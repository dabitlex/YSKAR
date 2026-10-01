# Prüfung des nativen Miners auf dem Rechner

Der Kern des nativen Minings (`Sha256d`, `Sha256dKern`, `Rechenweg`,
`MiniJson`, `NativMiner`) hat keinen Android-Bezug. Er lässt sich deshalb
hier mit einem normalen JDK gegen einen echten YSKAR-Knoten prüfen –
derselbe `MiningServer` wie auf dem Raspberry, im Testnetz.

```bash
# 1. Hash: Genesis-Block, 2000 Zufallsheader gegen MessageDigest, alle Rechenwege
mkdir -p /tmp/jb
javac -d /tmp/jb android/app/src/main/java/net/yskar/wallet/{Sha256d,Sha256dKern,Rechenweg,MiniJson,NativMiner}.java \
      android/pruefung/ShaPruefung.java android/pruefung/MinerPruefung.java
java -cp /tmp/jb net.yskar.wallet.ShaPruefung

# 2. Gegen einen lokalen Knoten: Shares, Blöcke, verworfene Sitzung,
#    Leistungsregler, Stopp, Pool ohne Pool, falsche Adresse
node --experimental-strip-types android/pruefung/knoten.ts 18655 &
java -cp /tmp/jb net.yskar.wallet.MinerPruefung http://127.0.0.1:18655 ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw
```

`Sha256dKern.java` wird von `gen_sha.py` erzeugt:
`python3 android/pruefung/gen_sha.py > android/app/src/main/java/net/yskar/wallet/Sha256dKern.java`
