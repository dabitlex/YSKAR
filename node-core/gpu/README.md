# GPU mining program (CUDA)

This folder contains `yskar-cuda`, the program that mines YSKAR on NVIDIA graphics cards. This
guide is for developers who want to build it, test it on a card, or understand how it works.

`yskar-cuda.exe` is a standalone program. Node Core and the command-line miner start it as a
child process, send it jobs and receive nonces from it. It computes hashes and reports nonces
whose hash meets the target. Whether such a nonce becomes a block is decided by the node, through
`MiningCoordinator.submitNonce()` and the same complete validation as for any other block.

## What is verified and what is not

**Verified without a graphics card** (paths are relative to the `node-core` folder):

| What | How |
|---|---|
| SHA-256d of the 136-byte header, bit for bit against the real genesis block | `gpu/test/test_sha.c` compiles `yskar_sha256.h`, the same file the GPU build uses, with `gcc` (`npm run test:sha`) |
| Nonce at offset 128, little-endian | The same test |
| Target comparison byte by byte from the front, as in `submitNonce()` | The same test, and the self-test of the CPU emulation |
| Protocol with Node Core: device detection, job, hit, progress | `test/gpu.test.ts` with the CPU emulation |
| Hits become real blocks, several in a row, that the node validates completely | `test/gpu.test.ts` |
| Stopping ends the program | `test/gpu.test.ts` |
| A crash while mining or a missing program does not stop the node | `test/gpu.test.ts` |
| A card that computes wrongly, or a program that does not answer the self-test, is refused | `test/gpu.test.ts` |
| CPU and GPU never check the same nonces | `test/gpu.test.ts` |
| The program compiles with `nvcc` and MSVC on Windows | The release workflow (`.github/workflows/node-core-release.yml` in the repository root) builds it on Windows with CUDA 11.8. It then runs `--probe` and records the outcome; without an NVIDIA driver the program is expected to end with an error there. |

The CPU emulation is the same program with `yskar_cpu.cpp` in place of the CUDA kernel. Build it
with `npm run build:gpu-emu`; it produces `gpu/bin/yskar-cuda-emu`. It identifies itself as an
emulation (`"emulation":true`, device name `CPU-Nachbildung (keine GPU)`), so that nobody takes
its figures for GPU figures.

**Not verified by any automated run:**

- that the kernel computes correctly on a real card. The build machines have no NVIDIA card.
- how fast it is on a given card.

The self-test on the card itself shows the first, and the benchmark measures the second (steps 3
and 4 below). The self-test is the actual proof that a card computes correctly. Node Core and the
command-line miner run it themselves before they mine with a card, and refuse a card that fails.

## Why a separate program

The GPU code is a program of its own and not a native Node.js module, for three reasons:

- **A driver crash takes down only this program**, not the node. Node Core then reports that the
  GPU is not available and keeps running.
- **No rebuild with every Node.js or Electron update.** A native module must match the runtime
  exactly; a program does not.
- **Without CUDA, this one file is simply absent.** Node Core still builds and starts.

## Step by step

All commands are for PowerShell in the `node-core` folder of the repository.

You need the NVIDIA CUDA Toolkit (for `nvcc`) and Visual Studio or the Visual Studio Build Tools
with the C++ tools ("Desktop development with C++").

### 1. Build

```powershell
powershell -ExecutionPolicy Bypass -File gpu\build-gpu.ps1 -Nvcc "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8\bin\nvcc.exe"
```

The path is the default location of CUDA 11.8. Change it if your installation is elsewhere.
Without `-Nvcc` the script uses `bin\nvcc.exe` below the folder named in the `CUDA_PATH`
environment variable, or the `nvcc.exe` found on the `PATH`. `npm run build:gpu` runs the script
without parameters.

| Parameter | Meaning |
|---|---|
| `-Nvcc <path>` | Use this `nvcc.exe` |
| `-Arch 50,61,75` | Build only for these Compute Capabilities |
| `-VcVarsVer 14.29` | Use this MSVC toolset instead of the default one |

**Why CUDA 11.8.** CUDA 11.8 still builds for Compute Capability 5.0, the oldest architecture in
the list below. Newer CUDA releases have removed old architectures. The script asks `nvcc` itself
which architectures it knows and skips the others with a message; it does not guess.

