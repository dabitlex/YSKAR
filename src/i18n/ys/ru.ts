import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Статус',
    erklaerung: 'Три полосы знака YSKAR с первого взгляда показывают состояние приложения.',
    band: { wallet: 'Кошелёк', netz: 'Сеть', mining: 'Майнинг' },
    wallet: { gesichert: 'Слова восстановления сохранены', offen: 'Слова восстановления ещё не сохранены' },
    netz: { verbunden: 'Подключено к сети', getrennt: 'Подключение к сети…' },
    mining: { an: 'Майнинг идёт', aus: 'Майнинг остановлен' },
  },
  mining: {
    leistung: 'Мощность телефона',
    laufzeit: 'Время работы',
    minuten: (n: number) => `${n} мин`,
    jeBlock: 'за блок пула',
    soloUnter: 'Без пула. Изменить можно в деталях майнинга.',
    details: 'Детали майнинга',
    detailsUnter: 'Шары, активность, режим, воркеры',
    mehrTitel: 'Больше мощности',
    mehrEinstieg: 'Mini App — это вход, чтобы познакомиться с YSKAR.',
    mehrText: 'Для настоящего майнинга используйте Node Core на ПК с CPU и GPU (NVIDIA, AMD, Intel) или HiveOS на ригах.',
    mehrLink: 'Загрузки на yskar.app',
    wegZumBlock: 'Путь к блоку',
    besterShare: (p: string) => `Ваш лучший шар за сессию достигает ${p} цели блока.`,
    blockziel: (d: string) => `Цель блока = difficulty ${d}. Шар выше цели — это блок.`,
    letzteShares: 'Последние шары',
    angenommen: (n: string) => `${n} принято`,
    abgelehnt: 'Шар не принят',
    einstellungen: 'Настройки',
    benchmark: 'Бенчмарк',
  },
};

export default ys;
