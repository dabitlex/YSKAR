#!/usr/bin/env bash
# Werte fuer den HiveOS-Agenten. Er LAEDT diese Datei (source) und liest
# danach $khs (Summe in kH/s) und $stats (JSON). Alles andere bleibt in
# einer Funktion, damit keine Variable des Agenten ueberschrieben wird.
#
# Quelle sind die Protokolle je Karte (siehe yskar-log.sh). Eine Karte,
# deren Protokoll seit drei Minuten still ist, zaehlt mit 0.
#
# Nach der Vorlage von Alexander (github.com/derhier/yskar-hiveos).

yskar_stats() {
  local hier manifest
  hier="$(dirname "${BASH_SOURCE[0]}")"
  manifest=/hive/miners/custom/yskar-hiveos/h-manifest.conf
  [[ -r $manifest ]] || manifest="$hier/h-manifest.conf"
  # shellcheck disable=SC2034 # das Manifest setzt alle vier
  local CUSTOM_NAME CUSTOM_VERSION CUSTOM_LOG_BASENAME CUSTOM_CONFIG_FILENAME
  # shellcheck source=/dev/null
  . "$manifest"
  . "$(dirname "$manifest")/yskar-log.sh"

  local jetzt ordner log n alter a r acc=0 rej=0 summe=0 wert
  local hs=() bus=() temp=() fan=() nv=()
  jetzt=$(date +%s)
  ordner="$(dirname "$CUSTOM_CONFIG_FILENAME")"

  # Temperatur, Luefter und Bus der NVIDIA-Karten, in der Reihenfolge von
  # HiveOS -- dieselbe wie CUDA_DEVICE_ORDER=PCI_BUS_ID in h-run.sh.
  local gs="${GPU_STATS_JSON:-/run/hive/gpu-stats.json}"
  if [[ -r $gs ]] && command -v jq > /dev/null; then
    readarray -t nv < <(jq -r '[.brand, .busids, .temp, .fan] | transpose[]
      | select(.[0] == "nvidia") | "\(.[1]) \(.[2] // 0) \(.[3] // 0)"' "$gs" 2>/dev/null)
  fi

  local b t f
  while IFS= read -r log; do
    [[ -f $log ]] || continue
    n="${log##*_gpu}"; n="${n%.log}"
    [[ $n =~ ^[0-9]+$ ]] || continue
    alter=$(( jetzt - $(stat -c %Y "$log") ))
    wert=0
    (( alter < 180 )) && wert=$(yskar_khs "$log")
    read -r a r < <(yskar_zaehle "$log")
    acc=$(( acc + a )); rej=$(( rej + r ))
    summe=$(awk -v x="$summe" -v y="$wert" 'BEGIN { printf "%.3f", x + y }')
    hs+=("$wert")

    b=""; t=0; f=0
    read -r b t f <<< "${nv[$n]:-}"
    local nr=0
    [[ $b =~ ^([0-9a-fA-F]{2}): ]] && nr=$(( 16#${BASH_REMATCH[1]} ))
    bus+=("$nr"); temp+=("${t:-0}"); fan+=("${f:-0}")
  done < <(ls "${CUSTOM_LOG_BASENAME}"_gpu*.log 2>/dev/null | sort -V)

  local laufzeit=0
  [[ -r $ordner/.gestartet ]] && laufzeit=$(( jetzt - $(< "$ordner/.gestartet") ))

  # JSON ohne jq zusammensetzen: nur Zahlen, nichts zu maskieren.
  local IFS=,
  # shellcheck disable=SC2034 # liest der Agent
  khs=$(awk -v x="$summe" 'BEGIN { printf "%.3f", x }')
  stats="{\"hs\":[${hs[*]}],\"hs_units\":\"khs\",\"temp\":[${temp[*]}],\"fan\":[${fan[*]}]"
  stats+=",\"uptime\":$laufzeit,\"ver\":\"$CUSTOM_VERSION\",\"ar\":[$acc,$rej],\"bus_numbers\":[${bus[*]}]}"
}
yskar_stats
unset -f yskar_stats yskar_zaehle yskar_khs yskar_kuerze
