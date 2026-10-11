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
  -- `periodo` NÃO existe mais nesta instância (confirmado via information_schema em
  -- 2026-07-19) — apesar do que este documento dizia antes. registrar_leite/atualizar_leite
  -- (site) e registrar_parto (arquivamento) ainda tentavam gravar/ler essa coluna e quebravam
  -- de verdade; corrigido em supabase/migrations/0016_remove_periodo_controle_leite.sql. Se o
  -- bot do WhatsApp ainda referencia `periodo` em algum fluxo, esse fluxo também está quebrado.

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
7. **`usuarios_whatsapp.ativo` nunca é checado** — `Identificar Usuario` filtra só por
   `telefone`. Desativar um usuário no banco não impede que ele continue interagindo com o bot.
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
