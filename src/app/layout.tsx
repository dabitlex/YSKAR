import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import localFont from 'next/font/local';
import './globals.css';
import { THEMA_STARTSKRIPT } from '@/lib/thema';

/*
  Manrope: geometrisch, ruhig, mit klaren Ziffern -- so soll sich die App
  lesen: wie ein Werkzeug, nicht wie ein Spielautomat. Die Dateien liegen im
  Repo (src/fonts, OFL-lizenziert): Der Build braucht damit kein Google, und
  im Telegram-WebView laedt nichts von fremden Servern.

  Mono ist kein Stilmittel: Hexadezimal, Adressen und Merkwoerter brauchen
  feste Zeichenbreite, sonst kann man sie nicht zuverlaessig abschreiben.
*/
const sans = localFont({
  src: [{ path: '../fonts/manrope-latin-wght-normal.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-sans', display: 'swap',
  // Ohne die metrisch angepasste Ersatzschrift im selben Stapel: Sonst
  // zeichnete Arial die Zeichen, die in "latin" fehlen (ł, ş, ж …), und die
  // Ergaenzungen unten kaemen nie zum Zug.
  adjustFontFallback: false,
});
/*
  Ergaenzungen fuer Polnisch, Tuerkisch (Latin Extended) und Russisch
  (Kyrillisch). Eigene Familien mit unicode-range: Der Browser nimmt sie nur
  fuer Zeichen, die Manrope-latin nicht hat. Chinesisch zeichnet die
  Systemschrift -- eine CJK-Schrift waere viele Megabyte gross.
  next/font verlangt Literale, deshalb stehen die Bereiche ausgeschrieben.
*/
const sansExt = localFont({
  src: [{ path: '../fonts/manrope-latin-ext-wght-normal.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-sans-ext', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }],
});
const sansKyr = localFont({
  src: [{ path: '../fonts/manrope-cyrillic-wght-normal.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-sans-kyr', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' }],
});
const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono', display: 'swap', adjustFontFallback: false,
});
const monoExt = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-ext-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-latin-ext-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono-ext', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }],
});
const monoKyr = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-cyrillic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-cyrillic-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono-kyr', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' }],
});

export const metadata: Metadata = {
  title: 'YSKAR',
  description: 'Proof of work on your phone. Verifiable. — Proof of Work auf dem Telefon. Nachrechenbar.',
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#0A101C' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[sans, sansExt, sansKyr, mono, monoExt, monoKyr].map(f => f.variable).join(' ')}>
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
