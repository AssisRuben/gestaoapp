// Gera as cópias de HOMOLOGAÇÃO dos workflows do n8n (bot, erros e lembretes) a partir dos JSONs de
// produção do repositório:
//   - troca o endereço do Supabase pelo do projeto de homologação;
//   - webhook do bot em outro caminho (whatsapp-fazenda-homolog), pra não disputar com a produção;
//   - nomes com "(HOMOLOGAÇÃO)";
//   - TIRA o vínculo com as credenciais de produção (ficam só com um nome sugerido): no n8n, cada nó
//     com credencial precisa ser apontado pras credenciais de homologação. Isso é de propósito — uma
//     cópia que herdasse a credencial de produção gravaria no banco real.
//
//   node scripts/workflow-homologacao.js https://SEU-PROJETO.supabase.co "Nome da instância Evolution de teste"
//   → n8n-homologacao/*.json (fora do git)
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const [urlHomolog, instanciaHomolog] = process.argv.slice(2);
if (!urlHomolog || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(urlHomolog) || !instanciaHomolog) {
  console.error('uso: node scripts/workflow-homologacao.js https://SEU-PROJETO.supabase.co "Instância Evolution de teste"');
  process.exit(1);
}

const URL_PRODUCAO = "https://zlgtkcdscwzxgnltodhb.supabase.co";
if (urlHomolog === URL_PRODUCAO) {
  console.error("esse é o Supabase de PRODUÇÃO — use o do projeto de homologação");
  process.exit(1);
}

const raiz = path.join(__dirname, "..");
const saida = path.join(raiz, "n8n-homologacao");
fs.mkdirSync(saida, { recursive: true });

for (const arquivo of ["fazenda-leite-multiagentes.json", "fazenda-leite-erros.json", "fazenda-leite-lembretes.json"]) {
  const texto = fs.readFileSync(path.join(raiz, arquivo), "utf8").split(URL_PRODUCAO).join(urlHomolog);
  const wf = JSON.parse(texto);

  wf.name = `${wf.name} (HOMOLOGAÇÃO)`;
  wf.active = false;
  delete wf.id;
  delete wf.versionId;
  if (wf.settings) delete wf.settings.errorWorkflow;

  for (const n of wf.nodes) {
    if (n.type === "n8n-nodes-base.webhook") {
      n.parameters.path = `${n.parameters.path}-homolog`;
      n.webhookId = crypto.randomUUID();
    }
    if (n.parameters && typeof n.parameters.instanceName === "string") {
      n.parameters.instanceName = instanciaHomolog;
    }
    if (n.credentials) {
      for (const tipo of Object.keys(n.credentials)) {
        n.credentials[tipo] = { name: `${tipo} HOMOLOGAÇÃO` };
      }
    }
  }

  fs.writeFileSync(path.join(saida, arquivo.replace(".json", ".homologacao.json")), JSON.stringify(wf, null, 2) + "\n");
  const restante = JSON.stringify(wf).includes(URL_PRODUCAO);
  console.log(`${arquivo} → n8n-homologacao/ (${wf.nodes.length} nós${restante ? ", ATENÇÃO: ainda cita produção" : ""})`);
}
