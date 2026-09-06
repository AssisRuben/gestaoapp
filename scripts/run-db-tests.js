// Roda supabase/tests/rpc_tests.sql direto contra o Postgres do projeto, em vez de exigir
// copiar/colar no SQL Editor do Supabase. O próprio arquivo .sql já roda tudo dentro de uma
// transação e termina com ROLLBACK, então nenhum dado de teste sobra no banco mesmo rodando
// contra o projeto real — mas por rodar contra o banco de verdade (não há projeto de
// staging/local configurado ainda), evite rodar isso em paralelo com uso real da aplicação.
//
// Precisa de uma conta em auth.users já existente (o próprio .sql explica por quê) e de
// credenciais de conexão direta ao Postgres via variáveis de ambiente:
//   - SUPABASE_DB_URL (connection string completa), ou
//   - PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE (discretas — preferível quando a
//     senha tem caracteres especiais tipo # ou @, que quebram o parser de URL)
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const sqlPath = path.join(__dirname, "..", "supabase", "tests", "rpc_tests.sql");

function buildClientConfig() {
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, SUPABASE_DB_URL } = process.env;

  if (PGHOST && PGUSER && PGPASSWORD && PGDATABASE) {
    return {
      host: PGHOST,
      port: Number(PGPORT || 5432),
      user: PGUSER,
      password: PGPASSWORD,
      database: PGDATABASE,
      ssl: { rejectUnauthorized: false },
    };
  }

  if (SUPABASE_DB_URL) {
    return { connectionString: SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } };
  }

  console.error(
    "Faltam credenciais de conexão. Defina SUPABASE_DB_URL ou PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.",
  );
  process.exit(1);
}

async function main() {
  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new Client(buildClientConfig());

  client.on("notice", (notice) => {
    console.log(`[postgres] ${notice.message}`);
  });

  await client.connect();
  try {
    await client.query(sql);
    console.log("\ntest:db OK");
  } catch (err) {
    console.error(`\ntest:db FALHOU: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