**Newer Visual Studio versions.** CUDA 11.8 supports Visual Studio 2017 to 2022. If `nvcc` stops
with `unsupported Microsoft Visual Studio version`, the script tries a second time with
`-allow-unsupported-compiler`. This is an official `nvcc` switch that only turns off the version
check. The kernel uses no standard library on the GPU, so the risk is small, but it is a risk,
and that is what step 3 is for. If the MSVC standard library then rejects the CUDA version
(`STL1002`), the script tries once more with `_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH`. If the
build still fails, it lists the installed MSVC toolsets and suggests selecting one with
`-VcVarsVer`.

The script finds Visual Studio through `vswhere` and takes over its build environment. You do
not need to open a "Developer PowerShell".

The result is `gpu\bin\yskar-cuda.exe`. It is linked statically against the CUDA runtime, so a
computer that runs it needs only the NVIDIA driver, not the CUDA Toolkit. At the end the script
runs the device detection and the self-test on device 0 itself. If it finds no card, it says so
and ends without an error; if the self-test fails, it ends with an error.

### 2. Detect the card

```powershell
.\gpu\bin\yskar-cuda.exe --probe
```

The program prints one line per card it finds:

```text
{"t":"device","id":0,"name":"<name of the card>","cc":"<major>.<minor>","vram":<bytes>,"sm":<multiprocessors>}
```

`cc` is the Compute Capability, `vram` the memory in bytes, `sm` the number of streaming
multiprocessors. If no card is found, the program ends with exit code 2.

### 3. Self-test

```powershell
.\gpu\bin\yskar-cuda.exe --selftest --device 0
```

The card itself computes the hash of the genesis block and the result is compared bit for bit.
The test also checks that the kernel recognizes the genesis nonce as a hit and the next nonce as
no hit.

A passed test prints the device line from step 2 and then:

```json
{"t":"selftest","hash":"000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66","expected":"000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66"}
{"t":"selftest","ok":true,"check":"Genesis-Hash bitgenau"}
{"t":"selftest","ok":true,"check":"Genesis-Nonce als Treffer erkannt"}
{"t":"selftest","ok":true,"check":"Nonce daneben ist kein Treffer"}
{"t":"selftest","result":"PASSED"}
```

The three checks mean: genesis hash exact to the bit, genesis nonce recognized as a hit, the
nonce next to it is not a hit.

If the last line says `FAILED`, do not mine with this card. The program then ends with exit
code 1.

### 4. Measure the hashrate

```powershell
.\gpu\bin\yskar-cuda.exe --bench 10 --device 0
```

The program measures for ten seconds after a warm-up of two seconds that is not counted. The
target is unreachable, so that no hit disturbs the count. The result is one line:

```text
{"t":"bench","hashes":<count>,"seconds":<seconds>,"hashrate":<hashes per second>,"mhs":<megahashes per second>}
```

The figure is measured, not estimated: counted hashes divided by measured time.

### 5. Build and start Node Core

```powershell
npm install
npm run build
npm start
```

