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
  mining: {
    leistung: '手机算力',
    laufzeit: '运行时间',
    minuten: (n: number) => `${n} 分钟`,
    jeBlock: '每个矿池区块',
    soloUnter: '未加入矿池。可在挖矿详情中更改。',
    details: '挖矿详情',
    detailsUnter: 'Share、活动、模式、Worker',
    mehrTitel: '更多算力',
    mehrEinstieg: 'Mini App 是你了解 YSKAR 的入口。',
    mehrText: '真正挖矿请在电脑上使用 Node Core（CPU 和 GPU：NVIDIA、AMD、Intel），或在矿机上使用 HiveOS。',
    mehrLink: '在 yskar.app 下载',
    wegZumBlock: '通往区块',
    besterShare: (p: string) => `你本次会话的最佳 Share 达到区块目标的 ${p}。`,
    blockziel: (d: string) => `区块目标 = difficulty ${d}。高于目标的 Share 就是一个区块。`,
    letzteShares: '最近的 Share',
    angenommen: (n: string) => `已接受 ${n} 个`,
    abgelehnt: 'Share 未被接受',
    einstellungen: '设置',
    benchmark: '性能测试',
  },
  netz: {
    naechster: '下一个',
    laeuft: (n: number) => `已 ${n} 分钟`,
    ketteAria: '链上最新区块',
  },
};

export default ys;
