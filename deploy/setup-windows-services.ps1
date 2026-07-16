# Rodar UMA VEZ, em PowerShell como Administrador (clique direito > Executar como administrador).
# Registra o site (via PM2 runtime) e o Cloudflare Tunnel como Servicos do Windows,
# que sobem sozinhos no boot, sem precisar de login de usuario nem porta aberta no roteador
# (o tunnel so faz conexao de saida pra Cloudflare).
#
# Pre-requisitos ja preparados pelo Claude nesta sessao:
#   - NSSM em C:\nssm\nssm.exe
#   - cloudflared em C:\cloudflared\cloudflared.exe, tunnel "gestaoapp" ja criado e
#     autenticado (C:\Users\Assis Montenegro\.cloudflared\cert.pem), DNS ja apontado
#   - deploy\cloudflared-config.yml com o ingress pro localhost:3000
#   - PM2 instalado globalmente (npm i -g pm2)

$ErrorActionPreference = "Stop"

$appDir       = "C:\Users\Assis Montenegro\Desktop\gestaoapp"
$nodeExe      = "C:\Program Files\nodejs\node.exe"
$pm2Runtime   = "C:\Users\Assis Montenegro\AppData\Roaming\npm\node_modules\pm2\bin\pm2-runtime"
$nssm         = "C:\nssm\nssm.exe"
$cloudflared  = "C:\cloudflared\cloudflared.exe"
$tunnelConfig = Join-Path $appDir "deploy\cloudflared-config.yml"
$logDir       = "C:\nssm\logs"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Install-NssmService($name, $app, $args, $workDir, $stdout, $stderr) {
    $existing = & $nssm status $name 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Servico $name ja existe, removendo para recriar..."
        & $nssm stop $name confirm | Out-Null
        & $nssm remove $name confirm | Out-Null
    }
    & $nssm install $name $app $args
    & $nssm set $name AppDirectory $workDir
    & $nssm set $name AppStdout $stdout
    & $nssm set $name AppStderr $stderr
    & $nssm set $name Start SERVICE_AUTO_START
    & $nssm set $name AppRestartDelay 3000
    Write-Host "Servico $name instalado."
}

# --- Servico do site (Next.js via pm2-runtime) ---
Install-NssmService -name "GestaoAppNext" -app $nodeExe `
    -args "`"$pm2Runtime`" `"$appDir\ecosystem.config.js`"" `
    -workDir $appDir `
    -stdout "$logDir\next-out.log" -stderr "$logDir\next-err.log"

# --- Servico do Cloudflare Tunnel (substitui Caddy + port forwarding) ---
Install-NssmService -name "GestaoAppCloudflared" -app $cloudflared `
    -args "tunnel --config `"$tunnelConfig`" run" `
    -workDir "C:\cloudflared" `
    -stdout "$logDir\cloudflared-out.log" -stderr "$logDir\cloudflared-err.log"

Start-Service GestaoAppNext
Start-Service GestaoAppCloudflared

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "--- Status ---"
Get-Service GestaoAppNext, GestaoAppCloudflared | Format-Table -AutoSize
