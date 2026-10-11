// Uso sem internet: as duas filas do celular (pesagem e campo) e o service worker (public/sw.js),
// com rede, armazenamento e cache simulados.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { carregar, ok, terminar, RAIZ } from "./ts.mjs";

// ---- ambiente de navegador mínimo ----
const armazenamento = new Map();
globalThis.localStorage = {
  getItem: (k) => armazenamento.get(k) ?? null,
  setItem: (k, v) => armazenamento.set(k, String(v)),
  removeItem: (k) => armazenamento.delete(k),
};
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.Event = class {
  constructor(tipo) {
    this.type = tipo;
  }
};
const json = (status, corpo) => ({ status, ok: status < 300, headers: { get: () => "application/json" }, json: async () => corpo });
const html = () => ({ status: 200, ok: true, headers: { get: () => "text/html" }, json: async () => { throw new Error("html"); } });

// ---- fila da pesagem ----
console.log("fila da pesagem");
let rede = "ok";
const enviados = [];
globalThis.fetch = async (_url, opcoes) => {
  if (rede === "sem-rede") throw new TypeError("Failed to fetch");
  enviados.push(JSON.parse(opcoes.body));
  if (rede === "sessao") return json(401, { error: "Sua sessão expirou." });
  if (rede === "login-html") return html();
  if (rede === "recusa") return json(422, { error: "sem acesso a esta propriedade" });
  return json(200, { salvos: 2, corrigidos: 0, erros: [] });
};
const fila = await carregar("fila-offline");

fila.guardarPesagem({ propriedadeId: "F", data: "2026-10-11", periodo: "manha", itens: [{ vaca_id: "a", litros: 10 }, { vaca_id: "b", litros: 8 }] });
fila.guardarPesagem({ propriedadeId: "F", data: "2026-10-11", periodo: "manha", itens: [{ vaca_id: "b", litros: 9 }] });
const f = fila.filaPesagens();
ok(f.length === 1 && f[0].itens.length === 2 && f[0].itens.find((i) => i.vaca_id === "b").litros === 9, "mesma data/ordenha vira uma pesagem só; o valor novo vence");
rede = "sem-rede";
ok((await fila.enviarFila()).restantes === 1, "sem internet: continua guardada");
rede = "sessao";
await fila.enviarFila();
ok(fila.filaPesagens().length === 1 && fila.filaPesagens()[0].ultimoErro, "sessão expirada: continua guardada, com o aviso");
rede = "login-html";
ok((await fila.enviarFila()).restantes === 1, "redirecionamento pro /login (HTML) não conta como enviado");
rede = "ok";
const r = await fila.enviarFila();
ok(r.enviadas === 1 && r.restantes === 0, "com internet: envia e esvazia a fila");
fila.guardarPesagem({ propriedadeId: "F", data: "2026-10-11", periodo: "tarde", itens: [{ vaca_id: "a", litros: 7 }] });
rede = "recusa";
const recusa = await fila.enviarFila();
ok(recusa.restantes === 0 && recusa.erros[0].mensagem.includes("sem acesso"), "recusada pelo servidor: sai da fila mostrando o erro");

// ---- fila do campo ----
console.log("fila do campo");
armazenamento.clear();
const recebidos = new Map();
let modo = "ok";
globalThis.fetch = async (_url, opcoes) => {
  if (modo === "sem-rede") throw new TypeError("Failed to fetch");
  const corpo = JSON.parse(opcoes.body);
  if (modo === "sessao") return json(401, { error: "sessão expirou" });
  if (modo === "perde-resposta") {
    recebidos.set(corpo.id, true);
    throw new TypeError("conexão caiu");
  }
  // mesma regra de registrar_lancamento_campo: id repetido não lança de novo
  if (recebidos.has(corpo.id)) return json(200, { ok: true, mensagem: "já recebido", repetido: true });
  recebidos.set(corpo.id, true);
  if (corpo.dados.vaca_id === "x") return json(200, { ok: false, mensagem: "Vaca não encontrada nesta fazenda." });
  return json(200, { ok: true, mensagem: "registrado" });
};
const campo = await carregar("fila-campo");

