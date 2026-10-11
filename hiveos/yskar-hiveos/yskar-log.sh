#!/usr/bin/env bash
# Auswertung der Protokolle je Karte -- gemeinsam fuer h-run.sh und h-stats.sh.
#
# Der CLI-Miner schreibt (mit --einfach, ohne Terminal):
#   [12:00:00] 10s 3,52 GH/s 60s 3,51 GH/s 15m 3,50 GH/s · ...   einmal je Minute
#   [12:00:07] angenommen #17 · Difficulty ...                    je Share
#   [12:00:09] abgelehnt <grund>                                  je abgelehntem Share
#   [12:00:12] BLOCK GEFUNDEN  #4321   +875 YSR                    statt "angenommen"
# "#17" zaehlt die angenommenen Shares dieses Prozesses, Bloecke eingeschlossen;
# ein Block ist ein Share, der auch das Ziel des Netzes trifft. h-run.sh setzt vor
# jeden Start eine Zeile "### Start ..."; ein Protokoll, das zu gross wurde,
# beginnt mit "### gekuerzt ... A=<n> R=<n>" und traegt die Zahlen weiter.

# yskar_zaehle LOG -> "angenommen abgelehnt" seit dem letzten Start
yskar_zaehle() {
  awk '
    /^### Start/    { a = 0; b = 0; r = 0; next }
    /^### gekuerzt/ { for (i = 1; i <= NF; i++) {
                        if ($i ~ /^A=[0-9]+$/) { a = substr($i, 3) + 0; b = 0 }
                        if ($i ~ /^R=[0-9]+$/) r += substr($i, 3) + 0 }
                      next }
    / angenommen #[0-9]+/ { if (match($0, / angenommen #[0-9]+/)) {
                              a = substr($0, RSTART + 13, RLENGTH - 13) + 0; b = 0 }
                            next }
    /\] BLOCK GEFUNDEN / { b++; next }
    / abgelehnt /   { r++ }
    END { printf "%d %d\n", a + b, r }' "$1" 2>/dev/null || echo "0 0"
}

# yskar_khs LOG -> Leistung der letzten Minutenzeile seit dem Start, in kH/s
yskar_khs() {
  tac "$1" 2>/dev/null | awk '
    /^### Start/ { exit }
    /\] 10s / {
      for (i = 1; i < NF; i++) if ($i == "10s") { v = $(i + 1); u = $(i + 2); break }
      # Deutsches Format: Komma ist das Dezimalzeichen, ein Punkt davor
      # trennt Tausender. Ohne Komma ist der Punkt das Dezimalzeichen.
      if (index(v, ",")) { gsub(/\./, "", v); sub(/,/, ".", v) }
      f = 0
      if (u == "H/s") f = 1e-3; else if (u == "kH/s") f = 1; else if (u == "MH/s") f = 1e3
      else if (u == "GH/s") f = 1e6; else if (u == "TH/s") f = 1e9; else if (u == "PH/s") f = 1e12
      printf "%.3f\n", v * f; gefunden = 1; exit
    }
    END { if (!gefunden) print 0 }'
}

# yskar_kuerze LOG [MAX_BYTE] [ZEILEN] -- ein zu grosses Protokoll auf die
# letzten Zeilen kuerzen, ohne dass die Zaehler zurueckspringen.
yskar_kuerze() {
  local log=$1 max=${2:-5242880} zeilen=${3:-2000} groesse a r rt rest
  groesse=$(stat -c %s "$log" 2>/dev/null) || return 0
  (( groesse > max )) || return 0
  read -r a r < <(yskar_zaehle "$log")
  rest="$log.rest.$$"
  tail -n "$zeilen" "$log" | grep -v '^### gekuerzt' > "$rest"
  if grep -q '^### Start' "$rest"; then
    # Der letzte Start liegt im Rest -- dann zaehlt nur, was danach kam.
    cat "$rest" > "$log"
  else
    rt=$(grep -c ' abgelehnt ' "$rest")
    { echo "### gekuerzt $(date '+%F %T') A=$a R=$(( r - rt ))"; cat "$rest"; } > "$log"
  fi
  rm -f "$rest"
}
