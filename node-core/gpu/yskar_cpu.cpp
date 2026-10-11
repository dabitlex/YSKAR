#include <stdio.h>
/*
 * CPU-Nachbildung des Rechenwerks.
 *
 * Dieselbe Schnittstelle wie yskar_gpu.cu und dieselben Funktionen aus
 * yskar_sha256.h -- auch dieselben wie im Kernel: Hash als Woerter,
 * Zielvergleich auf Woertern. Damit laesst sich alles ausser der
 * Ausfuehrung auf der Karte pruefen: Protokoll, Jobwechsel, Treffermeldung,
 * Selbsttest, Messung -- auf jedem Rechner, ohne CUDA.
 *
 * Sie beweist NICHT, dass eine Grafikkarte arbeitet. Sie gibt sich als
 * Nachbildung zu erkennen, damit niemand ihre Zahlen fuer GPU-Werte haelt.
 */
#include <stdlib.h>
#include <string.h>
#include "yskar_sha256.h"
#include "yskar_backend.h"

static uint32_t e_mid[8];
static uint32_t e_ziel[8];   /* Ziel als Big-Endian-Woerter, wie auf der Karte */
static unsigned int e_iters_default = 4096;

extern "C" {

int yskar_dev_is_emulation(void) { return 1; }
const char *yskar_dev_error(void) { return ""; }

/*
 * Wie viele Karten die Nachbildung vorgibt. Ohne Angabe eine; mit
 * YSKAR_EMU_GERAETE=n (1 bis 8) n Stueck -- fuer die Tests mit mehreren
 * Karten. Jede rechnet gleich, sie heissen nur verschieden.
 */
static int emu_anzahl(void) {
  const char *t = getenv("YSKAR_EMU_GERAETE");
  int n = t ? atoi(t) : 1;
  return n < 1 ? 1 : n > 8 ? 8 : n;
}

int yskar_dev_count(int *anzahl) { *anzahl = emu_anzahl(); return 0; }

int yskar_dev_info(int id, char *name, int namelen,
                   int *major, int *minor, unsigned long long *vram, int *sm) {
  if (emu_anzahl() > 1) snprintf(name, (size_t)namelen, "CPU-Nachbildung (keine GPU) #%d", id);
  else snprintf(name, (size_t)namelen, "CPU-Nachbildung (keine GPU)");
  *major = 0; *minor = 0; *vram = 0; *sm = 0;
  return 0;
}

int yskar_dev_init(int id) { (void)id; return 0; }

int yskar_dev_set_job(const uint32_t mid[8], const uint8_t target[32]) {
  memcpy(e_mid, mid, sizeof e_mid);
  yskar_ziel_woerter(e_ziel, target);
  return 0;
}

unsigned long long yskar_dev_batchsize(unsigned int iters) {
  (void)e_iters_default;
  return iters;
}

int yskar_dev_batch(unsigned long long basis, unsigned int iters,
                    unsigned long long *geprueft, unsigned long long *gefunden) {
  *gefunden = YSKAR_NONE;
  uint32_t h[8];
  for (unsigned int k = 0; k < iters; k++) {
    yskar_hash_nonce_w(h, e_mid, basis + k);
    /* Wie im Kernel: ersten Treffer merken, aber zu Ende rechnen -- sonst
       waere die gezaehlte Hashzahl groesser als die gerechnete. */
    if (*gefunden == YSKAR_NONE && yskar_meets_target_w(h, e_ziel)) *gefunden = basis + k;
  }
  *geprueft = iters;
  return 0;
}

int yskar_dev_single(unsigned long long nonce, unsigned char aus[32]) {
  yskar_hash_nonce(aus, e_mid, nonce);
  return 0;
}

int yskar_dev_one(unsigned long long nonce, unsigned long long *gefunden) {
  uint32_t h[8];
  yskar_hash_nonce_w(h, e_mid, nonce);
  *gefunden = yskar_meets_target_w(h, e_ziel) ? nonce : YSKAR_NONE;
  return 0;
}

void yskar_dev_free(void) {}

}
