<#
  YSKAR CUDA-Miner bauen.

  Ergebnis: gpu\bin\yskar-cuda.exe

  Das Programm wird statisch gegen die CUDA-Laufzeit gelinkt. Auf dem
  Zielrechner braucht es dann nur den NVIDIA-Treiber -- kein CUDA Toolkit.

  Aufruf aus dem Ordner node-core:

    powershell -ExecutionPolicy Bypass -File gpu\build-gpu.ps1

  Optional:

    -Arch 50,61,75    nur diese Compute Capabilities
    -Nvcc <Pfad>      bestimmtes nvcc.exe verwenden

  WAS DIESES SKRIPT LOEST

  1. Visual-Studio-Umgebung. nvcc braucht cl.exe als Host-Compiler. Das
     Skript sucht Visual Studio oder die Build Tools ueber vswhere und
     uebernimmt deren Umgebung -- du musst keine "Developer PowerShell"
     oeffnen.

  2. Neuere MSVC-Fassungen mit aelterem CUDA. CUDA 11.8 kennt Visual Studio
     2026 nicht und bricht mit "unsupported Microsoft Visual Studio version"
     ab. Das Skript versucht es erst ohne, dann mit
     -allow-unsupported-compiler. Das ist ein offizieller nvcc-Schalter;
     er schaltet nur die Versionspruefung ab. Weil der Kernel keine
     Standardbibliothek auf der GPU benutzt, ist das Risiko gering -- aber
     es ist ein Risiko, und das Skript sagt es dir, wenn es ihn braucht.

  3. Compute Capabilities. Gebaut wird fuer alle Architekturen, die DEIN
     nvcc kennt, aus einer Liste gaengiger Karten -- nicht fest fuer eine
     bestimmte. Zusaetzlich PTX der hoechsten, damit neuere Karten den Code
     beim ersten Start selbst uebersetzen koennen.
#>
param(
  [int[]] $Arch = @(),
  [string] $Nvcc = '',
  # Bestimmten MSVC-Werkzeugsatz verwenden, z.B. '14.29'.
  #
  # CUDA 11.8 unterstuetzt Visual Studio 2017 bis 2022. Neuere
  # MSVC-Fassungen weist es ab; -allow-unsupported-compiler umgeht die
  # Pruefung, aber nicht jede Unvertraeglichkeit. Die Build Tools bringen
  # meist aeltere Werkzeugsaetze mit -- welche, zeigt:
  #
  #   dir "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
  [string] $VcVarsVer = ''
)
$ErrorActionPreference = 'Stop'
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path
$bin  = Join-Path $hier 'bin'
$ziel = Join-Path $bin 'yskar-cuda.exe'
$quelleGpu  = Join-Path $hier 'yskar_gpu.cu'
$quelleHost = Join-Path $hier 'yskar_host.cpp'
$objGpu  = Join-Path $bin 'yskar_gpu.obj'
$objHost = Join-Path $bin 'yskar_host.obj'
New-Item -ItemType Directory -Force -Path $bin | Out-Null

Write-Host 'YSKAR CUDA-Miner' -ForegroundColor Cyan
Write-Host ''

# ------------------------------------------------------------------ nvcc
if (-not $Nvcc) {
  $kandidaten = @()
  if ($env:CUDA_PATH) { $kandidaten += (Join-Path $env:CUDA_PATH 'bin\nvcc.exe') }
  $imPfad = Get-Command nvcc.exe -ErrorAction SilentlyContinue
  if ($imPfad) { $kandidaten += $imPfad.Source }
  $Nvcc = $kandidaten | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Nvcc -or -not (Test-Path $Nvcc)) {
  throw 'nvcc nicht gefunden. CUDA Toolkit installieren oder -Nvcc angeben.'
}
$vorherEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$nvccVersion = (& $Nvcc --version 2>&1 | Out-String)
$ErrorActionPreference = $vorherEAP
$treffer = [regex]::Match($nvccVersion, 'release (\d+)\.(\d+)')
if (-not $treffer.Success) { throw "nvcc meldet keine Fassung: $nvccVersion" }
$version = $treffer
$cudaMajor = [int]$version.Groups[1].Value
$cudaMinor = [int]$version.Groups[2].Value
Write-Host "nvcc:  $Nvcc"
Write-Host "CUDA:  $cudaMajor.$cudaMinor"

