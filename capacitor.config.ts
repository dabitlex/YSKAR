import type { CapacitorConfig } from '@capacitor/cli';

/**
 * YSKAR Wallet -- die native Huelle um die Mini App.
 *
 * Die App laedt die Weboberflaeche von Vercel (server.url), nicht aus dem
 * Paket. Damit ist jede Aenderung an der Oberflaeche sofort in der App --
 * eine neue APK braucht es nur, wenn sich die Huelle selbst aendert
 * (Plugins, Rechte, Mining-Dienst). Ohne Netz zeigt Android die Seite aus
 * native/www (errorPath).
 *
 * YSKAR_APP_URL erlaubt einen anderen Server, z.B. eine Vorschau-Adresse
 * fuer einen Testbau. Vorgabe ist der Betrieb.
 */
// Leer zaehlt wie nicht gesetzt: Der Workflow reicht das Eingabefeld auch
// dann durch, wenn niemand etwas eingetragen hat -- und eine leere Adresse
// liess die App beim Start abstuerzen ("Provided server url is invalid").
const APP_URL = (process.env.YSKAR_APP_URL?.trim() || 'https://yskar.vercel.app').replace(/\/+$/, '');
if (!/^https?:\/\//.test(APP_URL)) throw new Error(`YSKAR_APP_URL ohne Protokoll: ${APP_URL}`);

const config: CapacitorConfig = {
  appId: 'net.yskar.wallet',
  appName: 'YSKAR Wallet',
  webDir: 'native/www',
  server: {
    url: APP_URL,
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    /*
      Kennung fuer natives Mining (src/lib/native/nativMining.ts). Nur diese
      APK hat den NativMiner im Dienst; die Oberflaeche erkennt ihn daran
      ohne Warten. Telegram, Browser und aeltere APKs haben die Kennung
      nicht und minen weiter im WebView.
    */
    appendUserAgent: 'YSKAR-NativMining/1',
    allowMixedContent: false,
    backgroundColor: '#F4F7FB',
    // Der Tresor liegt im WebView-Speicher -- ohne Sicherung im Backup,
    // sonst wandert er mit dem Google-Konto auf ein anderes Geraet.
    includePlugins: undefined,
  },
  plugins: {
    // Android 15+ zeichnet Apps bis unter Statusleiste und Gestenbalken.
    // Capacitor traegt deren Hoehe als --safe-area-inset-* ins <html> ein
    // (insetsHandling "css", die Vorgabe); die Oberflaeche nutzt das in
    // globals.css. "native" hatte das Eintragen abgeschaltet -- deshalb
    // bleibt es hier bei der Vorgabe. Die App ist hell, also helle Leiste
    // mit dunklen Symbolen, unabhaengig vom Systemthema.
    SystemBars: { style: 'LIGHT' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    CapacitorHttp: { enabled: false },
  },
};

export default config;
