import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/*
  IBM Plex: fuer Ingenieursdokumentation entworfen, und genau so soll sich
  die App lesen. Ueber next/font selbst gehostet -- ein Aufruf an Google
  waere im Telegram-WebView zusaetzliche Latenz vor dem ersten Bild.

  Mono ist hier kein Stilmittel: Hexadezimal, Adressen und Merkwoerter
  brauchen feste Zeichenbreite, sonst kann man sie nicht spaltenweise lesen
  und nicht zuverlaessig abschreiben.
*/
const sans = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600'],
  variable: '--font-plex-sans', display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'],
  variable: '--font-plex-mono', display: 'swap',
});

export const metadata: Metadata = {
  title: 'YSKAR',
  description: 'Proof of Work auf dem Telefon. Nachrechenbar.',
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  viewportFit: 'cover', themeColor: '#0C0F14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
