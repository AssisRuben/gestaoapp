// Junta o esquema original + todas as migrations, em ordem, num arquivo só pra colar no SQL Editor
// de um Supabase NOVO (homologação/testes). Não usar na produção — lá as tabelas já existem.
//
//   node scripts/montar-banco.js            → supabase/homologacao/banco_completo.sql
//   node scripts/montar-banco.js --com-dados → acrescenta supabase/homologacao/dados_exemplo.sql
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const migrations = fs
  .readdirSync(path.join(raiz, "supabase", "migrations"))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

const partes = [
  ["supabase/base/0000_esquema_original.sql", fs.readFileSync(path.join(raiz, "supabase/base/0000_esquema_original.sql"), "utf8")],
  ...migrations.map((f) => [`supabase/migrations/${f}`, fs.readFileSync(path.join(raiz, "supabase/migrations", f), "utf8")]),
];
if (process.argv.includes("--com-dados")) {
  partes.push(["supabase/homologacao/dados_exemplo.sql", fs.readFileSync(path.join(raiz, "supabase/homologacao/dados_exemplo.sql"), "utf8")]);
}

const saida = path.join(raiz, "supabase", "homologacao", "banco_completo.sql");
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(
  saida,
  `-- GERADO por scripts/montar-banco.js — não editar à mão. Só pra banco NOVO (homologação/testes).\n\n` +
    partes.map(([nome, sql]) => `-- ======== ${nome} ========\n\n${sql.trim()}\n`).join("\n"),
);
console.log(`${saida}: ${partes.length} arquivos (última migration: ${migrations[migrations.length - 1]})`);
