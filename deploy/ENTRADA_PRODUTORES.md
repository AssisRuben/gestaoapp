# Entrada das fazendas no Gestão Pec — roteiro do gestor

Para o gestor do programa colocar cada fazenda pra funcionar. Vale para uma fazenda ou para as ~40
da primeira leva.

**Como funciona:** o produtor **se cadastra no site** primeiro. É esse cadastro que cria a fazenda e
libera o WhatsApp dele pro bot — sem ele, o bot nem responde (número não cadastrado é ignorado).

Guia do produtor (link pra mandar): https://claude.ai/artifact/E9q1g1TsiAR9Lff7TvUsKG — é privado
até ser compartilhado: use o menu Compartilhar da página antes de mandar.

## Antes da primeira fazenda (uma vez só)

- [ ] Migrations até a **0047** rodadas e deploy do site feito.
- [ ] Workflow do bot publicado no n8n, com o workflow de erros selecionado (Settings → Error
      workflow).
- [ ] E-mail do site pelo Brevo funcionando (`deploy/SMTP_BREVO.md`) — o cadastro manda e-mail de
      confirmação; sem o Brevo trava em poucos por hora.

## Cuidado com o WhatsApp (Evolution, API não oficial)

- **Mande o link do guia do seu WhatsApp pessoal**, não do número do bot. Mensagem que o número do
  bot inicia, em série, é o que derruba a conta. Espalhe os envios ao longo do dia.
- Um número de WhatsApp só pode estar em **uma** fazenda. Grupos são ignorados pelo bot.

## Para cada fazenda

1. **Mandar o guia** pro produtor (do seu WhatsApp pessoal).
2. **O produtor se cadastra no site** — assisrubens.shop → Cadastre-se → **Sou produtor**: nome da
   fazenda, nome dele, município/UF e o **WhatsApp que vai usar com o bot** (obrigatório). Confirma
   o e-mail que chegar.
   - Quem entra com **Google** cai na tela "Sua conta ainda não tem fazenda" e cadastra a fazenda
     ali mesmo (botão "Sou produtor: cadastrar minha fazenda").
   - Produtor que não consegue se cadastrar sozinho: o gestor cadastra em Acessos → **+ Nova
     fazenda** (o bot fica liberado na hora) e, se depois ele criar conta, liga em Dar acesso ao site
     → **Produtor**.
3. **Salvar o número do bot** como "Gestão Pec" e mandar `quantas vacas eu tenho?`. Resposta com 0
   vacas = tudo certo. Sem resposta = ele está mandando de um número diferente do cadastrado (o
   produtor corrige no site, tocando no nome da fazenda → WhatsApp).
4. **Técnico** que atende a fazenda: cria a conta (Cadastre-se → Sou técnico) e o produtor libera
   pelo menu da fazenda → Acessos (ou você, em Acessos → Dar acesso ao site → Técnico).
5. **Cadastrar o rebanho pela planilha** — o produtor ou o técnico: Vacas → **Importar planilha** →
   baixa o modelo, preenche (vacas com parto, cobertura e diagnóstico; bezerros; pesagens da
   lactação atual, se tiver) e carrega. A tela confere linha por linha e só grava depois de
   confirmar. Também dá vaca a vaca na tela Vacas, ou pelo bot (`cadastra a vaca 12`).
   - Vaca **em lactação precisa do parto** (pode ser data aproximada), senão o bot recusa o leite.
   - Vaca **seca** não recebe leite; **prenhe** precisa da data da cobertura.
6. **Conferir no painel do gestor**:
   - Visão Geral / Ranking: a fazenda aparece (os números vêm com as primeiras pesagens).
   - Acessos: produtor e técnico ligados na fazenda certa.
   - Agente: as primeiras conversas do WhatsApp.
   - `supabase/diagnosticos/dados_antigos.sql` uma vez por semana nas primeiras semanas.

## Limites que importam na primeira leva

| O quê | Limite | Efeito |
|---|---|---|
| E-mails do site (Brevo grátis) | 300 por dia; Supabase em 60 por hora | Confirmação de cadastro e "esqueci minha senha" |
| Mensagens iniciadas pelo bot | evitar | Risco de bloqueio do número |
| Lembretes automáticos | suspensos (0043) | Pendências ficam no Início do site e em "relatório reprodutivo" |

## Problemas comuns

- **Bot não responde** — o produtor manda de um número diferente do cadastrado no site (o nono
  dígito não importa), ou está num grupo, ou ainda não se cadastrou.
- **"Esse WhatsApp já está cadastrado numa fazenda"** / tela "Falta liberar seu acesso" depois do
  cadastro — o número já é de outra fazenda (cadastro em dobro, ou fazenda criada pelo gestor).
  Ligue a conta à fazenda certa em Acessos → Dar acesso ao site → Produtor.
- **"Não registrei o leite… não tem parto ativo"** — falta o parto da vaca (passo 5).
- **"Essa vaca está seca"** — a vaca está como seca; se voltou a produzir, registre o parto novo.
- **"Esse e-mail já tem conta"** no cadastro — a pessoa já se cadastrou antes; use "Esqueci minha
  senha".
