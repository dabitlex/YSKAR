#!/usr/bin/env bash
#
# YSKAR OpenCL-Miner (AMD, Intel) fuer Linux bauen.
#
# Ergebnis: gpu/bin/yskar-opencl
#
# Aufruf aus dem Ordner node-core:
#
#   bash gpu/build-opencl.sh
#
# Gebraucht werden nur node (fuer den Kernel-Quelltext) und g++. Kein
# OpenCL-SDK: Das Programm laedt libOpenCL.so.1 erst beim Start. Die bringt
# der Grafiktreiber mit (AMD: ROCm oder AMDGPU-PRO, Intel: Compute Runtime;
# auf manchen Systemen zusaetzlich das Paket ocl-icd-libopencl1).
#
# Gelinkt wird statisch gegen die C++-Standardbibliothek. Auf dem Zielrechner
# braucht es dann nur den Treiber und eine glibc mindestens so neu wie die,
# gegen die gebaut wurde -- sie steht am Ende der Ausgabe.
set -euo pipefail

hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ziel="$hier/bin/yskar-opencl"
mkdir -p "$hier/bin"

echo "1/2 Kernel-Quelltext (yskar_sha256.h + yskar_opencl.cl)"
node "$hier/opencl-quelle.mjs" "$hier/bin"

echo "2/2 Programm (g++)"
g++ -O2 -std=c++17 -Wall -Wextra -DYSKAR_API_OPENCL -I"$hier" -I"$hier/bin" \
  -o "$ziel" "$hier/yskar_host.cpp" "$hier/yskar_opencl.cpp" \
  -static-libstdc++ -static-libgcc -pthread -ldl
strip "$ziel"

echo ""
ls -l "$ziel"
echo "Abhaengigkeiten:"
ldd "$ziel" || true
glibc=$(objdump -T "$ziel" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1)
echo "Braucht mindestens: ${glibc:-?}"
echo "SHA-256: $(sha256sum "$ziel" | cut -d' ' -f1)"

echo ""
echo "Geraeteerkennung auf diesem Rechner:"
if "$ziel" --probe; then
  echo "Selbsttest auf Geraet 0:"
  "$ziel" --selftest --device 0
else
  echo "Keine AMD- oder Intel-Karte mit OpenCL gefunden -- das ist auf einem Build-Rechner normal."
fi
