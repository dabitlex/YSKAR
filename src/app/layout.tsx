import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import localFont from 'next/font/local';
import './globals.css';
import { THEMA_STARTSKRIPT } from '@/lib/thema';

/*
  Hanken Grotesk und Geist Mono: dieselben Schriften wie die neue Website
  ("Erstes Licht"). Die Dateien liegen im Repo (src/fonts, OFL-lizenziert):
  Der Build braucht kein Google, und im Telegram-WebView laedt nichts von
  fremden Servern.
  Hanken Grotesk deckt Latein, Polnisch und Tuerkisch ab, aber kein
  Kyrillisch. Russisch, Ukrainisch und Vietnamesisch stehen deshalb wie auf
  der Website ganz in Geist (globals.css, :lang); fuer die vietnamesischen
  Zeichen mit zwei Akzenten springen Manrope und IBM Plex Mono ein.
  Chinesisch zeichnet die Systemschrift.

  Mono ist kein Stilmittel: Hexadezimal, Adressen und Merkwoerter brauchen
  feste Zeichenbreite, sonst kann man sie nicht zuverlaessig abschreiben.
*/
const sans = localFont({
  src: [{ path: '../fonts/hanken-grotesk-latin.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-sans', display: 'swap', adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' }],
});
// Polnisch und Tuerkisch: wird nur geladen, wo ein Zeichen daraus vorkommt.
const sansExt = localFont({
  src: [{ path: '../fonts/hanken-grotesk-latin-ext.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-sans-ext', display: 'swap', adjustFontFallback: false, preload: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }],
});
// Kyrillisch (und alles, was Hanken Grotesk nicht hat).
const geist = localFont({
  src: [{ path: '../fonts/geist-variable.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-geist', display: 'swap', adjustFontFallback: false, preload: false,
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
  themeColor: '#040A1A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={[sans, sansExt, geist, sansVi, mono, monoVi].map(f => f.variable).join(' ')} data-thema="dunkel">
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
