/*
 * YSKAR CUDA-Miner -- Programmlogik.
 *
 * Ein eigenstaendiges Programm, das der Node Core als Kindprozess startet.
 * Es bekommt Jobs ueber stdin und meldet Treffer ueber stdout -- eine Zeile
 * JSON je Nachricht.
 *
 * WARUM EIN EIGENER PROZESS und kein natives Node-Modul:
 *
 *   - Ein Absturz im Treiber reisst nur diesen Prozess mit, nicht den
 *     Knoten. Der Knoten meldet dann "GPU nicht verfuegbar" und laeuft
 *     weiter -- das verlangt die Anforderung ausdruecklich.
 *   - Ein natives Modul muesste zur Node- UND zur Electron-Fassung passen
 *     und bei jedem Update neu gebaut werden. Ein Programm nicht.
 *   - Ohne CUDA fehlt einfach diese Datei. Der Knoten baut und startet
 *     trotzdem.
 *
 * WARUM DIESE DATEI GETRENNT VOM KERNEL IST: Neuere MSVC-Fassungen weigern
 * sich, ihre Standardbibliothek mit CUDA vor 12.4 zu uebersetzen (STL1002).
 * CUDA 12.4 wiederum kann Compute Capability 5.0 nicht mehr. Getrennt
 * uebersetzt, sieht nvcc die Standardbibliothek nie -- und beides geht.
 *
 * WAS DIESES PROGRAMM NICHT TUT: Bloecke pruefen. Es rechnet Hashes und
 * meldet Nonces, deren Hash das Ziel erfuellt. Ob daraus ein gueltiger
 * Block wird, entscheidet der Knoten -- ueber MiningCoordinator.submitNonce()
 * und dieselbe vollstaendige Validierung wie fuer jeden anderen Block.
 *
 * ---------------------------------------------------------------------
 * Protokoll, eine Zeile je Nachricht:
 *
 *   Knoten -> Miner
 *     {"t":"job","jobId":"<hex>","header":"<272 hex>","target":"<64 hex>"}
 *     {"t":"stop"}
 *     {"t":"quit"}
 *
 *   Miner -> Knoten
 *     {"t":"device","id":0,"name":"...","cc":"5.0","vram":2147483648}
 *     {"t":"ready"}
 *     {"t":"progress","hashes":123,"ms":1000}
 *     {"t":"found","jobId":"<hex>","nonce":"<dezimal>"}
 *     {"t":"error","message":"..."}
 *
 * Aufruf:
 *   yskar-cuda --probe               Geraete auflisten und beenden
 *   yskar-cuda --selftest --device 0 Karte rechnet den Genesis-Hash
 *   yskar-cuda --bench 10 --device 0 echte Hashrate messen
 *   yskar-cuda --device 0            minen
 * ---------------------------------------------------------------------
 */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <string>
#include <thread>
#include <mutex>
#include <deque>
#include <atomic>
#include <chrono>
#include <iostream>

#include "yskar_sha256.h"
#include "yskar_backend.h"

/* ============================================================== Ausgabe */

static std::mutex g_aus;

static void sende(const std::string &zeile) {
  std::lock_guard<std::mutex> l(g_aus);
  std::fputs(zeile.c_str(), stdout);
  std::fputc('\n', stdout);
  std::fflush(stdout);
}

static std::string esc(const std::string &s) {
  std::string o;
  for (char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if ((unsigned char)c < 0x20) o += ' ';
    else o += c;
  }
  return o;
}

static void fehler(const std::string &m) {
  sende("{\"t\":\"error\",\"message\":\"" + esc(m) + "\"}");
}

/* ============================================================ Einlesen */

/* Den Wert eines Textfelds aus einer JSON-Zeile holen. Bewusst kein
   vollstaendiger JSON-Leser: Die Nachrichten kommen ausschliesslich vom
   eigenen Knoten und haben feste Form. */
static bool feld(const std::string &z, const char *name, std::string &out) {
  std::string key = std::string("\"") + name + "\":\"";
  size_t a = z.find(key);
  if (a == std::string::npos) return false;
  a += key.size();
  size_t b = z.find('"', a);
  if (b == std::string::npos) return false;
  out = z.substr(a, b - a);
  return true;
}

static bool unhex(uint8_t *out, const std::string &s, size_t n) {
  if (s.size() != n * 2) return false;
  for (size_t i = 0; i < n; i++) {
    unsigned v;
    if (std::sscanf(s.c_str() + 2 * i, "%2x", &v) != 1) return false;
    out[i] = (uint8_t)v;
  }
  return true;
}

