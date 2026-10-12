# Fazenda Leite — contexto do projeto

## Visão geral

Sistema de gestão de fazenda leiteira (metodologia PAEZ/Balde Cheio). Já existe um bot de WhatsApp
(n8n + Evolution API + Supabase) em produção que os produtores usam pra registrar leite, partos,
coberturas, diagnósticos de prenhez e lançamentos financeiros. Este projeto novo é um **site** que
compartilha o mesmo banco Supabase — pra clientes acessarem direto, e pra gerar relatórios mais
sofisticados durante visitas técnicas (veterinário/zootecnista).

**Importante**: o bot de WhatsApp continua em produção e continuará escrevendo nesse mesmo banco.
O site não substitui o bot, coexiste com ele. Qualquer regra de negócio nova deve, idealmente,
ficar no banco (função RPC/trigger), não duplicada em JS do site, porque o bot **não vai chamar**
código do site.

## Stack recomendada pro site

- Next.js (App Router, TypeScript)
- Supabase Auth (login) + Row Level Security (autorização, chave de tenant = `propriedade_id`)
- Regras de escrita com invariantes de negócio → funções RPC no Postgres, chamadas tanto pelo
  site quanto (no futuro) pelo bot, para não duplicar lógica em dois lugares.

## Schema do banco (Supabase/Postgres)

Todos os `id` são `uuid` com `gen_random_uuid()`. Única coluna UNIQUE além das PKs:
`usuarios_whatsapp.telefone`.

```
propriedades (tabela raiz/tenant)
  id uuid PK
  nome_propriedade text NOT NULL
  nome_produtor text NOT NULL
  municipio text
  estado text
  tecnico_responsavel text
  created_at, updated_at timestamptz

vacas
  id uuid PK
  propriedade_id uuid NOT NULL -> propriedades.id
  mae_id uuid -> vacas.id (auto-referência)
  status_produtivo text        -- valores reais observados: "novilha" | "lactacao" | "seca"
  status_reprodutivo text      -- valores reais observados: "vazia" | "prenhe" | "vazia_em_servico"
  data_parto date
  numero_identificacao integer -- chave natural usada em TODO o resto do sistema
  created_at, updated_at timestamptz

coberturas
  id uuid PK
  vaca_id uuid NOT NULL -> vacas.id
  data_cobertura date NOT NULL
  diagnostico_prenhez text default 'pendente'  -- valores: 'pendente' | 'positivo' | 'negativo'
  created_at timestamptz
  -- GAP DE SCHEMA: não tem coluna pra touro/sêmen usado. Se precisar rastrear, adicionar coluna.

partos
  id uuid PK
  vaca_id uuid NOT NULL -> vacas.id
  cobertura_id uuid -> coberturas.id (a cobertura que resultou nesse parto, se rastreada)
  data_parto date NOT NULL
  producao_total numeric
  projecao_305 numeric   -- NÃO confiar no valor gravado aqui, ver "Cálculos" abaixo
  persistencia numeric    -- idem
  dias_em_aberto integer  -- idem
  iep integer             -- este É calculado corretamente no INSERT (ver abaixo)
  created_at timestamptz
  ativa boolean NOT NULL default true  -- só UM parto "ativo" (lactação corrente) por vaca

bezerros
  id uuid PK
  propriedade_id uuid NOT NULL -> propriedades.id
  parto_id uuid -> partos.id
  mae_id uuid -> vacas.id
  vaca_id_gerada uuid -> vacas.id   -- null até o bezerro ser cadastrado como vaca adulta
  numero_identificacao integer     -- preenchido no momento do registro do parto (bezerros
                                     -- antigos, cadastrados antes dessa mudança, podem estar com
                                     -- este campo null — ver regra 4)
  sexo text                        -- CHECK: 'macho' | 'femea' | 'natimorto'
  data_nascimento date
  created_at timestamptz

controle_leite
  id uuid PK
  vaca_id uuid NOT NULL -> vacas.id
  parto_id uuid NOT NULL -> partos.id   -- OBRIGATÓRIO: só dá pra lançar leite se a vaca tiver
                                          -- um parto com ativa=true
  litros numeric NOT NULL
  data_controle date NOT NULL
  created_at timestamptz
  periodo text   -- opcional: 'manha' | 'tarde' | 'dia_inteiro'. Recriada em 0025 (não existia
                 -- desde 0016). Serve pra saber qual ordenha corrigir/apagar quando há mais de uma
                 -- no dia. Não vai pro controle_leite_historico ao arquivar a lactação.

financeiro
  id uuid PK
  propriedade_id uuid NOT NULL -> propriedades.id
  tipo text NOT NULL           -- CHECK: apenas 'despesa' ou 'receita'
  categoria text                -- livre, mas o bot normaliza pra minúsculo sem acento
  valor numeric NOT NULL
  data date NOT NULL
  created_at timestamptz
  -- índice: idx_financeiro_propriedade_data (propriedade_id, data)

patrimonio
  id uuid PK
  propriedade_id uuid NOT NULL -> propriedades.id
  tipo_ativo text
  valor_total numeric
  taxa_juros numeric
  vida_util integer
  created_at timestamptz
  -- ainda NÃO integrado ao bot. Fora de escopo do módulo financeiro atual.

usuarios_whatsapp
  id uuid PK
  propriedade_id uuid NOT NULL -> propriedades.id
  telefone text NOT NULL UNIQUE
  papel text NOT NULL default 'produtor'
  ativo boolean NOT NULL default true
  created_at timestamptz

interacoes_log
  id uuid PK
  propriedade_id uuid -> propriedades.id
  intencao_detectada text
  entidades_extraidas jsonb
  mensagem_recebida text
  resposta_enviada text
  created_at timestamptz
```

