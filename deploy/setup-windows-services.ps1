# Rodar UMA VEZ, em PowerShell como Administrador (clique direito > Executar como administrador).
# Registra o site (via PM2 runtime) e o Caddy (proxy HTTPS) como Servicos do Windows,
# que sobem sozinhos no boot, sem precisar de login de usuario.
#
# Pre-requisitos ja preparados pelo Claude nesta sessao:
#   - NSSM em C:\nssm\nssm.exe
#   - Caddy em C:\caddy\caddy.exe (+ Caddyfile em deploy\Caddyfile)
#   - PM2 instalado globalmente (npm i -g pm2)
#   - node_modules/pm2/bin/pm2-runtime resolvido abaixo

$ErrorActionPreference = "Stop"

$appDir    = "C:\Users\Assis Montenegro\Desktop\gestaoapp"
$nodeExe   = "C:\Program Files\nodejs\node.exe"
$pm2Runtime = "C:\Users\Assis Montenegro\AppData\Roaming\npm\node_modules\pm2\bin\pm2-runtime"
$nssm      = "C:\nssm\nssm.exe"
$caddyExe  = "C:\caddy\caddy.exe"
$caddyfile = Join-Path $appDir "deploy\Caddyfile"
$logDir    = "C:\nssm\logs"

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

# --- Firewall: libera 80/443 de entrada ---
if (-not (Get-NetFirewallRule -DisplayName "GestaoApp HTTP/HTTPS" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "GestaoApp HTTP/HTTPS" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow | Out-Null
    Write-Host "Regra de firewall criada (TCP 80/443 entrada)."
} else {
    Write-Host "Regra de firewall ja existia."
}

# --- Servico do site (Next.js via pm2-runtime) ---
Install-NssmService -name "GestaoAppNext" -app $nodeExe `
    -args "`"$pm2Runtime`" `"$appDir\ecosystem.config.js`"" `
    -workDir $appDir `
    -stdout "$logDir\next-out.log" -stderr "$logDir\next-err.log"

# --- Servico do Caddy (proxy reverso HTTPS) ---
Install-NssmService -name "GestaoAppCaddy" -app $caddyExe `
    -args "run --config `"$caddyfile`"" `
    -workDir "C:\caddy" `
    -stdout "$logDir\caddy-out.log" -stderr "$logDir\caddy-err.log"

Start-Service GestaoAppNext
Start-Service GestaoAppCaddy

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "--- Status ---"
Get-Service GestaoAppNext, GestaoAppCaddy | Format-Table -AutoSize
