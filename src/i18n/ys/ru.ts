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
};

export default ys;