## Regras de negócio / invariantes (aprendidas com bugs reais no bot)

Estas regras hoje vivem em JavaScript espalhado nos Code nodes do n8n. Ao construir o site,
o ideal é portar isso pra funções RPC no Postgres — assim bot e site chamam a mesma lógica.

1. **Registrar parto** deve, na mesma transação lógica:
   - Fechar a lactação anterior: `UPDATE partos SET ativa=false WHERE vaca_id=X AND ativa=true`
   - Calcular `iep` = dias entre a data do novo parto e a `data_parto` do parto anterior ativo
     (null se for o primeiro parto da vaca)
   - Vincular a cobertura confirmada mais recente (`diagnostico_prenhez='positivo'`) como
     `cobertura_id` do novo parto, se existir
   - Atualizar a vaca: `status_produtivo='lactacao'`, `status_reprodutivo='vazia'` (ela precisa
     ser coberta de novo — **não** usar "lactante", esse valor não existe no vocabulário real)
   - Criar um registro em `bezerros` (mae_id = vaca, parto_id = novo parto), já preenchendo
     `numero_identificacao`, `sexo` e `data_nascimento` — esses três campos são capturados neste
     momento, não depois (ver regra 4 pra como isso é usado no cadastro da vaca gerada por esse
     bezerro)

2. **Registrar leite** exige que a vaca tenha um parto com `ativa=true`. Sem isso, o insert
   falha (`parto_id` é `NOT NULL`). Sempre checar e responder algo instrutivo antes de tentar
   inserir, não deixar estourar erro de constraint.

3. **Diagnóstico de prenhez** (`coberturas.diagnostico_prenhez`) *deveria* atualizar só a cobertura
   **mais recente** da vaca — isso é a intenção (permitindo tanto confirmar `pendente` →
   `positivo`/`negativo` quanto corrigir um diagnóstico já registrado errado, inclusive voltar
   pra `pendente`). **Mas o bot hoje não implementa isso com precisão**: o UPDATE filtra só por
   `vaca_id` (sem `ORDER BY data_cobertura DESC LIMIT 1` nem filtro por `id` de cobertura
   específica), então se a vaca tiver mais de uma cobertura na tabela, **todas** são atualizadas
   pelo mesmo UPDATE. Ao portar essa regra pro site/RPC, implementar corretamente com
   `ORDER BY data_cobertura DESC LIMIT 1` (ou UPDATE só pelo `id` da cobertura certa) — não repetir
   o bug do bot.

4. **Cadastro de vaca nova**: se não vier número, usar `MAX(numero_identificacao) + 1` da
   propriedade. Sempre checar duplicata antes de inserir (número já pode existir). Se a vaca
   tiver mãe informada (`numero_mae`), o vínculo com o bezerro correspondente deve ser feito em
   duas etapas, nesta ordem:
   1. Tentar achar por número: `bezerros.numero_identificacao = <número da vaca sendo cadastrada>
      AND bezerros.mae_id = <mãe>`. Esse é o caminho esperado agora que `numero_identificacao` de
      `bezerros` é preenchido no registro do parto (ver schema acima).
   2. Só se não encontrar nada por número, cair no fallback antigo: pegar o bezerro **sem**
      `vaca_id_gerada` mais recente dessa mãe (`ORDER BY created_at DESC LIMIT 1`). Esse fallback
      existe pra cobrir bezerros antigos, cadastrados antes dessa mudança, que ficaram sem
      número.

   **Nota de implementação**: a função `cadastrar_vaca` já implementa as duas etapas corretamente
   (`supabase/migrations/0003_cadastrar_vaca_busca_bezerro_por_numero.sql` substituiu a versão
   original em `0002_cadastrar_vaca.sql`, que só fazia a etapa 2).

5. **Cálculos que NÃO devem ser lidos direto do banco** — `partos.dias_em_aberto`,
   `partos.persistencia`, `partos.projecao_305` ficam desatualizados assim que o tempo passa ou
   chega leite novo. O bot calcula isso **ao vivo**, toda vez que gera um relatório, em vez de
   confiar no valor gravado:
   - `dias_em_aberto` = se já tem cobertura pós-parto com diagnóstico positivo, é
     `data_cobertura - data_parto`; senão, é `hoje - data_parto` (continua contando)
   - `projecao_305` = `(litros acumulados na lactação / dias em lactação) × 305`
   - `persistencia` = `(média diária dos últimos 30 dias / média diária dos 30 dias anteriores) × 100`,
     só calculável com pelo menos 60 dias de lactação
   - `iep`, esse sim, é gravado corretamente no momento do parto (ver regra 1) e pode ser lido
     direto do banco.
   - **Regra atual, site e bot** (`src/lib/indicadores.ts` e `_indicadores_lactacao`, 0027): a
     média diária é a média dos DIAS PESADOS (soma das ordenhas do dia ÷ nº de dias com pesagem),
     e projeção 305 e persistência usam essa média. A conta antiga do bot (acumulado ÷ dias em
     lactação) subestimava com controle leiteiro semanal/mensal. Dias em aberto vão até a
     cobertura positiva MAIS RECENTE da lactação.

6. **Deletar qualquer coisa** (registro de leite, lançamento financeiro) deve pedir confirmação
   antes de executar — nunca apagar direto na primeira mensagem/ação. **O bot atual viola essa
   própria regra pro leite, ver BUG #1 abaixo** — o módulo financeiro implementa certo (delete só
   roda depois do usuário responder SIM, via uma pendência salva no Redis com TTL de 300s); use o
   financeiro como referência de implementação correta, não o de leite.

