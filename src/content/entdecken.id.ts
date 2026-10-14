/**
 * "Discover" content -- Indonesian (Bahasa Indonesia).
 *
 * Plain data, no React. Numbers come from src/lib/core/params.ts so an
 * article never claims anything the chain itself does not. Number
 * formatting is passed in (language).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import { MAX_COINBASE_OUTPUTS } from '@/lib/core/params';
import { MAX_FEE_BPS } from '@/lib/pool/settlement';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhalteId(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'Apa itu YSKAR?',
    teaser: 'Chain PoW sendiri. Bukan token di blockchain milik pihak lain.',
    lesezeit: '2 mnt',
    einleitung: 'YSKAR adalah mata uang kripto proof-of-work yang independen, dengan ' +
      'chain sendiri, konsensus sendiri, dan miner sendiri. Tidak ada smart contract di ' +
      'blockchain lain yang bernama “YSKAR” — chain itu sendiri adalah produknya.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Jaringan', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '09/09/2026' },
        { label: 'Fungsi hash', wert: 'SHA-256d' },
        { label: 'Waktu blok', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} mnt` },
      ] },
      { art: 'absatz', text: 'Blok genesis membawa sebuah inskripsi, dan inskripsi itu menjadi ' +
        'standar untuk semua yang menyusul: “proof, not promise”. Tidak ada nilai yang ' +
        'disimulasikan. Perangkatmu menghitung hash sungguhan, setiap node memverifikasi ulang ' +
        'setiap share sendiri, dan saldomu bisa direkonstruksi hanya dari blok-blok yang ada.' },
      { art: 'absatz', text: 'Kamu menggunakannya lewat Telegram Mini App atau aplikasi Android ' +
        '“YSKAR Wallet”. Namun kepemilikan terikat pada kunci, bukan pada Telegram: siapa pun yang ' +
        'memegang dua belas kata itu menguasai saldonya — dengan atau tanpa akun Telegram.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR adalah proyek, bukan alat pembayaran. ' +
        'Beberapa full node memverifikasi chain secara independen satu sama lain; setiap blok ' +
        'bisa dicek di explorer.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Mining di ponselmu',
    teaser: 'Share, difficulty, blok — begini cara perangkatmu ikut serta.',
    lesezeit: '3 mnt',
    einleitung: 'Ponselmu menghitung hash SHA-256d untuk sebuah job dari jaringan. ' +
      'Prosedurnya sama dengan Bitcoin — hanya difficulty-nya dipilih sedemikian rupa ' +
      'sehingga ponsel punya peluang yang nyata.',
    bausteine: [
      { art: 'schritte', titel: 'Bagaimana sebuah blok tercipta', punkte: [
        'Node membagikan job: header dari blok berikutnya, berlaku selama 90 detik.',
        'Worker-mu mencoba nonce satu per satu. Setiap perhitungan adalah hash sungguhan.',
        'Hash di bawah target share adalah sebuah share. Node menghitungnya ulang — ' +
          'tanpa kerja, tidak ada share yang valid.',
        'Jika hash bahkan berada di bawah difficulty blok, sebuah blok ditemukan. ' +
          `Reward sebesar ${REWARD} YSR masuk ke alamatmu.`,
      ] },
      { art: 'absatz', text: 'Siklus kerja (25–100 %) mengatur seberapa berat beban ' +
        'perangkatmu. Jumlah worker mengikuti jumlah core — kalibrasi mencari ' +
        'pengaturan terbaik untuk ponselmu.' },
      { art: 'absatz', text: 'Di Telegram, layar tetap menyala selama mining — jika layar terkunci, ' +
        'platform menangguhkan worker. Aplikasi Android tetap menghitung saat ' +
        'layar terkunci, terlihat dari notifikasi yang menampilkan hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Pengguna baru menambang di pool; solo tetap tersedia ' +
        'di “Mining → Lanjutan”. Di pool, bloknya sendiri yang membayar semua peserta — ' +
        'operator tidak pernah memegang uang orang lain.' },
    ],
  },
  {
    slug: 'pool-oder-solo', icon: 'Wuerfel', farbe: 'work',
    titel: 'Pool atau solo?',
    teaser: 'Bagian kecil yang rutin, atau semua atau tidak sama sekali.',
    lesezeit: '2 mnt',
    einleitung: `Rata-rata setiap ${Number(TARGET_BLOCK_TIME) / 60} menit, satu penambang di ` +
      `jaringan menemukan blok senilai ${REWARD} YSR. Pertanyaannya, bagaimana kamu ingin dibayar untuk bagianmu.`,
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Pool', wert: 'bagian kecil, rutin' },
        { label: 'Solo', wert: 'satu blok penuh, jarang' },
      ] },
      { art: 'absatz', text: 'Di pool, banyak perangkat menambang bersama. Saat pool menemukan blok, ' +
        'bloknya sendiri yang membagi reward sesuai kerja terbaru (PPLNS). Bagianmu tergantung ' +
        'seberapa besar hashrate-mu menambah daya pool.' },
      { art: 'absatz', text: 'Secara solo, kamu mendapat seluruh blok — tapi hanya jika perangkatmu ' +
        'sendiri yang menemukannya. Satu ponsel sendirian punya peluang yang sangat kecil per blok ' +
        'melawan seluruh jaringan; bisa butuh waktu lama sampai itu terjadi.' },
      { art: 'schritte', titel: 'Yang perlu kamu tahu tentang pool', punkte: [
        `Operator menetapkan biaya antara 0 dan ${MAX_FEE_BPS / 100} %; aplikasi menampilkannya sebelum kamu mulai.`,
        `Satu pool hanya bisa membayar penambang dalam jumlah terbatas per blok (saat ini ${MAX_COINBASE_OUTPUTS - 1}). ` +
          'Jika penuh, kamu pilih pool lain.',
        'Setiap pembayaran terbuka untuk umum di blok dan di explorer.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Pengguna baru menambang di pool. Kamu bisa beralih ke solo di ' +
        '“Mining → Lanjutan”.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} per blok, halving setiap ${z(EPOCH_BLOCKS)} blok.`,
    lesezeit: '3 mnt',
    einleitung: 'Tidak ada presale, tidak ada alokasi tim, dan tidak ada airdrop. Setiap YSR ' +
      'tercipta sebagai reward blok — untuk siapa pun yang menemukan blok tersebut.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Suplai maks.', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward saat ini', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `setiap ${z(EPOCH_BLOCKS)} blok` },
        { label: 'Waktu blok', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} menit` },
      ] },
      { art: 'balken', titel: 'Emisi dari waktu ke waktu', werte: [
        { label: `Epoch 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoch 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoch 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Satu epoch adalah ${z(EPOCH_BLOCKS)} blok, kira-kira ${EPOCHE_TAGE} hari. ` +
        'Setelah itu reward turun setengah — seperti Bitcoin, hanya lebih cepat.' },
      { art: 'absatz', text: `Satu season adalah ${z(SEASON_BLOCKS)} blok, dua season membentuk satu ` +
        'epoch. Reward dibagi dua dengan bit shift biasa, tanpa pembulatan — sehingga total ' +
        `suplai berakhir sedikit di bawah ${ysr(MAX_SUPPLY)}, persis seperti Bitcoin.` },
      { art: 'kennzahlen', werte: [
        { label: 'Biaya minimum', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Slot per blok', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Angka-angka di halaman ini diambil langsung dari ' +
        'parameter konsensus chain — bukan dari whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Wallet & keamanan',
    teaser: 'Dua belas kata, PIN, tanda tangan di perangkat.',
    lesezeit: '2 mnt',
    einleitung: 'Wallet-mu adalah dua belas kata. Siapa pun yang memegangnya menguasai saldomu — ' +
      'dan jika kata-kata ini hilang, saldomu ikut hilang. Tidak ada yang bisa mengatur ulang ' +
      'kata-kata ini: bukan kami, bukan Telegram, tidak seorang pun.',
    bausteine: [
      { art: 'schritte', titel: 'Apa yang terjadi di perangkat', punkte: [
        'Kata-kata disimpan di ponsel, terenkripsi dengan PIN-mu.',
        'Pembayaran disusun dan ditandatangani sepenuhnya di perangkat.',
        'Server hanya melihat byte yang sudah jadi — server tidak bisa mengubah jumlah atau ' +
          'penerima tanpa merusak tanda tangannya.',
      ] },
      { art: 'absatz', text: 'PIN melindungimu dari orang yang mengambil ponselmu saat tidak ' +
        'terkunci. Terhadap penyerang yang serius dan punya akses ke perangkat, satu-satunya ' +
        'perlindungan adalah tidak menyimpan jumlah besar di sana.' },
      { art: 'absatz', text: 'Kode QR di “Terima” dibuat di perangkat. ' +
        'Saat mengirim, kamu bisa memindai kode pengguna lain dengan kamera — ' +
        'alamatnya divalidasi sebelum digunakan.' },
      { art: 'hinweis', tone: 'risk', text: 'Pembayaran yang sudah terkirim tidak bisa ditarik kembali. ' +
        'Periksa alamat secara lengkap, bukan hanya awal dan akhirnya.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full node & pool',
    teaser: 'Beberapa node, pool pertama sudah aktif — begini jaringan saling terhubung.',
    lesezeit: '3 mnt',
    einleitung: 'Full node mengambil chain, memverifikasi setiap blok sendiri, dan menyusun ' +
      'bloknya sendiri. Beberapa node sudah berjalan bersamaan dan saling sinkron lewat ' +
      'P2P — chain tidak lagi bergantung pada satu server.',
    bausteine: [
      { art: 'schritte', titel: 'Apa yang dilakukan node', punkte: [
        'Header dulu: node mengambil chain dari node lain dan memverifikasi chain serta ' +
          'kerja secara lokal sebelum menerima sebuah blok.',
        'Node menerima transaksi ke mempool-nya dan membagikan job ke penambang.',
        'Saat penambang menemukan blok, node mengirimkannya dan meneruskannya ke peer-nya.',
        'Semuanya punya batas: ukuran pesan, tenggat waktu, dan slot per peer sudah ditetapkan — ' +
          'satu peer saja tidak bisa membebani node secara berlebihan.',
      ] },
      { art: 'absatz', text: 'Node berjalan di mesin apa pun dengan Node 22; penyimpanannya ' +
        'berupa satu file SQLite. Siapa pun bisa menjalankan node sendiri dan memverifikasi chain ' +
        'tanpa harus memercayai siapa pun.' },
      { art: 'schritte', titel: 'Mining di pool, cara kerjanya', punkte: [
        'Pool tidak pernah memegang uang orang lain. Pembagiannya menjadi coinbase dari ' +
          'blok tersebut (konsensus versi 2: coinbase dengan banyak penerima).',
        'PPLNS: N unit kerja terakhir yang dibayar — lintas penemuan blok. ' +
          'Pool hopping tidak menguntungkan.',
        'Pembagiannya ada di dalam blok, bisa diverifikasi oleh siapa pun.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Di tab “Mining”, aplikasi memilih pool dengan ' +
        'slot kosong terbanyak; lewat “Ganti” kamu bisa memilih sendiri. Pool melaporkan daya hash, ' +
        'jumlah penambang, dan biaya sebelum kamu mulai.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Stabilkan dulu, lalu berkembang, lalu fitur baru.',
    lesezeit: '2 mnt',
    einleitung: 'Tanpa tanggal yang tidak bisa ditepati. Sebagai gantinya, status yang bisa dicek siapa pun di ' +
      'explorer dan di kode sumber.',
    bausteine: [
      { art: 'schritte', titel: 'Selesai', punkte: [
        'Chain, wallet, transaksi di dalam blok, miner di ponsel.',
        'Biaya per byte dan pasar biaya berdasarkan antrean yang sebenarnya.',
        'Mining di pool dengan pembayaran PPLNS langsung dari blok; pemilihan pool di aplikasi.',
        'P2P antar full node; beberapa node independen berjalan bersamaan.',
        'Aplikasi Android dengan mining di latar belakang — sebagai APK di GitHub.',
        'YSKAR Node Core 0.7.1 untuk Windows dan Linux.',
      ] },
      { art: 'schritte', titel: 'Sekarang', punkte: [
        'Menstabilkan jaringan dan memperbaiki masalah kecil.',
      ] },
      { art: 'schritte', titel: 'Direncanakan', punkte: [
        'Node Core: beberapa GPU sekaligus, lalu GPU mining untuk AMD dan Intel (OpenCL).',
        `Upgrade jaringan (soft fork) di blok ${z(7000)}.`,
        'YSKAR Wallet di Google Play.',
      ] },
      { art: 'schritte', titel: 'Nanti', punkte: [
        'Stratum mining, setelah jaringan mencapai ukuran tertentu.',
        'Kanal pembayaran langsung antara pengirim dan penerima.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Kode sumbernya terbuka. Setiap langkah di sini ' +
        'sesuai dengan sebuah dokumen di repository.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'Apakah YSKAR airdrop atau tap-to-earn?',
    antwort: 'Bukan. Tidak ada yang perlu di-tap dan tidak ada yang dibagikan. YSR hanya ' +
      'tercipta sebagai reward blok untuk kerja komputasi sungguhan yang sudah ' +
      'diverifikasi ulang oleh node.' },
  { frage: 'Berapa yang didapat ponselku?',
    antwort: 'Di pool, kamu mendapat bagian dari setiap blok yang ditemukan pool, sesuai kerjamu: ' +
      'kira-kira hashrate-mu dibagi hashrate pool, dikali ' +
      `${REWARD} YSR, dikurangi biaya. Tab “Mining” menghitung perkiraan ini dengan ` +
      'nilai-nilai nyatamu. Secara solo, semuanya tergantung apakah perangkatmu sendiri menemukan blok.' },
  { frage: 'Apakah YSR punya harga?',
    antwort: 'Tidak. YSR tidak punya harga dan tidak diperdagangkan di bursa mana pun. Jangan ada yang ' +
      'menambang dengan harapan hal itu akan berubah.' },
  { frage: 'Apa yang terjadi jika aku kehilangan dua belas kataku?',
    antwort: 'Saldonya hilang. Tidak ada “lupa password”: baik kami maupun ' +
      'Telegram tidak bisa memulihkan kata-kata itu. Tulis di kertas — jangan sebagai screenshot.' },
  { frage: 'Siapa yang menjalankan chain?',
    antwort: 'Tidak ada yang menjalankannya sendirian. Beberapa full node berjalan bersamaan, saling sinkron lewat P2P ' +
      'dan memverifikasi ulang setiap blok sendiri. Aplikasi membaca lewat sebuah mirror — ' +
      'siapa pun bisa menjalankan node sendiri dan bahkan tidak memerlukan mirror itu.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-10-12',
    titel: 'Node Core 0.7.1 untuk Windows dan Linux',
    text: 'Node desktop dengan wallet dan mining kini tersedia dalam paket terpisah ' +
      'untuk Windows dan Linux.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-30',
    titel: 'Aplikasi Android “YSKAR Wallet”',
    text: 'Notifikasi push untuk pembayaran masuk, buka kunci dan kirim dengan sidik jari, ' +
      'mining saat layar terkunci. Sebagai APK di GitHub — dan aplikasinya kini tersedia dalam beberapa bahasa.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Desain baru dan pindai QR',
    text: 'Aplikasi kini menjelaskan apa itu YSKAR — dan alamat bisa dipindai dengan ' +
      'kamera saat mengirim.',
  },
  {
    datum: '2026-09-09',
    titel: 'Chain sudah diluncurkan',
    text: 'Blok genesis sudah ditambang, dengan inskripsi “proof, not promise”. Mining ' +
      'terbuka untuk semua orang.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
