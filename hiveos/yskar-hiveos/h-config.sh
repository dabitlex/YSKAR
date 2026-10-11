#!/usr/bin/env bash
# Schreibt yskar.conf aus den Werten des Flight Sheets.
#
# HiveOS LAEDT diese Datei (source) bei jedem Start des Miners -- deshalb
# kein exit und kein set -e. Die Werte:
#   CUSTOM_TEMPLATE     Wallet and worker template  -> Adresse (ysr1...)
#   CUSTOM_URL          Pool URL                    -> --api
#   CUSTOM_USER_CONFIG  Extra config arguments      -> MODE=, GPUS=, EXTRA=
#
# Nach der Vorlage von Alexander (github.com/derhier/yskar-hiveos).

[[ -z $CUSTOM_CONFIG_FILENAME ]] && . "$(dirname "${BASH_SOURCE[0]}")/h-manifest.conf"

yskar_konfig() {
  local adresse api modus karten extra

  # Die Adresse ist der Teil vor einem Punkt -- fuer Templates wie
  # "%WAL%.%WORKER_NAME%". Der CLI-Miner kennt keinen Worker-Namen.
  adresse="${CUSTOM_TEMPLATE%%.*}"
  adresse="${adresse//[[:space:]]/}"
  api="${CUSTOM_URL//[[:space:]]/}"
  api="${api%/}"

  # Nur bekannte Schluessel; je Zeile oder mit ; getrennt, der letzte gilt.
  yskar_opt() {
    printf '%s\n' "$CUSTOM_USER_CONFIG" | tr ';' '\n' \
      | sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" | tail -1 \
      | tr -d '"\r' | sed 's/[[:space:]]*$//'
  }
  modus="$(yskar_opt MODE)";  [[ $modus == solo ]] || modus=pool
  karten="$(yskar_opt GPUS)"; karten="${karten// /}"
  [[ -z $karten || $karten == all ]] && karten=all
  # Nur Zahlen mit Komma, sonst alle -- eine Tippfehler-Liste soll nicht
  # stillschweigend gar keine Karte starten.
  [[ $karten == all || $karten =~ ^[0-9]+(,[0-9]+)*$ ]] || {
    echo "WARNUNG: GPUS=$karten nicht verstanden (Beispiel: GPUS=0,2) -- es rechnen alle Karten"
    karten=all
  }
  extra="$(yskar_opt EXTRA)"
  unset -f yskar_opt

  [[ $adresse =~ ^ysr1[02-9ac-hj-np-z]{38}$ ]] \
    || echo "WARNUNG: '$adresse' ist keine YSKAR-Adresse (ysr1..., 42 Zeichen) -- Wallet im Flight Sheet pruefen"
  [[ $api =~ ^https?://[^[:space:]]+$ ]] \
    || echo "WARNUNG: Pool URL '$api' muss mit https:// oder http:// beginnen"

  mkdir -p "$(dirname "$CUSTOM_CONFIG_FILENAME")"
  cat > "$CUSTOM_CONFIG_FILENAME" <<KONF
ADDRESS=$adresse
API=$api
MODE=$modus
GPUS=$karten
EXTRA=$extra
KONF
}
yskar_konfig
unset -f yskar_konfig