campo.guardarLancamento({ propriedadeId: "F", tipo: "cobertura", dados: { vaca_id: "a" }, descricao: "cob a" });
campo.guardarLancamento({ propriedadeId: "F", tipo: "parto", dados: { vaca_id: "x" }, descricao: "parto x" });
ok(campo.lancamentosCampo().every((l) => l.estado === "guardado" && l.id), "lançamentos guardados com id próprio");
modo = "sem-rede";
await campo.enviarCampo();
ok(campo.lancamentosCampo().every((l) => l.estado === "guardado"), "sem internet: continuam guardados");
modo = "perde-resposta";
await campo.enviarCampo();
ok(campo.lancamentosCampo()[0].estado === "guardado" && recebidos.size === 1, "servidor recebeu mas a resposta se perdeu: segue guardado");
modo = "sessao";
await campo.enviarCampo();
ok(campo.lancamentosCampo().every((l) => l.estado === "guardado"), "sessão expirada: continuam guardados");
modo = "ok";
await campo.enviarCampo();
const porDescricao = Object.fromEntries(campo.lancamentosCampo().map((l) => [l.descricao, l]));
ok(porDescricao["cob a"].estado === "enviado" && recebidos.size === 2, "reenvio do que já tinha chegado: enviado, sem lançar de novo");
ok(porDescricao["parto x"].estado === "recusado" && porDescricao["parto x"].mensagem.includes("Vaca não encontrada"), "recusado pela regra: fica com o motivo");
for (let i = 0; i < 20; i++) campo.guardarLancamento({ propriedadeId: "F", tipo: "diagnostico", dados: { vaca_id: "a" }, descricao: `d${i}` });
await campo.enviarCampo();
ok(campo.lancamentosCampo().length === 15, "histórico guarda só os 15 últimos resolvidos");

// ---- service worker ----
console.log("service worker");
const handlers = {};
const caches = new Map();
const cacheApi = {
  open: async (nome) => {
    if (!caches.has(nome)) caches.set(nome, new Map());
    const c = caches.get(nome);
    const chave = (r) => (typeof r === "string" ? r : new URL(r.url).pathname);
    return { match: async (r) => c.get(chave(r))?.clone(), put: async (r, resp) => c.set(chave(r), resp) };
  },
  keys: async () => [...caches.keys()],
  delete: async (nome) => caches.delete(nome),
};
class Resposta {
  constructor(body, { status = 200, redirected = false, type = "basic", headers = {} } = {}) {
    Object.assign(this, { body, status, redirected, type, headers, ok: status >= 200 && status < 300 });
  }
  clone() {
    return new Resposta(this.body, this);
  }
  async text() {
    return this.body;
  }
}
let online = true;
let logado = true;
const fetchSw = async (pedido, opcoes = {}) => {
  const url = new URL(typeof pedido === "string" ? `https://site${pedido}` : pedido.url);
  if (!online) throw new TypeError("offline");
  if (!logado && !url.pathname.startsWith("/_next/")) {
    return opcoes.redirect === "manual" ? new Resposta("", { status: 0, type: "opaqueredirect" }) : new Resposta("<html>login</html>", { redirected: true });
  }
  if (url.pathname === "/leite/pesagem" || url.pathname === "/campo") {
    return new Resposta(`<html>TELA ${url.pathname} <script src="/_next/static/chunks/app-1.js"></script></html>`);
  }
  if (url.pathname.startsWith("/_next/static/")) return new Resposta("js");
  return new Resposta("<html>outra</html>");
};
const self = {
  location: { origin: "https://site" },
  addEventListener: (tipo, h) => (handlers[tipo] = h),
  skipWaiting() {},
  clients: { claim: async () => {} },
};
vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "public/sw.js"), "utf8"), {
  self, caches: cacheApi, fetch: fetchSw, Response: Resposta, URL, Promise, console,
});
async function navegar(caminho) {
  let resposta;
  handlers.fetch({ request: { method: "GET", url: `https://site${caminho}`, mode: "navigate" }, respondWith: (p) => (resposta = p), waitUntil() {} });
  const r = await resposta;
  await new Promise((fim) => setTimeout(fim, 10));
  return r;
}
async function mensagem(tipo) {
  const espera = [];
  handlers.message({ data: { tipo }, waitUntil: (p) => espera.push(p) });
  await Promise.all(espera);
}
const guardada = async (caminho) => (await cacheApi.open("gestaopec-paginas-v1")).match(caminho);

await mensagem("precarregar");
ok((await guardada("/leite/pesagem"))?.body.includes("TELA") && (await guardada("/campo"))?.body.includes("TELA"), "precarregar guarda a pesagem e o lançar no campo");
ok(await (await cacheApi.open("gestaopec-estatico-v1")).match("/_next/static/chunks/app-1.js"), "e os arquivos que essas telas usam");
online = false;
ok((await navegar("/campo")).body.includes("TELA /campo"), "sem internet: abre a tela guardada");
ok((await navegar("/financeiro")).body.includes("Sem internet"), "sem internet: outra tela mostra o aviso com os atalhos");
online = true;
await mensagem("limpar");
logado = false;
await mensagem("precarregar");
ok(!(await guardada("/leite/pesagem")), "deslogado: não guarda o /login no lugar da tela (e limpar apagou a anterior)");
await navegar("/campo");
ok(!(await guardada("/campo")), "navegação redirecionada pro login não é guardada");

terminar("offline");