7. **Constantes do ciclo reprodutivo** usadas nos cálculos ao vivo (relatórios), não achadas no
   schema mas fixas no código do bot:
   - Gestação assumida = **283 dias** → `data_parto_previsto = data_cobertura + 283 dias`
     (a partir da cobertura com `diagnostico_prenhez='positivo'`)
   - Secagem prevista = **60 dias antes** do parto previsto
   - Janela de "vacas para secar" nos relatórios gerais = entre 5 dias atrás e 30 dias à frente
     da data de secagem prevista

8. **Módulo financeiro** — regras de negócio (hoje só existem no prompt da IA do bot, sem
   enforcement em SQL/JS; considerar mover pra RPC/constraint se o site for a fonte de verdade):
   - `registrar_financeiro`: se a categoria não vier na mensagem, a IA **infere** uma categoria
     curta e padronizada. Lista de categorias em uso (site e bot, definida em
     `src/app/(app)/financeiro/financeiro-client.tsx`, 2026-09-06): despesa — "ração",
     "medicação", "veterinário", "combustível", "energia elétrica", "mão de obra", "manutenção",
     "produtos da ordenha", "inseminação artificial", "custo com pastagem", "outros"; receita —
     "venda de leite", "venda de animal", "outros". "veterinário" cobre só visita/consulta;
     remédio/vacina/vermífugo vai em "medicação". Categoria vazia grava como `'outros'`.
     Normalização pra minúsculo/sem acento é feita só pela IA no prompt — **não há garantia no
     banco** de que os dados estejam limpos.
   - `consultar_financeiro`: período default (sem `periodo_dias` explícito e sem "hoje" na
     mensagem) é **mês atual + mês passado**. Calcula total de despesas, receitas e saldo, e
     agrupa por `"tipo - categoria"`.
   - `atualizar_financeiro`: localiza o lançamento alvo por `categoria` (case-insensitive) +
     `tipo` + `data` (todos os critérios opcionais), pega o mais recente que bate
     (`ORDER BY created_at DESC`), e **atualiza direto, sem pedir confirmação** (diferente do
     delete).
   - `deletar_financeiro`: mesma lógica de seleção do alvo, mas exige confirmação SIM/NAO antes
     de executar (comportamento correto, ver regra 6).

## Constraints conhecidas no banco

```sql
-- financeiro.tipo só aceita esses dois valores
CHECK (tipo = ANY (ARRAY['receita'::text, 'despesa'::text]))

-- bezerros.sexo só aceita esses três valores
CHECK (sexo = ANY (ARRAY['macho'::text, 'femea'::text, 'natimorto'::text]))
```

## Bugs conhecidos no bot de WhatsApp (achados lendo o workflow n8n em 2026-07-16)

Estes são bugs REAIS no fluxo em produção, não só gaps de documentação. Relevantes porque (a) o
site compartilha o mesmo banco e pode ter que lidar com dados sujos deixados por eles, e (b) não
devem ser reintroduzidos ao portar lógica pro site/RPC.

**Nenhum destes bugs existe mais no JSON do repo** (0022, 0024, 0025 e 0027: escritas e relatórios
do bot passam pelas funções do banco — ver seções "Bot: todas as escritas pelo banco" e
"Relatórios do bot"). Ficam descritos porque explicam dados antigos.

1. **[Crítico] Exclusão de registro de leite não é segura de fato.** No fluxo `deletar_registro`
   (leite), o `DELETE` no Supabase roda **antes** de pedir confirmação SIM/NAO — a mensagem de
   confirmação é decorativa, o registro já foi apagado quando o usuário a lê. Contradiz a regra 6
   acima e a própria instrução do prompt da IA ("nunca execute a exclusão você mesmo"). Comparar
   com `deletar_financeiro`, que implementa a confirmação corretamente.
2. **Relatório reprodutivo individual não calcula projeção 305d / persistência.** Um filtro
   compara `controle_leite.id` com o `id` de uma cobertura (UUIDs de tabelas diferentes, nunca
   batem), então essa busca praticamente sempre retorna vazia. O relatório reprodutivo **geral**
   (sem filtrar por vaca) não tem esse bug e funciona.
3. **`atualizar_registro` (corrigir lançamento de leite) provavelmente não funciona.** O INSERT de
   `controle_leite` nunca grava `periodo` (fica `NULL`), mas a busca de atualização filtra por
   `periodo = entidades.periodo || 'dia_inteiro'` — `NULL != 'dia_inteiro'` no Postgres, então a
   busca não encontra o registro pra atualizar na prática.
4. **`atualizar_registro` (leite) não trata "não encontrado".** Ao contrário do fluxo espelho em
   financeiro, vai direto pro UPDATE sem checar se algo foi encontrado antes — tende a falhar
   silenciosamente.
5. **Diagnóstico de prenhez atualiza por `vaca_id`, não a cobertura mais recente** — ver regra 3
   acima.
6. **`remoteJid` hardcoded no nó de envio de resposta** — toda resposta do bot vai pro mesmo
   número de WhatsApp fixo, independente de quem mandou a mensagem original. Provavelmente
   artefato de ambiente de teste (só um produtor testando hoje), mas bloqueante pra uso
   multi-fazenda real caso ainda esteja assim quando o site for ao ar. **Corrigido no JSON do repo
   (0022)**: os 3 nós de envio usam o remoteJid do webhook — vale só depois de reimportar no n8n.
7. **`usuarios_whatsapp.ativo` nunca é checado** — corrigido no JSON do repo (0024): "Acesso
   Liberado?" exige usuário ativo. Antes disso o nó só aceitava a conversa do número consigo mesmo,
   então produtores de outros números eram ignorados.
8. **`tipo_relatorio='geral'` não tem branch próprio** — o switch só trata explicitamente
   `reprodutivo` e `cadastro`; qualquer outro valor (incluindo `geral` e `leite`) cai no relatório
   de produção de leite.

