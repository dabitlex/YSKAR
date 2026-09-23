$ErrorActionPreference = 'Stop'
Write-Host 'YSKAR Node Core 0.3.1 - Native Desktop Build' -ForegroundColor Cyan
Write-Host ''
node --version
npm --version
Write-Host ''
Write-Host 'Installiere Desktop-Abhängigkeiten...' -ForegroundColor Yellow
& npm install
if ($LASTEXITCODE -ne 0) { throw 'npm install ist fehlgeschlagen.' }
Write-Host ''
Write-Host 'Baue Node-Core-Bundle...' -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Der Node-Core-Build ist fehlgeschlagen.' }
Write-Host ''
Write-Host 'Erstelle native Windows-Anwendung und Installer...' -ForegroundColor Yellow
& npm run dist
if ($LASTEXITCODE -ne 0) { throw 'Der Electron-/Windows-Installer-Build ist fehlgeschlagen.' }
Write-Host ''
Write-Host '========================================' -ForegroundColor Green
Write-Host 'YSKAR Node Core Desktop erfolgreich gebaut' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Green
Write-Host ''
Write-Host 'Installer:' -ForegroundColor Cyan
Write-Host (Join-Path $PSScriptRoot 'release\YSKAR-Node-Core-Setup-0.3.1.exe')
