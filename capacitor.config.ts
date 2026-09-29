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
const APP_URL = (process.env.YSKAR_APP_URL ?? 'https://yskar.vercel.app').replace(/\/+$/, '');

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
    allowMixedContent: false,
    backgroundColor: '#F4F7FB',
    // Der Tresor liegt im WebView-Speicher -- ohne Sicherung im Backup,
    // sonst wandert er mit dem Google-Konto auf ein anderes Geraet.
    includePlugins: undefined,
  },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    CapacitorHttp: { enabled: false },
  },
};

export default config;