/*
 * Zeilen von stdin in einem eigenen Faden lesen.
 *
 * Die Rechenschleife darf nie auf stdin warten -- sonst stuende die Karte
 * still, bis der Knoten etwas schickt. Und ein neuer Job muss sofort
 * ankommen, nicht erst nach dem naechsten Stapel.
 */
static std::mutex g_ein;
static std::deque<std::string> g_zeilen;
static std::atomic<bool> g_eingabeZu(false);

static void leseEingabe() {
  std::string z;
  while (std::getline(std::cin, z)) {
    std::lock_guard<std::mutex> l(g_ein);
    g_zeilen.push_back(z);
  }
  g_eingabeZu = true;   /* Knoten weg -- dann hat Weiterrechnen keinen Sinn. */
}

static bool naechsteZeile(std::string &z) {
  std::lock_guard<std::mutex> l(g_ein);
  if (g_zeilen.empty()) return false;
  z = g_zeilen.front();
  g_zeilen.pop_front();
  return true;
}


/* ====================================================== Rechenwerk-Huelle */

/*
 * Duenne Huelle um die C-Schnittstelle aus yskar_backend.h.
 *
 * Dahinter steht entweder CUDA (yskar_gpu.cu) oder die CPU-Nachbildung
 * (yskar_cpu.cpp). Diese Datei weiss nicht, welche -- und braucht es nicht
 * zu wissen.
 */
struct Geraet {
  unsigned int iters = yskar_dev_is_emulation() ? 4096u : 64u;

  bool init(int dev) {
    if (yskar_dev_init(dev) != 0) { fehler(yskar_dev_error()); return false; }
    return true;
  }
  bool setzeJob(const uint32_t mid[8], const uint8_t target[32]) {
    if (yskar_dev_set_job(mid, target) != 0) { fehler(yskar_dev_error()); return false; }
    return true;
  }
  bool stapel(uint64_t basis, uint64_t &geprueft, uint64_t &gefunden) {
    unsigned long long gp = 0, gf = YSKAR_NONE;
    if (yskar_dev_batch(basis, iters, &gp, &gf) != 0) { fehler(yskar_dev_error()); return false; }
    geprueft = gp; gefunden = gf;
    return true;
  }
  bool einzel(uint64_t nonce, uint8_t aus[32]) {
    if (yskar_dev_single(nonce, aus) != 0) { fehler(yskar_dev_error()); return false; }
    return true;
  }
  bool eine(uint64_t nonce, uint64_t &gefunden) {
    unsigned long long gf = YSKAR_NONE;
    if (yskar_dev_one(nonce, &gf) != 0) { fehler(yskar_dev_error()); return false; }
    gefunden = gf;
    return true;
  }
  uint64_t groesse() const { return yskar_dev_batchsize(iters); }
  void mehr()    { if (iters < (1u << 22)) iters *= 2; }
  void weniger() { if (iters > 1) iters /= 2; }
  void frei()    { yskar_dev_free(); }
};

/* Geraete auflisten -- fuer --probe und beim Start. */
static int liste(bool ausgeben) {
  int n = 0;
  if (yskar_dev_count(&n) != 0) {
    if (ausgeben) fehler(yskar_dev_error());
    return 0;
  }
  for (int i = 0; i < n && ausgeben; i++) {
    char name[256] = {0};
    int major = 0, minor = 0, sm = 0;
    unsigned long long vram = 0;
    if (yskar_dev_info(i, name, (int)sizeof name, &major, &minor, &vram, &sm) != 0) continue;
    char z[512];
    std::snprintf(z, sizeof z,
      "{\"t\":\"device\",\"id\":%d,\"name\":\"%s\",\"cc\":\"%d.%d\",\"vram\":%llu,\"sm\":%d%s}",
      i, esc(name).c_str(), major, minor, vram, sm,
      yskar_dev_is_emulation() ? ",\"emulation\":true" : "");
    sende(z);
  }
  return n;
}

/* ================================================ Selbsttest und Messung */

static const char *GENESIS_HEADER =
  "010000000000000000000000000000000000000000000000000000000000000000000000"
  "000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840"
  "e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a"
  "000000000010000001000000000000000000000000000000000000";   /* Nonce = 0 */
static const char *GENESIS_HASH =
  "000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66";
static const uint64_t GENESIS_NONCE = 50773796ull;

static std::string hex(const uint8_t *b, size_t n) {
  static const char *z = "0123456789abcdef";
  std::string o;
  for (size_t i = 0; i < n; i++) { o += z[b[i] >> 4]; o += z[b[i] & 15]; }
  return o;
}

