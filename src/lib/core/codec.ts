/** Deterministische Serialisierung. Little-Endian, feste Breiten. */
export class Writer {
  private parts: Uint8Array[] = [];
  private size = 0;

  private push(b: Uint8Array) { this.parts.push(b); this.size += b.length; return this; }

  u8(v: number)  { return this.push(Uint8Array.of(v & 0xff)); }
  u16(v: number) { const b=new Uint8Array(2); new DataView(b.buffer).setUint16(0,v,true); return this.push(b); }
  u32(v: number) { const b=new Uint8Array(4); new DataView(b.buffer).setUint32(0,v>>>0,true); return this.push(b); }
  u64(v: bigint) {
    if (v < 0n || v > 0xffffffffffffffffn) throw new Error(`u64 ausserhalb des Bereichs: ${v}`);
    const b=new Uint8Array(8); new DataView(b.buffer).setBigUint64(0,v,true); return this.push(b);
  }
  bytes(b: Uint8Array, expect?: number) {
    if (expect !== undefined && b.length !== expect) {
      throw new Error(`erwartet ${expect} Byte, erhalten ${b.length}`);
    }
    return this.push(b);
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

export class Reader {
  private o = 0;
  private buf: Uint8Array;
  private dv: DataView;
  // Bewusst keine Konstruktor-Parametereigenschaft: die erzeugt echten Code
  // und laesst sich nicht rein typenentfernend ausfuehren.
  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  private need(n: number) {
    if (this.o + n > this.buf.length) throw new Error('Daten zu kurz');
  }
  u8()  { this.need(1); return this.buf[this.o++]; }
  u16() { this.need(2); const v=this.dv.getUint16(this.o,true); this.o+=2; return v; }
  u32() { this.need(4); const v=this.dv.getUint32(this.o,true); this.o+=4; return v; }
  u64() { this.need(8); const v=this.dv.getBigUint64(this.o,true); this.o+=8; return v; }
  bytes(n: number) { this.need(n); const v=this.buf.slice(this.o,this.o+n); this.o+=n; return v; }
  get rest() { return this.buf.length - this.o; }
  get offset() { return this.o; }
}

export const toHex = (b: Uint8Array) =>
  Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

export function fromHex(s: string): Uint8Array {
  const c = s.startsWith('\\x') ? s.slice(2) : s;
  if (c.length % 2) throw new Error('Hex-Laenge ungerade');
  const o = new Uint8Array(c.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
  return o;
}
