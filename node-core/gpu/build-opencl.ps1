<#
  YSKAR OpenCL-Miner (AMD, Intel) fuer Windows bauen.

  Ergebnis: gpu\bin\yskar-opencl.exe

  Aufruf aus dem Ordner node-core:

    powershell -ExecutionPolicy Bypass -File gpu\build-opencl.ps1

  Gebraucht werden nur node (fuer den Kernel-Quelltext) und Visual Studio
  oder die Build Tools mit "Desktopentwicklung mit C++". Kein OpenCL-SDK
  und kein CUDA: Das Programm laedt OpenCL.dll erst beim Start. Die bringt
  jeder AMD-, Intel- und NVIDIA-Grafiktreiber mit.

  Gelinkt wird mit /MT (statische C-Laufzeit). Der Zielrechner braucht
  also kein Visual-C++-Redistributable, nur den Grafiktreiber.
#>
param(
  [string] $VcVarsVer = ''
)
$ErrorActionPreference = 'Stop'

$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$bin = Join-Path $hier 'bin'
$ziel = Join-Path $bin 'yskar-opencl.exe'
New-Item -ItemType Directory -Force -Path $bin | Out-Null

# ------------------------------------------------------ Visual Studio
# Wie in build-gpu.ps1: vswhere finden und die Umgebung von vcvars64
# uebernehmen -- keine "Developer PowerShell" noetig.
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path $vswhere)) {
    throw 'cl.exe nicht gefunden und vswhere fehlt. Visual Studio Build Tools mit "Desktopentwicklung mit C++" installieren.'
  }
  $vs = & $vswhere -latest -products * `
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
    -property installationPath
  if (-not $vs) { throw 'Keine Visual-Studio-Installation mit C++-Werkzeugen gefunden.' }
  $vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
  if (-not (Test-Path $vcvars)) { throw "vcvars64.bat fehlt: $vcvars" }
  $vcArgs = if ($VcVarsVer) { " -vcvars_ver=$VcVarsVer" } else { '' }
  cmd /c "`"$vcvars`"$vcArgs >nul 2>&1 && set" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
  Write-Host "MSVC:  $vs"
}
if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) { throw 'cl.exe ist auch nach vcvars64 nicht verfuegbar.' }

# ------------------------------------------------------ Bauen
Write-Host '1/2 Kernel-Quelltext (yskar_sha256.h + yskar_opencl.cl)'
& node (Join-Path $hier 'opencl-quelle.mjs') $bin
if ($LASTEXITCODE -ne 0) { throw 'opencl-quelle.mjs ist fehlgeschlagen.' }

Write-Host '2/2 Programm (cl.exe)'
$arbeit = Join-Path ([IO.Path]::GetTempPath()) ("yskar-opencl-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $arbeit | Out-Null
try {
  $vorher = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $a = @('/nologo', '/EHsc', '/O2', '/MT', '/std:c++17', '/W3', '/DYSKAR_API_OPENCL',
         "/I$hier", "/I$bin", "/Fo:$arbeit\", "/Fe:$ziel",
         (Join-Path $hier 'yskar_host.cpp'), (Join-Path $hier 'yskar_opencl.cpp'))
  $text = (& cl.exe @a 2>&1 | Out-String)
  $code = $LASTEXITCODE
  $ErrorActionPreference = $vorher
  if ($code -ne 0) { Write-Host $text; throw "cl.exe ist fehlgeschlagen (Code $code)." }
} finally {
  Remove-Item -Recurse -Force $arbeit -ErrorAction SilentlyContinue
}

Write-Host ''
Get-Item $ziel | Format-List FullName, Length
Write-Host "SHA-256: $((Get-FileHash -Algorithm SHA256 $ziel).Hash.ToLower())"

Write-Host ''
Write-Host 'Geraeteerkennung auf diesem Rechner:'
$ErrorActionPreference = 'Continue'
& $ziel --probe
if ($LASTEXITCODE -eq 0) {
  Write-Host 'Selbsttest auf Geraet 0:'
  & $ziel --selftest --device 0
  if ($LASTEXITCODE -ne 0) { throw 'Der Selbsttest ist fehlgeschlagen -- mit dieser Karte nicht minen.' }
} else {
  Write-Host 'Keine AMD- oder Intel-Karte mit OpenCL gefunden -- das ist auf einem Build-Rechner normal.'
}
exit 0
