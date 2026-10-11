// Monta o banco DO ZERO num Postgres em memória (PGlite — Postgres de verdade compilado pra
// WebAssembly, sem Docker nem Supabase) e roda supabase/tests/rpc_tests.sql inteiro.
// Não toca na produção. Roda no `npm test` e no GitHub a cada push.
//
// O que o Supabase já traz pronto (papéis anon/authenticated/service_role, schema auth, auth.uid())
// é criado aqui do jeito mínimo que as migrations precisam.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => fs.readFileSync(path.join(raiz, f), "utf8");

const migrations = fs
  .readdirSync(path.join(raiz, "supabase/migrations"))
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);

for (const arquivo of ["supabase/base/0000_esquema_original.sql", ...migrations.map((m) => `supabase/migrations/${m}`)]) {
  try {
    await db.exec(ler(arquivo));
  } catch (e) {
    console.error(`FALHOU ao aplicar ${arquivo}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`banco montado do zero: 0000 + ${migrations.length} migrations (até ${migrations.at(-1)})`);

// o rpc_tests.sql usa um usuário existente como "quem está logado"
await db.exec(`insert into auth.users (email, raw_user_meta_data) values ('teste@exemplo.invalid', '{"nome":"Usuário de teste"}')`);

// o arquivo termina com ROLLBACK; troca o aviso final por um erro com nome conhecido pra ter
// certeza de que TODAS as asserções rodaram (um erro antes disso é uma falha de verdade)
const testes = ler("supabase/tests/rpc_tests.sql").replace(
  "raise notice 'TODOS OS TESTES PASSARAM'",
  "raise exception 'TESTES_CHEGARAM_AO_FIM'",
);
try {
  await db.exec(testes);
  console.error("FALHOU: rpc_tests.sql terminou sem chegar ao fim das asserções");
  process.exit(1);
} catch (e) {
  if (!String(e.message).includes("TESTES_CHEGARAM_AO_FIM")) {
    console.error(`FALHOU: ${e.message}`);
    process.exit(1);
  }
}
console.log("rpc_tests.sql: todas as asserções passaram");
await db.exec("rollback"); // o erro proposital acima deixa a transação do arquivo aberta

// dados de exemplo da homologação também precisam carregar sem erro
try {
  await db.exec(ler("supabase/homologacao/dados_exemplo.sql"));
  const { rows } = await db.query(
    "select count(*)::int n from alertas_reprodutivos() where propriedade_id = 'dddddddd-0000-0000-0000-000000000001'",
  );
  if (rows[0].n < 3) throw new Error(`esperava alertas na Fazenda Demonstração, veio ${rows[0].n}`);
  console.log("dados de exemplo (homologação): ok");
} catch (e) {
  console.error(`FALHOU nos dados de exemplo: ${e.message}`);
  process.exit(1);
}

// o diagnóstico de dados antigos (rodado à mão no SQL Editor) precisa continuar válido
try {
  const { rows } = await db.query(ler("supabase/diagnosticos/dados_antigos.sql"));
  if (rows.length !== 12) throw new Error(`esperava 12 verificações, veio ${rows.length}`);
  console.log("diagnóstico de dados antigos: ok");
} catch (e) {
  console.error(`FALHOU no diagnóstico de dados antigos: ${e.message}`);
  process.exit(1);
}
