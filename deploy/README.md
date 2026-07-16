# Hospedagem no PC (assisrubens.shop via Cloudflare Tunnel)

Visão geral: PM2 (`pm2-runtime`) roda o Next.js em produção na porta 3000
local. O `cloudflared` conecta essa máquina na rede da Cloudflare por uma
conexão de **saída** (outbound) e expõe `assisrubens.shop` /
`www.assisrubens.shop` — sem abrir nenhuma porta no roteador, sem depender
de IP fixo, e com HTTPS resolvido pela própria Cloudflare. Os dois processos
sobem como **Serviço do Windows** via NSSM, então voltam sozinhos depois de
reiniciar o PC, sem precisar estar logado.

Por que Cloudflare Tunnel em vez de Caddy + port forwarding: o domínio já
usa os nameservers da Cloudflare, então dá pra usar o Tunnel direto — mais
simples, funciona mesmo atrás de CGNAT (comum em operadoras brasileiras), e
não expõe a rede de casa a conexões de entrada da internet.

## Já feito nesta sessão

- `cloudflared` instalado em `C:\cloudflared\cloudflared.exe`, autenticado
  (`C:\Users\Assis Montenegro\.cloudflared\cert.pem`)
- Tunnel `gestaoapp` criado (id `11f1ed22-cabd-4632-bc55-a3b2d61a2c9c`)
- DNS já apontado na Cloudflare: `assisrubens.shop` e `www.assisrubens.shop`
  → tunnel (CNAME automático, gerenciado pela Cloudflare)
- Testado manualmente: `https://assisrubens.shop` respondendo HTTP 200
- `deploy/cloudflared-config.yml` com o ingress pro `localhost:3000`

## O que falta rodar manualmente

### 1. Rodar o script de setup (uma vez, como Administrador)

Abrir PowerShell **como Administrador** e rodar:

```powershell
cd "C:\Users\Assis Montenegro\Desktop\gestaoapp"
.\deploy\setup-windows-services.ps1
```

Isso registra dois serviços do Windows com auto-start e auto-restart em
crash:
- `GestaoAppNext` — o site (Next.js via pm2-runtime)
- `GestaoAppCloudflared` — o túnel

Não precisa mexer em firewall nem no roteador — o tunnel só faz conexão de
saída.

## Operação do dia a dia

```powershell
Get-Service GestaoAppNext, GestaoAppCloudflared       # status
Restart-Service GestaoAppNext                          # aplicar novo deploy
Get-Content C:\nssm\logs\next-err.log -Tail 50          # logs de erro do site
Get-Content C:\nssm\logs\cloudflared-err.log -Tail 50   # logs do tunnel
```

## Deploy de uma atualização de código

```powershell
git pull
npm install
npm run build
Restart-Service GestaoAppNext
```

## `.env.local` (na raiz do projeto, nunca commitado)

```
NEXT_PUBLIC_SUPABASE_URL=https://zlgtkcdscwzxgnltodhb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key do dashboard>
```
