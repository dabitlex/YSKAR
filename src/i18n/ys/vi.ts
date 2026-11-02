import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Trạng thái',
    erklaerung: 'Ba dải của biểu tượng YSKAR cho thấy ngay trạng thái của ứng dụng.',
    band: { wallet: 'Ví', netz: 'Mạng', mining: 'Đào' },
    wallet: { gesichert: 'Đã sao lưu từ khôi phục', offen: 'Chưa sao lưu từ khôi phục' },
    netz: { verbunden: 'Đã kết nối mạng', getrennt: 'Đang kết nối mạng…' },
    mining: { an: 'Đang đào', aus: 'Đã dừng đào' },
  },
  mining: {
    leistung: 'Sức mạnh điện thoại',
    laufzeit: 'Thời gian chạy',
    minuten: (n: number) => `${n} phút`,
    jeBlock: 'mỗi khối của pool',
    soloUnter: 'Không dùng pool. Đổi trong chi tiết đào.',
    details: 'Chi tiết đào',
    detailsUnter: 'Share, hoạt động, chế độ, worker',
    mehrTitel: 'Mạnh hơn',
    mehrEinstieg: 'Mini App là cửa vào để bạn làm quen với YSKAR.',
    mehrText: 'Để đào thực sự, hãy dùng Node Core trên PC với CPU và GPU (NVIDIA, AMD, Intel) hoặc HiveOS trên máy đào.',
    mehrLink: 'Tải về tại yskar.app',
    wegZumBlock: 'Đường tới một khối',
    besterShare: (p: string) => `Share tốt nhất của bạn trong phiên này đạt ${p} mục tiêu khối.`,
    blockziel: (d: string) => `Mục tiêu khối = difficulty ${d}. Share vượt mục tiêu là một khối.`,
    letzteShares: 'Share gần đây',
    angenommen: (n: string) => `${n} được chấp nhận`,
    abgelehnt: 'Share không được chấp nhận',
    einstellungen: 'Cài đặt',
    benchmark: 'Đo hiệu năng',
  },
  netz: {
    naechster: 'Tiếp theo',
    laeuft: (n: number) => `đã ${n} phút`,
    ketteAria: 'Các khối mới nhất của chuỗi',
  },
};

export default ys;