## Programa de doação de sêmen (0018_programa_semen.sql)

- `touros`: catálogo central (sem propriedade_id). Só o gestor escreve; qualquer usuário logado lê.
- `entregas_doses`: o gestor registra a entrega (pode corrigir/excluir enquanto não confirmada); a
  fazenda confirma via `confirmar_recebimento_doses`. Só entregas confirmadas entram no saldo.
- Saldo (view `saldo_doses`) é sempre calculado: recebidas − coberturas com `dose_programa` −
  baixas, **somando `coberturas_historico`** (registrar_parto arquiva coberturas; sem o histórico a
  dose "voltaria" a cada parto). Excluir a cobertura devolve a dose.
- `baixas_doses` (0021): dose que sai do saldo sem virar inseminação (perda, descarte,
  transferência). A fazenda registra/desfaz via `registrar_baixa_doses`/`deletar_baixa_doses`.
- Coberturas do bot gastam dose desde 0022 (ver seção do bot abaixo).
- `indicadores_reprodutivos_programa` (0021): por fazenda, só doses do programa — taxa de
  concepção (positivas ÷ diagnosticadas; pendentes fora), doses por prenhez, gestações em curso,
  nascimentos. `bezerros.dose_programa` marca o bezerro nascido de dose do programa.
- registrar_parto (desde 0021) só vincula cobertura positiva que **ainda não gerou parto** — antes,
  um segundo parto sem cobertura nova herdava a cobertura (e o touro/dose) do parto anterior.
- `registrar_cobertura`/`atualizar_cobertura` bloqueiam dose sem saldo (`_garantir_saldo_dose`).
- `bezerros.touro_id` (pai) é gravado em registrar_parto a partir da cobertura vinculada — fica no
  bezerro porque `bezerros.parto_id` é zerado quando a lactação é arquivada.
- O gestor escreve só em touros, entregas, adesões e acessos de técnicos (0023); as RPCs de dados
  da fazenda continuam sem enxergá-lo.

### Adesão e linha de base (0019_adesao_linha_base.sql)

- `adesoes_programa`: uma linha por fazenda, com data de adesão e a linha de base **gravada**
  (congelada — lançamento retroativo não muda o ponto de partida). O gestor registra; o sistema
  sugere os valores via `sugerir_linha_base` e o gestor revisa (fazenda nova não tem histórico, aí
  vale o diagnóstico da visita).
- `calcular_indicadores(propriedade, data)` é a régua única da linha de base e do valor de hoje
  (`indicadores_atuais_programa()`): litros/vaca/dia = média das pesagens (soma por vaca/dia) nos
  30 dias até a data; produção/dia = isso × vacas em lactação; receita/despesa = média dos meses com
  lançamento nos 12 meses até a data; custo/litro = despesa mensal ÷ (produção/dia × 30). Rebanho
  usa o status ATUAL das vacas (não há histórico de status).

## Painel do gestor (0020_gestor_dados_reais.sql)

- Todas as abas leem dados reais, agregados no banco: `leite_diario_propriedade` e
  `financeiro_diario_propriedade` (uma linha por fazenda/dia, incluindo lactações arquivadas),
  `resumo_fazendas` (rebanho, último lançamento, IEP, WhatsApp de contato) e
  `indicadores_todas_fazendas()` (régua de calcular_indicadores).
- **Limite de 1000 linhas do PostgREST** (max_rows padrão do Supabase): uma consulta maior é cortada
  sem erro. TODA leitura de lista em src/lib/cached-data.ts passa por `buscarTodasPaginas` — ao
  criar uma nova, use o helper e termine a ordenação num campo único (ex.: id).
- Aba Agente lê `interacoes_log`, mas o workflow do bot exportado no repo **não grava** nessa
  tabela: a tela fica vazia até o bot ganhar um nó de insert (propriedade_id, intencao_detectada,
  mensagem_recebida, resposta_enviada).

## O que NÃO existe ainda (gaps conhecidos)

- Touro/sêmen: `coberturas.touro_semen` (texto, 0006) e, desde 0018, `touro_id` do catálogo
  central. Até 0022 o bot gravava o texto num campo `touro`; coberturas antigas do bot podem ter o
  touro só ali (ou em lugar nenhum, se essa coluna não existir no banco)
- `patrimonio` não tem nenhuma integração com o bot ainda
- **Decisão (2026-10-11): custo por litro usa só as despesas correntes** (lançamentos de despesa do
  `financeiro`, em `calcular_indicadores`). Patrimônio/depreciação NÃO entra nessa conta — não
  acrescentar.

## Telefone e status reprodutivo (0024_telefone_status_reprodutivo.sql)

- `usuarios_whatsapp.telefone` é gravado só com dígitos e com 55 (trigger). A comparação com o
  número do WhatsApp usa `_telefone_chave`, que ignora o nono dígito (o JID do WhatsApp de muitos
  celulares brasileiros vem sem ele). O bot identifica o usuário por `bot_identificar_usuario`
  (nó "Identificar Usuario"); nunca comparar telefone com `=` direto.
- `vacas.status_reprodutivo` é recalculado por trigger em `coberturas` (site e bot), a partir da
  cobertura mais recente da lactação atual: nenhuma → vazia, pendente → vazia_em_servico,
  positivo → prenhe, negativo → vazia. Edição manual vale até a próxima mudança de cobertura.
- Bot, nó "Acesso Liberado?": processa mensagem de usuário cadastrado e ativo (não grupo) ou a
  conversa do número consigo mesmo (teste), e só de eventos da instância do bot
  (`body.instance === 'Assis Rubens'`) — outra instância com webhook pro mesmo n8n repassava as
  mensagens que ELA recebia (2026-10-11). Trocou a instância? Mude ali também. Desativado recebe aviso; número não cadastrado é
  ignorado em silêncio (a instância pode ser um número pessoal).
