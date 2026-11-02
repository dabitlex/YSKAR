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
};

export default ys;
