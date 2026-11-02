import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Durum',
    erklaerung: 'YSKAR işaretinin üç bandı uygulamanın durumunu bir bakışta gösterir.',
    band: { wallet: 'Cüzdan', netz: 'Ağ', mining: 'Madencilik' },
    wallet: { gesichert: 'Kurtarma kelimeleri yedeklendi', offen: 'Kurtarma kelimeleri henüz yedeklenmedi' },
    netz: { verbunden: 'Ağa bağlı', getrennt: 'Ağa bağlanılıyor…' },
    mining: { an: 'Madencilik çalışıyor', aus: 'Madencilik durduruldu' },
  },
  mining: {
    leistung: 'Telefon gücü',
    laufzeit: 'Çalışma süresi',
    minuten: (n: number) => `${n} dk`,
    jeBlock: 'havuz bloğu başına',
    soloUnter: 'Havuz yok. Madencilik ayrıntılarından değiştir.',
    details: 'Madencilik ayrıntıları',
    detailsUnter: 'Share, etkinlik, mod, worker',
    mehrTitel: 'Daha fazla güç',
    mehrEinstieg: 'Mini App, YSKAR’ı tanımak için giriş kapın.',
    mehrText: 'Gerçek madencilik için CPU ve GPU (NVIDIA, AMD, Intel) ile bir PC’de Node Core ya da rig’lerde HiveOS kullan.',
    mehrLink: 'İndirmeler yskar.app’te',
    wegZumBlock: 'Bloğa giden yol',
    besterShare: (p: string) => `Bu oturumdaki en iyi share’in blok hedefinin ${p} kadarına ulaşıyor.`,
    blockziel: (d: string) => `Blok hedefi = difficulty ${d}. Hedefin üstündeki bir share bir bloktur.`,
    letzteShares: 'Son share’ler',
    angenommen: (n: string) => `${n} kabul edildi`,
    abgelehnt: 'Share kabul edilmedi',
    einstellungen: 'Ayarlar',
    benchmark: 'Kıyaslama testi',
  },
};

export default ys;