- Falha no bot: o nó "Guardar Remetente (Erro)" grava no Redis (`exec_remetente:<execução>`, 15
  min) quem mandou a mensagem — ele tem que ficar ACIMA do "É Áudio?" na tela: com executionOrder
  v1 o n8n roda os ramos da mesma saída um por vez, o mais alto primeiro; abaixo, o erro parava a
  execução antes de gravar (teste 9.8); o workflow `fazenda-leite-erros.json` (Error Trigger) lê isso,
  avisa o produtor que a mensagem pode não ter sido registrada e grava `intencao_detectada='erro'`
  em interacoes_log. Precisa estar selecionado em Settings → Error workflow do workflow principal,
  e o workflow de erros precisa estar **publicado** (não só salvo) pra aparecer nessa lista.
- Datas de "hoje" no site: sempre `hojeBrasil()` de `src/lib/datas.ts` (fuso de Fortaleza), nunca
  `new Date().toISOString()`.

## Acesso de técnicos (0023_acesso_tecnicos.sql)

- O vínculo é a própria `usuarios_propriedades` (0001), com `papel='tecnico'`. Toda RPC/policy só
  confere "existe vínculo", então o técnico lê e escreve tudo da fazenda, como o produtor; com
  mais de uma fazenda, o seletor do cabeçalho troca entre elas.
- Quem concede/remove (`vincular_tecnico` por e-mail, `desvincular_tecnico`): o produtor da fazenda
  (modal da fazenda → Acessos) ou o gestor (aba Técnicos — necessário pra fazenda só-WhatsApp, que
  não tem produtor com conta). O técnico não concede nada; vínculo de produtor nunca sai por aqui.
- O técnico cria a conta antes (login → Cadastre-se → "Sou técnico", ou Google): conta sem
  `nome_propriedade` no metadata não cria fazenda (trigger de 0013).

## Censo do rebanho

- Quadro status produtivo × reprodutivo no topo da tela Vacas (`vacas/censo-rebanho.tsx`),
  calculado no cliente a partir da lista de vacas; tocar num número filtra a lista. Status fora do
  vocabulário (ou nulo) conta como "Outro" pra fechar com o total.

## Bot: todas as escritas pelo banco (0025_bot_funcoes_banco.sql)

- Leite, diagnóstico, cadastro/correção de vaca e financeiro do WhatsApp passam por funções
  `bot_*` (nós "... (RPC)" no workflow), com a mesma regra do site — o n8n não grava mais direto
  em tabela nenhuma. Todas devolvem `{ok, mensagem}`; o nó "Confirmar ..." seguinte só repassa a
  mensagem.
- Leite (`_registrar_leite`, também usado pelo site): litros entre 0 e 100, data não futura (fuso
  de Fortaleza, `_hoje_fazenda()`) e não anterior ao parto ativo; mesma ordenha repetida no mesmo
  dia é recusada; vaca com status "seca" é recusada (0040 — a secagem não fecha a lactação, então
  o parto continua ativo; as telas de Leite e Pesagem também não listam vaca seca). Corrigir/apagar com mais de uma ordenha no dia usa o período falado; sem dar pra
  saber qual, responde listando as opções em vez de adivinhar.
- Exclusões (leite e financeiro) continuam em duas etapas: `bot_localizar_*_exclusao` devolve a
  pergunta e o id (pendência no Redis); só depois do SIM `bot_excluir_*` apaga, conferindo que o
  registro é da fazenda do telefone.
- Corrigir/apagar financeiro exige categoria ou data (antes pegava o lançamento mais recente da
  fazenda). Categoria gravada pelo bot é normalizada no banco (`_categoria_normalizada`).

## Testes automáticos

- `npm test`: `tests/indicadores.test.mjs`, `tests/offline.test.mjs` (filas do celular + service
  worker, com rede simulada) e `tests/banco.test.mjs` (banco montado do zero num Postgres em
  memória — PGlite — + `supabase/tests/rpc_tests.sql` inteiro + dados de exemplo). Não toca na
  produção. `npm run typecheck` = tsc.
- GitHub Actions (`.github/workflows/verificacao.yml`) roda lint, tipos, testes e build a cada push.
  Migration nova ou regra nova: acrescente o teste em `rpc_tests.sql` (ou num `tests/*.test.mjs`)
  no mesmo commit.

## Homologação e banco do zero

- As tabelas originais (propriedades, vacas, partos...) NÃO são criadas por nenhuma migration — o
  estado anterior à 0001 está em `supabase/base/0000_esquema_original.sql`.
- `node scripts/montar-banco.js [--com-dados]` junta 0000 + todas as migrations (+ a Fazenda
  Demonstração) em `supabase/homologacao/banco_completo.sql`, pra um Supabase novo. Verificado:
  banco montado do zero + `rpc_tests.sql` inteiro passam (Postgres 16 e 18).
- Migration nova precisa continuar funcionando nos dois caminhos: em cima da produção e no banco
  montado do zero. Ao acrescentar coluna em tabela original, use `add column if not exists`.
- Passo a passo do ambiente (Supabase, Easypanel, n8n): `deploy/HOMOLOGACAO.md`.
- E-mail do Auth (confirmação, senha) por SMTP próprio no Brevo: `deploy/SMTP_BREVO.md`. O e-mail
  padrão do Supabase só manda poucos por hora — trava cadastro em grupo. Links dos modelos passam
  por `/auth/confirm` (token_hash).
  `scripts/workflow-homologacao.js` gera as cópias dos workflows sem as credenciais de produção.

