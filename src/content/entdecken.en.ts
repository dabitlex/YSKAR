/**
 * "Discover" content -- English.
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

export default function inhalteEn(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'What is YSKAR?',
    teaser: 'Its own PoW chain. Not a token on someone else’s blockchain.',
    lesezeit: '2 min',
    einleitung: 'YSKAR is an independent proof-of-work cryptocurrency with its own ' +
      'chain, its own consensus and its own miner. There is no smart contract on ' +
      'another blockchain called “YSKAR” — the chain itself is the product.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Network', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '2026-09-09' },
        { label: 'Hash function', wert: 'SHA-256d' },
        { label: 'Block time', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'The genesis block carries an inscription, and it sets the ' +
        'standard for everything that follows: “proof, not promise”. No value is ' +
        'simulated. Your device computes real hashes, every node re-verifies every ' +
        'share itself, and your balance can be rebuilt from the blocks alone.' },
      { art: 'absatz', text: 'You use it through the Telegram Mini App or the Android app ' +
        '“YSKAR Wallet”. Ownership, however, is tied to keys, not to Telegram: whoever ' +
        'has the twelve words has the balance — with or without a Telegram account.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR is a project, not a means of payment. ' +
        'Several full nodes verify the chain independently of each other; every block ' +
        'can be checked in the explorer.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Mining on your phone',
    teaser: 'Shares, difficulty, blocks — how your device takes part.',
    lesezeit: '3 min',
    einleitung: 'Your phone computes SHA-256d hashes on a job from the network. ' +
      'It is the same procedure as Bitcoin — only the difficulty is chosen so ' +
      'that a phone has a real chance.',
    bausteine: [
      { art: 'schritte', titel: 'How a block comes to be', punkte: [
        'The node hands out a job: the header of the next block, valid for 90 seconds.',
        'Your workers try nonces. Every computation is a real hash.',
        'A hash below the share target is a share. The node re-computes it — ' +
          'without work there is no valid share.',
        'If the hash is even below the block difficulty, a block is found. ' +
          `The reward of ${REWARD} YSR goes to your address.`,
      ] },
      { art: 'absatz', text: 'The duty cycle (25–100 %) controls how hard your device ' +
        'is loaded. The number of workers follows the cores — calibration finds the ' +
        'best setting for your phone.' },
      { art: 'absatz', text: 'In Telegram the screen stays on while mining — if it locks, ' +
        'the platform suspends the worker. The Android app keeps computing with the ' +
        'screen locked, visible in the notification showing the hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Solo and pool are equals. The first pool is ' +
        'live: the block itself pays out everyone involved — the operator never ' +
        'holds anyone else’s money.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} per block, halving every ${z(EPOCH_BLOCKS)} blocks.`,
    lesezeit: '3 min',
    einleitung: 'There is no presale, no team allocation and no airdrop. Every YSR ' +
      'comes into existence as a block reward — for whoever found the block.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Max. supply', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward today', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `every ${z(EPOCH_BLOCKS)} blocks` },
        { label: 'Block time', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} minutes` },
      ] },
      { art: 'balken', titel: 'Emission over time', werte: [
        { label: `Epoch 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoch 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoch 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `An epoch is ${z(EPOCH_BLOCKS)} blocks, roughly ${EPOCHE_TAGE} days. ` +
        'After that the reward halves — like Bitcoin, only faster.' },
      { art: 'absatz', text: `A season is ${z(SEASON_BLOCKS)} blocks, two seasons make an ` +
        'epoch. The reward is halved by a plain bit shift, no rounding — so the total ' +
        `supply lands just below ${ysr(MAX_SUPPLY)}, exactly like Bitcoin.` },
      { art: 'kennzahlen', werte: [
        { label: 'Minimum fee', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Slots per block', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'The numbers on this page come straight from ' +
        'the chain’s consensus parameters — not from a whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Wallet & security',
    teaser: 'Twelve words, a PIN, signatures on the device.',
    lesezeit: '2 min',
    einleitung: 'Your wallet is twelve words. Whoever has them has your balance — ' +
      'and whoever loses them loses it. Nobody can reset them: not us, not ' +
      'Telegram, nobody.',
    bausteine: [
      { art: 'schritte', titel: 'What happens on the device', punkte: [
        'The words are stored on the phone, encrypted with your PIN.',
        'A payment is built and signed entirely on the device.',
        'The server only sees finished bytes — it cannot change the amount or the ' +
          'recipient without breaking the signature.',
      ] },
      { art: 'absatz', text: 'The PIN protects against someone picking up your unlocked ' +
        'phone. Against a determined attacker with access to the device, the only ' +
        'protection is not keeping large amounts on it.' },
      { art: 'absatz', text: 'The QR code under “Receive” is generated on the device. ' +
        'When sending, you can scan another user’s code with the camera — the ' +
        'address is validated before it is used.' },
      { art: 'hinweis', tone: 'risk', text: 'A sent payment cannot be recalled. ' +
        'Verify the address in full, not just the beginning and the end.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full node & pool',
    teaser: 'Several nodes, first pool live — how the network fits together.',
    lesezeit: '3 min',
    einleitung: 'A full node fetches the chain, verifies every block itself and builds ' +
      'its own blocks. Several nodes already run at the same time and sync over ' +
      'P2P — the chain no longer depends on a single server.',
    bausteine: [
      { art: 'schritte', titel: 'What a node does', punkte: [
        'Headers first: it fetches the chain from other nodes and verifies chain and ' +
          'work locally before adopting a block.',
        'It accepts transactions into its mempool and hands out jobs to miners.',
        'When a miner finds a block, the node submits it and relays it to its peers.',
        'Everything has limits: message sizes, deadlines and slots per peer are fixed — ' +
          'a single peer cannot overload a node.',
      ] },
      { art: 'absatz', text: 'The node runs on any machine with Node 22; its storage ' +
        'is a single SQLite file. Anyone can run their own and verify the chain ' +
        'without having to trust anybody.' },
      { art: 'schritte', titel: 'Pool mining, how it works', punkte: [
        'The pool never holds anyone else’s money. The split becomes the coinbase of ' +
          'the block (consensus version 2: coinbase with multiple recipients).',
        'PPLNS: the last N units of work are paid — across block finds. ' +
          'Pool hopping does not pay off.',
        'The split is in the block for everyone to verify.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'The first pool is live. In the “Mining” tab ' +
        'choose “Pool” and enter its address — the pool reports hash power, ' +
        'miner count and fee before you start.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Micropayments, Node Core for every system, apps with a Lightning wallet.',
    lesezeit: '2 min',
    einleitung: 'No dates that will not hold. Instead, states anyone can check in the ' +
      'explorer and in the source code.',
    bausteine: [
      { art: 'schritte', titel: 'Done', punkte: [
        'Chain, wallet, transactions in the block, miner on the phone.',
        'Fee market: recommendation from the actual queue.',
        'Consensus version 2: coinbase with multiple recipients.',
        'Pool mining with PPLNS payout straight from the block — the first pool is live.',
        'P2P between full nodes; several nodes run at the same time.',
        'The chain lives on the full nodes; the server is only a mirror for the app.',
        'Android app “YSKAR Wallet”: push for incoming payments, biometrics, background ' +
          'mining, in-app update notice — as an APK on GitHub.',
      ] },
      { art: 'schritte', titel: 'Next', punkte: [
        'Micropayments: transfer small amounts quickly and cheaply.',
        'YSKAR Node Core: release with integrated wallet and mining for every system.',
        'iOS app; Lightning wallet in both apps.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'The source is open. Every step here ' +
        'corresponds to a document in the repository.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'Is YSKAR an airdrop or tap-to-earn?',
    antwort: 'No. There is nothing to tap and nothing is handed out. YSR only ' +
      'come into existence as block rewards for real computing work that the ' +
      'node has re-verified.' },
  { frage: 'How much do I earn with my phone?',
    antwort: 'That depends on your hashrate relative to the whole network. ' +
      `On average, every ${Number(TARGET_BLOCK_TIME) / 60} minutes one device in the ` +
      `network finds a block worth ${REWARD} YSR. The “Network” tab shows the ` +
      'network hashrate — your share of it is your expected chance per block.' },
  { frage: 'What happens if I lose my twelve words?',
    antwort: 'The balance is lost. There is no “forgot password”: neither we nor ' +
      'Telegram can restore the words. Write them on paper — not as a screenshot.' },
  { frage: 'Who runs the chain?',
    antwort: 'Nobody alone. Several full nodes run at the same time, sync over P2P ' +
      'and re-verify every block themselves. The app reads through a mirror — ' +
      'anyone can run their own node and does not need even that.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-09-30',
    titel: 'Android app “YSKAR Wallet”',
    text: 'Push notifications for incoming payments, unlock and send with your fingerprint, ' +
      'mining with the screen locked. As an APK on GitHub — and the app is now bilingual.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'New design and QR scanning',
    text: 'The app now shows what YSKAR is — and addresses can be scanned with the ' +
      'camera when sending.',
  },
  {
    datum: '2026-09-09',
    titel: 'The chain has launched',
    text: 'Genesis block mined, inscription “proof, not promise”. Mining is ' +
      'open to everyone.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
