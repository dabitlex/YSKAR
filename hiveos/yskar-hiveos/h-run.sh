#!/usr/bin/env bash
# Startet je Grafikkarte einen CLI-Miner.
#
# NVIDIA-Karten rechnet yskar-cuda, AMD- und Intel-Karten yskar-opencl. Die
# Karten beider Programme stehen in EINER Liste, geordnet nach PCI-Bus wie
# in HiveOS -- GPUS=0,2 meint also dieselben Karten wie das Dashboard. Die
# Liste steht in .karten (Nummer, Programm, Nummer im Programm, Bus); die
# Werte fuer das Dashboard liest h-stats.sh daraus.
#
# Der CLI-Miner bedient genau eine Karte (--device n). Jede Karte bekommt
# ihren eigenen Prozess, ihre eigene Sitzung beim Pool und ihr eigenes
# Protokoll. Mehrere Sitzungen derselben Adresse belegen beim Pool nur
# EINEN Platz -- Plaetze zaehlen Adressen.
#
# Endet ein Miner (Pool nicht erreichbar, Karte ausgefallen), startet nur er
# nach 15 Sekunden neu; die anderen Karten rechnen weiter.
#
# Nach der Vorlage von Alexander (github.com/derhier/yskar-hiveos).

cd "$(dirname "$(readlink -f "$0")")" || exit 1
DIR="$PWD"
. ./h-manifest.conf
. ./yskar-log.sh

wert() { sed -n "s/^$1=//p" "$CUSTOM_CONFIG_FILENAME" 2>/dev/null | tail -1; }
ADRESSE="$(wert ADDRESS)"; API="$(wert API)"; MODUS="$(wert MODE)"
KARTEN="$(wert GPUS)"; EXTRA="$(wert EXTRA)"

if [[ -z $ADRESSE || -z $API ]]; then
  echo "Adresse oder Pool URL fehlt -- Flight Sheet pruefen ($CUSTOM_CONFIG_FILENAME)"
  sleep 30; exit 1
fi

NODE="$DIR/node/bin/node"
CUDA="$DIR/miner/gpu/yskar-cuda"
OCL="$DIR/miner/gpu/yskar-opencl"
chmod +x "$NODE" "$CUDA" "$OCL" 2>/dev/null
mkdir -p "$(dirname "$CUSTOM_LOG_BASENAME")"

# Dieselbe Reihenfolge wie HiveOS: nach PCI-Bus.
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export NO_COLOR=1

# ------------------------------------------------------------ Kartenliste
# Eintrag je Karte: "<bus> <api> <nr>". Der Bus der NVIDIA-Karten kommt aus
# der Kartenliste von HiveOS (gleiche Reihenfolge wie CUDA_DEVICE_ORDER=
# PCI_BUS_ID), der der AMD- und Intel-Karten von yskar-opencl selbst. Ohne
# Bus: NVIDIA zuerst, dann AMD/Intel.
GS="${GPU_STATS_JSON:-/run/hive/gpu-stats.json}"
# Kurz nach dem Booten schreibt HiveOS die Kartenliste noch -- bis zu 30 s
# warten, damit die Reihenfolge zum Dashboard passt.
for (( w = 0; w < 30 && ! -r $GS; w++ )); do sleep 1; done
nvbus=()
if [[ -r $GS ]] && command -v jq > /dev/null; then
  readarray -t nvbus < <(jq -r '[.brand, .busids] | transpose[] | select(.[0] == "nvidia") | .[1]' "$GS" 2>/dev/null)
fi
eintraege=()
if [[ -x $CUDA ]]; then
  n=$("$CUDA" --probe 2>/dev/null | grep -c '"t":"device"')
  for (( i = 0; i < n; i++ )); do eintraege+=("${nvbus[$i]:-+$(printf %03d "$i")} cuda $i"); done
fi
if [[ -x $OCL ]]; then
  while IFS= read -r z; do
    # Integrierte Grafik minet auf einem Rig nicht mit (HiveOS zaehlt sie nicht).
    [[ $z == *'"integrated":true'* ]] && continue
    nr=$(sed -n 's/.*"id":\([0-9]*\).*/\1/p' <<< "$z")
    b=$(sed -n 's/.*"bus":"\([^"]*\)".*/\1/p' <<< "$z")
    [[ -n $nr ]] && eintraege+=("${b:-zz$(printf %03d "$nr")} opencl $nr")
  done < <("$OCL" --probe 2>/dev/null | grep '"t":"device"')
