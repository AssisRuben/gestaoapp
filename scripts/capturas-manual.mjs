// Tira as imagens do Manual do Gestão Pec (lista "Imagens a capturar" do manual).
//
// Uso:  node scripts/capturas-manual.mjs            (todas)
//       node scripts/capturas-manual.mjs 13 21      (só essas)
//
// Roda contra o site no ar (padrão: produção) com uma conta de teste, na fazenda de teste.
// SÓ LÊ: abre telas e preenche formulários pra foto, mas nunca toca em Salvar/Confirmar/Excluir.
// A única chamada ao banco além das leituras é a conferência da importação de planilha (modo
// "validar", que desfaz tudo) e a checagem de WhatsApp repetido do cadastro.
//
// Configuração em .env.capturas (ignorado pelo git):
//   CAPTURAS_EMAIL=...            conta com acesso à fazenda de teste (produtor ou técnico)
//   CAPTURAS_SENHA=...
//   CAPTURAS_GESTOR_EMAIL=...     conta de gestor, pras imagens 25 a 31 (sem ela, usa CAPTURAS_EMAIL)
//   CAPTURAS_GESTOR_SENHA=...
//   CAPTURAS_FAZENDA=Fazenda Teste
//   CAPTURAS_URL=https://gestaopec.com.br
//   CAPTURAS_SEM_FAZENDA_EMAIL=... (opcional: conta sem fazenda, pra imagem 03)
//   CAPTURAS_SEM_FAZENDA_SENHA=...
//
// Saída: capturas-manual/<nome>.png (pasta ignorada pelo git). A imagem 11 (WhatsApp) é manual.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const SAIDA = path.join(RAIZ, "capturas-manual");

function lerEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(arquivo, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const env = { ...lerEnv(path.join(RAIZ, ".env.capturas")), ...process.env };
const URL_BASE = (env.CAPTURAS_URL || "https://gestaopec.com.br").replace(/\/$/, "");
const FAZENDA = env.CAPTURAS_FAZENDA || "Fazenda Teste";
if (!env.CAPTURAS_EMAIL || !env.CAPTURAS_SENHA) {
  console.error("Falta CAPTURAS_EMAIL e CAPTURAS_SENHA no arquivo .env.capturas (veja o topo deste script).");
  process.exit(1);
}

const CELULAR = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const COMPUTADOR = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };

const ESPERA = 1200; // dá tempo de gráficos e mapa desenharem

async function ir(page, caminho) {
  await page.goto(URL_BASE + caminho, { waitUntil: "load" });
  await page.waitForTimeout(ESPERA);
}

async function entrar(page, email, senha) {
  await ir(page, "/login");
  await page.fill("#email", email);
  await page.fill("#password", senha);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(ESPERA);
}

// Seletor "Trocar de fazenda" do cabeçalho (só aparece pra quem tem mais de uma fazenda).
async function escolherFazenda(page) {
  if (!page.url().includes(URL_BASE) || new URL(page.url()).pathname.startsWith("/gestor")) await ir(page, "/");
  const seletor = page.locator('select[aria-label="Trocar de fazenda"]');
  if (!(await seletor.count())) return;
  const opcao = await seletor.locator("option", { hasText: FAZENDA }).first().getAttribute("value");
  if (!opcao) throw new Error(`Fazenda "${FAZENDA}" não aparece no seletor dessa conta.`);
  if ((await seletor.inputValue()) !== opcao) {
    await seletor.selectOption(opcao);
    await page.waitForLoadState("load");
    await page.waitForTimeout(ESPERA * 2);
  }
}

// Botão visível com o texto (no celular há um botão flutuante e outro escondido com o mesmo texto).
const botao = (page, texto) => page.locator("button:visible", { hasText: texto }).first();

async function abrirFazenda(page) {
  // o nome da fazenda no cabeçalho abre a janela com Dados gerais, Perfil, Acessos e Patrimônio
  await page.locator("header button:visible", { hasText: FAZENDA }).first().click();
  await page.waitForTimeout(ESPERA);
}

