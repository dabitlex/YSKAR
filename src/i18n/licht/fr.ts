import type licht from './de';

const fr: typeof licht = {
  deinLicht: 'Ta lumière',
  deinPlatz: 'Ta place',
  keinLicht: 'Pas encore de lumière',
  seit: (min: number) => `Minage · ${min} min`,
  bereit: 'Prêt.',
  bereitPool: (pool: string, n: number) => `Touche démarrer et ton téléphone rejoint le pool ${pool}. Ta lumière serait la n° ${n} sur la rive.`,
  bereitSolo: (n: number) => `Touche démarrer et ton téléphone mine seul. Ta lumière serait la n° ${n} sur la rive.`,
  waehlen: 'Choisis un pool, et ta lumière s’allume.',
  erwartung: (min: string, anteil: string, sym: string) => `Ton pool trouve un bloc toutes les ${min} minutes environ, en moyenne. Ta part : environ ${anteil} ${sym}.`,
  erwartungOffen: 'Ta lumière est allumée. Chaque share accepté par le pool compte pour ta part du prochain bloc du pool.',
  solo: 'Ton téléphone mine seul. S’il trouve un bloc, toute la récompense est pour toi. C’est rare.',
  leistung: 'Puissance',
  last: (p: number, w: number) => `Charge ${p} % · ${w} workers`,
  anpassen: 'Régler',
  ersterEtikett: 'Premier share accepté',
  ersterTitel: 'Ton téléphone participe maintenant au travail, preuve à l’appui.',
  ersterText: 'Un share est ta preuve auprès du pool. Plus tu as de shares, plus ta part est grande quand le pool trouve un bloc.',
  einstiegTitel: 'Allume\nta lumière.',
  einstiegText: 'Ton téléphone travaille sur de vrais blocs et gagne des YSR pour cela. Pour chaque participant, une lumière brille sur la rive.',
  schritt: (n: number, von: number) => `Étape ${n} sur ${von}`,
};

export default fr;
