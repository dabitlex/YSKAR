/**
 * "Discover" content -- Vietnamese.
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

export default function inhalteVi(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'YSKAR là gì?',
    teaser: 'Một chuỗi PoW riêng. Không phải token trên blockchain của người khác.',
    lesezeit: '2 phút',
    einleitung: 'YSKAR là một đồng tiền mã hóa proof of work độc lập với chuỗi riêng, ' +
      'cơ chế đồng thuận riêng và trình đào riêng. Không có smart contract nào trên ' +
      'một blockchain khác mang tên “YSKAR” — chính chuỗi là sản phẩm.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Mạng', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '09/09/2026' },
        { label: 'Hàm băm', wert: 'SHA-256d' },
        { label: 'Thời gian block', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} phút` },
      ] },
      { art: 'absatz', text: 'Block genesis mang một dòng chữ khắc, và nó đặt ra tiêu chuẩn ' +
        'cho mọi thứ sau đó: “proof, not promise”. Không có giá trị nào được mô phỏng. ' +
        'Thiết bị của bạn tính toán hash thật, mọi node đều tự tính lại từng share, ' +
        'và số dư của bạn có thể được dựng lại chỉ từ các block.' },
      { art: 'absatz', text: 'Bạn sử dụng qua Telegram Mini App hoặc ứng dụng Android ' +
        '“YSKAR Wallet”. Tuy nhiên, quyền sở hữu gắn với khóa, không gắn với Telegram: ai ' +
        'có 12 từ khôi phục thì có số dư — dù có hay không có tài khoản Telegram.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR là một dự án, không phải phương tiện thanh toán. ' +
        'Nhiều Full Node kiểm tra chuỗi độc lập với nhau; mọi block đều có thể ' +
        'kiểm chứng trong Explorer.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Đào trên điện thoại',
    teaser: 'Share, Difficulty, block — cách thiết bị của bạn tham gia.',
    lesezeit: '3 phút',
    einleitung: 'Điện thoại của bạn tính toán hash SHA-256d dựa trên một job từ mạng lưới. ' +
      'Đây là proof of work thực sự — và Difficulty được chọn sao cho ' +
      'một chiếc điện thoại có cơ hội thực sự.',
    bausteine: [
      { art: 'schritte', titel: 'Một block ra đời như thế nào', punkte: [
        'Node phát ra một job: phần header của block tiếp theo, có hiệu lực trong 90 giây.',
        'Các worker của bạn thử các nonce. Mỗi phép tính là một hash thật.',
        'Một hash thấp hơn mục tiêu share là một share. Node tính lại để kiểm tra — ' +
          'không có công việc thì không có share hợp lệ.',
        'Nếu hash còn thấp hơn cả Difficulty của block, một block được tìm thấy. ' +
          `Phần thưởng ${REWARD} YSR sẽ về địa chỉ của bạn.`,
      ] },
      { art: 'absatz', text: 'Mức tải (25–100 %) quyết định thiết bị của bạn chạy nặng ' +
        'đến đâu. Số worker phụ thuộc vào số lõi — chức năng hiệu chỉnh sẽ tìm thiết lập ' +
        'tốt nhất cho điện thoại của bạn.' },
      { art: 'absatz', text: 'Trong Telegram, màn hình luôn sáng khi đang đào — nếu màn hình khóa, ' +
        'nền tảng sẽ tạm dừng worker. Ứng dụng Android vẫn tiếp tục tính toán khi màn hình ' +
        'đã khóa, có thể thấy qua thông báo hiển thị hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Người dùng mới đào trong pool; chế độ solo vẫn có ' +
        'trong “Đào → Nâng cao”. Trong pool, chính block trả thưởng cho tất cả người tham gia — ' +
        'người vận hành không bao giờ giữ tiền của người khác.' },
    ],
  },
  {
    slug: 'pool-oder-solo', icon: 'Wuerfel', farbe: 'work',
    titel: 'Pool hay solo?',
    teaser: 'Phần nhỏ đều đặn, hoặc được ăn cả ngã về không.',
    lesezeit: '2 phút',
    einleitung: `Trung bình cứ ${Number(TARGET_BLOCK_TIME) / 60} phút, một thợ đào trong mạng ` +
      `tìm thấy một block trị giá ${REWARD} YSR. Câu hỏi là bạn muốn được trả cho phần của mình theo cách nào.`,
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Pool', wert: 'phần nhỏ, đều đặn' },
        { label: 'Solo', wert: 'cả block, hiếm khi' },
      ] },
      { art: 'absatz', text: 'Trong pool, nhiều thiết bị cùng đào. Khi pool tìm thấy block, ' +
        'chính block chia phần thưởng theo công sức gần đây (PPLNS). Phần của bạn phụ thuộc ' +
        'vào việc hashrate của bạn đóng góp bao nhiêu vào sức tính toán của pool.' },
      { art: 'absatz', text: 'Khi đào solo, bạn nhận cả block — nhưng chỉ khi chính thiết bị ' +
        'của bạn tìm ra nó. Một chiếc điện thoại đơn lẻ có cơ hội rất nhỏ cho mỗi block so với ' +
        'toàn mạng; có thể mất rất lâu mới thành công.' },
      { art: 'schritte', titel: 'Những điều bạn nên biết về pool', punkte: [
        `Người vận hành đặt mức phí từ 0 đến ${MAX_FEE_BPS / 100} %; ứng dụng hiển thị mức phí trước khi bạn bắt đầu.`,
        `Mỗi block, một pool chỉ có thể trả cho số thợ đào có hạn (hiện tại là ${MAX_COINBASE_OUTPUTS - 1}). ` +
          'Nếu pool đã đầy, bạn chọn pool khác.',
        'Mọi khoản chi trả đều công khai trong block và trong Explorer.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Người dùng mới đào trong pool. Bạn chuyển sang solo tại ' +
        '“Đào → Nâng cao”.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} mỗi block, halving sau mỗi ${z(EPOCH_BLOCKS)} block.`,
    lesezeit: '3 phút',
    einleitung: 'Không có presale, không phân bổ cho đội ngũ và không có airdrop. Mỗi YSR ' +
      'đều được tạo ra dưới dạng phần thưởng block — cho người đã tìm thấy block đó.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Nguồn cung tối đa', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward hiện tại', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `mỗi ${z(EPOCH_BLOCKS)} block` },
        { label: 'Thời gian block', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} phút` },
      ] },
      { art: 'balken', titel: 'Phát hành theo thời gian', werte: [
        { label: `Epoch 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoch 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoch 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Một epoch là ${z(EPOCH_BLOCKS)} block, khoảng ${EPOCHE_TAGE} ngày. ` +
        'Sau đó phần thưởng giảm một nửa.' },
      { art: 'absatz', text: `Một season là ${z(SEASON_BLOCKS)} block, hai season tạo thành một ` +
        'epoch. Phần thưởng được giảm một nửa bằng phép dịch bit đơn thuần, không làm tròn — vì vậy ' +
        `tổng nguồn cung dừng ở mức ngay dưới ${ysr(MAX_SUPPLY)}.` },
      { art: 'kennzahlen', werte: [
        { label: 'Phí tối thiểu', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Số chỗ mỗi block', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Các con số trên trang này lấy trực tiếp từ ' +
        'tham số đồng thuận của chuỗi — không phải từ whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Ví & bảo mật',
    teaser: '12 từ khôi phục, mã PIN, ký trên thiết bị.',
    lesezeit: '2 phút',
    einleitung: 'Ví của bạn là 12 từ khôi phục. Ai có chúng sẽ có số dư của bạn — ' +
      'và ai làm mất chúng sẽ mất số dư. Không ai có thể đặt lại chúng: không phải ' +
      'chúng tôi, không phải Telegram, không ai cả.',
    bausteine: [
      { art: 'schritte', titel: 'Những gì diễn ra trên thiết bị', punkte: [
        'Các từ khôi phục được lưu trên điện thoại, mã hóa bằng mã PIN của bạn.',
        'Một khoản thanh toán được tạo và ký hoàn toàn trên thiết bị.',
        'Máy chủ chỉ thấy các byte đã hoàn chỉnh — nó không thể thay đổi số tiền hay ' +
          'người nhận mà không làm hỏng chữ ký.',
      ] },
      { art: 'absatz', text: 'Mã PIN bảo vệ khi có người cầm điện thoại đang mở khóa của bạn. ' +
        'Trước một kẻ tấn công quyết tâm có quyền truy cập vào thiết bị, cách bảo vệ ' +
        'duy nhất là không giữ số tiền lớn trên đó.' },
      { art: 'absatz', text: 'Mã QR trong mục “Nhận” được tạo trên thiết bị. ' +
        'Khi gửi, bạn có thể quét mã của người dùng khác bằng camera — địa chỉ ' +
        'được kiểm tra hợp lệ trước khi sử dụng.' },
      { art: 'hinweis', tone: 'risk', text: 'Khoản thanh toán đã gửi không thể thu hồi. ' +
        'Hãy kiểm tra toàn bộ địa chỉ, không chỉ phần đầu và phần cuối.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full Node & pool',
    teaser: 'Nhiều node, pool đầu tiên đã hoạt động — mạng lưới kết nối với nhau thế nào.',
    lesezeit: '3 phút',
    einleitung: 'Một Full Node tải chuỗi về, tự kiểm tra từng block và tự tạo ' +
      'block của mình. Hiện đã có nhiều node chạy cùng lúc và đồng bộ qua ' +
      'P2P — chuỗi không còn phụ thuộc vào một máy chủ duy nhất.',
    bausteine: [
      { art: 'schritte', titel: 'Một node làm gì', punkte: [
        'Header trước: node tải chuỗi từ các node khác và kiểm tra chuỗi cùng ' +
          'công việc ngay tại máy trước khi chấp nhận một block.',
        'Node nhận giao dịch vào Mempool của mình và phát job cho các thợ đào.',
        'Khi một thợ đào tìm thấy block, node gửi block đó lên và chuyển tiếp đến các peer.',
        'Mọi thứ đều có giới hạn: kích thước tin nhắn, thời hạn và số chỗ cho mỗi peer đều cố định — ' +
          'một peer đơn lẻ không thể làm quá tải một node.',
      ] },
      { art: 'absatz', text: 'Node chạy trên bất kỳ máy nào có Node 22; dữ liệu của nó ' +
        'là một tệp SQLite duy nhất. Ai cũng có thể chạy node riêng và kiểm tra chuỗi ' +
        'mà không cần tin tưởng bất kỳ ai.' },
      { art: 'schritte', titel: 'Đào pool hoạt động thế nào', punkte: [
        'Pool không bao giờ giữ tiền của người khác. Phần chia trở thành coinbase của ' +
          'block (phiên bản đồng thuận 2: coinbase với nhiều người nhận).',
        'PPLNS: trả cho N đơn vị công việc gần nhất — xuyên qua các lần tìm thấy block. ' +
          'Nhảy pool (pool hopping) không có lợi.',
        'Phần chia nằm trong block để mọi người kiểm chứng.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Trong tab “Đào”, ứng dụng chọn pool có ' +
        'nhiều chỗ trống nhất; tại “Đổi” bạn có thể tự chọn. Pool báo sức tính toán, ' +
        'số thợ đào và mức phí trước khi bạn bắt đầu.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Lộ trình',
    teaser: 'Ổn định trước, rồi phát triển, rồi tính năng mới.',
    lesezeit: '2 phút',
    einleitung: 'Không đưa ra mốc thời gian không giữ được. Thay vào đó là các trạng thái mà ai cũng ' +
      'có thể kiểm tra trong Explorer và trong mã nguồn.',
    bausteine: [
      { art: 'schritte', titel: 'Đã hoàn thành', punkte: [
        'Chuỗi, ví, giao dịch trong block, trình đào trên điện thoại.',
        'Phí theo byte và thị trường phí dựa trên hàng chờ thực tế.',
        'Đào pool với chi trả PPLNS trực tiếp từ block; chọn pool trong các ứng dụng.',
        'P2P giữa các Full Node; nhiều node độc lập chạy cùng lúc.',
        'Ứng dụng Android với tính năng đào nền — dưới dạng APK trên GitHub.',
        'YSKAR Node Core 0.7.1 cho Windows và Linux.',
      ] },
      { art: 'schritte', titel: 'Hiện tại', punkte: [
        'Ổn định mạng lưới và sửa các lỗi nhỏ.',
      ] },
      { art: 'schritte', titel: 'Dự kiến', punkte: [
        'Node Core: nhiều GPU cùng lúc, sau đó đào bằng GPU cho AMD và Intel (OpenCL).',
        `Nâng cấp mạng (soft fork) tại block ${z(7000)}.`,
        'YSKAR Wallet trên Google Play.',
      ] },
      { art: 'schritte', titel: 'Sau này', punkte: [
        'Đào qua Stratum, khi mạng lưới đạt đến một quy mô nhất định.',
        'Kênh thanh toán trực tiếp giữa người gửi và người nhận.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Mã nguồn là mở. Mỗi bước ở đây ' +
        'tương ứng với một tài liệu trong repository.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'YSKAR có phải là airdrop hay tap-to-earn không?',
    antwort: 'Không. Không có gì để chạm và không có gì được phát miễn phí. YSR chỉ ' +
      'được tạo ra dưới dạng phần thưởng block cho công việc tính toán thật mà ' +
      'node đã tính lại để kiểm tra.' },
  { frage: 'Điện thoại của tôi nhận được bao nhiêu?',
    antwort: 'Trong pool, bạn nhận một phần của mỗi block mà pool tìm thấy, dựa trên công sức của bạn: ' +
      'xấp xỉ hashrate của bạn chia cho hashrate của pool, nhân ' +
      `${REWARD} YSR, trừ phí. Tab “Đào” tính ước tính này với các giá trị ` +
      'thực của bạn. Khi đào solo, mọi thứ phụ thuộc vào việc chính thiết bị của bạn có tìm thấy block hay không.' },
  { frage: 'YSR có giá không?',
    antwort: 'Không. YSR không có giá và không được giao dịch trên sàn nào. Không ai nên đào ' +
      'với kỳ vọng điều đó sẽ thay đổi.' },
  { frage: 'Điều gì xảy ra nếu tôi làm mất 12 từ khôi phục?',
    antwort: 'Số dư sẽ bị mất. Không có chức năng “quên mật khẩu”: cả chúng tôi lẫn ' +
      'Telegram đều không thể khôi phục các từ này. Hãy viết chúng ra giấy — không chụp màn hình.' },
  { frage: 'Ai vận hành chuỗi?',
    antwort: 'Không ai một mình. Nhiều Full Node chạy cùng lúc, đồng bộ qua P2P ' +
      'và tự tính lại từng block để kiểm tra. Ứng dụng đọc dữ liệu qua một máy chủ mirror — ' +
      'ai cũng có thể chạy node riêng và khi đó không cần cả mirror này.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-10-12',
    titel: 'Node Core 0.7.1 cho Windows và Linux',
    text: 'Node dành cho máy tính, có ví và tính năng đào, giờ có gói riêng ' +
      'cho Windows và Linux.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-30',
    titel: 'Ứng dụng Android “YSKAR Wallet”',
    text: 'Thông báo đẩy khi có tiền vào, mở khóa và gửi bằng vân tay, ' +
      'đào khi màn hình đã khóa. Dưới dạng APK trên GitHub — và ứng dụng giờ đã hỗ trợ nhiều ngôn ngữ.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Thiết kế mới và quét mã QR',
    text: 'Ứng dụng giờ giới thiệu YSKAR là gì — và khi gửi, có thể quét địa chỉ bằng ' +
      'camera.',
  },
  {
    datum: '2026-09-09',
    titel: 'Chuỗi đã khởi chạy',
    text: 'Block genesis đã được đào, dòng chữ khắc “proof, not promise”. Việc đào ' +
      'mở cho tất cả mọi người.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
