import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: '状态',
    erklaerung: 'YSKAR 标志的三条色带让你一眼看清应用的状态。',
    band: { wallet: '钱包', netz: '网络', mining: '挖矿' },
    wallet: { gesichert: '恢复词已备份', offen: '恢复词尚未备份' },
    netz: { verbunden: '已连接网络', getrennt: '正在连接网络…' },
    mining: { an: '挖矿进行中', aus: '挖矿已停止' },
  },
};

export default ys;
