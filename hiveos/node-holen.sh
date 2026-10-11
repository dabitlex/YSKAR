#!/usr/bin/env bash
# Laedt Node.js fuer das HiveOS-Paket und prueft es.
#
#   bash hiveos/node-holen.sh <zielordner>   -> <zielordner>/node-<v>-linux-x64-glibc-217.tar.xz
#
# Die Fassung "glibc-217" stammt aus den inoffiziellen Bauten des Node-
# Projekts (unofficial-builds.nodejs.org). Sie braucht nur glibc 2.17 und
# laeuft damit auch auf aelteren HiveOS-Abbildern; die offiziellen Bauten
# brauchen glibc 2.28.
#
# Geprueft wird zweimal: gegen SHASUMS256.txt desselben Servers (schuetzt
# vor einem beschaedigten Download) und gegen die hier festgehaltene
# Pruefsumme (schuetzt davor, dass sich die Datei unbemerkt aendert).
set -euo pipefail

NODE_VERSION=v22.23.3
# Festgehalten aus dem ersten Lauf der CI (12.10.2026), dort gegen
# SHASUMS256.txt geprueft. Leer: nur gegen SHASUMS256.txt pruefen.
NODE_SHA256=5473ba6774b3c631201a1d29fd4f1809fd927d2266894c544ca47f301eec15bf

ziel=${1:?Zielordner fehlt}
mkdir -p "$ziel"
datei="node-$NODE_VERSION-linux-x64-glibc-217.tar.xz"
basis="https://unofficial-builds.nodejs.org/download/release/$NODE_VERSION"

curl -fsSL --retry 3 -o "$ziel/$datei" "$basis/$datei"
curl -fsSL --retry 3 -o "$ziel/SHASUMS256.txt" "$basis/SHASUMS256.txt"

erwartet=$(awk -v d="$datei" '$2 == d { print $1 }' "$ziel/SHASUMS256.txt")
ist=$(sha256sum "$ziel/$datei" | cut -d' ' -f1)
[[ -n $erwartet ]] || { echo "$datei steht nicht in SHASUMS256.txt" >&2; exit 1; }
[[ $ist == "$erwartet" ]] || { echo "Pruefsumme falsch: $ist statt $erwartet" >&2; exit 1; }
if [[ -n $NODE_SHA256 ]]; then
  [[ $ist == "$NODE_SHA256" ]] || { echo "Pruefsumme $ist weicht von der festgehaltenen $NODE_SHA256 ab" >&2; exit 1; }
  echo "Node $NODE_VERSION: Pruefsumme stimmt mit SHASUMS256.txt und der festgehaltenen ueberein"
else
  echo "Node $NODE_VERSION: Pruefsumme stimmt mit SHASUMS256.txt ueberein -- noch nicht festgehalten: $ist"
fi
rm -f "$ziel/SHASUMS256.txt"
echo "$ziel/$datei"
