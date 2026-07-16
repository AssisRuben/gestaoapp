# Hospedagem no PC (assisrubens.shop)

Visão geral: PM2 (`pm2-runtime`) roda o Next.js em produção na porta 3000;
Caddy fica na frente como proxy reverso, cuidando de HTTPS automático
(Let's Encrypt) pro domínio `assisrubens.shop`. Ambos sobem como **Serviço
do Windows** via NSSM, então voltam sozinhos depois de reiniciar o PC — sem
precisar estar logado.

## Passo a passo (o que falta rodar manualmente)

### 1. `.env.local` (na raiz do projeto, nunca commitado)

```
NEXT_PUBLIC_SUPABASE_URL=https://zlgtkcdscwzxgnltodhb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key do dashboard>
```
Pegue a anon key em: Supabase Dashboard > seu projeto > Settings > API.

### 2. DNS na Hostinger

No painel da Hostinger, na zona DNS de `assisrubens.shop`, criar:
- Registro `A`, host `@`, aponta pra `177.127.8.145` (IP público atual desta
  máquina — **confirme se é fixo**; se a operadora trocar esse IP, o domínio
  para de resolver até atualizar o registro de novo)
- Registro `A`, host `www`, mesmo IP (ou `CNAME www -> assisrubens.shop`)

### 3. Port forwarding no roteador de casa

Encaminhar as portas **80** e **443** (TCP) do roteador pro IP local desta
máquina na rede interna. Isso é feito no painel de administração do
roteador (geralmente `192.168.0.1` ou `192.168.1.1`) — específico de cada
modelo, não dá pra automatizar daqui.

Depois de configurar, teste de fora da rede (ex: 4G no celular, sem wifi)
se `http://assisrubens.shop` responde. Se não responder mesmo com o
forwarding certo, o provedor de internet pode estar usando CGNAT (IP
"público" que na real é compartilhado) — nesse caso port forwarding não
funciona e a alternativa é um túnel (ex: Cloudflare Tunnel) em vez de expor
a porta direto.

### 4. Rodar o script de setup (uma vez, como Administrador)

Abrir PowerShell **como Administrador** e rodar:

```powershell
cd "C:\Users\Assis Montenegro\Desktop\gestaoapp"
.\deploy\setup-windows-services.ps1
```

Isso cria a regra de firewall (80/443 entrada) e registra dois serviços
do Windows: `GestaoAppNext` e `GestaoAppCaddy`, ambos com auto-start e
auto-restart em caso de crash.

## Operação do dia a dia

```powershell
Get-Service GestaoAppNext, GestaoAppCaddy      # status
Restart-Service GestaoAppNext                  # aplicar novo deploy
Get-Content C:\nssm\logs\next-err.log -Tail 50 # logs de erro do site
Get-Content C:\nssm\logs\caddy-err.log -Tail 50
```

## Deploy de uma atualização de código

```powershell
git pull
npm install
npm run build
Restart-Service GestaoAppNext
```
