// Service worker do Gestão Pec: deixa a PESAGEM DO DIA funcionar sem internet (curral sem sinal).
//
// - Arquivos do site (/_next/static, ícones): guardados no primeiro uso (os nomes mudam a cada
//   deploy, então nunca ficam velhos).
// - Telas em OFFLINE: busca na rede quando dá e guarda a cópia; sem rede, abre a última cópia
//   (com as vacas e lançamentos daquele momento). O site também manda "precarregar" ao abrir com
//   internet, pra a pesagem já estar guardada antes de a pessoa ir pro curral.
// - Outras telas sem rede: página simples com o atalho pra pesagem.
// - Nunca guarda o redirecionamento pro /login no lugar da tela. "limpar" (mandado pela tela de
//   login) apaga as telas guardadas, que têm dados da fazenda.
// O envio das pesagens guardadas é feito pela própria tela (src/lib/fila-offline.ts).

const PAGINAS = "gestaopec-paginas-v1";
const ESTATICO = "gestaopec-estatico-v1";
const OFFLINE = ["/leite/pesagem"];

const PAGINA_OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sem internet — Gestão Pec</title>
<style>body{font-family:system-ui,sans-serif;background:#faf7f1;color:#1f2a1f;margin:0;padding:32px 16px;text-align:center}
a{display:inline-block;margin-top:16px;background:#2f5233;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600}
p{max-width:420px;margin:12px auto;line-height:1.5}</style></head><body>
<h1>Sem internet</h1>
<p>Esta tela precisa de conexão. A <strong>pesagem do dia</strong> funciona sem sinal: lance o leite e ele é enviado sozinho quando a internet voltar.</p>
<a href="/leite/pesagem">Abrir pesagem do dia</a>
</body></html>`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nome of await caches.keys()) {
        if (nome.startsWith("gestaopec-") && nome !== PAGINAS && nome !== ESTATICO) await caches.delete(nome);
      }
      await self.clients.claim();
    })(),
  );
});

async function guardarEstaticos(html) {
  const cache = await caches.open(ESTATICO);
  const enderecos = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  await Promise.all(
    enderecos.map(async (endereco) => {
      if (await cache.match(endereco)) return;
      try {
        const resposta = await fetch(endereco);
        if (resposta.ok) await cache.put(endereco, resposta);
      } catch {
        // sem rede no meio do caminho: fica pra próxima
      }
    }),
  );
}

async function guardarPagina(caminho) {
  const resposta = await fetch(caminho, { credentials: "same-origin", redirect: "manual" });
  // deslogado (redirecionou pro /login) ou erro: não guarda nada no lugar da tela
  if (!resposta.ok || resposta.type === "opaqueredirect") return;
  const html = await resposta.clone().text();
  await (await caches.open(PAGINAS)).put(caminho, resposta);
  await guardarEstaticos(html);
}

self.addEventListener("message", (evento) => {
  const tipo = evento.data && evento.data.tipo;
  if (tipo === "precarregar") {
    evento.waitUntil(Promise.all(OFFLINE.map((caminho) => guardarPagina(caminho).catch(() => {}))));
  } else if (tipo === "limpar") {
    evento.waitUntil(caches.delete(PAGINAS));
  }
});

function ehEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/gestao-pec-logo.png" ||
    url.pathname === "/apple-touch-icon.png"
  );
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (ehEstatico(url)) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(ESTATICO);
        const guardado = await cache.match(pedido);
        if (guardado) return guardado;
        const resposta = await fetch(pedido);
        if (resposta.ok) cache.put(pedido, resposta.clone());
        return resposta;
      })(),
    );
    return;
  }

  if (pedido.mode === "navigate") {
    evento.respondWith(
      (async () => {
        try {
          const resposta = await fetch(pedido);
          if (OFFLINE.includes(url.pathname) && resposta.ok && !resposta.redirected) {
            const copia = resposta.clone();
            (async () => {
              const html = await copia.clone().text();
              await (await caches.open(PAGINAS)).put(url.pathname, copia);
              await guardarEstaticos(html);
            })().catch(() => {});
          }
          return resposta;
        } catch {
          const guardada = await (await caches.open(PAGINAS)).match(url.pathname);
          if (guardada) return guardada;
          return new Response(PAGINA_OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
      })(),
    );
  }
});
