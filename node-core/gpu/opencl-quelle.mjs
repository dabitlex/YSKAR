/**
 * Erzeugt gpu/bin/yskar_opencl_quelle.h: den Quelltext, den yskar-opencl
 * beim Start dem OpenCL-Compiler im Grafiktreiber gibt.
 *
 * Der Quelltext ist yskar_sha256.h -- dieselbe Datei, die nvcc fuer CUDA und
 * gcc fuer die Pruefung uebersetzen -- und danach yskar_opencl.cl. So rechnet
 * auch die AMD- und Intel-Fassung genau die geprueften Zeilen und keine
 * zweite, getrennt geschriebene SHA-256.
 *
 *   node gpu/opencl-quelle.mjs [Zielordner]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = dirname(fileURLToPath(import.meta.url));
const ziel = resolve(process.argv[2] ?? join(hier, 'bin'));

export function openclQuelle() {
  const sha = readFileSync(join(hier, 'yskar_sha256.h'), 'utf8');
  const kern = readFileSync(join(hier, 'yskar_opencl.cl'), 'utf8');
  return `${sha}\n${kern}`;
}

function alsC(text) {
  /* Eine Zeichenkette je Zeile: MSVC begrenzt einzelne Literale auf rund
     16 KB, aneinandergehaengte duerfen laenger sein. */
  const zeilen = text.replace(/\r\n/g, '\n').split('\n').map(z =>
    '  "' + z.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '  ') + '\\n"');
  return zeilen.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('opencl-quelle.mjs')) {
  mkdirSync(ziel, { recursive: true });
  const datei = join(ziel, 'yskar_opencl_quelle.h');
  writeFileSync(datei,
    '/* Erzeugt von gpu/opencl-quelle.mjs -- nicht von Hand aendern. */\n' +
    '#ifndef YSKAR_OPENCL_QUELLE_H\n#define YSKAR_OPENCL_QUELLE_H\n' +
    'static const char YSKAR_OPENCL_QUELLE[] =\n' + alsC(openclQuelle()) + ';\n#endif\n');
  console.log(`OpenCL-Quelltext geschrieben: ${datei}`);
}
