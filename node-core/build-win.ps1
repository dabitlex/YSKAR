$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build-desktop.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
