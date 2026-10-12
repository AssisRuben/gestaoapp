# Entrada das fazendas no Gestão Pec — roteiro do gestor

Para o gestor do programa colocar cada fazenda pra funcionar. Vale para uma fazenda ou para as ~40
da primeira leva. Guia do produtor (link pra mandar pelo WhatsApp):
https://claude.ai/artifact/E9q1g1TsiAR9Lff7TvUsKG (é privado até ser compartilhado — use o menu
Compartilhar da página antes de mandar o link).

## Antes da primeira fazenda (uma vez só)

- [ ] Migrations até a **0044** rodadas e deploy do site feito (0044 = "Cadastrar fazenda" e
      liberar produtor no painel do gestor).
- [ ] Workflow do bot publicado no n8n, com o workflow de erros selecionado (Settings → Error
      workflow).
- [ ] E-mail do site pelo Brevo funcionando (`deploy/SMTP_BREVO.md`) — sem ele, cadastro no site
      trava em poucos por hora.
- [ ] Planilha com, por fazenda: nome da fazenda, nome do produtor, município/UF, técnico
      responsável e o **WhatsApp que o produtor vai usar** com o bot.

## Cuidado com o WhatsApp (Evolution, API não oficial)

- **Não mande o guia nem avisos do número do bot para muitas pessoas de uma vez.** Mensagem que o
  número inicia, em série, é o que derruba a conta. Mande o link do guia **do seu WhatsApp
  pessoal**, ou espalhe os envios ao longo do dia.
- O bot só responde a quem está cadastrado. Grupos são ignorados.
- Um número de WhatsApp só pode estar em **uma** fazenda.

## Para cada fazenda

1. **Cadastrar a fazenda** — Painel do gestor → **Acessos** → **+ Nova fazenda**: nome, produtor,
   WhatsApp, técnico, município e UF. Na hora em que salva, o produtor já pode usar o bot.
2. **Mandar o guia** pro produtor (do seu WhatsApp pessoal) e pedir pra ele **salvar o número do
   bot** como "Gestão Pec".
3. **Primeira mensagem de teste**: peça pro produtor mandar `quantas vacas eu tenho?`. Resposta com
   0 vacas = número reconhecido. Sem resposta = WhatsApp digitado errado (corrija no cadastro) ou o
   produtor mandou de outro número.
4. **Cadastrar o rebanho pela planilha** — quem tem acesso ao site da fazenda (o técnico que
   atende, depois do passo 6, ou o próprio produtor com conta) vai em **Vacas → Importar
   planilha**, baixa o modelo, preenche (vacas com parto/cobertura/diagnóstico, bezerros e, se
   tiver, as pesagens da lactação atual) e carrega. A tela confere linha por linha e só grava depois
   de confirmar. Também dá pela tela Vacas uma a uma, ou pelo bot (`cadastra a vaca 12`). O gestor
   não lança dados da fazenda.
5. **Situação de cada vaca** (a planilha já cobre isto) — sem isto o bot recusa leite e os
   relatórios ficam vazios:
   - **Em lactação** → registrar o **parto** (Reprodução → Parto), com a data aproximada se não
     souber a exata. Leite só é aceito de vaca com parto registrado.
   - **Seca** → marcar o status como seca (não recebe leite).
   - **Prenhe** → registrar a **cobertura** e o **diagnóstico positivo** (dá o parto previsto e a
     data de secar).
6. **Acesso ao site** (opcional, quando a pessoa quiser usar o site):
   - **Técnico**: cria a conta (Cadastre-se → Sou técnico); você libera em Acessos → Dar acesso ao
     site → **Técnico**, com o e-mail dele e a fazenda.
   - **Produtor que já usa o bot**: cria a conta em Cadastre-se → Sou produtor → marca **"Minha
     fazenda já usa o Gestão Pec pelo WhatsApp"**; você libera em Dar acesso ao site → **Produtor**.
     Se ele esquecer de marcar, o sistema cria uma fazenda vazia em nome dele — nesse caso me avise
     pra remover.
7. **Conferir no painel**:
   - Visão Geral / Ranking: a fazenda aparece (os números aparecem com as primeiras pesagens).
   - Acessos: técnico e produtor ligados na fazenda certa.
   - Agente: as primeiras conversas do WhatsApp.
   - `supabase/diagnosticos/dados_antigos.sql` uma vez por semana nas primeiras semanas — pega
     vaca em lactação sem parto, número repetido etc.

## Limites que importam na primeira leva

| O quê | Limite | Efeito |
|---|---|---|
| E-mails do site (Brevo grátis) | 300 por dia; Supabase em 60 por hora | Cadastros e "esqueci minha senha" |
| Mensagens iniciadas pelo bot | evitar | Risco de bloqueio do número |
| Lembretes automáticos | suspensos (0043) | Pendências ficam no Início do site e em "relatório reprodutivo" |

## Problemas comuns

- **Bot não responde ao produtor** — número cadastrado diferente do que ele usa (confira com DDD;
  o nono dígito não importa) ou ele está num grupo.
- **"Não registrei o leite… não tem parto ativo"** — falta o parto da vaca (passo 5).
- **"Essa vaca está seca"** — a vaca está como seca; se voltou a produzir, registre o parto novo.
- **Produtor criou conta e caiu numa fazenda vazia** — ele não marcou "já uso pelo WhatsApp";
  libere a fazenda certa pra ele e peça a remoção da vazia.
- **"Esse e-mail já tem conta"** no cadastro — a pessoa já se cadastrou antes; use "Esqueci minha
  senha".
