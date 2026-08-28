$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'FREE CRM needs Node.js 22 or newer. Download it from https://nodejs.org/' -ForegroundColor Yellow
  exit 1
}

$majorVersion = [int]((node --version).TrimStart('v').Split('.')[0])
if ($majorVersion -lt 22) {
  Write-Host 'FREE CRM needs Node.js 22 or newer.' -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'Preparing FREE CRM for its first launch…' -ForegroundColor Green
  npm ci --no-audit --no-fund
}

$localUrl = 'http://localhost:3477'
$browserCommand = "`$ProgressPreference='SilentlyContinue'; for (`$attempt=0; `$attempt -lt 180; `$attempt++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri '$localUrl' | Out-Null; Start-Process '$localUrl'; break } catch { Start-Sleep -Milliseconds 500 } }"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-Command', $browserCommand -WindowStyle Hidden

Write-Host "FREE CRM is preparing and will open at $localUrl" -ForegroundColor Green
Write-Host 'Keep this window open while you use FREE CRM. Press Ctrl+C to stop.' -ForegroundColor DarkGray
npm run device
