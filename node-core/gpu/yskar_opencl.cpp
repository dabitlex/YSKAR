/*
 * YSKAR OpenCL-Backend -- AMD- und Intel-Grafikkarten.
 *
 * Dieselbe Schnittstelle wie yskar_gpu.cu (yskar_backend.h). Mit
 * yskar_host.cpp zusammen ergibt das das Programm yskar-opencl, das Node
 * Core und der Kommandozeilen-Miner genau wie yskar-cuda starten: gleiches
 * Protokoll, gleicher Selbsttest, gleiche Messung.
 *
 * WARUM OpenCL LAUFZEIT-GELADEN WIRD: OpenCL.dll (Windows) und
 * libOpenCL.so.1 (Linux) bringt der Grafiktreiber mit. Das Programm laedt
 * sie erst beim Start. So braucht der Bau weder ein SDK noch eine
 * Importbibliothek -- nur einen C++-Compiler --, und auf einem Rechner ohne
 * OpenCL meldet das Programm das sauber, statt gar nicht zu starten.
 *
 * WELCHE GERAETE: alle Grafikkarten aller OpenCL-Plattformen, ausser
 * NVIDIA -- dort ist yskar-cuda schneller, und eine Karte soll nicht
 * zweimal erscheinen. Sieht der Rechner dieselbe Karte ueber zwei
 * Plattformen (unter Linux etwa ROCm und Mesa), zaehlt sie einmal, und
 * zwar ueber die Plattform des Herstellers.
 *
 * Umgebungsvariablen (nur fuer Pruefung und Fehlersuche):
 *   YSKAR_OPENCL_NVIDIA=1  NVIDIA-Karten mit aufnehmen
 *   YSKAR_OPENCL_CPU=1     auch Prozessoren als Geraet zulassen; das
 *                          Programm meldet sich dann als Nachbildung
 *                          ("emulation":true), damit niemand dessen Zahlen
 *                          fuer Grafikkarten-Zahlen haelt
 *
 * Der Kernel-Quelltext (yskar_sha256.h + yskar_opencl.cl) steckt als
 * Zeichenkette in yskar_opencl_quelle.h. Erzeugt wird sie beim Bau von
 * gpu/opencl-quelle.mjs -- die beiden Dateien bleiben die Quelle.
 */
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>
#include <chrono>
#include <algorithm>

#ifdef _WIN32
#  ifndef _CRT_SECURE_NO_WARNINGS
#    define _CRT_SECURE_NO_WARNINGS
#  endif
#  define WIN32_LEAN_AND_MEAN
#  define NOMINMAX
#  include <windows.h>
#  define CL_CALL __stdcall
#else
#  include <dlfcn.h>
#  define CL_CALL
#endif

#include "yskar_sha256.h"
#include "yskar_backend.h"
#include "yskar_opencl_quelle.h"

/* ============================================ Das Noetigste aus cl.h
   Werte aus den Khronos-Kopfdateien (CL/cl.h, CL/cl_ext.h). Sie sind Teil
   der stabilen OpenCL-Schnittstelle und aendern sich nicht. */
typedef int32_t  cl_int;
typedef uint32_t cl_uint;
typedef uint64_t cl_ulong;
typedef cl_ulong cl_bitfield;
typedef cl_bitfield cl_device_type;
typedef cl_bitfield cl_mem_flags;
typedef cl_bitfield cl_command_queue_properties;
typedef cl_uint cl_platform_info, cl_device_info, cl_program_build_info, cl_kernel_work_group_info;
typedef intptr_t cl_context_properties;
typedef struct _cl_platform_id *cl_platform_id;
typedef struct _cl_device_id *cl_device_id;
typedef struct _cl_context *cl_context;
typedef struct _cl_command_queue *cl_command_queue;
typedef struct _cl_mem *cl_mem;
typedef struct _cl_program *cl_program;
typedef struct _cl_kernel *cl_kernel;
typedef struct _cl_event *cl_event;

