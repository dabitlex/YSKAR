$ErrorActionPreference = 'Stop'
Write-Host 'YSKAR Node Core - Direkt-Test' -ForegroundColor Cyan
node --experimental-strip-types "$PSScriptRoot\src\main.ts"
