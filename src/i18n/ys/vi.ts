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
};

export default ys;
