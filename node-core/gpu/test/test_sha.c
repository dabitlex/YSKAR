/*
 * Prueft yskar_sha256.h gegen den ECHTEN Genesis-Block.
 *
 * Uebersetzt dieselbe Datei, die auch nvcc fuer die GPU uebersetzt. Stimmt
 * hier der Hash, stimmt die Rechnung -- ob sie auf der Karte laeuft, zeigt
 * erst der Lauf auf dem Rechner mit NVIDIA-GPU.
 */
#include <stdio.h>
#include <string.h>
#include "../yskar_sha256.h"

static int fehler = 0;
static void pruefe(int ok, const char *was) {
  printf("  %s  %s\n", ok ? "ok    " : "FEHLER", was);
  if (!ok) fehler++;
}

static void unhex(uint8_t *out, const char *s, int n) {
  for (int i = 0; i < n; i++) sscanf(s + 2*i, "%2hhx", &out[i]);
}

int main(void) {
  const char *HEADER =
    "010000000000000000000000000000000000000000000000000000000000000000000000"
    "000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840"
    "e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a"
    "000000000010000001000000000000000000000024bf060300000000";
  const char *HASH =
    "000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66";
  const uint64_t NONCE = 50773796ull;

  uint8_t header[136], soll[32], ist[32];
  unhex(header, HEADER, 136);
  unhex(soll, HASH, 32);

  /* Die Nonce steht im Header schon drin. Fuer den Test wird sie geloescht
     -- genau so bekommt die GPU den Header vom Knoten (Nonce = 0). */
  memset(header + YSKAR_NONCE_OFFSET, 0, 8);

  uint32_t mid[8];
  yskar_midstate(mid, header);
  yskar_hash_nonce(ist, mid, NONCE);

  printf("Genesis-Block, Nonce %llu\n", (unsigned long long)NONCE);
  printf("  erwartet  "); for (int i = 0; i < 32; i++) printf("%02x", soll[i]); printf("\n");
  printf("  errechnet "); for (int i = 0; i < 32; i++) printf("%02x", ist[i]);  printf("\n\n");

  pruefe(memcmp(ist, soll, 32) == 0, "SHA-256d stimmt bitgenau mit dem Genesis ueberein");

  /* Eine andere Nonce muss einen anderen Hash ergeben. */
  uint8_t anders[32];
  yskar_hash_nonce(anders, mid, NONCE + 1);
  pruefe(memcmp(anders, soll, 32) != 0, "Nonce + 1 ergibt einen anderen Hash");

  /* Zielvergleich: der Genesis erfuellt sein eigenes Ziel (Difficulty 4096). */
  uint8_t ziel[32] = {0};
  /* target = 2^240 / 4096 = 2^228 -> Byte 3 hat den Wert 0x10 */
  ziel[3] = 0x10;
  pruefe(yskar_meets_target(ist, ziel), "Genesis erfuellt Difficulty 4096");

  uint8_t zuStreng[32] = {0};
  zuStreng[4] = 0x01;  /* viel kleiner */
  pruefe(!yskar_meets_target(ist, zuStreng), "Genesis erfuellt ein zu strenges Ziel NICHT");

  /* Gleichheit zaehlt als erfuellt -- wie submitNonce(). */
  pruefe(yskar_meets_target(ist, ist), "Hash == Ziel gilt als erfuellt");

  /* Byte 0 entscheidet vor Byte 31. */
  uint8_t a[32] = {0}, b[32] = {0};
  a[0] = 1; b[31] = 0xff;
  pruefe(!yskar_meets_target(a, b), "Byte 0 ist das hoechstwertige");

  printf("\n%s\n", fehler ? "FEHLGESCHLAGEN" : "Alle Pruefungen bestanden.");
  return fehler ? 1 : 0;
}
