$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'FREE CRM needs Node.js 22.13.0 or newer. Download it from https://nodejs.org/' -ForegroundColor Yellow
  exit 1
}

$nodeVersion = (node -p "process.versions.node").Trim()
$versionParts = $nodeVersion.Split('.')
if ([int]$versionParts[0] -lt 22 -or ([int]$versionParts[0] -eq 22 -and [int]$versionParts[1] -lt 13)) {
  Write-Host "FREE CRM needs Node.js 22.13.0 or newer; this device has $nodeVersion." -ForegroundColor Yellow
  exit 1
}

$lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $projectRoot 'package-lock.json')).Hash.ToLowerInvariant()
$runtime = (node -p "process.versions.node + '|' + process.platform + '|' + process.arch").Trim()
$expectedStamp = "$runtime|$lockHash"
$stampPath = Join-Path $projectRoot 'node_modules/.free-crm-install-stamp'
$installedStamp = if (Test-Path -LiteralPath $stampPath) { [IO.File]::ReadAllText($stampPath).Trim() } else { '' }
if ($installedStamp -ne $expectedStamp) {
  Write-Host 'Synchronizing FREE CRM dependencies with this device and lockfile…' -ForegroundColor Green
  npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  [IO.File]::WriteAllText($stampPath, "$expectedStamp`n")
}

$localUrl = 'http://127.0.0.1:3477'
$browserCommand = "`$ProgressPreference='SilentlyContinue'; for (`$attempt=0; `$attempt -lt 180; `$attempt++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri '$localUrl' | Out-Null; Start-Process '$localUrl'; break } catch { Start-Sleep -Milliseconds 500 } }"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile', '-Command', $browserCommand -WindowStyle Hidden

Write-Host "FREE CRM is preparing and will open at $localUrl" -ForegroundColor Green
Write-Host 'Keep this window open while you use FREE CRM. Press Ctrl+C to stop.' -ForegroundColor DarkGray
npm.cmd run device
exit $LASTEXITCODE
