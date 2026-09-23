/*
 * Die schmale Schnittstelle zwischen Programmlogik und Rechenwerk.
 *
 * Zwei Umsetzungen:
 *   yskar_gpu.cu   CUDA, uebersetzt von nvcc
 *   yskar_cpu.cpp  CPU-Nachbildung zum Pruefen, uebersetzt von cl.exe/g++
 *
 * Absichtlich reines C: Ueber diese Grenze geht keine
 * C++-Standardbibliothek. Nur so laesst sich der Kernel mit CUDA 11.8
 * uebersetzen (noetig fuer Compute Capability 5.0), waehrend die
 * Programmlogik eine aktuelle Standardbibliothek benutzt.
 *
 * Rueckgabe 0 heisst Erfolg. Sonst steht der Grund in yskar_dev_error().
 */
#ifndef YSKAR_BACKEND_H
#define YSKAR_BACKEND_H

#include <stdint.h>

/* Kein Treffer. */
#define YSKAR_NONE 0xFFFFFFFFFFFFFFFFull

#ifdef __cplusplus
extern "C" {
#endif

/** 1, wenn dies die CPU-Nachbildung ist -- keine echte Grafikkarte. */
int yskar_dev_is_emulation(void);

/** Letzter Fehlertext. Nie NULL. */
const char *yskar_dev_error(void);

/** Wie viele Geraete gibt es? Ohne CUDA: Fehler, Anzahl 0. */
int yskar_dev_count(int *anzahl);

/** Name, Compute Capability, Speicher und Multiprozessoren eines Geraets. */
int yskar_dev_info(int id, char *name, int namelen,
                   int *major, int *minor, unsigned long long *vram, int *sm);

/** Geraet belegen und Gittergroesse festlegen. */
int yskar_dev_init(int id);

/** Midstate und Ziel setzen -- einmal je Job. */
int yskar_dev_set_job(const uint32_t mid[8], const uint8_t target[32]);

/** Wie viele Nonces ein Stapel mit dieser Iterationszahl prueft. */
unsigned long long yskar_dev_batchsize(unsigned int iters);

/** Einen Stapel rechnen. gefunden == YSKAR_NONE heisst: kein Treffer. */
int yskar_dev_batch(unsigned long long basis, unsigned int iters,
                    unsigned long long *geprueft, unsigned long long *gefunden);

/** Einen einzelnen Hash rechnen -- fuer den Selbsttest. */
int yskar_dev_single(unsigned long long nonce, unsigned char aus[32]);

/** Genau eine Nonce gegen das Ziel pruefen -- fuer den Selbsttest. */
int yskar_dev_one(unsigned long long nonce, unsigned long long *gefunden);

/** Belegten Speicher freigeben. */
void yskar_dev_free(void);

#ifdef __cplusplus
}
#endif
#endif