# ------------------------------------------------------ Visual Studio
# Vorbelegt, weil der Block unten uebersprungen wird, wenn cl.exe schon im
# Pfad liegt (Developer PowerShell). Ohne Vorbelegung waere $vs dann leer,
# und der Hinweis bei einem Fehlschlag stuerbe selbst ab.
$vs = ''
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

  # Die Umgebung von vcvars64 in diese Sitzung uebernehmen.
  $vcArgs = if ($VcVarsVer) { " -vcvars_ver=$VcVarsVer" } else { '' }
  cmd /c "`"$vcvars`"$vcArgs >nul 2>&1 && set" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
  Write-Host "MSVC:  $vs$(if ($VcVarsVer) { " (Werkzeugsatz $VcVarsVer)" })"
}
$cl = (Get-Command cl.exe -ErrorAction SilentlyContinue)
if (-not $cl) {
  if ($VcVarsVer) {
    Write-Host ''
    Write-Host "Der Werkzeugsatz $VcVarsVer ist offenbar nicht installiert." -ForegroundColor Yellow
    $msvcDir = if ($vs) { Join-Path $vs 'VC\Tools\MSVC' } else { '' }
    if ($msvcDir -and (Test-Path $msvcDir)) {
      Write-Host 'Vorhanden sind:' -ForegroundColor Yellow
      Get-ChildItem $msvcDir -Directory | ForEach-Object { Write-Host "  $($_.Name)" }
      Write-Host ''
      Write-Host 'Fuer -VcVarsVer genuegen die ersten beiden Stellen, z.B. 14.44.' -ForegroundColor Yellow
    }
    throw "cl.exe mit Werkzeugsatz $VcVarsVer nicht verfuegbar."
  }
  throw 'cl.exe ist auch nach vcvars64 nicht verfuegbar.'
}

# ------------------------------------------------ Compute Capabilities
# Gaengige Architekturen, aelteste zuerst. 50 ist Maxwell (z.B. 940MX,
# GTX 750), 61 Pascal (GTX 10xx), 75 Turing, 86 Ampere, 89 Ada.
$gewuenscht = if ($Arch.Count -gt 0) { $Arch } else { @(50, 52, 60, 61, 70, 75, 80, 86, 89, 90) }

# Welche kennt DIESES nvcc? Neuere Fassungen haben alte entfernt -- CUDA 13
# kennt 50 nicht mehr. Statt zu raten, fragen.
$bekannt = @()
$vorherEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
  $liste = & $Nvcc --list-gpu-arch 2>&1
  foreach ($z in $liste) { if ("$z" -match 'compute_(\d+)') { $bekannt += [int]$Matches[1] } }
} catch { }
$ErrorActionPreference = $vorherEAP
if ($bekannt.Count -eq 0) {
  Write-Host 'nvcc --list-gpu-arch nicht verfuegbar -- verwende die Liste ungeprueft.' -ForegroundColor Yellow
  $bekannt = $gewuenscht
}
$archs = $gewuenscht | Where-Object { $bekannt -contains $_ } | Sort-Object -Unique
$weg = $gewuenscht | Where-Object { $bekannt -notcontains $_ }
if ($archs.Count -eq 0) { throw "Keine der Architekturen $($gewuenscht -join ',') wird von CUDA $cudaMajor.$cudaMinor unterstuetzt." }
if ($weg.Count -gt 0) {
  Write-Host "Von diesem CUDA nicht unterstuetzt, uebersprungen: $($weg -join ', ')" -ForegroundColor Yellow
  if ($weg -contains 50) {
    Write-Host '  Compute Capability 5.0 (z.B. 940MX) braucht ein aelteres CUDA, etwa 11.8.' -ForegroundColor Yellow
  }
}
Write-Host "Architekturen: $($archs -join ', ')"

$gencode = @()
foreach ($a in $archs) { $gencode += "-gencode=arch=compute_$a,code=sm_$a" }
# PTX der hoechsten -- damit auch neuere Karten den Code nutzen koennen.
$hoechste = ($archs | Measure-Object -Maximum).Maximum
$gencode += "-gencode=arch=compute_$hoechste,code=compute_$hoechste"

# ------------------------------------------------------------- Bauen
#
# ZWEI SCHRITTE, und das ist der Kern der Sache:
#
#   1. nvcc uebersetzt NUR den Kernel (yskar_gpu.cu). Diese Datei benutzt
#      keine C++-Standardbibliothek.
#   2. cl.exe uebersetzt die Programmlogik (yskar_host.cpp) ganz ohne CUDA.
#   3. nvcc verbindet beide.
#
# Zusammen in einer Datei bricht MSVC 14.44 ab:
#
#   yvals_core.h: error STL1002: Unexpected compiler version,
#                 expected CUDA 12.4 or newer
#
# CUDA 12.4 kann aber Compute Capability 5.0 nicht mehr. Getrennt
# uebersetzt, sieht nvcc die Standardbibliothek nie -- und beides geht.

function Baue([string[]] $extra) {
  # $ErrorActionPreference muss hier auf 'Continue' stehen.
  #
  # Schreibt ein externes Programm auf die Fehlerspur und wird diese mit
  # 2>&1 eingefangen, macht PowerShell daraus bei 'Stop' einen
  # Abbruchfehler (NativeCommandError). Das Skript stuerbe dann genau in
  # der Zeile, deren Ergebnis es auswerten will -- und der zweite Versuch
  # mit -allow-unsupported-compiler kaeme nie zustande.
  $vorher = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $text = ''
  $code = 0
  try {
    # 1. Kernel
    $a1 = $gencode + $extra + @('-O3', '-c', '-o', $objGpu, $quelleGpu)
    $text += (& $Nvcc @a1 2>&1 | Out-String)
    $code = $LASTEXITCODE
    if ($code -eq 0) {
      # 2. Programmlogik -- ohne CUDA, mit aktueller Standardbibliothek
      $a2 = @('/nologo', '/c', '/EHsc', '/O2', '/std:c++17', "/Fo:$objHost", $quelleHost)
      $text += (& cl.exe @a2 2>&1 | Out-String)
      $code = $LASTEXITCODE
    }
    if ($code -eq 0) {
      # 3. Verbinden. nvcc kennt die CUDA-Laufzeit; statisch gelinkt braucht
      #    der Zielrechner nur den Treiber, kein Toolkit.
      $a3 = $gencode + @('-cudart', 'static', '-o', $ziel, $objGpu, $objHost)
      $text += (& $Nvcc @a3 2>&1 | Out-String)
      $code = $LASTEXITCODE
    }
  } finally {
    $ErrorActionPreference = $vorher
  }
  return @{ Code = $code; Text = $text }
}

Write-Host ''
Write-Host 'Uebersetze...' -ForegroundColor Yellow
$r = Baue @()
if ($r.Code -ne 0 -and $r.Text -match 'unsupported Microsoft Visual Studio version') {
  Write-Host ''
  Write-Host "CUDA $cudaMajor.$cudaMinor kennt diese Visual-Studio-Fassung nicht." -ForegroundColor Yellow
  Write-Host 'Neuer Versuch mit -allow-unsupported-compiler (schaltet nur die Versionspruefung ab).' -ForegroundColor Yellow
  $r = Baue @('-allow-unsupported-compiler')
}
if ($r.Code -ne 0 -and $r.Text -match 'STL1002') {
  # Sollte nach der Trennung nicht mehr vorkommen -- cuda_runtime.h koennte
  # aber selbst eine C++-Kopfdatei hereinziehen. _ALLOW_COMPILER_AND_STL_
  # VERSION_MISMATCH ist der von MSVC selbst vorgeschlagene Ausweg.
  Write-Host ''
  Write-Host 'Die MSVC-Standardbibliothek lehnt diese CUDA-Fassung ab (STL1002).' -ForegroundColor Yellow
  Write-Host 'Neuer Versuch mit _ALLOW_COMPILER_AND_STL_VERSION_MISMATCH.' -ForegroundColor Yellow
  $r = Baue @('-allow-unsupported-compiler', '-Xcompiler', '/D_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH')
}
if ($r.Code -ne 0) {
  Write-Host $r.Text
  if ($r.Text -match 'unsupported Microsoft Visual Studio version' -or $r.Text -match 'STL1002') {
    Write-Host ''
    Write-Host 'Auch mit -allow-unsupported-compiler nicht uebersetzbar.' -ForegroundColor Yellow
    Write-Host 'Welche MSVC-Werkzeugsaetze sind installiert?' -ForegroundColor Yellow
    $msvc = if ($vs) { Join-Path $vs 'VC\Tools\MSVC' } else { '' }
    if ($msvc -and (Test-Path $msvc)) {
      Get-ChildItem $msvc -Directory | ForEach-Object { Write-Host "  $($_.Name)" }
      Write-Host ''
      Write-Host 'Einen davon gezielt verwenden, z.B.:' -ForegroundColor Yellow
      Write-Host '  powershell -ExecutionPolicy Bypass -File gpu\build-gpu.ps1 -VcVarsVer 14.29' -ForegroundColor Yellow
    }
  }
  throw 'Der CUDA-Build ist fehlgeschlagen.'
}

# -------------------------------------------------------- Selbstpruefung
Write-Host ''
Write-Host "Gebaut: $ziel" -ForegroundColor Green
Write-Host ''
Write-Host 'Geraeteerkennung:' -ForegroundColor Cyan
$vorherEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $ziel --probe 2>&1 | Write-Host
$probeCode = $LASTEXITCODE
$ErrorActionPreference = $vorherEAP
if ($probeCode -ne 0) {
  Write-Host ''
  Write-Host 'Das Programm ist gebaut, findet aber keine CUDA-GPU (Treiber? Karte?).' -ForegroundColor Yellow
  Write-Host 'Der Node Core zeigt GPU-Mining dann als nicht verfuegbar an.' -ForegroundColor Yellow
  exit 0
}

# Der eigentliche Beweis: Rechnet die Karte bitgenau wie der Knoten?
Write-Host ''
Write-Host 'Selbsttest (die Karte rechnet den Genesis-Hash):' -ForegroundColor Cyan
$ErrorActionPreference = 'Continue'
& $ziel --selftest --device 0 2>&1 | Write-Host
$testCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($testCode -ne 0) {
  Write-Host ''
  Write-Host 'SELBSTTEST FEHLGESCHLAGEN -- mit dieser Karte bitte nicht minen.' -ForegroundColor Red
  Write-Host 'Der Node Core lehnt sie ohnehin ab. Bitte die Ausgabe melden.' -ForegroundColor Red
  exit 1
}
Write-Host ''
Write-Host 'Selbsttest bestanden. GPU-Mining kann verwendet werden.' -ForegroundColor Green
