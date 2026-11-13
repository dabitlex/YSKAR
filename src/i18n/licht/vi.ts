import type licht from './de';

const vi: typeof licht = {
  deinLicht: 'Ánh đèn của bạn',
  deinPlatz: 'Chỗ của bạn',
  keinLicht: 'Chưa có ánh đèn',
  seit: (min: number) => `Đang đào · ${min} phút`,
  bereit: 'Sẵn sàng.',
  bereitPool: (pool: string, n: number) => `Chạm bắt đầu và điện thoại của bạn sẽ tham gia pool ${pool}. Ánh đèn của bạn sẽ là ngọn thứ ${n} bên bờ.`,
  bereitSolo: (n: number) => `Chạm bắt đầu và điện thoại của bạn sẽ tự đào một mình. Ánh đèn của bạn sẽ là ngọn thứ ${n} bên bờ.`,
  waehlen: 'Chọn một pool, rồi ánh đèn của bạn sẽ sáng.',
  erwartung: (min: string, anteil: string, sym: string) => `Pool của bạn trung bình khoảng ${min} phút tìm được một khối. Phần của bạn: khoảng ${anteil} ${sym}.`,
  erwartungOffen: 'Ánh đèn của bạn đang sáng. Mỗi share được pool chấp nhận đều tính vào phần của bạn ở khối tiếp theo của pool.',
  solo: 'Điện thoại của bạn đang tự đào một mình. Nếu tìm được khối, toàn bộ phần thưởng thuộc về bạn. Điều đó hiếm khi xảy ra.',
  leistung: 'Công suất',
  last: (p: number, w: number) => `Tải ${p}% · ${w} worker`,
  anpassen: 'Điều chỉnh',
  ersterEtikett: 'Share đầu tiên đã được chấp nhận',
  ersterTitel: 'Điện thoại của bạn giờ đã tham gia làm việc, và điều đó kiểm chứng được.',
  ersterText: 'Share là bằng chứng công việc của bạn gửi cho pool. Càng nhiều share, phần của bạn càng lớn khi pool tìm được khối.',
};

export default vi;
