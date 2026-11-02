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
  mining: {
    leistung: 'Потужність телефона',
    laufzeit: 'Час роботи',
    minuten: (n: number) => `${n} хв`,
    jeBlock: 'за блок пулу',
    soloUnter: 'Без пулу. Змінити можна в деталях майнінгу.',
    details: 'Деталі майнінгу',
    detailsUnter: 'Шари, активність, режим, воркери',
    mehrTitel: 'Більше потужності',
    mehrEinstieg: 'Mini App — це вхід, щоб познайомитися з YSKAR.',
    mehrText: 'Для справжнього майнінгу використовуйте Node Core на ПК з CPU і GPU (NVIDIA, AMD, Intel) або HiveOS на ригах.',
    mehrLink: 'Завантаження на yskar.app',
    wegZumBlock: 'Шлях до блоку',
    besterShare: (p: string) => `Ваш найкращий шар за сесію досягає ${p} цілі блоку.`,
    blockziel: (d: string) => `Ціль блоку = difficulty ${d}. Шар вище цілі — це блок.`,
    letzteShares: 'Останні шари',
    angenommen: (n: string) => `${n} прийнято`,
    abgelehnt: 'Шар не прийнято',
    einstellungen: 'Налаштування',
    benchmark: 'Бенчмарк',
  },
};

export default ys;
