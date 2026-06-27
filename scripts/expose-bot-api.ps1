# Expoe a API do bot (porta 3001) na internet via Cloudflare Tunnel.
# Nao precisa abrir porta no roteador — funciona mesmo com CGNAT da operadora.
#
# Uso (com o bot ja rodando):
#   .\scripts\expose-bot-api.ps1
#
# Copie a URL https://....trycloudflare.com e configure na Vercel:
#   BOT_API_URL e NEXT_PUBLIC_BOT_API_URL

param(
  [int]$Port = 3001
)

$ErrorActionPreference = "Stop"

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $fallback = "$env:ProgramFiles\cloudflared\cloudflared.exe"
  if (Test-Path $fallback) { return $fallback }
  throw "cloudflared nao encontrado. Instale: winget install Cloudflare.cloudflared"
}

Write-Host ""
Write-Host "=== Expor API do bot (porta $Port) ===" -ForegroundColor Cyan
Write-Host "Certifique-se de que o bot esta rodando (npm run dev)." -ForegroundColor DarkGray
Write-Host ""

try {
  $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/healthz" -UseBasicParsing -TimeoutSec 3
  Write-Host "OK: API respondendo em http://127.0.0.1:$Port" -ForegroundColor Green
} catch {
  Write-Host "AVISO: API nao respondeu em http://127.0.0.1:$Port" -ForegroundColor Yellow
  Write-Host "       Inicie o bot antes: npm run dev" -ForegroundColor Yellow
}

$cloudflared = Find-Cloudflared
Write-Host ""
Write-Host "Iniciando tunel Cloudflare..." -ForegroundColor Cyan
Write-Host "Quando aparecer a URL https://....trycloudflare.com:" -ForegroundColor White
Write-Host "  1. Vercel > palpito (dapp) > Settings > Environment Variables" -ForegroundColor White
Write-Host "  2. Atualize BOT_API_URL e NEXT_PUBLIC_BOT_API_URL com essa URL" -ForegroundColor White
Write-Host "  3. Redeploy: cd dapp; npx vercel --prod --yes" -ForegroundColor White
Write-Host ""
Write-Host "Mantenha esta janela aberta enquanto o bot estiver online." -ForegroundColor DarkGray
Write-Host ""

& $cloudflared tunnel --url "http://127.0.0.1:$Port"
