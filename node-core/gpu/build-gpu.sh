#!/usr/bin/env bash
#
# YSKAR CUDA-Miner fuer Linux bauen -- das Gegenstueck zu build-gpu.ps1.
#
# Ergebnis: gpu/bin/yskar-cuda
#
# Aufruf aus dem Ordner node-core:
#
#   bash gpu/build-gpu.sh
#
# Optional ueber die Umgebung:
#
#   ARCH="75 86"     nur diese Compute Capabilities
#   NVCC=/pfad/nvcc  bestimmtes nvcc verwenden (sonst das aus PATH)
#
# Das Programm wird statisch gegen die CUDA-Laufzeit und die
# C++-Standardbibliothek gelinkt. Auf dem Zielrechner braucht es dann nur
# den NVIDIA-Treiber -- kein CUDA Toolkit, keine bestimmte libstdc++. Wie alt
# die glibc sein darf, steht am Ende der Ausgabe.
#
# Der Weg folgt dem Vorschlag von derhier in Issue #9: Kernel mit nvcc,
# Programmlogik mit g++, verbunden mit g++ gegen cudart_static.
set -euo pipefail

hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
quelleGpu="$hier/yskar_gpu.cu"
quelleHost="$hier/yskar_host.cpp"
ziel="$hier/bin/yskar-cuda"

nvcc="${NVCC:-$(command -v nvcc || true)}"
if [[ -z $nvcc || ! -x $nvcc ]]; then
  echo "nvcc nicht gefunden. CUDA Toolkit installieren oder NVCC=/pfad/zu/nvcc setzen." >&2
  exit 1
fi
cuda="$(cd "$(dirname "$nvcc")/.." && pwd)"
echo "nvcc: $nvcc"
"$nvcc" --version | tail -1

# ---------------------------------------------------- Compute Capabilities
# Dieselbe Liste wie build-gpu.ps1 (50 Maxwell ... 90 Hopper), dazu 100 und
# 120 (Blackwell, RTX 50xx) -- jeweils nur, wenn DIESES nvcc sie kennt.
# CUDA 13 kennt 50 bis 72 nicht mehr; fuer GTX 9xx/10xx braucht es CUDA 12.
gewuenscht=(${ARCH:-50 52 60 61 70 75 80 86 89 90 100 120})
bekannt=$("$nvcc" --list-gpu-arch 2>/dev/null | sed -n 's/^compute_\([0-9]*\)$/\1/p' || true)
archs=()
weg=()
for a in "${gewuenscht[@]}"; do
  if [[ -z $bekannt ]] || grep -qx "$a" <<<"$bekannt"; then archs+=("$a"); else weg+=("$a"); fi
done
(( ${#archs[@]} > 0 )) || { echo "Keine der Architekturen ${gewuenscht[*]} wird von diesem nvcc unterstuetzt." >&2; exit 1; }
(( ${#weg[@]} == 0 )) || echo "Von diesem nvcc nicht unterstuetzt, uebersprungen: ${weg[*]}"
echo "Architekturen: ${archs[*]}"

gencode=()
for a in "${archs[@]}"; do gencode+=("-gencode=arch=compute_$a,code=sm_$a"); done
# PTX der hoechsten -- damit auch neuere Karten den Code nutzen koennen.
hoechste=${archs[-1]}
gencode+=("-gencode=arch=compute_$hoechste,code=compute_$hoechste")

# --------------------------------------------------------------- Bauen
# Wie unter Windows in getrennten Schritten: nvcc sieht nur den Kernel, die
# Programmlogik uebersetzt der gewoehnliche C++-Compiler ganz ohne CUDA.
arbeit="$(mktemp -d)"
trap 'rm -rf "$arbeit"' EXIT
mkdir -p "$hier/bin"

echo "1/3 Kernel (nvcc)"
"$nvcc" "${gencode[@]}" -O3 -Xptxas -v -c -o "$arbeit/gpu.o" "$quelleGpu" 2> "$arbeit/ptxas.txt" \
  || { cat "$arbeit/ptxas.txt" >&2; exit 1; }
# Liegt der Hash ganz in Registern? ptxas meldet je Architektur den Stapel
# des Kernels. Mehr als 0 Byte heisst: Arbeitswoerter im langsamen lokalen
# Speicher -- der Kernel rechnet dann deutlich langsamer (so bis 0.7.0).
stapel=$(awk '/Function properties for _Z12yskar_kernel/ { getline; print $1 }' "$arbeit/ptxas.txt" | sort -u | tr '\n' ' ')
if [[ -z $stapel ]]; then
  echo "WARNUNG: ptxas hat keine Angaben zum Kernel geliefert."
elif [[ $stapel == "0 " ]]; then
  echo "Kernel: ganz in Registern (0 Byte Stapel) auf allen Architekturen"
else
  echo "WARNUNG: Kernel braucht lokalen Speicher (Stapel in Byte: $stapel)"
  grep -A1 "Function properties for _Z12yskar_kernel" "$arbeit/ptxas.txt" || true
fi

echo "2/3 Programmlogik (g++)"
g++ -O2 -std=c++17 -c -o "$arbeit/host.o" "$quelleHost"

echo "3/3 Verbinden"
cudalib=""
for d in "$cuda/lib64" "$cuda/lib" "$cuda/targets/x86_64-linux/lib"; do
  [[ -f $d/libcudart_static.a ]] && { cudalib="$d"; break; }
done
[[ -n $cudalib ]] || { echo "libcudart_static.a nicht gefunden unter $cuda." >&2; exit 1; }
g++ -o "$ziel" "$arbeit/gpu.o" "$arbeit/host.o" \
  -static-libstdc++ -static-libgcc \
  -L"$cudalib" -lcudart_static -lpthread -ldl -lrt
strip "$ziel"

echo ""
ls -l "$ziel"
echo "Abhaengigkeiten:"
ldd "$ziel" || true
glibc=$(objdump -T "$ziel" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1)
echo "Braucht mindestens: ${glibc:-?}"
echo "SHA-256: $(sha256sum "$ziel" | cut -d' ' -f1)"