#define CL_SUCCESS 0
#define CL_TRUE 1
#define CL_PLATFORM_NAME   0x0902
#define CL_PLATFORM_VENDOR 0x0903
#define CL_DEVICE_TYPE_CPU (1 << 1)
#define CL_DEVICE_TYPE_GPU (1 << 2)
#define CL_DEVICE_TYPE_ACCELERATOR (1 << 3)
#define CL_DEVICE_TYPE_ALL 0xFFFFFFFF
#define CL_DEVICE_TYPE 0x1000
#define CL_DEVICE_VENDOR_ID 0x1001
#define CL_DEVICE_MAX_COMPUTE_UNITS 0x1002
#define CL_DEVICE_GLOBAL_MEM_SIZE 0x101F
#define CL_DEVICE_NAME 0x102B
#define CL_DEVICE_VENDOR 0x102C
#define CL_DEVICE_VERSION 0x102F
#define CL_DEVICE_BOARD_NAME_AMD 0x4038
#define CL_DEVICE_TOPOLOGY_AMD 0x4037
#define CL_DEVICE_PCI_BUS_INFO_KHR 0x410F
#define CL_MEM_READ_WRITE (1 << 0)
#define CL_MEM_READ_ONLY (1 << 2)
#define CL_PROGRAM_BUILD_LOG 0x1183
#define CL_KERNEL_WORK_GROUP_SIZE 0x11B0
#define CL_KERNEL_PREFERRED_WORK_GROUP_SIZE_MULTIPLE 0x11B3

#define VENDOR_NVIDIA 0x10DEu

/* ============================================== Laufzeit-Laden */

#define CL_FUNKTIONEN(X) \
  X(cl_int, clGetPlatformIDs, (cl_uint, cl_platform_id *, cl_uint *)) \
  X(cl_int, clGetPlatformInfo, (cl_platform_id, cl_platform_info, size_t, void *, size_t *)) \
  X(cl_int, clGetDeviceIDs, (cl_platform_id, cl_device_type, cl_uint, cl_device_id *, cl_uint *)) \
  X(cl_int, clGetDeviceInfo, (cl_device_id, cl_device_info, size_t, void *, size_t *)) \
  X(cl_context, clCreateContext, (const cl_context_properties *, cl_uint, const cl_device_id *, void (CL_CALL *)(const char *, const void *, size_t, void *), void *, cl_int *)) \
  X(cl_command_queue, clCreateCommandQueue, (cl_context, cl_device_id, cl_command_queue_properties, cl_int *)) \
  X(cl_program, clCreateProgramWithSource, (cl_context, cl_uint, const char **, const size_t *, cl_int *)) \
  X(cl_int, clBuildProgram, (cl_program, cl_uint, const cl_device_id *, const char *, void (CL_CALL *)(cl_program, void *), void *)) \
  X(cl_int, clGetProgramBuildInfo, (cl_program, cl_device_id, cl_program_build_info, size_t, void *, size_t *)) \
  X(cl_kernel, clCreateKernel, (cl_program, const char *, cl_int *)) \
  X(cl_int, clGetKernelWorkGroupInfo, (cl_kernel, cl_device_id, cl_kernel_work_group_info, size_t, void *, size_t *)) \
  X(cl_mem, clCreateBuffer, (cl_context, cl_mem_flags, size_t, void *, cl_int *)) \
  X(cl_int, clSetKernelArg, (cl_kernel, cl_uint, size_t, const void *)) \
  X(cl_int, clEnqueueWriteBuffer, (cl_command_queue, cl_mem, cl_uint, size_t, size_t, const void *, cl_uint, const cl_event *, cl_event *)) \
  X(cl_int, clEnqueueReadBuffer, (cl_command_queue, cl_mem, cl_uint, size_t, size_t, void *, cl_uint, const cl_event *, cl_event *)) \
  X(cl_int, clEnqueueNDRangeKernel, (cl_command_queue, cl_kernel, cl_uint, const size_t *, const size_t *, const size_t *, cl_uint, const cl_event *, cl_event *)) \
  X(cl_int, clFinish, (cl_command_queue)) \
  X(cl_int, clReleaseMemObject, (cl_mem)) \
  X(cl_int, clReleaseKernel, (cl_kernel)) \
  X(cl_int, clReleaseProgram, (cl_program)) \
  X(cl_int, clReleaseCommandQueue, (cl_command_queue)) \
  X(cl_int, clReleaseContext, (cl_context))

#define CL_ZEIGER(ret, name, args) typedef ret (CL_CALL *name##_t) args; static name##_t p_##name = NULL;
CL_FUNKTIONEN(CL_ZEIGER)

