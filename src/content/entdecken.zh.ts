/**
 * "Discover" content -- Simplified Chinese.
 *
 * Plain data, no React. Numbers come from src/lib/core/params.ts so an
 * article never claims anything the chain itself does not. Number
 * formatting is passed in (language).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhalteZh(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'YSKAR 是什么？',
    teaser: '一条独立的 PoW 区块链，而不是别人链上的代币。',
    lesezeit: '2 分钟',
    einleitung: 'YSKAR 是一种独立的工作量证明加密货币，拥有自己的区块链、' +
      '自己的共识机制和自己的挖矿程序。其他区块链上并没有一个叫“YSKAR”的' +
      '智能合约——区块链本身就是产品。',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: '网络', wert: 'yskar-main-1' },
        { label: '创世区块', wert: '2026-09-09' },
        { label: '哈希函数', wert: 'SHA-256d' },
        { label: '出块时间', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} 分钟` },
      ] },
      { art: 'absatz', text: '创世区块中刻有一句铭文，它为之后的一切定下了标准：' +
        '“proof, not promise”。没有任何数值是模拟出来的。你的设备计算真实的哈希，' +
        '每个节点都会亲自重新验证每一个 Share，你的余额仅凭区块就能完整重建。' },
      { art: 'absatz', text: '你可以通过 Telegram 小程序或 Android 应用“YSKAR Wallet”' +
        '来使用它。但所有权绑定的是私钥，而不是 Telegram：谁拥有 12 个助记词，' +
        '谁就拥有余额——无论有没有 Telegram 账号。' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR 是一个项目，而不是支付手段。' +
        '多个全节点相互独立地验证区块链；每个区块都可以在区块浏览器中查看核实。' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: '用手机挖矿',
    teaser: 'Share、难度、区块——你的设备如何参与其中。',
    lesezeit: '3 分钟',
    einleitung: '你的手机根据网络下发的任务计算 SHA-256d 哈希。' +
      '这与比特币的流程完全相同——只是难度经过设定，让手机也有真正的机会。',
    bausteine: [
      { art: 'schritte', titel: '一个区块是如何产生的', punkte: [
        '节点下发一个任务：下一个区块的区块头，有效期 90 秒。',
        '你的 Worker 不断尝试 Nonce。每一次计算都是真实的哈希。',
        '低于 Share 目标值的哈希就是一个 Share。节点会重新计算它——' +
          '没有付出工作，就不会有有效的 Share。',
        '如果哈希甚至低于区块难度，就找到了一个区块。' +
          `${REWARD} YSR 的奖励将发放到你的地址。`,
      ] },
      { art: 'absatz', text: '占用率（25–100 %）决定你的设备负载有多高。' +
        'Worker 数量取决于 CPU 核心数——校准功能会为你的手机找到最佳设置。' },
      { art: 'absatz', text: '在 Telegram 中，挖矿期间屏幕保持常亮——一旦锁屏，' +
        '平台就会暂停 Worker。Android 应用在锁屏后仍会继续计算，' +
        '通知栏中会显示当前算力。' },
      { art: 'hinweis', tone: 'work', text: 'Solo 和矿池地位平等。第一个矿池已经上线：' +
        '区块本身直接向所有参与者支付——运营者从不经手他人的资金。' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: '代币经济',
    teaser: `${ysr(MAX_SUPPLY)} YSR，每个区块 ${REWARD} 个，每 ${z(EPOCH_BLOCKS)} 个区块减半。`,
    lesezeit: '3 分钟',
    einleitung: '没有预售，没有团队份额，也没有空投。每一枚 YSR ' +
      '都是作为区块奖励诞生的——归找到该区块的人所有。',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: '最大供应量', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: '当前奖励', wert: `${REWARD} YSR` },
        { label: '减半', wert: `每 ${z(EPOCH_BLOCKS)} 个区块` },
        { label: '出块时间', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} 分钟` },
      ] },
      { art: 'balken', titel: '随时间的发行量', werte: [
        { label: `第 1 纪元 · ${REWARD}`, anteil: 1 },
        { label: `第 2 纪元 · ${REWARD / 2}`, anteil: .5 },
        { label: `第 3 纪元 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `一个纪元为 ${z(EPOCH_BLOCKS)} 个区块，约 ${EPOCHE_TAGE} 天。` +
        '之后奖励减半——和比特币一样，只是更快。' },
      { art: 'absatz', text: `一个赛季为 ${z(SEASON_BLOCKS)} 个区块，两个赛季构成一个` +
        '纪元。奖励通过简单的位移运算减半，不做四舍五入——因此总供应量' +
        `最终会略低于 ${ysr(MAX_SUPPLY)}，与比特币完全一样。` },
      { art: 'kennzahlen', werte: [
        { label: '最低手续费', wert: `${ysr(MIN_FEE)} YSR` },
        { label: '每个区块的交易位', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: '本页的数字直接来自区块链的共识参数' +
        '——而不是来自白皮书。' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: '钱包与安全',
    teaser: '12 个助记词、一个 PIN、在设备上完成签名。',
    lesezeit: '2 分钟',
    einleitung: '你的钱包就是 12 个助记词。谁拥有它们，谁就拥有你的余额——' +
      '丢失它们，就会失去余额。没有人能重置它们：我们不能，Telegram 不能，' +
      '任何人都不能。',
    bausteine: [
      { art: 'schritte', titel: '设备上发生了什么', punkte: [
        '助记词保存在手机上，并用你的 PIN 加密。',
        '一笔付款完全在设备上构建和签名。',
        '服务器只能看到已完成的字节——它无法在不破坏签名的情况下' +
          '修改金额或收款方。',
      ] },
      { art: 'absatz', text: 'PIN 可以防止他人拿起你已解锁的手机直接使用。' +
        '但面对能接触设备的蓄意攻击者，唯一的保护就是' +
        '不要在设备上存放大额资产。' },
      { art: 'absatz', text: '“接收”页面上的二维码在设备上生成。' +
        '发送时，你可以用相机扫描其他用户的二维码——' +
        '地址在使用前会先经过校验。' },
      { art: 'hinweis', tone: 'risk', text: '已发送的付款无法撤回。' +
        '请完整核对地址，而不只是开头和结尾。' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: '全节点与矿池',
    teaser: '多个节点，第一个矿池已上线——网络是如何组成的。',
    lesezeit: '3 分钟',
    einleitung: '全节点会获取区块链，亲自验证每一个区块，并构建自己的区块。' +
      '目前已有多个节点同时运行并通过 P2P 同步——' +
      '区块链不再依赖于单一服务器。',
    bausteine: [
      { art: 'schritte', titel: '节点做什么', punkte: [
        '区块头优先：它从其他节点获取区块链，在采纳区块之前' +
          '先在本地验证链和工作量。',
        '它将交易接收进自己的交易池（Mempool），并向矿工下发任务。',
        '当矿工找到区块时，节点会提交该区块并转发给它的对等节点。',
        '一切都有上限：消息大小、超时时间和每个对等节点的名额都是固定的——' +
          '单个对等节点无法让节点过载。',
      ] },
      { art: 'absatz', text: '节点可以在任何装有 Node 22 的机器上运行；' +
        '它的存储只是一个 SQLite 文件。任何人都可以运行自己的节点并验证区块链，' +
        '而无需信任任何人。' },
      { art: 'schritte', titel: '矿池挖矿的原理', punkte: [
        '矿池从不经手他人的资金。分配方案直接成为区块的 Coinbase' +
          '（共识版本 2：支持多个收款方的 Coinbase）。',
        'PPLNS：按最近 N 个单位的工作量支付——跨越多次出块。' +
          '跳池（Pool Hopping）无利可图。',
        '分配方案写在区块中，任何人都可以验证。',
      ] },
      { art: 'hinweis', tone: 'work', text: '第一个矿池已经上线。在“挖矿”标签页中' +
        '选择“矿池”并输入其地址——在你开始之前，矿池会显示算力、' +
        '矿工数量和手续费。' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: '路线图',
    teaser: '微支付、适用于所有系统的 Node Core、带闪电网络钱包的应用。',
    lesezeit: '2 分钟',
    einleitung: '不给出无法兑现的日期。取而代之的是任何人都能在' +
      '区块浏览器和源代码中核实的进展状态。',
    bausteine: [
      { art: 'schritte', titel: '已完成', punkte: [
        '区块链、钱包、区块中的交易、手机上的挖矿程序。',
        '手续费市场：根据实际排队情况给出建议。',
        '共识版本 2：支持多个收款方的 Coinbase。',
        '矿池挖矿，PPLNS 收益直接从区块中支付——第一个矿池已经上线。',
        '全节点之间的 P2P；多个节点同时运行。',
        '区块链存在于全节点上；服务器只是供应用使用的镜像。',
        'Android 应用“YSKAR Wallet”：收款推送、生物识别、后台挖矿、' +
          '应用内更新提示——以 APK 形式发布在 GitHub 上。',
      ] },
      { art: 'schritte', titel: '下一步', punkte: [
        '微支付：快速、低成本地转账小额资金。',
        'YSKAR Node Core：集成钱包和挖矿功能、适用于所有系统的发行版。',
        'iOS 应用；两款应用均支持闪电网络钱包。',
      ] },
      { art: 'hinweis', tone: 'work', text: '源代码是公开的。这里的每一步' +
        '都对应代码仓库中的一份文档。' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'YSKAR 是空投或点击赚币（Tap-to-Earn）吗？',
    antwort: '不是。这里没有什么可点击的，也不会白送任何东西。YSR 只会' +
      '作为真实计算工作的区块奖励而产生，而这些工作都经过节点重新验证。' },
  { frage: '用手机能赚多少？',
    antwort: '这取决于你的算力在全网算力中所占的比例。' +
      `平均每 ${Number(TARGET_BLOCK_TIME) / 60} 分钟，网络中会有一台设备` +
      `找到一个价值 ${REWARD} YSR 的区块。“网络”标签页会显示` +
      '全网算力——你所占的份额就是你每个区块的预期机会。' },
  { frage: '如果我丢失了 12 个助记词怎么办？',
    antwort: '余额将会丢失。这里没有“忘记密码”：无论是我们还是' +
      'Telegram 都无法恢复助记词。请把它们写在纸上——不要截图。' },
  { frage: '谁在运行这条区块链？',
    antwort: '没有任何一方能单独运行。多个全节点同时运行，通过 P2P 同步，' +
      '并亲自重新验证每一个区块。应用通过一个镜像读取数据——' +
      '任何人都可以运行自己的节点，那样连镜像都不需要。' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-09-30',
    titel: 'Android 应用“YSKAR Wallet”',
    text: '收款推送通知、用指纹解锁和发送、锁屏挖矿。' +
      '以 APK 形式发布在 GitHub 上——而且应用现在支持多种语言。',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: '全新设计与扫码功能',
    text: '应用现在会介绍 YSKAR 是什么——发送时还可以用相机' +
      '扫描地址。',
  },
  {
    datum: '2026-09-09',
    titel: '区块链正式启动',
    text: '创世区块已挖出，铭文为“proof, not promise”。挖矿' +
      '向所有人开放。',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
