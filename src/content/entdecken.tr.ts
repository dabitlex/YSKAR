/**
 * "Keşfet" content -- Türkçe.
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

export default function inhalteTr(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'YSKAR nedir?',
    teaser: 'Kendi PoW zinciri. Başkasının blokzincirindeki bir token değil.',
    lesezeit: '2 dk',
    einleitung: 'YSKAR, kendi zinciri, kendi konsensüsü ve kendi madencisi olan ' +
      'bağımsız bir Proof of Work kripto parasıdır. Başka bir blokzincirde „YSKAR" ' +
      'adında bir akıllı sözleşme yok — ürün, zincirin kendisidir.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Ağ', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '09.09.2026' },
        { label: 'Hash fonksiyonu', wert: 'SHA-256d' },
        { label: 'Blok süresi', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} dk` },
      ] },
      { art: 'absatz', text: 'Genesis bloğu bir yazıt taşır ve bu yazıt sonraki her şeyin ' +
        'ölçütüdür: „proof, not promise". Hiçbir değer simüle edilmez. Cihazın gerçek ' +
        'hash’ler hesaplar, her düğüm her share’i kendisi yeniden hesaplar ve bakiyen ' +
        'yalnızca bloklardan yeniden oluşturulabilir.' },
      { art: 'absatz', text: 'Kullanım Telegram Mini App ya da „YSKAR Wallet" Android ' +
        'uygulaması üzerinden olur. Mülkiyet ise Telegram’a değil anahtarlara bağlıdır: ' +
        'on iki kelimeye sahip olan bakiyeye sahiptir — Telegram hesabı olsun ya da olmasın.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR bir projedir, ödeme aracı değildir. ' +
        'Birden fazla tam düğüm (full node) zinciri birbirinden bağımsız olarak doğrular; ' +
        'her blok gezginde kontrol edilebilir.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Telefonda madencilik',
    teaser: 'Share, zorluk, blok — cihazın nasıl katılıyor.',
    lesezeit: '3 dk',
    einleitung: 'Telefonun, ağdan gelen bir iş (job) üzerinde SHA-256d hash’leri hesaplar. ' +
      'Bitcoin ile aynı yöntem — yalnızca zorluk, bir telefonun gerçek bir şansı ' +
      'olacak şekilde seçilmiştir.',
    bausteine: [
      { art: 'schritte', titel: 'Bir blok nasıl oluşur', punkte: [
        'Düğüm bir iş verir: bir sonraki bloğun başlığı, 90 saniye geçerli.',
        'Worker’ların nonce’ları dener. Her hesaplama gerçek bir hash’tir.',
        'Share hedefinin altındaki bir hash bir share’dir. Düğüm onu yeniden hesaplar — ' +
          'iş olmadan geçerli share olmaz.',
        'Hash blok zorluğunun da altındaysa bir blok bulunmuştur. ' +
          `${REWARD} YSR ödül adresine gider.`,
      ] },
      { art: 'absatz', text: 'Çalışma oranı (%25–100) cihazının ne kadar yükleneceğini ' +
        'belirler. Worker sayısı çekirdeklere göre ayarlanır — kalibrasyon, telefonun ' +
        'için en iyi ayarı bulur.' },
      { art: 'absatz', text: 'Telegram’da madencilik sürerken ekran açık kalır — kilitlenirse ' +
        'platform worker’ı durdurur. Android uygulaması ekran kilitliyken de hesaplamaya ' +
        'devam eder; bunu hash gücünü gösteren bildirimden görebilirsin.' },
      { art: 'hinweis', tone: 'work', text: 'Solo ve havuz eşit haklara sahiptir. İlk havuz ' +
        'aktif: ödemeyi bloğun kendisi tüm katılımcılara yapar — işletmeci hiçbir ' +
        'zaman başkasının parasını tutmaz.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomi',
    teaser: `${ysr(MAX_SUPPLY)} YSR, blok başına ${REWARD}, her ${z(EPOCH_BLOCKS)} blokta yarılanma.`,
    lesezeit: '3 dk',
    einleitung: 'Ön satış, ekip payı ve airdrop yok. Her YSR blok ödülü olarak ' +
      'var olur — bloğu kim bulduysa onda.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Maks. arz', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Bugünkü ödül', wert: `${REWARD} YSR` },
        { label: 'Yarılanma', wert: `her ${z(EPOCH_BLOCKS)} blokta` },
        { label: 'Blok süresi', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} dakika` },
      ] },
      { art: 'balken', titel: 'Zaman içinde emisyon', werte: [
        { label: `Dönem 1 · ${REWARD}`, anteil: 1 },
        { label: `Dönem 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Dönem 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Bir dönem ${z(EPOCH_BLOCKS)} blok, yani yaklaşık ${EPOCHE_TAGE} gün sürer. ` +
        'Sonrasında ödül yarıya iner — Bitcoin’deki gibi, yalnızca daha hızlı.' },
      { art: 'absatz', text: `Bir sezon ${z(SEASON_BLOCKS)} blok, iki sezon bir dönemdir. ` +
        'Ödül yuvarlama yapılmadan, saf bit kaydırmayla yarılanır — bu yüzden toplam ' +
        `arz tam Bitcoin’deki gibi ${ysr(MAX_SUPPLY)} değerinin hemen altında kalır.` },
      { art: 'kennzahlen', werte: [
        { label: 'Asgari ücret', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Blok başına yer', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Bu sayfadaki sayılar doğrudan zincirin ' +
        'konsensüs parametrelerinden gelir — bir whitepaper’dan değil.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Cüzdan ve güvenlik',
    teaser: 'On iki kelime, PIN, cihazda imza.',
    lesezeit: '2 dk',
    einleitung: 'Cüzdanın on iki kelimedir. Onlara sahip olan bakiyene sahip olur — ' +
      'onları kaybeden bakiyeyi kaybeder. Kimse onları sıfırlayamaz: ne biz, ne ' +
      'Telegram, hiç kimse.',
    bausteine: [
      { art: 'schritte', titel: 'Cihazda ne olur', punkte: [
        'Kelimeler PIN’inle şifrelenerek telefonda saklanır.',
        'Bir ödeme tamamen cihazda oluşturulur ve imzalanır.',
        'Sunucu yalnızca hazır baytları görür — imzayı bozmadan tutarı ya da alıcıyı ' +
          'değiştiremez.',
      ] },
      { art: 'absatz', text: 'PIN, birinin kilidi açık telefonunu eline almasına karşı ' +
        'korur. Cihaza erişimi olan kararlı bir saldırgana karşı tek koruma, üzerinde ' +
        'büyük tutar bırakmamaktır.' },
      { art: 'absatz', text: '„Al" altındaki QR kod cihazda oluşturulur. Gönderirken başka ' +
        'bir kullanıcının kodunu kamerayla tarayabilirsin — adres kullanılmadan önce ' +
        'doğrulanır.' },
      { art: 'hinweis', tone: 'risk', text: 'Gönderilen bir ödeme geri alınamaz. ' +
        'Adresin tamamını kontrol et, yalnızca başını ve sonunu değil.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Tam düğüm ve havuz',
    teaser: 'Birden fazla düğüm, ilk havuz aktif — ağ nasıl bir araya geliyor.',
    lesezeit: '3 dk',
    einleitung: 'Bir tam düğüm (full node) zinciri çeker, her bloğu kendisi doğrular ve ' +
      'kendi bloklarını oluşturur. Şimdiden birden fazla düğüm aynı anda çalışıyor ve ' +
      'P2P üzerinden eşleşiyor — zincir artık tek bir sunucuya bağlı değil.',
    bausteine: [
      { art: 'schritte', titel: 'Bir düğüm ne yapar', punkte: [
        'Önce başlıklar: zinciri diğer düğümlerden çeker ve bir bloğu kabul etmeden ' +
          'önce zinciri ve işi yerel olarak doğrular.',
        'İşlemleri mempool’una alır ve madencilere iş dağıtır.',
        'Bir madenci blok bulduğunda düğüm onu gönderir ve eşlerine (peer) iletir.',
        'Her şeyin sınırı var: mesaj boyutları, süreler ve eş başına yerler sabittir — ' +
          'tek bir eş bir düğümü aşırı yükleyemez.',
      ] },
      { art: 'absatz', text: 'Düğüm Node 22 olan her makinede çalışır; depolaması tek bir ' +
        'SQLite dosyasıdır. İsteyen kendi düğümünü çalıştırır ve zinciri kimseye ' +
        'güvenmek zorunda kalmadan doğrular.' },
      { art: 'schritte', titel: 'Havuz madenciliği nasıl işler', punkte: [
        'Havuz hiçbir zaman başkasının parasını tutmaz. Paylaşım, bloğun coinbase’i olur ' +
          '(konsensüs sürümü 2: birden fazla alıcılı coinbase).',
        'PPLNS: son N iş birimi ödenir — blok bulguları arasında da. ' +
          'Havuz değiştirmek (pool hopping) işe yaramaz.',
        'Paylaşım blokta durur; herkes doğrulayabilir.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'İlk havuz aktif. „Madencilik" sekmesinde ' +
        '„Havuz" seç ve adresini gir — havuz, başlamadan önce hash gücünü, ' +
        'madenci sayısını ve ücreti bildirir.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Yol haritası',
    teaser: 'Mikro ödemeler, her sistem için Node Core, Lightning cüzdanlı uygulamalar.',
    lesezeit: '2 dk',
    einleitung: 'Tutulmayacak tarih yok. Onun yerine herkesin gezginde ve kaynak ' +
      'kodda kontrol edebileceği durumlar.',
    bausteine: [
      { art: 'schritte', titel: 'Tamamlandı', punkte: [
        'Zincir, cüzdan, blokta işlemler, telefonda madenci.',
        'Ücret piyasası: gerçek kuyruktan öneri.',
        'Konsensüs sürümü 2: birden fazla alıcılı coinbase.',
        'Doğrudan bloktan PPLNS ödemeli havuz madenciliği — ilk havuz aktif.',
        'Tam düğümler arasında P2P; birden fazla düğüm aynı anda çalışıyor.',
        'Zincir tam düğümlerde yaşar; sunucu artık yalnızca uygulama için bir ayna.',
        '„YSKAR Wallet" Android uygulaması: gelen ödemelerde push bildirimi, biyometri, ' +
          'arka planda madencilik, uygulama içi güncelleme uyarısı — GitHub’da APK olarak.',
      ] },
      { art: 'schritte', titel: 'Sırada', punkte: [
        'Mikro ödemeler: küçük tutarları hızlı ve ucuz aktarma.',
        'YSKAR Node Core: her sistem için entegre cüzdan ve madencilikle yayın.',
        'iOS uygulaması; her iki uygulamada Lightning cüzdanı.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Kaynak kod açık. Buradaki her adımın ' +
        'depoda bir belgesi var.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'YSKAR bir airdrop ya da tap-to-earn mi?',
    antwort: 'Hayır. Dokunulacak bir şey yok ve hiçbir şey dağıtılmıyor. YSR yalnızca ' +
      'düğümün yeniden hesaplayarak doğruladığı gerçek hesaplama işi için blok ödülü ' +
      'olarak var olur.' },
  { frage: 'Telefonumla ne kadar kazanırım?',
    antwort: 'Bu, hash gücünün tüm ağa oranına bağlı. ' +
      `Ortalama her ${Number(TARGET_BLOCK_TIME) / 60} dakikada ağdaki bir cihaz ` +
      `${REWARD} YSR değerinde bir blok bulur. „Ağ" sekmesi ağ hash gücünü gösterir — ` +
      'senin payın, blok başına beklenen şansındır.' },
  { frage: 'On iki kelimemi kaybedersem ne olur?',
    antwort: 'Bakiye kaybolur. „Şifremi unuttum" diye bir şey yok: ne biz ne de ' +
      'Telegram kelimeleri geri getirebilir. Kâğıda yaz — ekran görüntüsü olarak değil.' },
  { frage: 'Zinciri kim işletiyor?',
    antwort: 'Tek başına kimse. Birden fazla tam düğüm aynı anda çalışır, P2P üzerinden ' +
      'eşleşir ve her bloğu kendisi yeniden hesaplar. Uygulama bir ayna üzerinden okur — ' +
      'isteyen kendi düğümünü çalıştırır ve ona da ihtiyaç duymaz.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-09-30',
    titel: '„YSKAR Wallet" Android uygulaması',
    text: 'Gelen ödemelerde push bildirimi, parmak iziyle kilit açma ve gönderme, ' +
      'ekran kilitliyken madencilik. GitHub’da APK olarak — ve uygulama artık birden fazla dilde.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Yeni tasarım ve QR tarama',
    text: 'Uygulama artık YSKAR’ın ne olduğunu gösteriyor — ve gönderirken adresler ' +
      'kamerayla taranabiliyor.',
  },
  {
    datum: '2026-09-09',
    titel: 'Zincir başladı',
    text: 'Genesis bloğu kazıldı, yazıt „proof, not promise". Madencilik ' +
      'herkese açık.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
