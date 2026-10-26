import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import localFont from 'next/font/local';
import './globals.css';
import { THEMA_STARTSKRIPT } from '@/lib/thema';

/*
  Geist und Geist Mono: dieselbe Schrift wie yskar.app und die YSKAR Wallet.
  Die Dateien liegen im Repo (src/fonts, OFL-lizenziert): Der Build braucht
  kein Google, und im Telegram-WebView laedt nichts von fremden Servern.
  Geist deckt Latein, Polnisch, Tuerkisch und Kyrillisch ab. Fuer die
  vietnamesischen Zeichen mit zwei Akzenten springen Manrope und IBM Plex
  Mono ein (eigene Familien mit unicode-range, nur bei Bedarf geladen).
  Chinesisch zeichnet die Systemschrift.

  Mono ist kein Stilmittel: Hexadezimal, Adressen und Merkwoerter brauchen
  feste Zeichenbreite, sonst kann man sie nicht zuverlaessig abschreiben.
*/
const sans = localFont({
  src: [{ path: '../fonts/geist-variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-sans', display: 'swap', adjustFontFallback: false,
});
const sansVi = localFont({
  src: [{ path: '../fonts/manrope-vietnamese-wght-normal.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-sans-vi', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' }],
});
const mono = localFont({
  src: [{ path: '../fonts/geist-mono-variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-mono', display: 'swap', adjustFontFallback: false,
});
const monoVi = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-vietnamese-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-vietnamese-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono-vi', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' }],
});

export const metadata: Metadata = {
  title: 'YSKAR',
  description: 'Proof of work on your phone. Verifiable. — Proof of Work auf dem Telefon. Nachrechenbar.',
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#03060F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[sans, sansVi, mono, monoVi].map(f => f.variable).join(' ')} data-thema="dunkel">
      <head>
        {/* Thema vor dem ersten Zeichnen setzen -- sonst blitzt Hell auf. */}
        <script dangerouslySetInnerHTML={{ __html: THEMA_STARTSKRIPT }} />
      </head>
      <body className="font-sans">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
