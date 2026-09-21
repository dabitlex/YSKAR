$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host 'YSKAR Node Core 0.2.2 - Windows Installer Build' -ForegroundColor Cyan
Write-Host ''

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js wurde nicht gefunden. Bitte Node.js >= 25.5.0 installieren.' }

$nodeVersion = node --version
Write-Host "Node: $nodeVersion"
if ($nodeVersion -notmatch '^v(2[5-9]|[3-9][0-9])\.') { throw 'Node.js >= 25.5.0 wird benötigt.' }

$makensis = $null
$candidates = @(
  "$env:ProgramFiles\NSIS\makensis.exe",
  "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
  "$env:ChocolateyInstall\bin\makensis.exe"
)
foreach ($candidate in $candidates) {
  if ($candidate -and (Test-Path $candidate)) { $makensis = $candidate; break }
}
if (-not $makensis) {
  $cmd = Get-Command makensis -ErrorAction SilentlyContinue
  if ($cmd) { $makensis = $cmd.Source }
}
if (-not $makensis) {
  throw 'NSIS wurde nicht gefunden. Installiere NSIS und starte dieses Skript erneut.'
}

Write-Host ''
Write-Host 'Installiere Build-Abhängigkeiten...' -ForegroundColor Yellow
npm install

Write-Host ''
Write-Host 'Baue Standalone-EXE...' -ForegroundColor Yellow
npm run build

$exe = Join-Path $PSScriptRoot 'dist\YSKAR-Node-Core.exe'
if (-not (Test-Path $exe)) { throw "EXE wurde nicht erzeugt: $exe" }

Write-Host ''
Write-Host 'Baue Windows-Installer...' -ForegroundColor Yellow
& $makensis (Join-Path $PSScriptRoot 'installer\yskar-node-core.nsi')
if ($LASTEXITCODE -ne 0) { throw "NSIS-Build fehlgeschlagen: $LASTEXITCODE" }

$installer = Join-Path $PSScriptRoot 'installer\YSKAR Node Core-Setup-0.2.2.exe'
if (-not (Test-Path $installer)) { throw "Installer wurde nicht erzeugt: $installer" }

Write-Host ''
Write-Host 'FERTIG' -ForegroundColor Green
Write-Host "Standalone-EXE: $exe"
Write-Host "Installer:      $installer"
