import type licht from './de';

const tr: typeof licht = {
  deinLicht: 'Senin ışığın',
  deinPlatz: 'Senin yerin',
  keinLicht: 'Henüz ışık yok',
  seit: (min: number) => `Madencilik · ${min} dk`,
  bereit: 'Hazır.',
  bereitPool: (pool: string, n: number) => `Başlat’a dokun, telefonun ${pool} havuzuna katılsın. Işığın kıyıdaki ${n}. ışık olur.`,
  bereitSolo: (n: number) => `Başlat’a dokun, telefonun tek başına kazsın. Işığın kıyıdaki ${n}. ışık olur.`,
  waehlen: 'Bir havuz seç, ışığın yansın.',
  erwartung: (min: string, anteil: string, sym: string) => `Havuzun ortalama yaklaşık ${min} dakikada bir blok buluyor. Senin payın: yaklaşık ${anteil} ${sym}.`,
  erwartungOffen: 'Işığın yanıyor. Havuzun kabul ettiği her share, bir sonraki havuz bloğundaki payına sayılır.',
  solo: 'Telefonun tek başına kazıyor. Bir blok bulursa ödülün tamamı senin olur. Bu nadiren olur.',
  leistung: 'Güç',
  last: (p: number, w: number) => `Yük %${p} · ${w} worker`,
  anpassen: 'Ayarla',
  ersterEtikett: 'İlk share kabul edildi',
  ersterTitel: 'Telefonun artık kanıtlanabilir şekilde işe katılıyor.',
  ersterText: 'Share, havuza sunduğun iş kanıtıdır. Ne kadar çok share, havuz blok bulduğunda payın o kadar büyük olur.',
  einstiegTitel: 'Işığını\nyak.',
  einstiegText: 'Telefonun gerçek bloklar üzerinde çalışır ve karşılığında YSR kazanır. Katılan herkes için kıyıda bir ışık yanar.',
  schritt: (n: number, von: number) => `Adım ${n} / ${von}`,
};

export default tr;
