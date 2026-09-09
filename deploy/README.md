# Hospedagem (assisrubens.shop via Easypanel)

> Este documento descrevia antes uma hospedagem self-hosted no PC via
> Cloudflare Tunnel + NSSM (`GestaoAppNext`/`GestaoAppCloudflared`). Essa
> configuração foi abandonada — os dois serviços do Windows continuam
> registrados na máquina, mas **desabilitados**, e não servem tráfego real há
> tempo. O site roda hoje em outro lugar (abaixo). Os arquivos antigos
> (`setup-windows-services.ps1`, `cloudflared-config.yml`, `nssm.exe`) ficam
> aqui só como histórico; não use como referência de deploy atual.

## Onde roda hoje

**Easypanel**, projeto `fazendaleite`, app `gestaopec`
(`/etc/easypanel/projects/fazendaleite/gestaopec/code/` na VPS). Build via
Nixpacks (detecta Node 22 pelo `engines` do `package.json`) empacotado em
Docker; processo final sobe com `npm start` (`next start`).

## Deploy

Disparado manualmente pelo painel do Easypanel (puxa o commit mais recente de
`origin/main` do GitHub e builda do zero — não é deploy automático em todo
push). Passos:

1. Dar merge/push do que for deployar em `main`.
2. No painel do Easypanel, projeto `fazendaleite` → app `gestaopec`, disparar
   o deploy (rebuild).
3. Acompanhar o log de build. Se falhar com `npm error network` no passo
   `npm ci`, é falha transitória de rede do container de build — tentar de
   novo resolve na maioria das vezes.
4. Confirmar que voltou no ar: `curl -I https://assisrubens.shop/` (deve
   redirecionar pra `/login`).

## Variáveis de ambiente

Passadas como build args do Docker (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), configuradas
no painel do Easypanel, não em `.env.local` no repositório.

**Atenção**: o build do Docker já avisa (`SecretsUsedInArgOrEnv`) que
`SUPABASE_SERVICE_ROLE_KEY` — que dá acesso total ao banco, ignorando RLS —
fica como `ARG`/`ENV` no Dockerfile gerado, o que grava o valor no histórico
de camadas da imagem. Isso é gerado automaticamente pelo Nixpacks a partir da
configuração do Easypanel, não é algo que o código deste repositório
controla — mas vale revisar no painel se há uma forma de passar essa chave
como secret em vez de build arg, já que qualquer pessoa com acesso à imagem
Docker consegue extrair o valor.