/*
 * Selbsttest: Rechnet die Karte bitgenau wie der Knoten?
 *
 * Drei Pruefungen, alle AUF DER KARTE:
 *   1. Der Genesis-Header mit seiner Nonce ergibt den Genesis-Hash.
 *   2. Der Kernel erkennt diese Nonce als Treffer.
 *   3. Die Nonce daneben ist KEIN Treffer.
 *
 * Besteht das, rechnet die GPU denselben Algorithmus wie die CPU und die
 * WASM-Engine. Faellt es durch, darf mit dieser Karte nicht gemint werden.
 */
static int selbsttest(Geraet &g) {
  uint8_t header[YSKAR_HEADER_BYTES], soll[32], ist[32], ziel[32] = {0};
  std::string h(GENESIS_HEADER);
  h.resize(YSKAR_HEADER_BYTES * 2, '0');
  unhex(header, h, YSKAR_HEADER_BYTES);
  unhex(soll, GENESIS_HASH, 32);
  ziel[3] = 0x10;                      /* Difficulty 4096: 2^228 */

  uint32_t mid[8];
  yskar_midstate(mid, header);
  if (!g.setzeJob(mid, ziel)) return 1;

  int fehlerZahl = 0;
  auto melde = [&](bool ok, const char *was) {
    sende(std::string("{\"t\":\"selftest\",\"ok\":") + (ok ? "true" : "false") +
          ",\"check\":\"" + was + "\"}");
    if (!ok) fehlerZahl++;
  };

  if (!g.einzel(GENESIS_NONCE, ist)) return 1;
  sende("{\"t\":\"selftest\",\"hash\":\"" + hex(ist, 32) + "\",\"expected\":\"" + GENESIS_HASH + "\"}");
  melde(std::memcmp(ist, soll, 32) == 0, "Genesis-Hash bitgenau");

  uint64_t t = 0;
  if (!g.eine(GENESIS_NONCE, t)) return 1;
  melde(t == GENESIS_NONCE, "Genesis-Nonce als Treffer erkannt");

  if (!g.eine(GENESIS_NONCE + 1, t)) return 1;
  melde(t == YSKAR_NONE, "Nonce daneben ist kein Treffer");

  sende(std::string("{\"t\":\"selftest\",\"result\":\"") + (fehlerZahl ? "FAILED" : "PASSED") + "\"}");
  return fehlerZahl ? 1 : 0;
}

/*
 * Messung: echte Hashrate dieses Geraets.
 *
 * Ziel aus Nullen -- kein Hash kann es erfuellen, also stoert kein Treffer
 * die Zaehlung. Gezaehlt wird, was die Karte tatsaechlich gerechnet hat,
 * geteilt durch die gemessene Zeit. Die ersten zwei Sekunden zaehlen nicht:
 * Dort regelt sich die Stapelgroesse erst ein.
 */
static int messung(Geraet &g, int sekunden) {
  uint8_t header[YSKAR_HEADER_BYTES] = {0}, ziel[32] = {0};
  uint32_t mid[8];
  yskar_midstate(mid, header);
  if (!g.setzeJob(mid, ziel)) return 1;

  uint64_t basis = 0, gezaehlt = 0, geprueft = 0, gefunden = 0;
  const auto start = std::chrono::steady_clock::now();
  auto messStart = start;
  bool misst = false;

  for (;;) {
    const auto t0 = std::chrono::steady_clock::now();
    if (!g.stapel(basis, geprueft, gefunden)) return 1;
    const double ms = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - t0).count();
    basis += geprueft;
    if (ms < 100.0) g.mehr(); else if (ms > 250.0) g.weniger();

    const double seit = std::chrono::duration<double>(
      std::chrono::steady_clock::now() - start).count();
    if (!misst && seit >= 2.0) { misst = true; messStart = std::chrono::steady_clock::now(); gezaehlt = 0; continue; }
    if (misst) gezaehlt += geprueft;
    if (seit >= 2.0 + sekunden) break;
  }
  const double dauer = std::chrono::duration<double>(
    std::chrono::steady_clock::now() - messStart).count();
  char z[256];
  std::snprintf(z, sizeof z,
    "{\"t\":\"bench\",\"hashes\":%llu,\"seconds\":%.3f,\"hashrate\":%.0f,\"mhs\":%.3f}",
    (unsigned long long)gezaehlt, dauer, gezaehlt / dauer, gezaehlt / dauer / 1e6);
  sende(z);
  return 0;
}

