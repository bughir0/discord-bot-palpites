# Gera squarecloud-deploy.zip compativel com Square Cloud (Linux).
# Inclui dist/ pre-compilado (nao precisa de tsc na host), .env, src, etc.
#
# Uso:
#   .\scripts\build-squarecloud-zip.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$zipPath = Join-Path $root "squarecloud-deploy.zip"
$envFile = Join-Path $root ".env"

if (-not (Test-Path $envFile)) {
  Write-Host "ERRO: .env nao encontrado na raiz do projeto." -ForegroundColor Red
  exit 1
}

Write-Host "Compilando TypeScript (npm run build)..." -ForegroundColor Cyan
Push-Location $root
npm run build
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  Write-Host "ERRO: build falhou." -ForegroundColor Red
  exit 1
}
Pop-Location

if (-not (Test-Path (Join-Path $root "dist\index.js"))) {
  Write-Host "ERRO: dist/index.js nao encontrado apos build." -ForegroundColor Red
  exit 1
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$staging = Join-Path $env:TEMP "palpito-squarecloud-$(Get-Random)"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Write-Host "Copiando arquivos do bot..." -ForegroundColor Cyan

Copy-Item (Join-Path $root "dist") (Join-Path $staging "dist") -Recurse -Force
Copy-Item (Join-Path $root "package.json") $staging -Force
Copy-Item (Join-Path $root "tsconfig.json") $staging -Force

# .env seguro para shell da Square Cloud (cron entre aspas, sem comentarios)
$envLines = Get-Content $envFile | Where-Object {
  $_ -match '\S' -and $_ -notmatch '^\s*#'
}
$safeEnv = foreach ($line in $envLines) {
  if ($line -match '^(VERIFICAR_RESULTADOS_CRON|ABRIR_RODADA_CRON)=(.+)$') {
    $key = $matches[1]
    $val = $matches[2].Trim().Trim('"')
    "$key=`"$val`""
  } else {
    $line
  }
}
$envOut = ($safeEnv -join "`n") + "`n"
[System.IO.File]::WriteAllText((Join-Path $staging ".env"), $envOut, [System.Text.UTF8Encoding]::new($false))

$appConfig = Join-Path $root "squarecloud.app"
$content = [System.IO.File]::ReadAllText($appConfig) -replace "`r`n", "`n"
[System.IO.File]::WriteAllText((Join-Path $staging "squarecloud.app"), $content, [System.Text.UTF8Encoding]::new($false))

New-Item -ItemType Directory -Path (Join-Path $staging "data") -Force | Out-Null

Push-Location $staging
tar -caf $zipPath *
Pop-Location
Remove-Item $staging -Recurse -Force

$sizeKb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
Write-Host ""
Write-Host "ZIP pronto: $zipPath ($sizeKb KB)" -ForegroundColor Green
Write-Host "Contem: dist/, .env (cron com aspas), squarecloud.app, package.json" -ForegroundColor Cyan
Write-Host "Faca upload na Square Cloud com 'Publish to Web'" -ForegroundColor Yellow
