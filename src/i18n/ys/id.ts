import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Status',
    erklaerung: 'Tiga pita pada tanda YSKAR menunjukkan keadaan aplikasimu dalam sekali lihat.',
    band: { wallet: 'Wallet', netz: 'Jaringan', mining: 'Mining' },
    wallet: { gesichert: 'Kata pemulihan sudah dicadangkan', offen: 'Kata pemulihan belum dicadangkan' },
    netz: { verbunden: 'Terhubung ke jaringan', getrennt: 'Menghubungkan ke jaringan…' },
    mining: { an: 'Mining sedang berjalan', aus: 'Mining dihentikan' },
  },
  mining: {
    leistung: 'Daya ponsel',
    laufzeit: 'Durasi',
    minuten: (n: number) => `${n} mnt`,
    jeBlock: 'per blok pool',
    soloUnter: 'Tanpa pool. Ubah di detail mining.',
    details: 'Detail mining',
    detailsUnter: 'Share, aktivitas, mode, worker',
    mehrTitel: 'Daya lebih besar',
    mehrEinstieg: 'Mini App adalah pintu masukmu untuk mengenal YSKAR.',
    mehrText: 'Untuk mining sungguhan, gunakan Node Core di PC dengan CPU dan GPU (NVIDIA, AMD, Intel), atau HiveOS di rig.',
    mehrLink: 'Unduhan di yskar.app',
    wegZumBlock: 'Jalan menuju blok',
    besterShare: (p: string) => `Share terbaikmu di sesi ini mencapai ${p} dari target blok.`,
    blockziel: (d: string) => `Target blok = difficulty ${d}. Share di atas target adalah blok.`,
    letzteShares: 'Share terbaru',
    angenommen: (n: string) => `${n} diterima`,
    abgelehnt: 'Share tidak diterima',
    einstellungen: 'Pengaturan',
    benchmark: 'Benchmark',
  },
  netz: {
    naechster: 'Berikutnya',
    laeuft: (n: number) => `sejak ${n} mnt`,
    ketteAria: 'Blok terbaru di rantai',
  },
};

export default ys;
