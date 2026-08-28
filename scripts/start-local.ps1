$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Clover needs Node.js 22 or newer. Download it from https://nodejs.org/' -ForegroundColor Yellow
  exit 1
}

$majorVersion = [int]((node --version).TrimStart('v').Split('.')[0])
if ($majorVersion -lt 22) {
  Write-Host 'Clover needs Node.js 22 or newer.' -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'Preparing Clover for its first launch…' -ForegroundColor Green
  npm ci --no-audit --no-fund
}

$localUrl = 'http://localhost:3477'
$browserCommand = "Start-Sleep -Seconds 5; Start-Process '$localUrl'"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-Command', $browserCommand -WindowStyle Hidden

Write-Host "Clover is opening at $localUrl" -ForegroundColor Green
Write-Host 'Keep this window open while you use Clover. Press Ctrl+C to stop.' -ForegroundColor DarkGray
npm run device
