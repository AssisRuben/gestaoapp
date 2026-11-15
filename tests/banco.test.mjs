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
  -- sem default no id, como no Supabase: insert sem id falha aqui também (o SQL Editor recusava)
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
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
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'teste@exemplo.invalid', '{"nome":"Usuário de teste"}')`);

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

// fazenda da rodada de testes do lançamento: carrega pelas funções do site e o bloco APAGAR limpa tudo
try {
  const script = ler("supabase/homologacao/dados_teste_lancamento.sql");
  await db.exec(script.replace("'assismontenegro@hotmail.com'", "'teste@exemplo.invalid'"));
  const prop = "(select id from propriedades where nome_propriedade = 'Fazenda Piloto (testes)')";
  const { rows } = await db.query(`select
      (select count(*)::int from vacas where propriedade_id = ${prop}) vacas,
      (select count(*)::int from vacas where propriedade_id = ${prop} and status_produtivo = 'lactacao') lactacao,
      (select status_reprodutivo from vacas where propriedade_id = ${prop} and numero_identificacao = 2) estrela,
      (select status_produtivo from vacas where propriedade_id = ${prop} and numero_identificacao = 4) pintada,
      (select saldo::int from saldo_doses where propriedade_id = ${prop} and touro_id = (select id from touros where codigo = 'TT-ALFA')) saldo_alfa,
      (select count(*)::int from entregas_doses where propriedade_id = ${prop} and recebido_em is null) pendentes,
      (select count(*)::int from bezerros where propriedade_id = ${prop}) bezerros,
      (select count(*)::int from controle_leite c join vacas v on v.id = c.vaca_id where v.propriedade_id = ${prop}) pesagens,
      (select count(*)::int from botijao_abastecimentos where propriedade_id = ${prop}) botijao,
      (select count(*)::int from financeiro where propriedade_id = ${prop}) financeiro`);
  const r = rows[0];
  const esperado = { vacas: 8, lactacao: 4, estrela: "prenhe", pintada: "seca", saldo_alfa: 7, pendentes: 1, bezerros: 5, pesagens: 56, botijao: 2, financeiro: 11 };
  for (const [k, v] of Object.entries(esperado)) {
    if (r[k] !== v) throw new Error(`${k}: esperava ${v}, veio ${r[k]}`);
  }
  // doses com o técnico: 6 do Alfa a confirmar (fora do saldo) e 4 do Beta já disponíveis
  await db.exec(`insert into auth.users (id, email) values (gen_random_uuid(), 'tecnico.lancamento@exemplo.invalid')`);
  await db.exec(
    ler("supabase/homologacao/dados_teste_doses_tecnico.sql").replace("'tecnico@exemplo.com'", "'tecnico.lancamento@exemplo.invalid'"),
  );
  const { rows: tec } = await db.query(`select
      (select coalesce(sum(saldo), 0)::int from saldo_doses_tecnico s join auth.users u on u.id = s.tecnico_id
        where u.email = 'tecnico.lancamento@exemplo.invalid') saldo,
      (select count(*)::int from usuarios_propriedades up join auth.users u on u.id = up.usuario_id
        where u.email = 'tecnico.lancamento@exemplo.invalid' and up.papel = 'tecnico' and up.propriedade_id = ${prop}) acesso`);
  if (tec[0].saldo !== 4 || tec[0].acesso !== 1) throw new Error(`doses do técnico: veio ${JSON.stringify(tec[0])}`);
  // o bloco APAGAR do fim do arquivo (comentado) precisa limpar sem esbarrar em chave estrangeira
  const apagar = script.slice(script.indexOf("-- do $$")).split("\n").map((l) => l.replace(/^-- ?/, "")).join("\n");
  await db.exec(apagar);
  const { rows: sobrou } = await db.query(`select count(*)::int n from propriedades where nome_propriedade = 'Fazenda Piloto (testes)'`);
  if (sobrou[0].n !== 0) throw new Error("o bloco APAGAR não removeu a fazenda");
  console.log("fazenda de testes do lançamento: ok");
} catch (e) {
  console.error(`FALHOU na fazenda de testes do lançamento: ${e.message}`);
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
