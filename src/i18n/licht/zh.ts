import type licht from './de';

const zh: typeof licht = {
  deinLicht: '你的灯',
  deinPlatz: '你的位置',
  keinLicht: '还没有灯',
  seit: (min: number) => `挖矿中 · ${min} 分钟`,
  bereit: '就绪。',
  bereitPool: (pool: string, n: number) => `点击开始，你的手机就会加入矿池 ${pool}。你的灯将是岸边的第 ${n} 盏。`,
  bereitSolo: (n: number) => `点击开始，你的手机将独自挖矿。你的灯将是岸边的第 ${n} 盏。`,
  waehlen: '选一个矿池，你的灯就会亮起。',
  erwartung: (min: string, anteil: string, sym: string) => `你的矿池平均约每 ${min} 分钟找到一个区块。你的份额：约 ${anteil} ${sym}。`,
  erwartungOffen: '你的灯亮着。矿池接受的每个 share 都计入你在下一个矿池区块中的份额。',
  solo: '你的手机在独自挖矿。如果找到区块，全部奖励归你。这种情况很少见。',
  leistung: '算力',
  last: (p: number, w: number) => `负载 ${p}% · ${w} 个 Worker`,
  anpassen: '调整',
  ersterEtikett: '第一个 share 已被接受',
  ersterTitel: '你的手机现在已经在参与工作，而且可以验证。',
  ersterText: 'Share 是你交给矿池的工作证明。Share 越多，矿池找到区块时你的份额就越大。',
};

export default zh;
