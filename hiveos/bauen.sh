#!/usr/bin/env bash
# Baut das HiveOS-Paket.
#
#   bash hiveos/bauen.sh <version> <yskar-cuda> <node-...-linux-x64*.tar.xz> <zielordner> [yskar-opencl]
#
# Ergebnis: <zielordner>/yskar-hiveos-<version>.tar.gz mit einem Ordner
# yskar-hiveos/ darin -- so verlangt es HiveOS:
#
#   yskar-hiveos/
#     h-manifest.conf h-config.sh h-run.sh h-stats.sh yskar-log.sh
#     LICENSE README.md
#     miner/   der CLI-Miner aus diesem Repository (src/, Engine, package.json)
#     miner/gpu/yskar-cuda
#     miner/gpu/yskar-opencl   AMD und Intel, wenn angegeben
#     node/    Node.js (bin/node und seine Lizenz)
set -euo pipefail

version=${1:?Version fehlt}
cuda=${2:?Pfad zu yskar-cuda fehlt}
nodetar=${3:?Node-Archiv fehlt}
ziel=${4:?Zielordner fehlt}
opencl=${5:-}

[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version '$version' ist keine x.y.z" >&2; exit 1; }
[[ -f $cuda ]] || { echo "$cuda fehlt" >&2; exit 1; }
[[ -f $nodetar ]] || { echo "$nodetar fehlt" >&2; exit 1; }
[[ -z $opencl || -f $opencl ]] || { echo "$opencl fehlt" >&2; exit 1; }

hier="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(dirname "$hier")"
arbeit="$(mktemp -d)"
trap 'rm -rf "$arbeit"' EXIT
p="$arbeit/yskar-hiveos"
mkdir -p "$p/miner/gpu" "$p/node/bin"

# Die Skripte. Die Version steht nur im Manifest.
cp "$hier"/yskar-hiveos/{h-config.sh,h-run.sh,h-stats.sh,yskar-log.sh} "$p/"
sed "s/^CUSTOM_VERSION=.*/CUSTOM_VERSION=$version/" "$hier/yskar-hiveos/h-manifest.conf" > "$p/h-manifest.conf"
grep -qx "CUSTOM_VERSION=$version" "$p/h-manifest.conf"
cp "$repo/LICENSE" "$p/LICENSE"
cp "$hier/README.md" "$p/README.md"

# Der CLI-Miner, wie er im Repository liegt -- genau eine Engine.
engine=$(cd "$repo/miner" && ls miner.*.wasm)
[[ $(wc -w <<< "$engine") == 1 ]] || { echo "Nicht genau eine Engine in miner/: $engine" >&2; exit 1; }
cp -r "$repo/miner/src" "$p/miner/src"
cp "$repo/miner/$engine" "$repo/miner/package.json" "$p/miner/"
cp "$cuda" "$p/miner/gpu/yskar-cuda"
if [[ -n $opencl ]]; then cp "$opencl" "$p/miner/gpu/yskar-opencl"; fi

# Node.js: nur das Programm und seine Lizenz.
tar -xJf "$nodetar" -C "$arbeit" --wildcards '*/bin/node' '*/LICENSE'
cp "$arbeit"/node-v*/bin/node "$p/node/bin/node"
cp "$arbeit"/node-v*/LICENSE "$p/node/LICENSE"

chmod 755 "$p"/*.sh "$p"/miner/gpu/yskar-* "$p/node/bin/node"
chmod 644 "$p/h-manifest.conf"

mkdir -p "$ziel"
name="yskar-hiveos-$version.tar.gz"
# Feste Zeiten und Besitzer: Derselbe Stand ergibt dieselben Bytes.
stand=$(git -C "$repo" log -1 --format=%ct 2>/dev/null || date +%s)
tar --sort=name --mtime="@$stand" --owner=0 --group=0 --numeric-owner \
  -C "$arbeit" -cf - yskar-hiveos | gzip -n -9 > "$ziel/$name"
(cd "$ziel" && sha256sum "$name" > "$name.sha256")
echo "$ziel/$name"