## Visitas técnicas (0032_visitas.sql)

- `visitas` (data, observações, autor + `autor_nome` gravado) e `recomendacoes` (texto, prazo,
  concluída em/por). Escrita só por `registrar_visita`, `concluir_recomendacao` (qualquer vínculo
  da fazenda marca/desmarca) e `excluir_visita` (só o autor); leitura por RLS pra quem tem vínculo.
- `/relatorio`: formulário da visita + histórico com as recomendações marcáveis (não imprime). O
  resumo da fazenda (PDF e gestor) mostra "Recomendações em aberto" e a última visita.

## Diagnóstico de dados antigos

- `supabase/diagnosticos/dados_antigos.sql`: só leitura, roda no SQL Editor e lista sujeira deixada
  por bugs antigos (categorias, diagnóstico repetido em cobertura antiga, número de vaca repetido,
  bezerros sem número/sexo, lactação duplicada, leite em dobro, telefone fora do formato, fazenda
  órfã). A correção vira migration depois de revisar o resultado — não corrigir às cegas.

## Lembretes diários pelo WhatsApp (0031_lembretes.sql) — SUSPENSOS (0043)

- **Suspensos desde 11/10/2026**: a instância é Evolution (API não oficial) e disparo iniciado pelo
  número pra várias fazendas arrisca bloquear a conta. Workflow despublicado; site esconde a opção
  (`LEMBRETES_WHATSAPP_DISPONIVEL` em `fazenda-modal.tsx`); `bot_acao` responde que não está
  disponível. Pra voltar (API oficial da Meta ou resumo por e-mail): ligar a constante e rever
  `bot_acao`. Respostas do bot (inclusive o aviso de erro) continuam — são reativas, não disparo.