The build copies the CPU mining engine to `dist\` and reports whether it found
`gpu\bin\yskar-cuda.exe`. In the program, the card then appears on the Mining page with its name
and memory size.

### 6. Build the installer

```powershell
npm run dist
```

If `gpu\bin\yskar-cuda.exe` exists, the installer places it next to the application, outside the
asar archive, because programs cannot be started from inside the archive. If it is missing, the
result is an installer without GPU mining. Both are valid.

## Protocol

The program reads jobs from standard input and writes results to standard output, one JSON object
per line.

To the program:

```json
{"t":"job","jobId":"<hex>","header":"<272 hex characters>","target":"<64 hex characters>"}
{"t":"stop"}
{"t":"quit"}
```

`header` is the 136-byte block header with the nonce set to zero. `target` is the 32-byte target
the hash must not exceed. A new target is always sent together with a header; there is no
separate command for it. A job with the same `jobId` and the same header as the running one
changes only the target, and the card continues from the nonce it has reached; any other job
starts at nonce 0. Before 9 October 2026 every job started at nonce 0, so a target change
repeated work and returned duplicates (issue #4). `stop` pauses the work, `quit` ends the
program. The program also ends when its standard input is closed.

The kernel keeps one hit per batch: the first one a thread writes. While the share target is
still easy, a batch can contain several hits, and the others are not reported. Keeping the
lowest hit and checking the block target separately would close this, but needs a change to
`yskar_gpu.cu` that has to be built and tested on a card first (open in issue #4).

From the program:

```json
{"t":"device","id":0,"name":"...","cc":"5.0","vram":2147483648,"sm":3}
{"t":"ready"}
{"t":"progress","hashes":123,"ms":1000}
{"t":"found","jobId":"<hex>","nonce":"<decimal>"}
{"t":"error","message":"..."}
```

`progress` is sent about once per second and carries the hashes computed since the last message.

| Call | Purpose |
|---|---|
| `yskar-cuda --probe` | List the devices and exit |
| `yskar-cuda --selftest --device 0` | The card computes the genesis hash |
| `yskar-cuda --bench 10 --device 0` | Measure the hashrate |
| `yskar-cuda --device 0` | Mine: wait for jobs on standard input |

## Why three files instead of one

Newer MSVC versions refuse to compile their C++ standard library with a CUDA older than 12.4:

```text
yvals_core.h: error STL1002: Unexpected compiler version, expected CUDA 12.4 or newer
```

The build uses CUDA 11.8 because of Compute Capability 5.0. Both requirements can be met at the
same time only if `nvcc` never sees the standard library.

The script therefore builds in three steps:

```text
nvcc  -c yskar_gpu.cu     the kernel only, no standard library
cl    /c yskar_host.cpp   protocol and threads, no CUDA
nvcc  links the two
```

Between them is `yskar_backend.h`, a narrow interface in plain C. No standard library type
crosses it. The same interface is implemented by `yskar_cpu.cpp`, the emulation for testing
without a graphics card.

## How the kernel works

**Midstate.** The header has 136 bytes: two full SHA-256 blocks and eight bytes in the third.
The nonce lies entirely in the third block. The state after the first two blocks is therefore
the same for a whole job and is computed once. Each attempt then costs two compressions instead
of four. The WebAssembly engine of the CPU miner does the same.

**Constant memory.** All threads read the midstate and the target, and none writes them. That is
what GPU constant memory is for.

**Grid stride.** Each thread checks nonces at a distance of the grid size, so neighboring threads
check neighboring nonces. At the end of a batch a range without gaps has been covered.

**Batch length of 100 to 250 ms**, adjusted by the program itself. Shorter batches make the card
wait for the host. Longer batches delay new jobs, and under Windows the driver ends kernels that
run for more than about two seconds, especially on a card that also drives the display.

**A thread keeps computing after a hit.** If it stopped, nonces would remain unchecked while the
host counts them as checked, and the reported hashrate would be too high.

**At most one hit per batch.** The kernel stores the first hit of a batch and ignores further
ones. This matters only while the share target is still very easy, right after a session starts.

## CPU and GPU at the same time

Each miner receives its own extranonce and therefore its own job. The headers differ in bytes
120 to 127, so the two cannot check the same header twice. No additional consensus rule is
needed for this; it is the same mechanism by which the node separates all miners.

The program uses one CPU thread to drive the card. In CPU + GPU mode, leave one core free.

## Compute capabilities

The script builds for every architecture in this list that the installed `nvcc` knows:

| Compute Capability | Generation | Examples |
|---|---|---|
| 50 | Maxwell | GTX 750, GeForce 940MX |
| 52 | Maxwell | GTX 9xx |
| 60 | Pascal | Tesla P100 |
| 61 | Pascal | GTX 10xx |
| 70 | Volta | |
| 75 | Turing | GTX 16xx, RTX 20xx |
| 80 | Ampere | A100 |
| 86 | Ampere | RTX 30xx |
| 89 | Ada | RTX 40xx |
| 90 | Hopper | |

In addition it includes PTX code for the highest of them, so that newer cards can compile the
code themselves on first start. To choose the architectures yourself:

```powershell
powershell -ExecutionPolicy Bypass -File gpu\build-gpu.ps1 -Arch 50,61,86
```

## Files

```text
gpu/yskar_sha256.h     SHA-256d, compiles with nvcc and with gcc
gpu/yskar_gpu.cu       kernel and CUDA access, without the C++ standard library
gpu/yskar_host.cpp     protocol, self-test, benchmark, without CUDA
gpu/yskar_cpu.cpp      CPU emulation for testing
gpu/yskar_backend.h    the narrow C interface between them
gpu/build-gpu.ps1      Windows build
gpu/test/test_sha.c    check against the genesis block, without a GPU
gpu/bin/               build output, not in the repository
```