/* ============================================================ Hauptteil */

int main(int argc, char **argv) {
  int dev = 0, bench = 0;
  bool probe = false, test = false;
  for (int i = 1; i < argc; i++) {
    if (!std::strcmp(argv[i], "--probe")) probe = true;
    else if (!std::strcmp(argv[i], "--selftest")) test = true;
    else if (!std::strcmp(argv[i], "--bench") && i + 1 < argc) bench = std::atoi(argv[++i]);
    else if (!std::strcmp(argv[i], "--device") && i + 1 < argc) dev = std::atoi(argv[++i]);
  }

  const int n = liste(true);
  if (probe) return n > 0 ? 0 : 2;
  if (n == 0) return 2;
  if (dev < 0 || dev >= n) { fehler("Geraet " + std::to_string(dev) + " gibt es nicht"); return 2; }

  Geraet g;
  if (!g.init(dev)) return 3;

  if (test)  { const int r = selbsttest(g); g.frei(); return r; }
  if (bench > 0) { const int r = messung(g, bench); g.frei(); return r; }

  std::thread(leseEingabe).detach();
  sende("{\"t\":\"ready\"}");

  std::string jobId;
  bool aktiv = false;
  uint64_t basis = 0;
  uint64_t zaehler = 0;
  auto letzteMeldung = std::chrono::steady_clock::now();

  for (;;) {
    /* Alle wartenden Befehle abarbeiten -- ein neuer Job hat Vorrang vor
       dem naechsten Stapel. */
    std::string z;
    while (naechsteZeile(z)) {
      std::string t;
      if (!feld(z, "t", t)) continue;
      if (t == "quit") { g.frei(); return 0; }
      if (t == "stop") { aktiv = false; continue; }
      if (t == "job") {
        std::string id, hx, tg;
        uint8_t header[YSKAR_HEADER_BYTES], target[32];
        if (!feld(z, "jobId", id) || !feld(z, "header", hx) || !feld(z, "target", tg)
            || !unhex(header, hx, YSKAR_HEADER_BYTES) || !unhex(target, tg, 32)) {
          fehler("Job unlesbar");
          continue;
        }
        /* Der Knoten schickt den Header mit Nonce 0. Sicherheitshalber
           trotzdem leeren -- der Midstate darf die Nonce nie enthalten. */
        std::memset(header + YSKAR_NONCE_OFFSET, 0, 8);
        uint32_t mid[8];
        yskar_midstate(mid, header);
        if (!g.setzeJob(mid, target)) continue;
        jobId = id;
        basis = 0;        /* Neuer Job, neuer Nonce-Bereich. */
        aktiv = true;
      }
    }

    if (g_eingabeZu) { g.frei(); return 0; }

    if (!aktiv) {
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
      continue;
    }

    const auto t0 = std::chrono::steady_clock::now();
    uint64_t geprueft = 0, gefunden = YSKAR_NONE;
    if (!g.stapel(basis, geprueft, gefunden)) {
      /* Treiberfehler. Nicht weiterrechnen -- der Knoten entscheidet, ob
         er das Programm neu startet. */
      aktiv = false;
      continue;
    }
    const double ms = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - t0).count();

    zaehler += geprueft;
    basis += geprueft;

    if (gefunden != YSKAR_NONE) {
      sende("{\"t\":\"found\",\"jobId\":\"" + jobId + "\",\"nonce\":\"" +
            std::to_string((unsigned long long)gefunden) + "\"}");
    }

    /*
     * Stapelgroesse nachfuehren, Ziel 100 bis 250 ms.
     *
     * Zu kurz: Die Karte wartet zwischen den Stapeln auf den Rechner.
     * Zu lang: Ein neuer Job kommt erst nach dem Stapel an -- und unter
     * Windows beendet der Treiber Kernel, die laenger als rund zwei
     * Sekunden laufen (TDR), besonders auf einer Karte, die auch den
     * Bildschirm betreibt.
     */
    if (ms < 100.0) g.mehr();
    else if (ms > 250.0) g.weniger();

    const auto jetzt = std::chrono::steady_clock::now();
    const double seit = std::chrono::duration<double, std::milli>(jetzt - letzteMeldung).count();
    if (seit >= 1000.0) {
      char m[128];
      std::snprintf(m, sizeof m, "{\"t\":\"progress\",\"hashes\":%llu,\"ms\":%.0f}",
                    (unsigned long long)zaehler, seit);
      sende(m);
      zaehler = 0;
      letzteMeldung = jetzt;
    }
  }
}