static char g_fehler[2048] = {0};

static int melde(const char *was, cl_int e) {
  std::snprintf(g_fehler, sizeof g_fehler, "%s: OpenCL-Fehler %d", was, (int)e);
  return 1;
}
#define CL_OK(was, x) do { cl_int e_ = (x); if (e_ != CL_SUCCESS) return melde(was, e_); } while (0)

static bool g_geladen = false;

static bool ladeOpenCL() {
  if (g_geladen) return true;
#ifdef _WIN32
  HMODULE lib = LoadLibraryA("OpenCL.dll");
  if (!lib) { std::snprintf(g_fehler, sizeof g_fehler, "OpenCL nicht gefunden (OpenCL.dll fehlt -- Grafiktreiber installiert?)"); return false; }
#  define HOLE(name) reinterpret_cast<void *>(GetProcAddress(lib, name))
#else
  void *lib = dlopen("libOpenCL.so.1", RTLD_NOW);
  if (!lib) lib = dlopen("libOpenCL.so", RTLD_NOW);
  if (!lib) { std::snprintf(g_fehler, sizeof g_fehler, "OpenCL nicht gefunden (libOpenCL.so.1 fehlt -- Grafiktreiber mit OpenCL installiert?)"); return false; }
#  define HOLE(name) dlsym(lib, name)
#endif
#define CL_LADEN(ret, name, args) \
  p_##name = reinterpret_cast<name##_t>(HOLE(#name)); \
  if (!p_##name) { std::snprintf(g_fehler, sizeof g_fehler, "OpenCL unvollstaendig: %s fehlt", #name); return false; }
  CL_FUNKTIONEN(CL_LADEN)
#undef HOLE
  g_geladen = true;
  return true;
}

/* ============================================== Geraeteliste */

struct Eintrag {
  cl_platform_id plattform;
  cl_device_id geraet;
  std::string name;
  int major, minor;
  unsigned long long vram;
  int cu;
  bool mesa;
  /* PCI-Adresse, -1 = unbekannt. HiveOS nummeriert Karten nach Bus; mit
     derselben Reihenfolge passen Nummern, Temperaturen und Luefter. */
  int bus, dev, fn;
};

/* PCI-Adresse ueber die Erweiterung des Herstellers: AMD meldet sie als
   cl_device_topology_amd (Bus im Byte 21), Intel und Mesa ueber
   cl_khr_pci_bus_info. Ohne beides bleibt sie unbekannt. */
static void pciAdresse(cl_device_id d, int &bus, int &dev, int &fn) {
  bus = dev = fn = -1;
  unsigned char amd[24] = {0};
  if (p_clGetDeviceInfo(d, CL_DEVICE_TOPOLOGY_AMD, sizeof amd, amd, NULL) == CL_SUCCESS) {
    cl_uint typ = 0;
    std::memcpy(&typ, amd, sizeof typ);
    if (typ == 1) { bus = amd[21]; dev = amd[22]; fn = amd[23]; return; }
  }
  cl_uint khr[4] = {0, 0, 0, 0};
  if (p_clGetDeviceInfo(d, CL_DEVICE_PCI_BUS_INFO_KHR, sizeof khr, khr, NULL) == CL_SUCCESS) {
    bus = (int)khr[1]; dev = (int)khr[2]; fn = (int)khr[3];
  }
}

static std::vector<Eintrag> g_liste;
static bool g_listeFertig = false;
static bool g_nurCpu = false;

static bool schalter(const char *name) {
  const char *v = std::getenv(name);
  return v && v[0] == '1';
}

static std::string textInfo(cl_device_id d, cl_device_info was) {
  size_t n = 0;
  if (p_clGetDeviceInfo(d, was, 0, NULL, &n) != CL_SUCCESS || n == 0) return "";
  std::string s(n, '\0');
  if (p_clGetDeviceInfo(d, was, n, &s[0], NULL) != CL_SUCCESS) return "";
  while (!s.empty() && (s.back() == '\0' || s.back() == ' ')) s.pop_back();
  size_t a = 0;
  while (a < s.size() && s[a] == ' ') a++;
  return s.substr(a);
}

static std::string plattformText(cl_platform_id p, cl_platform_info was) {
  char b[512] = {0};
  if (p_clGetPlatformInfo(p, was, sizeof b - 1, b, NULL) != CL_SUCCESS) return "";
  return b;
}

static int baueListe() {
  if (g_listeFertig) return 0;
  if (!ladeOpenCL()) return 1;
  const bool mitNvidia = schalter("YSKAR_OPENCL_NVIDIA");
  const bool mitCpu = schalter("YSKAR_OPENCL_CPU");

  cl_uint np = 0;
  if (p_clGetPlatformIDs(0, NULL, &np) != CL_SUCCESS || np == 0) {
    std::snprintf(g_fehler, sizeof g_fehler, "Keine OpenCL-Plattform gefunden");
    g_listeFertig = true;
    return 1;
  }
  std::vector<cl_platform_id> plattformen(np);
  p_clGetPlatformIDs(np, plattformen.data(), NULL);

  std::vector<Eintrag> alle;
  for (cl_platform_id p : plattformen) {
    const std::string pn = plattformText(p, CL_PLATFORM_NAME) + " " + plattformText(p, CL_PLATFORM_VENDOR);
    const bool mesa = pn.find("Mesa") != std::string::npos || pn.find("Clover") != std::string::npos
                   || pn.find("rusticl") != std::string::npos;
    const cl_device_type typ = mitCpu ? (cl_device_type)CL_DEVICE_TYPE_ALL : (cl_device_type)CL_DEVICE_TYPE_GPU;
    cl_uint nd = 0;
    if (p_clGetDeviceIDs(p, typ, 0, NULL, &nd) != CL_SUCCESS || nd == 0) continue;
    std::vector<cl_device_id> geraete(nd);
    if (p_clGetDeviceIDs(p, typ, nd, geraete.data(), NULL) != CL_SUCCESS) continue;
    for (cl_device_id d : geraete) {
      cl_device_type dt = 0;
      p_clGetDeviceInfo(d, CL_DEVICE_TYPE, sizeof dt, &dt, NULL);
      if (!(dt & CL_DEVICE_TYPE_GPU) && !(mitCpu && (dt & CL_DEVICE_TYPE_CPU))) continue;
      cl_uint vendor = 0;
      p_clGetDeviceInfo(d, CL_DEVICE_VENDOR_ID, sizeof vendor, &vendor, NULL);
      if (vendor == VENDOR_NVIDIA && !mitNvidia) continue;

      Eintrag e;
      e.plattform = p; e.geraet = d; e.mesa = mesa;
      /* Unter ROCm heisst eine Karte "gfx1030"; der Name fuer Menschen
         steht dann in CL_DEVICE_BOARD_NAME_AMD. */
      e.name = textInfo(d, CL_DEVICE_BOARD_NAME_AMD);
      if (e.name.empty()) e.name = textInfo(d, CL_DEVICE_NAME);
      if (e.name.empty()) e.name = "OpenCL-Geraet";
      const std::string ver = textInfo(d, CL_DEVICE_VERSION);   /* "OpenCL 2.0 AMD-APP (...)" */
      e.major = 1; e.minor = 2;
      std::sscanf(ver.c_str(), "OpenCL %d.%d", &e.major, &e.minor);
      cl_ulong mem = 0; cl_uint cu = 0;
      p_clGetDeviceInfo(d, CL_DEVICE_GLOBAL_MEM_SIZE, sizeof mem, &mem, NULL);
      p_clGetDeviceInfo(d, CL_DEVICE_MAX_COMPUTE_UNITS, sizeof cu, &cu, NULL);
      e.vram = (unsigned long long)mem; e.cu = (int)cu;
      pciAdresse(d, e.bus, e.dev, e.fn);
      if (dt & CL_DEVICE_TYPE_CPU) g_nurCpu = true;
      alle.push_back(e);
    }
  }

  /* Dieselbe Karte ueber zwei Plattformen nur einmal -- die des Herstellers
     zuerst, Mesa danach. Gleich heisst: gleiche PCI-Adresse, oder, wo die
     fehlt, gleicher Name, gleicher Speicher, gleich viele Recheneinheiten. */
  for (int runde = 0; runde < 2; runde++) {
    for (const Eintrag &e : alle) {
      if (e.mesa != (runde == 1)) continue;
      bool doppelt = false;
      for (const Eintrag &x : g_liste) {
        const bool gleicherBus = x.bus >= 0 && e.bus >= 0 && x.bus == e.bus && x.dev == e.dev && x.fn == e.fn;
        const bool ohneBus = (x.bus < 0 || e.bus < 0) && x.name == e.name && x.vram == e.vram && x.cu == e.cu;
        if (gleicherBus || ohneBus) { doppelt = true; break; }
      }
      if (!doppelt) g_liste.push_back(e);
    }
  }
  /* Nach PCI-Bus ordnen, wie HiveOS und die Treiber-Werkzeuge. Karten ohne
     bekannte Adresse kommen danach, in der Reihenfolge der Plattform. */
  std::stable_sort(g_liste.begin(), g_liste.end(), [](const Eintrag &a, const Eintrag &b) {
    if ((a.bus < 0) != (b.bus < 0)) return a.bus >= 0;
    if (a.bus != b.bus) return a.bus < b.bus;
    if (a.dev != b.dev) return a.dev < b.dev;
    return a.fn < b.fn;
  });
  /* Gemischte Listen (CPU und GPU) kommen nur beim Pruefen vor. Sobald eine
     echte Karte dabei ist, gilt das Programm nicht als Nachbildung -- die
     CPU-Eintraege fliegen dann raus. */
  bool echteKarte = false;
  for (const Eintrag &e : g_liste) {
    cl_device_type dt = 0;
    p_clGetDeviceInfo(e.geraet, CL_DEVICE_TYPE, sizeof dt, &dt, NULL);
    if (dt & CL_DEVICE_TYPE_GPU) echteKarte = true;
  }
  if (echteKarte && g_nurCpu) {
    std::vector<Eintrag> nurGpu;
    for (const Eintrag &e : g_liste) {
      cl_device_type dt = 0;
      p_clGetDeviceInfo(e.geraet, CL_DEVICE_TYPE, sizeof dt, &dt, NULL);
      if (dt & CL_DEVICE_TYPE_GPU) nurGpu.push_back(e);
    }
    g_liste.swap(nurGpu);
    g_nurCpu = false;
  }
  g_listeFertig = true;
  return 0;
}

/* ============================================== Geraetezustand */

static cl_context g_ctx = NULL;
static cl_command_queue g_q = NULL;
static cl_program g_prog = NULL;
static cl_kernel g_kern = NULL, g_einzel = NULL;
static cl_mem g_mid = NULL, g_ziel = NULL, g_treffer = NULL, g_aus = NULL;
static cl_device_id g_dev = NULL;
static size_t g_lokal = 64;     /* Arbeitsgruppe */
static size_t g_global = 64;    /* Arbeitselemente je Stapel */
static int g_cu = 1;
/* Abgestimmt wird erst beim ersten Stapel: Selbsttest und Erkennung
   brauchen es nicht und sollen nicht darauf warten. */
static bool g_abgestimmt = false;
/* Der zuletzt gesetzte Job -- fuer die Wiederherstellung nach der Abstimmung. */
static uint32_t g_jobMid[8] = {0}, g_jobZiel[8] = {0};

static int starte(cl_kernel k, cl_ulong basis, cl_uint iters, size_t global, size_t lokal) {
  CL_OK("Argument 0", p_clSetKernelArg(k, 0, sizeof basis, &basis));
  CL_OK("Argument 1", p_clSetKernelArg(k, 1, sizeof iters, &iters));
  CL_OK("Argument 2", p_clSetKernelArg(k, 2, sizeof g_mid, &g_mid));
  CL_OK("Argument 3", p_clSetKernelArg(k, 3, sizeof g_ziel, &g_ziel));
  CL_OK("Argument 4", p_clSetKernelArg(k, 4, sizeof g_treffer, &g_treffer));
  const cl_uint null3[3] = {0, 0, 0};
  CL_OK("Treffer leeren", p_clEnqueueWriteBuffer(g_q, g_treffer, CL_TRUE, 0, sizeof null3, null3, 0, NULL, NULL));
  CL_OK("Kernelstart", p_clEnqueueNDRangeKernel(g_q, k, 1, NULL, &global, lokal ? &lokal : NULL, 0, NULL, NULL));
  CL_OK("clFinish", p_clFinish(g_q));
  return 0;
}

static int leseTreffer(unsigned long long *gefunden) {
  cl_uint t[3] = {0, 0, 0};
  CL_OK("Treffer lesen", p_clEnqueueReadBuffer(g_q, g_treffer, CL_TRUE, 0, sizeof t, t, 0, NULL, NULL));
  *gefunden = t[0] ? ((unsigned long long)t[2] << 32) | t[1] : YSKAR_NONE;
  return 0;
}

/*
 * Die schnellste Gittergroesse auf DIESER Karte messen.
 *
 * Wie viele Arbeitselemente eine Karte gleichzeitig gut auslastet, haengt
 * von Hersteller, Generation und Treiber ab. Statt zu raten, rechnet das
 * Programm beim Start kurz mit mehreren Groessen und nimmt die schnellste.
 * Gemessen wird mit unerreichbarem Ziel, damit kein Treffer stoert.
 */
static int stimmeAb(int cu) {
  const uint32_t mid[8] = {1, 2, 3, 4, 5, 6, 7, 8};
  const uint32_t ziel[8] = {0, 0, 0, 0, 0, 0, 0, 0};
  CL_OK("Messjob", p_clEnqueueWriteBuffer(g_q, g_mid, CL_TRUE, 0, sizeof mid, mid, 0, NULL, NULL));
  CL_OK("Messjob", p_clEnqueueWriteBuffer(g_q, g_ziel, CL_TRUE, 0, sizeof ziel, ziel, 0, NULL, NULL));

  const size_t einheiten = (size_t)(cu > 0 ? cu : 1);
  if (g_nurCpu) { g_global = einheiten * g_lokal; return 0; }

  static const size_t faktoren[] = {4, 8, 16, 32, 64, 128};
  double besteRate = 0;
  size_t besteGroesse = einheiten * g_lokal * 16;
  for (size_t f : faktoren) {
    const size_t global = einheiten * g_lokal * f;
    if (global > (size_t)1 << 26) break;
    /* Ein Aufwaermlauf (Treiber uebersetzt manches erst beim ersten Start),
       dann gemessen mit so vielen Iterationen, dass der Lauf messbar ist. */
    if (starte(g_kern, 0, 1, global, g_lokal)) return 1;
    cl_uint iters = 4;
    double ms = 0;
    for (int versuch = 0; versuch < 8; versuch++) {
      const auto t0 = std::chrono::steady_clock::now();
      if (starte(g_kern, 0, iters, global, g_lokal)) return 1;
      ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
      if (ms >= 40.0) break;
      iters *= 2;
    }
    const double rate = (double)global * iters / (ms > 0 ? ms : 1);
    if (rate > besteRate * 1.02) { besteRate = rate; besteGroesse = global; }
  }
  g_global = besteGroesse;
  return 0;
}

/* ===================================================== Schnittstelle */

extern "C" {

int yskar_dev_is_emulation(void) { return g_nurCpu ? 1 : 0; }
const char *yskar_dev_error(void) { return g_fehler; }

int yskar_dev_count(int *anzahl) {
  *anzahl = 0;
  if (baueListe() != 0) return 1;
  *anzahl = (int)g_liste.size();
  if (*anzahl == 0) {
    std::snprintf(g_fehler, sizeof g_fehler, "Keine AMD- oder Intel-Grafikkarte mit OpenCL gefunden");
    return 1;
  }
  return 0;
}

int yskar_dev_info(int id, char *name, int namelen,
                   int *major, int *minor, unsigned long long *vram, int *sm) {
  if (baueListe() != 0) return 1;
  if (id < 0 || id >= (int)g_liste.size()) { std::snprintf(g_fehler, sizeof g_fehler, "Geraet %d gibt es nicht", id); return 1; }
  const Eintrag &e = g_liste[(size_t)id];
  std::snprintf(name, (size_t)namelen, "%s", e.name.c_str());
  *major = e.major; *minor = e.minor; *vram = e.vram; *sm = e.cu;
  return 0;
}

/* PCI-Adresse als "03:00.0" (wie HiveOS sie schreibt), leer wenn unbekannt.
   Nur yskar-opencl kennt diese Funktion; yskar_host.cpp ruft sie nur im Bau
   mit -DYSKAR_API_OPENCL. */
const char *yskar_ocl_bus_text(int id) {
  static char b[16];
  b[0] = 0;
  if (baueListe() != 0 || id < 0 || id >= (int)g_liste.size()) return b;
  const Eintrag &e = g_liste[(size_t)id];
  if (e.bus >= 0) std::snprintf(b, sizeof b, "%02x:%02x.%x", e.bus & 0xff, e.dev & 0x1f, e.fn & 0x7);
  return b;
}

int yskar_dev_init(int id) {
  if (baueListe() != 0) return 1;
  if (id < 0 || id >= (int)g_liste.size()) { std::snprintf(g_fehler, sizeof g_fehler, "Geraet %d gibt es nicht", id); return 1; }
  const Eintrag &e = g_liste[(size_t)id];
  g_dev = e.geraet;
  cl_int err = CL_SUCCESS;
  const cl_context_properties props[] = { 0x1084 /* CL_CONTEXT_PLATFORM */, (cl_context_properties)e.plattform, 0 };
  g_ctx = p_clCreateContext(props, 1, &g_dev, NULL, NULL, &err);
  if (err != CL_SUCCESS) return melde("clCreateContext", err);
  g_q = p_clCreateCommandQueue(g_ctx, g_dev, 0, &err);
  if (err != CL_SUCCESS) return melde("clCreateCommandQueue", err);

  const char *quelle = YSKAR_OPENCL_QUELLE;
  g_prog = p_clCreateProgramWithSource(g_ctx, 1, &quelle, NULL, &err);
  if (err != CL_SUCCESS) return melde("clCreateProgramWithSource", err);
  err = p_clBuildProgram(g_prog, 1, &g_dev, "", NULL, NULL);
  if (err != CL_SUCCESS) {
    char log[1600] = {0};
    p_clGetProgramBuildInfo(g_prog, g_dev, CL_PROGRAM_BUILD_LOG, sizeof log - 1, log, NULL);
    std::snprintf(g_fehler, sizeof g_fehler, "Kernel nicht uebersetzbar (OpenCL-Fehler %d): %s", (int)err, log);
    return 1;
  }
  g_kern = p_clCreateKernel(g_prog, "yskar_kernel", &err);
  if (err != CL_SUCCESS) return melde("clCreateKernel(yskar_kernel)", err);
  g_einzel = p_clCreateKernel(g_prog, "yskar_einzel", &err);
  if (err != CL_SUCCESS) return melde("clCreateKernel(yskar_einzel)", err);

  g_mid = p_clCreateBuffer(g_ctx, CL_MEM_READ_ONLY, sizeof(cl_uint) * 8, NULL, &err);
  if (err != CL_SUCCESS) return melde("clCreateBuffer(mid)", err);
  g_ziel = p_clCreateBuffer(g_ctx, CL_MEM_READ_ONLY, sizeof(cl_uint) * 8, NULL, &err);
  if (err != CL_SUCCESS) return melde("clCreateBuffer(ziel)", err);
  g_treffer = p_clCreateBuffer(g_ctx, CL_MEM_READ_WRITE, sizeof(cl_uint) * 3, NULL, &err);
  if (err != CL_SUCCESS) return melde("clCreateBuffer(treffer)", err);
  g_aus = p_clCreateBuffer(g_ctx, CL_MEM_READ_WRITE, 32, NULL, &err);
  if (err != CL_SUCCESS) return melde("clCreateBuffer(aus)", err);

  /* Arbeitsgruppe: 256, wenn Kernel und Karte das zulassen, und immer ein
     Vielfaches dessen, was der Treiber bevorzugt (AMD 32/64, Intel 8-32). */
  size_t maxWg = 256, mehrfach = 1;
  p_clGetKernelWorkGroupInfo(g_kern, g_dev, CL_KERNEL_WORK_GROUP_SIZE, sizeof maxWg, &maxWg, NULL);
  p_clGetKernelWorkGroupInfo(g_kern, g_dev, CL_KERNEL_PREFERRED_WORK_GROUP_SIZE_MULTIPLE, sizeof mehrfach, &mehrfach, NULL);
  if (mehrfach == 0) mehrfach = 1;
  size_t wg = maxWg < 256 ? maxWg : 256;
  if (wg >= mehrfach) wg -= wg % mehrfach;
  g_lokal = wg > 0 ? wg : 1;
  g_cu = e.cu;
  g_abgestimmt = false;
  return 0;
}

int yskar_dev_set_job(const uint32_t mid[8], const uint8_t target[32]) {
  uint32_t ziel[8];
  yskar_ziel_woerter(ziel, target);
  std::memcpy(g_jobMid, mid, sizeof g_jobMid);
  std::memcpy(g_jobZiel, ziel, sizeof g_jobZiel);
  CL_OK("Midstate schreiben", p_clEnqueueWriteBuffer(g_q, g_mid, CL_TRUE, 0, sizeof(uint32_t) * 8, mid, 0, NULL, NULL));
  CL_OK("Ziel schreiben", p_clEnqueueWriteBuffer(g_q, g_ziel, CL_TRUE, 0, sizeof ziel, ziel, 0, NULL, NULL));
  return 0;
}

unsigned long long yskar_dev_batchsize(unsigned int iters) {
  return (unsigned long long)g_global * (unsigned long long)iters;
}

int yskar_dev_batch(unsigned long long basis, unsigned int iters,
                    unsigned long long *geprueft, unsigned long long *gefunden) {
  if (!g_abgestimmt) {
    /* Die Abstimmung ueberschreibt Midstate und Ziel -- danach den Job
       wiederherstellen, den der Aufrufer gesetzt hat. */
    if (stimmeAb(g_cu)) return 1;
    g_abgestimmt = true;
    CL_OK("Midstate schreiben", p_clEnqueueWriteBuffer(g_q, g_mid, CL_TRUE, 0, sizeof g_jobMid, g_jobMid, 0, NULL, NULL));
    CL_OK("Ziel schreiben", p_clEnqueueWriteBuffer(g_q, g_ziel, CL_TRUE, 0, sizeof g_jobZiel, g_jobZiel, 0, NULL, NULL));
  }
  if (starte(g_kern, (cl_ulong)basis, (cl_uint)iters, g_global, g_lokal)) return 1;
  if (leseTreffer(gefunden)) return 1;
  *geprueft = yskar_dev_batchsize(iters);
  return 0;
}

int yskar_dev_single(unsigned long long nonce, unsigned char aus[32]) {
  const cl_ulong n = (cl_ulong)nonce;
  CL_OK("Argument 0", p_clSetKernelArg(g_einzel, 0, sizeof n, &n));
  CL_OK("Argument 1", p_clSetKernelArg(g_einzel, 1, sizeof g_mid, &g_mid));
  CL_OK("Argument 2", p_clSetKernelArg(g_einzel, 2, sizeof g_aus, &g_aus));
  const size_t eins = 1;
  CL_OK("Einzelhash", p_clEnqueueNDRangeKernel(g_q, g_einzel, 1, NULL, &eins, &eins, 0, NULL, NULL));
  CL_OK("Einzelhash", p_clFinish(g_q));
  CL_OK("Einzelhash lesen", p_clEnqueueReadBuffer(g_q, g_aus, CL_TRUE, 0, 32, aus, 0, NULL, NULL));
  return 0;
}

/* Genau ein Arbeitselement, genau eine Nonce -- ohne Wettlauf. */
int yskar_dev_one(unsigned long long nonce, unsigned long long *gefunden) {
  if (starte(g_kern, (cl_ulong)nonce, 1, 1, 1)) return 1;
  return leseTreffer(gefunden);
}

void yskar_dev_free(void) {
  if (g_aus) { p_clReleaseMemObject(g_aus); g_aus = NULL; }
  if (g_treffer) { p_clReleaseMemObject(g_treffer); g_treffer = NULL; }
  if (g_ziel) { p_clReleaseMemObject(g_ziel); g_ziel = NULL; }
  if (g_mid) { p_clReleaseMemObject(g_mid); g_mid = NULL; }
  if (g_einzel) { p_clReleaseKernel(g_einzel); g_einzel = NULL; }
  if (g_kern) { p_clReleaseKernel(g_kern); g_kern = NULL; }
  if (g_prog) { p_clReleaseProgram(g_prog); g_prog = NULL; }
  if (g_q) { p_clReleaseCommandQueue(g_q); g_q = NULL; }
  if (g_ctx) { p_clReleaseContext(g_ctx); g_ctx = NULL; }
}

}  /* extern "C" */
