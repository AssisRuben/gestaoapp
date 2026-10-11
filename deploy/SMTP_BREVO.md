# E-mail próprio (SMTP) com o Brevo — plano gratuito

Por quê: o e-mail que vem com o Supabase é só pra teste — poucos envios por hora pro projeto todo
(confirmação de cadastro + "esqueci minha senha" somados). Com 40 produtores se cadastrando, trava
com "Muitos e-mails enviados pelo sistema em pouco tempo". O Brevo gratuito manda **300 e-mails por
dia**.

Tempo: uns 30 minutos (mais a espera do DNS, se for usar o domínio).

---

## 1. Conta no Brevo

1. Crie a conta em https://www.brevo.com (plano **Free**). Ele pede dados da empresa e um telefone
   — preencha com os seus.
2. Confirme o e-mail da conta.

## 2. Remetente (quem aparece como "De:")

Use um endereço do **seu domínio** — `assisrubens.shop` — e não um Gmail/Yahoo: e-mail "de"
@gmail.com enviado por outro servidor tende a cair no spam ou ser recusado (o Yahoo recusa).

1. Brevo → menu do canto superior direito → **Senders, Domains & Dedicated IPs** → aba **Domains**
   → **Add a domain** → `assisrubens.shop`.
2. Escolha configurar o DNS **manualmente**. O Brevo mostra 3 ou 4 registros (um código de
   verificação do Brevo, **DKIM** e **DMARC**, às vezes SPF).
3. Crie esses registros no painel onde o domínio `assisrubens.shop` está (onde você aponta o DNS do
   site — ex.: Cloudflare, Hostinger, Registro.br...). Copie nome e valor exatamente; tipo TXT (ou
   CNAME, se o Brevo pedir).
   - Se já existir um registro **SPF** (TXT começando com `v=spf1`), **não crie outro**: acrescente
     `include:spf.brevo.com` dentro do existente, antes do `~all`/`-all`.
   - Se já existir **DMARC** (`_dmarc`), mantenha o existente.
4. Volte no Brevo e clique **Authenticate this domain** (o DNS pode levar de minutos a algumas
   horas).
5. Aba **Senders** → **Add a sender**: nome **Gestão Pec**, e-mail `naoresponda@assisrubens.shop`
   (não precisa existir caixa de entrada pra ele se o domínio estiver autenticado).

## 3. Chave SMTP

1. Brevo → menu do canto superior direito → **SMTP & API** → aba **SMTP**.
2. Anote:
   - **SMTP Server**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Login**: um endereço do tipo `xxxxxxx@smtp-brevo.com` (NÃO é o e-mail da sua conta)
3. **Generate a new SMTP key** → nome "Supabase Gestão Pec" → copie a chave (ela só aparece uma vez).

## 4. Supabase

Painel do projeto de produção → **Authentication**:

1. **Emails → SMTP Settings** → ligue **Enable Custom SMTP**:
   | Campo | Valor |
   |---|---|
   | Sender email | `naoresponda@assisrubens.shop` |
   | Sender name | `Gestão Pec` |
   | Host | `smtp-relay.brevo.com` |
   | Port number | `587` |
   | Username | o Login do passo 3 (`...@smtp-brevo.com`) |
   | Password | a chave SMTP do passo 3 |
   | Minimum interval between emails | `10` segundos (padrão serve) |

   Salve.
2. **Rate Limits** → **Rate limit for sending emails** → `60` por hora (o máximo diário real é o
   do Brevo: 300). Salve.
3. **URL Configuration** → confira **Site URL** = `https://assisrubens.shop` (os links dos e-mails
   usam ela).

## 5. Textos dos e-mails em português

**Authentication → Emails → Templates.** Em cada modelo, troque o assunto e **substitua o corpo
inteiro** pelo código abaixo. Os links passam pela rota `/auth/confirm` do site — copie exatamente.

Não use `<head>`/`<title>` nem texto escondido de pré-visualização: o Gmail mostrou os restos
deles no topo do e-mail ("çã—ã"). Estilo sempre direto nas tags (cliente de e-mail ignora `<style>`).

