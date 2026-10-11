#!/usr/bin/env bash
# Startet je Grafikkarte einen CLI-Miner.
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
chmod +x "$NODE" "$CUDA" 2>/dev/null
mkdir -p "$(dirname "$CUSTOM_LOG_BASENAME")"

# Dieselbe Reihenfolge wie HiveOS: nach PCI-Bus.
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export NO_COLOR=1

anzahl=$("$CUDA" --probe 2>/dev/null | grep -c '"t":"device"')
if (( anzahl == 0 )); then
  echo "Keine NVIDIA-Karte gefunden:"; "$CUDA" --probe
  sleep 30; exit 1
fi

if [[ -z $KARTEN || $KARTEN == all ]]; then
  liste=$(seq 0 $(( anzahl - 1 )))
else
  liste=$(tr ',' ' ' <<< "$KARTEN")
fi

args=(--address "$ADRESSE" --api "$API" --gpu --gpu-bin "$CUDA" --einfach)
[[ $MODUS == pool ]] && args+=(--mode pool)
# shellcheck disable=SC2206 # EXTRA darf mehrere Optionen enthalten
[[ -n $EXTRA ]] && args+=($EXTRA)

rm -f "${CUSTOM_LOG_BASENAME}"_gpu*.log
date +%s > "$DIR/.gestartet"

# Eine Karte: Miner starten, auf sein Ende warten, nach 15 s neu.
karte() {
  local n=$1 log="${CUSTOM_LOG_BASENAME}_gpu$1.log" kind="" pause="" code
  trap 'kill $kind $pause 2>/dev/null; exit 0' TERM INT HUP
  while :; do
    echo "### Start $(date '+%F %T') GPU $n YSKAR $CUSTOM_VERSION" >> "$log"
    # Das Protokoll bekommt die Zeilen unveraendert, der Bildschirm mit
    # vorangestellter Karte. $! ist so der Miner selbst, nicht tee.
    "$NODE" "$DIR/miner/src/cli.mjs" "${args[@]}" --device "$n" < /dev/null \
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
