import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Стан',
    erklaerung: 'Три смуги знака YSKAR з першого погляду показують стан застосунку.',
    band: { wallet: 'Гаманець', netz: 'Мережа', mining: 'Майнінг' },
    wallet: { gesichert: 'Слова відновлення збережено', offen: 'Слова відновлення ще не збережено' },
    netz: { verbunden: 'Підключено до мережі', getrennt: 'Підключення до мережі…' },
    mining: { an: 'Майнінг триває', aus: 'Майнінг зупинено' },
  },
};

export default ys;