**Confirm signup** — assunto: `Confirme seu cadastro no Gestão Pec`

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <tr><td style="font-size:22px;font-weight:bold;color:#2f5d3a;padding-bottom:16px;">Confirme seu cadastro</td></tr>
        <tr><td style="font-size:15px;line-height:22px;padding-bottom:12px;">Olá,</td></tr>
        <tr><td style="font-size:15px;line-height:22px;padding-bottom:24px;">Sua conta no <strong>Gestão Pec</strong> foi criada. Falta só confirmar o seu e-mail no botão abaixo.</td></tr>
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/" style="display:inline-block;background:#2f5d3a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 28px;border-radius:6px;">Confirmar meu e-mail</a>
          </td>
        </tr>
        <tr><td style="font-size:14px;line-height:20px;color:#4b5563;padding-bottom:24px;">Se você não se cadastrou no Gestão Pec, ignore este e-mail.</td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;line-height:18px;color:#6b7280;">Gestão Pec Soluções Zootécnicas · Este é um e-mail automático, não responda.</td></tr>
      </table>
    </td>
  </tr>
</table>
```

**Reset Password** — assunto: `Redefinição de senha — Gestão Pec`

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <tr><td style="font-size:22px;font-weight:bold;color:#2f5d3a;padding-bottom:16px;">Redefinir sua senha</td></tr>
        <tr><td style="font-size:15px;line-height:22px;padding-bottom:12px;">Olá,</td></tr>
        <tr><td style="font-size:15px;line-height:22px;padding-bottom:24px;">Recebemos um pedido para redefinir a senha da sua conta no <strong>Gestão Pec</strong>. Clique no botão abaixo para criar uma nova senha:</td></tr>
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha" style="display:inline-block;background:#2f5d3a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 28px;border-radius:6px;">Criar nova senha</a>
          </td>
        </tr>
        <tr><td style="font-size:14px;line-height:20px;color:#4b5563;padding-bottom:24px;">Se você não pediu a redefinição, ignore este e-mail. Sua senha atual continua valendo.</td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;line-height:18px;color:#6b7280;">Gestão Pec Soluções Zootécnicas · Este é um e-mail automático, não responda.</td></tr>
      </table>
    </td>
  </tr>
</table>
```

**Change Email Address** — assunto: `Confirme seu novo e-mail — Gestão Pec`

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <tr><td style="font-size:22px;font-weight:bold;color:#2f5d3a;padding-bottom:16px;">Confirme seu novo e-mail</td></tr>
        <tr><td style="font-size:15px;line-height:22px;padding-bottom:12px;">Olá,</td></tr>
        <tr><td style="font-size:15px;line-height:22px;padding-bottom:24px;">Recebemos um pedido para trocar o e-mail da sua conta no <strong>Gestão Pec</strong> de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>. Clique no botão abaixo para confirmar:</td></tr>
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/" style="display:inline-block;background:#2f5d3a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 28px;border-radius:6px;">Confirmar novo e-mail</a>
          </td>
        </tr>
        <tr><td style="font-size:14px;line-height:20px;color:#4b5563;padding-bottom:24px;">Se você não pediu essa troca, ignore este e-mail. Seu e-mail atual continua valendo.</td></tr>
        <tr><td style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;line-height:18px;color:#6b7280;">Gestão Pec Soluções Zootécnicas · Este é um e-mail automático, não responda.</td></tr>
      </table>
    </td>
  </tr>
</table>
```

## 6. Testar

1. No site, **Esqueci minha senha** com o seu e-mail → deve chegar em segundos, remetente
   "Gestão Pec", em português. Clique no link → abre a tela de nova senha.
2. Cadastre um técnico de teste com um e-mail real (ex.: `seuemail+teste2@gmail.com`) → chega a
   confirmação → clicar entra no site.
3. Brevo → **Transactional → Logs** (ou Statistics) mostra cada envio — útil quando alguém disser
   que "não chegou" (olhe também o spam do destinatário).

## Problemas comuns

- **"Error sending confirmation email"** no cadastro → usuário/senha SMTP errados (o usuário é o
  `...@smtp-brevo.com`, não o e-mail da conta) ou o remetente não está verificado no Brevo.
- **Caiu no spam** → domínio ainda não autenticado (passo 2.4) ou faltou o DKIM.
- **Link abre "link inválido"** → o link do modelo foi alterado; use exatamente os do passo 5, e a
  Site URL do passo 4.3.
- **Conta Brevo nova em análise** → o Brevo às vezes revisa contas novas antes de liberar envio;
  responda o e-mail deles se pedirem informação.
