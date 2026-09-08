const fs = require('fs');
const path = require('path');
const wabtInit = require('wabt');

(async () => {
  const wabt = await wabtInit();
  const src = fs.readFileSync(path.join(__dirname, 'sha256d_miner.wat'), 'utf8');
  const mod = wabt.parseWat('sha256d_miner.wat', src, {
    mutable_globals: true,
    sat_float_to_int: true,
    sign_extension: true,
    bulk_memory: true,
  });
  mod.resolveNames();
  mod.validate();
  const { buffer } = mod.toBinary({ log: false, write_debug_names: false });
  fs.writeFileSync(path.join(__dirname, 'sha256d_miner.wasm'), Buffer.from(buffer));
  console.log('sha256d_miner.wasm:', buffer.length, 'Bytes');
})().catch(e => { console.error('FEHLER:', e.message); process.exit(1); });
