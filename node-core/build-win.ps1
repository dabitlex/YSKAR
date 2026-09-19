$ErrorActionPreference = 'Stop'
Write-Host 'YSKAR Node Core - Windows Build' -ForegroundColor Cyan
Write-Host ''
node --version
npm --version
Write-Host ''
Write-Host 'Installiere Build-Abhängigkeit...' -ForegroundColor Yellow
npm install
Write-Host ''
Write-Host 'Baue YSKAR Node Core...' -ForegroundColor Yellow
npm run build
Write-Host ''
Write-Host 'Fertig. EXE:' -ForegroundColor Green
Write-Host (Join-Path $PSScriptRoot 'dist\YSKAR-Node-Core.exe')