fi
# Nach Bus. Ohne bekannten Bus: NVIDIA ("+" sortiert vor jeder Ziffer) zuerst,
# AMD/Intel ("zz" hinter jeder Hex-Ziffer) zuletzt.
readarray -t eintraege < <(printf '%s\n' "${eintraege[@]}" | LC_ALL=C sort -t' ' -k1,1 | grep -v '^$')
anzahl=${#eintraege[@]}
if (( anzahl == 0 )); then
  echo "Keine Grafikkarte gefunden (NVIDIA mit CUDA, AMD oder Intel mit OpenCL):"
  [[ -x $CUDA ]] && "$CUDA" --probe
  [[ -x $OCL ]] && "$OCL" --probe
  sleep 30; exit 1
fi
: > "$DIR/.karten"
for (( i = 0; i < anzahl; i++ )); do
  read -r b api nr <<< "${eintraege[$i]}"
  [[ $b == zz* || $b == +* ]] && b=-
  echo "$i $api $nr $b" >> "$DIR/.karten"
done

if [[ -z $KARTEN || $KARTEN == all ]]; then
  liste=$(seq 0 $(( anzahl - 1 )))
else
  liste=$(tr ',' ' ' <<< "$KARTEN")
fi

args=(--address "$ADRESSE" --api "$API" --gpu --simple)
[[ $MODUS == pool ]] && args+=(--mode pool)
# shellcheck disable=SC2206 # EXTRA darf mehrere Optionen enthalten
[[ -n $EXTRA ]] && args+=($EXTRA)

rm -f "${CUSTOM_LOG_BASENAME}"_gpu*.log
date +%s > "$DIR/.gestartet"

# Eine Karte: Miner starten, auf sein Ende warten, nach 15 s neu.
karte() {
  local n=$1 log="${CUSTOM_LOG_BASENAME}_gpu$1.log" kind="" pause="" code
  local _b api nr prog
  read -r _b api nr <<< "${eintraege[$n]}"
  if [[ $api == opencl ]]; then prog="$OCL"; else prog="$CUDA"; fi
  trap 'kill $kind $pause 2>/dev/null; exit 0' TERM INT HUP
  while :; do
    echo "### Start $(date '+%F %T') GPU $n ($api $nr) YSKAR $CUSTOM_VERSION" >> "$log"
    # Das Protokoll bekommt die Zeilen unveraendert, der Bildschirm mit
    # vorangestellter Karte. $! ist so der Miner selbst, nicht tee.
    "$NODE" "$DIR/miner/src/cli.mjs" "${args[@]}" --gpu-bin "$prog" --gpu-api "$api" --device "$nr" < /dev/null \
      > >(tee -a "$log" | sed -u "s/^/[GPU $n] /") 2>&1 &
    kind=$!
    wait "$kind"; code=$?
    kind=""
    echo "[GPU $n] Miner beendet (Code $code) -- Neustart in 15 s" | tee -a "$log"
    sleep 15 & pause=$!; wait $pause; pause=""
  done
}

gewaehlt=()
for n in $liste; do
  if [[ $n =~ ^[0-9]+$ ]] && (( n < anzahl )); then gewaehlt+=("$n")
  else echo "GPU $n gibt es nicht -- uebersprungen"; fi
done
if (( ${#gewaehlt[@]} == 0 )); then
  echo "Keine der gewaehlten Karten gibt es (GPUS=$KARTEN, gefunden: $anzahl)"
  sleep 30; exit 1
fi

kinder=(); schlaf=""
ende() {
  trap - TERM INT HUP EXIT
  kill "${kinder[@]}" $schlaf 2>/dev/null
  wait
  exit 0
}
trap ende TERM INT HUP EXIT

echo "YSKAR $CUSTOM_VERSION · $anzahl Karte(n), es rechnen ${gewaehlt[*]} · Modus $MODUS · $API"
for n in "${gewaehlt[@]}"; do
  karte "$n" &
  kinder+=($!)
  sleep 1
done

# Alle zehn Minuten: Protokolle, die zu gross werden, kuerzen.
while :; do
  sleep 600 & schlaf=$!; wait $schlaf
  for log in "${CUSTOM_LOG_BASENAME}"_gpu*.log; do
    [[ -f $log ]] && yskar_kuerze "$log"
  done
done
