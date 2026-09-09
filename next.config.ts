import type { NextConfig } from 'next';

const config: NextConfig = {
  // Kein COOP/COEP: SharedArrayBuffer wuerde diese Header verlangen, und die
  // brechen das Laden der Telegram-Avatare (t.me liefert kein CORP). Wir
  // nutzen stattdessen mehrere unabhaengige Worker mit getrennten
  // Nonce-Bereichen -- gleiche Wirkung, keine Header-Nebenwirkungen.
  async headers() {
    return [{
      // Muster statt fester Name: Die Engine heisst jetzt nach ihrem Inhalt,
      // damit ein Jahres-Cache nie eine veraltete Fassung ausliefern kann.
      source: '/:file(miner\\..*\\.wasm)',
      headers: [
        { key: 'Content-Type', value: 'application/wasm' },
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    }];
  },
};

export default config;
