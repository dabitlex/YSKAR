import type licht from './de';

const id: typeof licht = {
  deinLicht: 'Cahayamu',
  deinPlatz: 'Tempatmu',
  keinLicht: 'Belum ada cahaya',
  seit: (min: number) => `Mining · ${min} mnt`,
  bereit: 'Siap.',
  bereitPool: (pool: string, n: number) => `Ketuk mulai dan ponselmu bergabung ke pool ${pool}. Cahayamu akan jadi yang ke-${n} di tepi.`,
  bereitSolo: (n: number) => `Ketuk mulai dan ponselmu menambang sendiri. Cahayamu akan jadi yang ke-${n} di tepi.`,
  waehlen: 'Pilih pool, lalu cahayamu menyala.',
  erwartung: (min: string, anteil: string, sym: string) => `Pool-mu menemukan blok rata-rata sekitar tiap ${min} menit. Bagianmu: sekitar ${anteil} ${sym}.`,
  erwartungOffen: 'Cahayamu menyala. Setiap share yang diterima pool dihitung untuk bagianmu di blok pool berikutnya.',
  solo: 'Ponselmu menambang sendiri. Jika menemukan blok, seluruh hadiahnya milikmu. Itu jarang terjadi.',
  leistung: 'Daya',
  last: (p: number, w: number) => `Beban ${p}% · ${w} worker`,
  anpassen: 'Atur',
};

export default id;