async function rolarAte(page, texto) {
  const alvo = page.getByRole("heading", { name: texto }).first();
  await alvo.scrollIntoViewIfNeeded();
  await alvo.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
}

async function foto(page, nome, opcoes = {}) {
  // tira o foco do último campo preenchido (a borda de foco sairia na imagem)
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  // rodando com `next dev` (CAPTURAS_URL=http://localhost:...), esconde o selo do Next no canto
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(SAIDA, nome), ...opcoes });
}

// [nome, formato, precisa de login, passos]
const CAPTURAS = [
  ["01-criar-conta-produtor.png", "celular", false, async (p) => {
    await ir(p, "/login");
    await p.getByRole("button", { name: /Cadastre-se/ }).click();
    await p.waitForTimeout(600);
    await p.fill("#nome_propriedade", "Sítio Exemplo");
    await p.fill("#nome_produtor", "José da Silva");
    await p.fill("#municipio", "Quixadá");
    await p.fill("#estado", "CE");
    await foto(p, "01-criar-conta-produtor.png");
  }],
  ["02-tela-de-entrada.png", "celular", false, async (p) => {
    await ir(p, "/login");
    await foto(p, "02-tela-de-entrada.png");
  }],
  ["03-conta-sem-fazenda.png", "celular", "sem_fazenda", async (p) => {
    await ir(p, "/");
    await foto(p, "03-conta-sem-fazenda.png");
  }],
  ["04-menu-computador.png", "computador", true, async (p) => {
    await ir(p, "/");
    await foto(p, "04-menu-computador.png");
  }],
  ["05-menu-celular-mais.png", "celular", true, async (p) => {
    await ir(p, "/");
    await botao(p, "Mais").click();
    await p.waitForTimeout(500);
    await foto(p, "05-menu-celular-mais.png");
  }],
  ["06-dados-gerais.png", "celular", true, async (p) => {
    await ir(p, "/");
    await abrirFazenda(p);
    await rolarAte(p, "Dados gerais");
    await foto(p, "06-dados-gerais.png");
  }],
  ["07-perfil-da-fazenda.png", "celular", true, async (p) => {
    await ir(p, "/");
    await abrirFazenda(p);
    await rolarAte(p, "Perfil da fazenda");
    await foto(p, "07-perfil-da-fazenda.png");
  }],
  ["08-acessos.png", "celular", true, async (p) => {
    await ir(p, "/");
    await abrirFazenda(p);
    await rolarAte(p, "Acessos");
    await foto(p, "08-acessos.png");
  }],
  ["09-nova-vaca.png", "celular", true, async (p) => {
    await ir(p, "/vacas");
    await botao(p, "Nova vaca").click();
    await p.waitForTimeout(600);
    await foto(p, "09-nova-vaca.png");
  }],
  ["10-importar-planilha-conferencia.png", "computador", true, async (p) => {
    await ir(p, "/vacas/importar");
    await p.getByRole("radio", { name: "Copiar e colar" }).click();
    // linhas de exemplo: duas certas e uma com erro (situação inválida), pra mostrar a conferência
    await p.locator("textarea").first().fill(
      "Número\tSituação\tÚltimo parto\n9001\tLactação\t10/01/2026\n9002\tNovilha\t\n9003\tTalvez\t\n",
    );
    await botao(p, "Conferir").click();
    await p.getByText("Confira antes de gravar").first().waitFor({ timeout: 30000 });
    await p.waitForTimeout(ESPERA);
    await p.getByText("Confira antes de gravar").first().scrollIntoViewIfNeeded();
    await foto(p, "10-importar-planilha-conferencia.png");
  }],
  ["12-patrimonio.png", "computador", true, async (p) => {
    await ir(p, "/");
    await abrirFazenda(p);
    await rolarAte(p, "Patrimônio");
    await foto(p, "12-patrimonio.png");
  }],
  ["13-pesagem-do-dia.png", "celular", true, async (p) => {
    await ir(p, "/leite/pesagem");
    const campos = p.locator('input[id^="litros_"]');
    const n = Math.min(await campos.count(), 3);
    for (let i = 0; i < n; i++) await campos.nth(i).fill(String([14.5, 18, 12][i]));
    await foto(p, "13-pesagem-do-dia.png");
  }],
  ["14-nova-cobertura.png", "celular", true, async (p) => {
    await ir(p, "/reproducao");
    await botao(p, "+ Registrar").click();
    await botao(p, "Cobertura (ou inseminação)").click();
    await p.waitForTimeout(600);
    await foto(p, "14-nova-cobertura.png");
  }],
  ["15-registrar-parto.png", "celular", true, async (p) => {
    await ir(p, "/reproducao");
    await botao(p, "+ Registrar").click();
    await p.locator("button:visible", { hasText: /^\s*Parto\s*$/ }).first().click();
    await p.waitForTimeout(600);
    await foto(p, "15-registrar-parto.png");
  }],
  ["16-virou-vaca.png", "celular", true, async (p) => {
    await ir(p, "/bezerros");
    // abre a pergunta "Virou vaca?" e NÃO confirma
    const virou = p.locator("button:visible", { hasText: /^\s*Virou vaca\s*$/ }).first();
    if (!(await virou.count())) throw new Error("nenhuma bezerra com o botão Virou vaca nessa fazenda");
    await virou.click();
    await p.waitForTimeout(600);
    await foto(p, "16-virou-vaca.png");
  }],
  ["17-novo-lancamento.png", "celular", true, async (p) => {
    await ir(p, "/financeiro");
    await botao(p, "Novo lançamento").click();
    await p.waitForTimeout(600);
    await foto(p, "17-novo-lancamento.png");
  }],
  ["18-financeiro-periodo.png", "computador", true, async (p) => {
    await ir(p, "/financeiro");
    // período de 3 meses (o padrão é só o mês atual, que no começo do mês tem pouca coisa)
    const d = new Date();
    const inicio = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    const iso = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;
    await p.fill("#inicio", iso);
    await p.waitForTimeout(400);
    await foto(p, "18-financeiro-periodo.png");
  }],
  ["19-lancar-no-campo.png", "celular", true, async (p) => {
    await ir(p, "/campo");
    await foto(p, "19-lancar-no-campo.png");
  }],
  ["20-doses-do-programa.png", "celular", true, async (p) => {
    await ir(p, "/reproducao");
    const bloco = p.getByRole("heading", { name: "Doses do programa" }).first();
    if (await bloco.count()) await bloco.scrollIntoViewIfNeeded();
    await foto(p, "20-doses-do-programa.png");
  }],
  ["21-inicio.png", "computador", true, async (p) => {
    await ir(p, "/");
    await foto(p, "21-inicio.png", { fullPage: true });
  }],
  ["22-registrar-visita.png", "computador", true, async (p) => {
    await ir(p, "/relatorio");
    await foto(p, "22-registrar-visita.png");
  }],
  ["23-resumo-da-fazenda.png", "computador", true, async (p) => {
    await ir(p, "/relatorio");
    await foto(p, "23-resumo-da-fazenda.png", { fullPage: true });
  }],
  ["24-censo-do-rebanho.png", "celular", true, async (p) => {
    await ir(p, "/vacas");
    await foto(p, "24-censo-do-rebanho.png");
  }],
  ["25-gestor-visao-geral.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor");
    await p.waitForTimeout(ESPERA * 2); // mapa
    await foto(p, "25-gestor-visao-geral.png", { fullPage: true });
  }],
  ["26-gestor-ranking.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor/ranking");
    await foto(p, "26-gestor-ranking.png", { fullPage: true });
  }],
  ["27-gestor-alertas.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor/alertas");
    await foto(p, "27-gestor-alertas.png", { fullPage: true });
  }],
  ["28-gestor-nova-entrega.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor/programa");
    await botao(p, "+ Nova entrega").click();
    await p.waitForTimeout(600);
    await foto(p, "28-gestor-nova-entrega.png");
  }],
  ["29-gestor-adesao.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor/programa");
    await rolarAte(p, "Adesão e linha de base");
    await foto(p, "29-gestor-adesao.png");
  }],
  ["30-gestor-cadastrar-fazenda.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor/tecnicos");
    await botao(p, "+ Nova fazenda").click();
    await p.waitForTimeout(500);
    await p.fill("#nf_nome", "Sítio Exemplo");
    await p.fill("#nf_produtor", "José da Silva");
    await p.fill("#nf_municipio", "Quixadá");
    await rolarAte(p, "Cadastrar fazenda");
    await foto(p, "30-gestor-cadastrar-fazenda.png");
  }],
  ["31-gestor-exportar.png", "computador", "gestor", async (p) => {
    await ir(p, "/gestor");
    await rolarAte(p, "Exportar planilhas");
    await foto(p, "31-gestor-exportar.png");
  }],
];

