# Ambiente de homologação

Um segundo Supabase + uma segunda instância do site + cópias dos workflows do n8n, pra testar
migration e mudança **antes** da produção. Regra de trabalho depois de montado:

1. migration nova → roda na homologação → testa (site, bot, `npm run test:db`);
2. só então roda na produção e faz o deploy.

Montar leva umas 2 horas, uma vez só.

## 1. Supabase de homologação

1. No painel do Supabase, **New project** (ex.: `gestaopec-homolog`, mesma região da produção).
2. **Authentication → Providers → Email**: pra testar mais rápido, pode desligar "Confirm email".
   **Authentication → URL Configuration → Site URL**: o endereço do site de homologação (passo 2).
3. No computador, na pasta do projeto:
   ```
   node scripts/montar-banco.js --com-dados
   ```
   Isso gera `supabase/homologacao/banco_completo.sql`: o esquema original
   (`supabase/base/0000_esquema_original.sql`) + todas as migrations em ordem + a "Fazenda
   Demonstração" (`supabase/homologacao/dados_exemplo.sql`).
4. Cole o arquivo inteiro no **SQL Editor** do projeto de homologação e rode. Tem que terminar sem
   erro, com o aviso "Fazenda Demonstração criada".
5. Depois de criar sua conta no site de homologação (passo 2), vincule-a à fazenda de exemplo e,
   se quiser testar o painel do gestor, marque-se como gestor:
   ```sql
   insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
   select id, 'dddddddd-0000-0000-0000-000000000001', 'produtor' from auth.users where email = 'SEU_EMAIL';

   -- opcional: gestor (com isso o site manda pro /gestor; use outra conta pra ver a fazenda)
   insert into gestores (usuario_id) select id from auth.users where email = 'OUTRO_EMAIL';
   ```
6. Troque o WhatsApp da fazenda de exemplo pelo número que vai testar o bot de homologação:
   `update usuarios_whatsapp set telefone = '5585XXXXXXXXX' where propriedade_id = 'dddddddd-0000-0000-0000-000000000001';`

## 2. Site de homologação (Easypanel)

1. Crie um app novo no projeto `fazendaleite` (ex.: `gestaopec-homolog`), apontando pro mesmo
   repositório do GitHub. Sugestão: branch `homologacao` (crie a partir da `main`); o deploy da
   produção continua só da `main`.
2. Variáveis de ambiente com as chaves do **projeto de homologação** (Settings → API do Supabase):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   Conferir duas vezes: com a chave de produção aqui, a "homologação" escreveria no banco real.
3. Domínio próprio, ex.: `homolog.assisrubens.shop`.

## 3. Bot de homologação (n8n)

1. **Evolution**: uma instância com um número de WhatsApp só de teste. O webhook dela aponta pro
   caminho de homologação: `https://SEU_N8N/webhook/whatsapp-fazenda-homolog`.
2. No n8n, crie as credenciais de homologação com **exatamente** estes nomes (o n8n tenta ligar
   pelo nome na importação):
   - `supabaseApi HOMOLOGAÇÃO` — URL e service role key do projeto de homologação
   - `evolutionApi HOMOLOGAÇÃO` — servidor/chave da Evolution
   - `redis HOMOLOGAÇÃO` — pode ser o mesmo Redis (as chaves usam o telefone, e o número de teste é
     outro), de preferência em outro "database" (índice)
   - `openAiApi HOMOLOGAÇÃO` — pode ser a mesma chave da OpenAI
3. Gere os workflows:
   ```
   node scripts/workflow-homologacao.js https://SEU-PROJETO-HOMOLOG.supabase.co "Nome da instância Evolution de teste"
   ```
   Saem em `n8n-homologacao/` (fora do git): bot, erros e lembretes, já com o endereço de
   homologação e **sem** vínculo com as credenciais de produção (o script recusa o endereço de
   produção).
4. Importe os três. Se algum nó aparecer sem credencial, abra e escolha a de homologação (são 24 nós
   de Supabase, 16 de Redis, 5 de Evolution e 3 de OpenAI no total).
5. No bot de homologação: Settings → Error workflow → o de erros de homologação (publicado).
   Publique o bot. O de lembretes só publique se quiser receber às 6h no número de teste — ou use
   "Testar agora".

## 4. Testes automáticos no banco de homologação

Com a connection string do projeto de homologação (Settings → Database):
```
SUPABASE_DB_URL="postgresql://..." npm run test:db
```
Roda `supabase/tests/rpc_tests.sql` inteiro (termina em ROLLBACK, não deixa dado). Na homologação dá
pra rodar quantas vezes quiser sem medo.

## Atualizar a homologação depois

- Migration nova: rode só o arquivo novo no SQL Editor de homologação (não o banco completo de novo).
- Recriar do zero: apague e recrie o projeto, e repita o passo 1.
- Workflows: depois de mudar os JSONs de produção, rode de novo `scripts/workflow-homologacao.js` e
  reimporte.
