#include <stdio.h>
/*
 * CPU-Nachbildung des Rechenwerks.
 *
 * Dieselbe Schnittstelle wie yskar_gpu.cu und dieselben Funktionen aus
 * yskar_sha256.h. Damit laesst sich alles ausser der Ausfuehrung auf der
 * Karte pruefen: Protokoll, Jobwechsel, Treffermeldung, Selbsttest,
 * Messung -- auf jedem Rechner, ohne CUDA.
 *
 * Sie beweist NICHT, dass eine Grafikkarte arbeitet. Sie gibt sich als
 * Nachbildung zu erkennen, damit niemand ihre Zahlen fuer GPU-Werte haelt.
 */
#include <string.h>
#include "yskar_sha256.h"
#include "yskar_backend.h"

static uint32_t e_mid[8];
static uint8_t  e_target[32];
static unsigned int e_iters_default = 4096;

extern "C" {

int yskar_dev_is_emulation(void) { return 1; }
const char *yskar_dev_error(void) { return ""; }

int yskar_dev_count(int *anzahl) { *anzahl = 1; return 0; }

int yskar_dev_info(int id, char *name, int namelen,
                   int *major, int *minor, unsigned long long *vram, int *sm) {
  (void)id;
  snprintf(name, (size_t)namelen, "CPU-Nachbildung (keine GPU)");
  *major = 0; *minor = 0; *vram = 0; *sm = 0;
  return 0;
}

int yskar_dev_init(int id) { (void)id; return 0; }

int yskar_dev_set_job(const uint32_t mid[8], const uint8_t target[32]) {
  memcpy(e_mid, mid, sizeof e_mid);
  memcpy(e_target, target, 32);
  return 0;
}

unsigned long long yskar_dev_batchsize(unsigned int iters) {
  (void)e_iters_default;
  return iters;
}

int yskar_dev_batch(unsigned long long basis, unsigned int iters,
                    unsigned long long *geprueft, unsigned long long *gefunden) {
  *gefunden = YSKAR_NONE;
  uint8_t h[32];
  for (unsigned int k = 0; k < iters; k++) {
    yskar_hash_nonce(h, e_mid, basis + k);
    /* Wie im Kernel: ersten Treffer merken, aber zu Ende rechnen -- sonst
       waere die gezaehlte Hashzahl groesser als die gerechnete. */
    if (*gefunden == YSKAR_NONE && yskar_meets_target(h, e_target)) *gefunden = basis + k;
  }
  *geprueft = iters;
  return 0;
}

int yskar_dev_single(unsigned long long nonce, unsigned char aus[32]) {
  yskar_hash_nonce(aus, e_mid, nonce);
  return 0;
}

int yskar_dev_one(unsigned long long nonce, unsigned long long *gefunden) {
  uint8_t h[32];
  yskar_hash_nonce(h, e_mid, nonce);
  *gefunden = yskar_meets_target(h, e_target) ? nonce : YSKAR_NONE;
  return 0;
}

void yskar_dev_free(void) {}

}