const pedidas = process.argv.slice(2).map((a) => a.padStart(2, "0"));
const fila = CAPTURAS.filter(([nome]) => !pedidas.length || pedidas.includes(nome.slice(0, 2)));

fs.mkdirSync(SAIDA, { recursive: true });
// --lang: o campo de data do Chromium segue o idioma do navegador, não o locale do contexto
const navegador = await chromium.launch({ args: ["--lang=pt-BR"] });
const contextos = {};

// Um contexto (sessão) por formato e conta, reaproveitado entre as capturas.
async function contexto(formato, login) {
  const chave = `${formato}:${login}`;
  if (contextos[chave]) return contextos[chave];
  const ctx = await navegador.newContext({
    ...(formato === "celular" ? CELULAR : COMPUTADOR),
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    serviceWorkers: "block", // sem cópia antiga de tela guardada
  });
  if (login) {
    const p = await ctx.newPage();
    if (login === "sem_fazenda") {
      if (!env.CAPTURAS_SEM_FAZENDA_EMAIL) throw new Error("sem CAPTURAS_SEM_FAZENDA_EMAIL no .env.capturas");
      await entrar(p, env.CAPTURAS_SEM_FAZENDA_EMAIL, env.CAPTURAS_SEM_FAZENDA_SENHA);
    } else if (login === "gestor" && env.CAPTURAS_GESTOR_EMAIL) {
      await entrar(p, env.CAPTURAS_GESTOR_EMAIL, env.CAPTURAS_GESTOR_SENHA);
    } else {
      await entrar(p, env.CAPTURAS_EMAIL, env.CAPTURAS_SENHA);
      await escolherFazenda(p);
    }
    await p.close();
  }
  contextos[chave] = ctx;
  return ctx;
}

const resultado = [];
for (const [nome, formato, login, passos] of fila) {
  let page;
  try {
    const ctx = await contexto(formato, login);
    page = await ctx.newPage();
    // nunca deixar uma exclusão/confirmação do navegador passar sem querer
    page.on("dialog", (d) => d.dismiss());
    await passos(page);
    resultado.push(["ok", nome]);
    console.log("ok   ", nome);
  } catch (e) {
    resultado.push(["FALHOU", nome, e.message.split("\n")[0]]);
    console.log("FALHOU", nome, "-", e.message.split("\n")[0]);
  } finally {
    await page?.close();
  }
}
await navegador.close();

const falhas = resultado.filter(([s]) => s !== "ok");
console.log(`\n${resultado.length - falhas.length} de ${resultado.length} imagens em ${SAIDA}`);
console.log("A imagem 11 (WhatsApp) é manual: print da conversa no celular.");
if (falhas.length) process.exitCode = 1;