- Workflow separado `fazenda-leite-lembretes.json` (6h, fuso de Fortaleza; tem também "Testar
  agora"): `lembretes_do_dia()` devolve uma linha por fazenda com lembrete LIGADO e pendência no
  dia (secar ≤7 dias/atrasada, diagnóstico com cobertura de 30+ dias, parto ≤7 dias ou atrasado até
  15, leite sem lançamento há 3+ dias); envia pelo Evolution; `marcar_lembrete_enviado` evita
  repetir no mesmo dia; grava `intencao_detectada='lembrete'` em interacoes_log.
- `propriedades.lembretes_whatsapp` vem DESLIGADO; o produtor liga no modal da fazenda (Dados
  gerais). O workflow vem despublicado — nada sai até publicar no n8n.

## Autoria (0030_autoria.sql)

- `controle_leite`, `coberturas`, `partos`, `financeiro`, `vacas`, `bezerros` têm `criado_por`,
  `criado_via` ('site' | 'whatsapp'), `atualizado_por`, `atualizado_em`, preenchidos por trigger
  em toda escrita (`auth.uid()` nulo = bot). Não precisa passar nada nas funções.
- Arquivar a lactação copia período e autoria pro `controle_leite_historico` (trigger no histórico).
- Site: linha "Lançado por ... / alterado por ..." nos formulários de edição de leite, financeiro,
  cobertura e parto; nomes via `getNomesUsuarios` (acessos da fazenda, 0023).

## Bezerra vira vaca (0029)

- `promover_bezerro` (botão "Virou vaca" em Bezerros): cria a novilha com o mesmo número e liga
  bezerro ↔ vaca direto (sem a heurística de `cadastrar_vaca`). Macho/natimorto recusado.

## Resumo da fazenda (gestor e relatório de visita)

- Produção/dia e L/vaca/dia do resumo vêm de `calcular_indicadores` (mesma régua do ranking e da
  linha de base) — não da média do total diário da fazenda, que subestima com pesagem espalhada.
- **Índices da fazenda pro produtor** (12/10/2026): `carregarIndicadoresFazenda`
  (`src/lib/indicadores-fazenda.ts`) + `IndicadoresFazendaView` — L/vaca/dia, produção/dia,
  receita e despesa por mês, custo por litro, receita por litro (receita ÷ litros do mês) e sobra
  por litro; comparação com a adesão ao programa quando existe; taxa de concepção, doses por
  prenhez, gestações e nascidos do programa de sêmen. Aparece no Início, no relatório da visita e
  no resumo do gestor — mesmos números do ranking.
- `carregarResumoFazenda` (`src/lib/resumo-fazenda.ts`) + `ResumoFazendaView`
  (`src/app/resumo-fazenda-view.tsx`): rebanho, médias (produção/dia, L/vaca/dia, projeção 305,
  IEP, dias em aberto), pendências (secar, diagnóstico, partos previstos), tabela das lactações
  com os indicadores da ficha, produção 60 dias e financeiro 6 meses. Usa service role: quem chama
  valida o acesso.
- `/relatorio` (produtor/técnico, fazenda atual) e `/gestor/fazendas/[id]` (gestor, só leitura)
  usam o mesmo resumo; "Imprimir / salvar PDF" usa o print do navegador (cabeçalho e navegação
  somem na impressão).
- Aba Alertas do gestor: seção Reprodução lê `alertas_reprodutivos()` (0028) — diagnóstico +45
  dias, secagem/parto atrasados, vazia +120 dias em lactação, doses sem confirmação +7 dias. O
  botão de documento de cada alerta abre o resumo da fazenda.

## Entrada de fazendas e produtores (0044, 0046, 0047)

- **O produtor se cadastra no site primeiro** — o cadastro "Sou produtor" cria a fazenda e grava o
  WhatsApp (obrigatório desde 12/10/2026), que é o que libera o número pro bot ("Acesso Liberado?"
  ignora número não cadastrado). Roteiro: `deploy/ENTRADA_PRODUTORES.md`.
- Conta sem fazenda (entrou com Google): a tela "Sua conta ainda não tem fazenda" tem "Sou
  produtor: cadastrar minha fazenda" (`criar_minha_fazenda`, 0047) — mesma coisa do cadastro;
  WhatsApp de outra fazenda é recusado.
- Exceção: gestor → Acessos → **Cadastrar fazenda** (`gestor_criar_fazenda`) pra quem não consegue
  se cadastrar; o WhatsApp fala com o bot na hora.
- Conta do site de quem já usa o bot: o produtor se cadastra normal em "Sou produtor" com o
  WhatsApp da fazenda; o trigger de cadastro (`handle_new_user_signup`, 0046) vê que o número já é
  de uma fazenda (`_telefone_chave`) e NÃO cria outra — a conta fica sem fazenda e a tela "Falta
  liberar seu acesso" explica. O gestor (ou o produtor dono) liga pelo e-mail em "Dar acesso ao
  site" → Produtor (`vincular_produtor`; técnico da fazenda vira produtor). Nunca liga sozinho pelo
  número (bastaria digitar o de outra pessoa). Só o gestor remove produtor (`desvincular_produtor`).
- Campos de WhatsApp usam `CampoTelefone` (`src/app/campo-telefone.tsx`): máscara (85) 99999-9999.

## Importar rebanho por planilha (0045_importar_rebanho.sql)

- Vacas → **Importar planilha** (`/vacas/importar`, produtor/técnico da fazenda). Abas Vacas
  (número, nome, situação, mãe, último parto, bezerro do parto, última cobertura, touro,
  diagnóstico), Bezerros e Leite (só da lactação atual). Modelo .xlsx gerado na própria tela.
- Leitura no navegador (`src/lib/planilha-rebanho.ts`, SheetJS do cdn.sheetjs.com — a versão do
  npm é antiga e vulnerável): só FORMATO (colunas com outros nomes, datas, variações de escrita).
  Regras e gravação no banco: `importar_rebanho(propriedade, dados, modo)` — 'validar' faz tudo e
  desfaz (a prévia é exatamente o que a importação faria), 'importar' é tudo ou nada,
  'importar_ok' grava só as linhas certas. Cada linha num bloco próprio.
- Bezerro do parto só é criado se a planilha informar. `vacas.nome` é opcional (aparece no site);
  o bot continua só pelo número.

## Cobertura atual (0038_cobertura_atual.sql)

- "Pra secar", "partos previstos" e "aguardando diagnóstico" usam só a **cobertura atual** de cada
  vaca: a mais recente da lactação atual (data >= parto ativo; sem parto, todas), ignorando a que
  já virou parto. Banco: view `coberturas_atuais` (bot, lembretes, alertas do gestor). Site:
  `coberturaAtualPorVaca` em `src/lib/indicadores.ts` (Início e resumo da fazenda). Positiva de
  antes do parto atual, sem vínculo, é gestação que já terminou — não vira "secagem atrasada".

## Leite da lactação e parto duplicado (0039)

- Indicadores (site e bot) contam o leite DA VACA com data entre o parto ativo e hoje — não pelo
  `controle_leite.parto_id`, que em dado antigo aponta pro parto anterior (o bot antes da 0022
  fechava a lactação só com ativa=false, sem arquivar; esses partos inativos continuam em `partos`).
- Trigger `partos_recusar_duplicado`: parto a menos de 240 dias de outro da mesma vaca (partos ou
  partos_historico) é recusado — vale pra site, bot e campo.

## Gestor: gestores, planilhas e fazenda própria (0037_gestores.sql)

- Aba "Acessos" (`/gestor/tecnicos`): seção "Gestores do programa" — `listar_gestores`,
  `adicionar_gestor` (por e-mail de conta existente), `remover_gestor` (nunca deixa zero gestores).
  Só gestor executa.
- Gestor que também tem vínculo com fazenda usa o site normalmente; o layout de (app) só manda pro
  /gestor quem não tem fazenda. Botões "Painel do gestor" / "Minha fazenda" alternam.
- Planilhas (Visão Geral → Exportar): `GET /gestor/exportar/{fazendas|leite|financeiro|doses}`.
  Route handler não passa pelo layout de /gestor: checa `isGestor()` na própria rota. CSV pelo
  `src/lib/csv.ts` (BOM, ";", vírgula decimal, datas dd/mm/aaaa) — mesmo formato que o Excel em
  português abre direto.

## Bot: doses, lembretes e bezerra→vaca (0036_bot_acoes.sql)

- "Quantas doses eu tenho?" → `consultar_relatorio` com `tipo_relatorio='doses'` → `_rel_doses`
  (saldo por touro + entregas esperando confirmação).
- Intenção `outras_acoes` (saída própria no "Rotear Intencao" → nó "Outra Ação (RPC)" →
  `bot_acao`) com `entidades.acao`: `confirmar_doses` (entregas pendentes, só do touro falado se
  disser), `ligar_lembretes`/`desligar_lembretes`, `promover_bezerro` (`numero_bezerro`).
  `_promover_bezerro` é a regra única (site chama via `promover_bezerro`, com checagem de acesso).
- O nó "Parsear Resposta IA" monta as entidades campo a campo e só aceita intenções de
  `INTENCOES_VALIDAS` (o resto vira "outro"): entidade ou intenção nova no prompt precisa ser
  acrescentada lá também (outras_acoes ficou de fora até 2026-10-11).

## Relatórios do bot (0027_bot_relatorios.sql)

- Consultas do WhatsApp (`consultar_vaca`, `consultar_relatorio`, `consultar_financeiro`) vão
  todas pro nó "Consultar (RPC)" → `bot_consultar`, que escolhe o relatório e devolve o texto
  pronto (versão curta, sem formatação, quando a pergunta veio por áudio). Nada mais é baixado e
  filtrado no n8n.
- Indicadores por `_indicadores_lactacao(parto_id)` — mesma regra de `src/lib/indicadores.ts`
  (média dos dias pesados). Site e bot mostram os mesmos números.
- Roteamento: financeiro → `_rel_financeiro`; `cadastro` → censo; com número de vaca →
  `reprodutivo`, `leite` ou os dois (`geral`/sem tipo); sem número → `reprodutivo` (rebanho),
  `geral` (produção + reprodução) ou produção. Período: "hoje", "mês" (financeiro),
  `periodo_dias`, senão mês atual + passado (`_periodo_consulta`).

## Uso sem internet (pesagem do dia)

- `public/sw.js` (service worker, registrado por `RegistrarOffline` no layout do app): guarda os
  arquivos do site e a tela `/leite/pesagem` (busca na rede quando dá; sem rede, a última cópia).
  Ao abrir o site com internet, pede pra guardar a pesagem (no máx. a cada 10 min). Outras telas
  sem rede mostram uma página com atalho pra pesagem. Nunca guarda o redirecionamento pro /login;
  a tela de login manda "limpar" (as cópias têm dados da fazenda).
- Sem sinal, a pesagem vai pra fila do celular (`src/lib/fila-offline.ts`, localStorage) e é
  enviada sozinha quando a internet volta (ou no botão "Enviar agora"). O envio — com ou sem
  internet — é pelo endereço fixo `POST /api/pesagem` (não por Server Action, cujo id muda a cada
  deploy). Reenviar é seguro: `registrar_pesagem` corrige a mesma ordenha. 401 = sessão expirada →
  fica na fila; recusada pelo servidor → sai da fila mostrando o erro.
- `/campo` ("Lançar no campo", 0035): cobertura, parto e diagnóstico, também offline (fila
  `src/lib/fila-campo.ts` → `POST /api/campo` → `registrar_lancamento_campo`). Como cobertura e
  parto NÃO são idempotentes, cada lançamento leva um id gerado no celular; `lancamentos_campo`
  guarda id + resultado e o reenvio do mesmo id só devolve o resultado, sem lançar de novo.
  Regras: as mesmas `_registrar_cobertura`/`_registrar_parto` de 0022; diagnóstico na cobertura
  mais recente. Recusa de regra volta `{ok:false}` e fica no histórico do celular com o motivo.
- O proxy de autenticação não intercepta `sw.js` nem `manifest.json`.
- Mudou o comportamento do service worker? Troque o sufixo `-v1` dos nomes de cache em `sw.js`.

## Pesagem do dia (0026_pesagem.sql)

- `/leite/pesagem`: todas as vacas com parto ativo numa lista, por data + ordenha (obrigatória).
  `registrar_pesagem` grava em lote com a regra de `_registrar_leite`; vaca que já tem lançamento
  na mesma data/ordenha tem o valor corrigido (não duplica); item vazio é ignorado (nunca apaga);
  erro numa vaca volta na lista de erros sem impedir as outras.

## Bot usando as funções do banco (0022_bot_registro.sql)

- Cobertura e parto pelo WhatsApp passam por `bot_registrar_cobertura`/`bot_registrar_parto`
  (nós HTTP "Registrar Cobertura (RPC)" e "Registrar Parto (RPC)" no workflow), que identificam a
  fazenda pelo telefone e chamam as mesmas funções internas do site (`_registrar_cobertura`,
  `_registrar_parto`). Só a service role executa. Devolvem `{ok, mensagem}` — nunca erro.
- O touro falado é procurado no catálogo por nome ou código (sem acento/maiúscula/espaço); se a
  fazenda tem saldo desse touro, a cobertura gasta dose do programa.
- Nó "Registrar Interação (Log)" grava toda resposta em `interacoes_log` (ramo paralelo, não
  bloqueia a resposta). Intenção `confirmacao_exclusao` = resposta SIM/NÃO de exclusão.
- Os nós de envio (Evolution) respondem pro remoteJid do webhook — antes era um número fixo.
- A URL do Supabase está escrita nos nós HTTP (https://zlgtkcdscwzxgnltodhb.supabase.co).

## Infra do bot (não afeta schema, mas relevante pra UX se o site replicar)

- **Buffer/debounce de mensagens via Redis**: mensagens rápidas em sequência do mesmo telefone são
  concatenadas (chave `buffer:<telefone>`, TTL 120s) e só processadas pela IA depois de um período
  de silêncio, evitando disparar uma chamada de IA por mensagem individual numa rajada.
- **Áudio**: mensagens de voz do WhatsApp são transcritas via Whisper (`whisper-1`, `language: pt`)
  antes de entrar no mesmo pipeline de texto.
- **Confirmação de delete via Redis, não via LLM**: quando existe uma exclusão pendente
  (`pendente_delete:<telefone>`, TTL 300s), a resposta do usuário (SIM/NAO) é interpretada por
  regex simples, **pulando completamente o classificador de IA** nesse turno.
- Modelo do classificador de intenção: `gpt-5-mini`, com memória de conversa em Redis
  (`sessionKey`=telefone, janela de 15 mensagens).

## Onde ver a lógica completa hoje

O workflow n8n exportado (`fazenda-leite-multiagentes.json`, na raiz do projeto) tem a lógica
completa e mais recente do bot, incluindo o texto exato dos prompts do classificador de intenção.
Vale ler antes de portar qualquer regra pro site, porque o JSON é a fonte de verdade mais
atualizada — este documento é um resumo (última conferência linha-a-linha contra o JSON:
2026-07-16), pode ficar desatualizado se o bot mudar depois.
