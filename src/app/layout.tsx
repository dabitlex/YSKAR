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
});
const mono = localFont({
  src: [
    { path: '../fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono', display: 'swap',
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
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
