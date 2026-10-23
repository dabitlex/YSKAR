/**
 * Contenido de la sección «Descubrir» -- Español.
 *
 * Datos puros, sin React. Los números vienen de src/lib/core/params.ts para
 * que un artículo nunca afirme algo distinto de lo que dice la propia cadena.
 * El formato de los números se recibe desde fuera (idioma).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import { MAX_COINBASE_OUTPUTS } from '@/lib/core/params';
import { MAX_FEE_BPS } from '@/lib/pool/settlement';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhalteEs(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: '¿Qué es YSKAR?',
    teaser: 'Una cadena PoW propia. No un token en la blockchain de otro.',
    lesezeit: '2 min',
    einleitung: 'YSKAR es una criptomoneda Proof of Work independiente, con su ' +
      'propia cadena, su propio consenso y su propio minero. No hay ningún smart ' +
      'contract llamado «YSKAR» en otra blockchain: la cadena en sí es el producto.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Red', wert: 'yskar-main-1' },
        { label: 'Génesis', wert: '09/09/2026' },
        { label: 'Función hash', wert: 'SHA-256d' },
        { label: 'Tiempo de bloque', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'El bloque génesis lleva una inscripción, y esa inscripción ' +
        'marca el listón para todo lo que sigue: «proof, not promise». No se simula ' +
        'ningún valor. Tu dispositivo calcula hashes reales, cada nodo vuelve a ' +
        'verificar cada share por sí mismo, y tu saldo puede reconstruirse solo a ' +
        'partir de los bloques.' },
      { art: 'absatz', text: 'Se usa a través de la Mini App de Telegram o de la app de ' +
        'Android «YSKAR Wallet». Pero la propiedad depende de las claves, no de ' +
        'Telegram: quien tiene las doce palabras tiene el saldo, con o sin cuenta de Telegram.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR es un proyecto, no un medio de pago. ' +
        'Varios nodos completos verifican la cadena de forma independiente; cada bloque ' +
        'puede comprobarse en el explorador.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Minería en el teléfono',
    teaser: 'Shares, difficulty, bloques: cómo participa tu dispositivo.',
    lesezeit: '3 min',
    einleitung: 'Tu teléfono calcula hashes SHA-256d sobre un job de la red. ' +
      'Es proof of work de verdad, y la difficulty está ' +
      'elegida para que un teléfono tenga una posibilidad real.',
    bausteine: [
      { art: 'schritte', titel: 'Así nace un bloque', punkte: [
        'El nodo entrega un job: la cabecera del próximo bloque, válida durante 90 segundos.',
        'Tus workers prueban nonces. Cada cálculo es un hash real.',
        'Un hash por debajo del objetivo de share es un share. El nodo lo recalcula: ' +
          'sin trabajo no hay share válido.',
        'Si el hash queda incluso por debajo de la difficulty del bloque, se ha encontrado ' +
          `un bloque. El reward de ${REWARD} YSR va a tu dirección.`,
      ] },
      { art: 'absatz', text: 'La carga de cálculo (25–100 %) controla cuánto se exige a ' +
        'tu dispositivo. El número de workers depende de los núcleos; la calibración ' +
        'encuentra el mejor ajuste para tu teléfono.' },
      { art: 'absatz', text: 'En Telegram la pantalla permanece encendida mientras se mina; ' +
        'si se bloquea, la plataforma detiene el worker. La app de Android sigue calculando ' +
        'con la pantalla bloqueada, visible en la notificación con el hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Los usuarios nuevos minan en un pool; el modo solo sigue ' +
        'disponible en «Minería → Avanzado». En un pool, el propio bloque paga a todos los participantes: el ' +
        'operador nunca retiene dinero ajeno.' },
    ],
  },
  {
    slug: 'pool-oder-solo', icon: 'Wuerfel', farbe: 'work',
    titel: '¿Pool o solo?',
    teaser: 'Partes pequeñas y regulares, o todo o nada.',
    lesezeit: '2 min',
    einleitung: `De media, cada ${Number(TARGET_BLOCK_TIME) / 60} minutos un minero de la ` +
      `red encuentra un bloque de ${REWARD} YSR. La pregunta es cómo quieres que se te pague tu parte.`,
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Pool', wert: 'partes pequeñas, con regularidad' },
        { label: 'Solo', wert: 'bloque entero, rara vez' },
      ] },
      { art: 'absatz', text: 'En un pool, muchos dispositivos minan juntos. Cuando el pool encuentra un bloque, ' +
        'el propio bloque reparte el reward según el trabajo reciente (PPLNS). Tu parte depende de cuánto ' +
        'aporta tu hashrate a la potencia del pool.' },
      { art: 'absatz', text: 'En solo, te llevas el bloque entero, pero solo si tu dispositivo lo encuentra ' +
        'por sí mismo. Un teléfono solo tiene una probabilidad muy pequeña por bloque frente a toda la red; ' +
        'puede pasar mucho tiempo hasta que ocurra.' },
      { art: 'schritte', titel: 'Lo que deberías saber sobre los pools', punkte: [
        `El operador fija una comisión entre 0 y ${MAX_FEE_BPS / 100} %; la app la muestra antes de empezar.`,
        `Un pool solo puede pagar a un número limitado de mineros por bloque (actualmente ${MAX_COINBASE_OUTPUTS - 1}). ` +
          'Si está lleno, eliges otro.',
        'Cada pago es público en el bloque y en el explorador.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Los usuarios nuevos minan en un pool. El modo solo se activa en ' +
        '«Minería → Avanzado».' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} por bloque, halving cada ${z(EPOCH_BLOCKS)} bloques.`,
    lesezeit: '3 min',
    einleitung: 'No hay preventa, ni asignación para el equipo, ni airdrop. Cada YSR ' +
      'nace como reward de bloque, para quien haya encontrado el bloque.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Suministro máx.', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward hoy', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `cada ${z(EPOCH_BLOCKS)} bloques` },
        { label: 'Tiempo de bloque', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} minutos` },
      ] },
      { art: 'balken', titel: 'Emisión a lo largo del tiempo', werte: [
        { label: `Época 1 · ${REWARD}`, anteil: 1 },
        { label: `Época 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Época 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Una época son ${z(EPOCH_BLOCKS)} bloques, unos ${EPOCHE_TAGE} días. ` +
        'Después el reward se reduce a la mitad.' },
      { art: 'absatz', text: `Una season son ${z(SEASON_BLOCKS)} bloques; dos seasons forman una ` +
        'época. El reward se divide a la mitad con un simple desplazamiento de bits, sin ' +
        `redondeo, así que el suministro total queda justo por debajo de ${ysr(MAX_SUPPLY)}.` },
      { art: 'kennzahlen', werte: [
        { label: 'Comisión mínima', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Plazas por bloque', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Los números de esta página salen directamente ' +
        'de los parámetros de consenso de la cadena, no de un whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Wallet y seguridad',
    teaser: 'Doce palabras, un PIN, firmas en el dispositivo.',
    lesezeit: '2 min',
    einleitung: 'Tu wallet son doce palabras. Quien las tenga, tiene tu saldo, y ' +
      'quien las pierda, lo pierde. Nadie puede restablecerlas: ni nosotros, ni ' +
      'Telegram, nadie.',
    bausteine: [
      { art: 'schritte', titel: 'Qué pasa en el dispositivo', punkte: [
        'Las palabras se guardan en el teléfono, cifradas con tu PIN.',
        'Un pago se construye y se firma por completo en el dispositivo.',
        'El servidor solo ve bytes ya terminados: no puede cambiar el importe ni el ' +
          'destinatario sin romper la firma.',
      ] },
      { art: 'absatz', text: 'El PIN protege frente a alguien que coja tu teléfono ' +
        'desbloqueado. Frente a un atacante decidido con acceso al dispositivo, la ' +
        'única protección es no guardar grandes cantidades en él.' },
      { art: 'absatz', text: 'El código QR de «Recibir» se genera en el dispositivo. ' +
        'Al enviar, puedes escanear el código de otro usuario con la cámara; la ' +
        'dirección se valida antes de usarse.' },
      { art: 'hinweis', tone: 'risk', text: 'Un pago enviado no se puede recuperar. ' +
        'Comprueba la dirección completa, no solo el principio y el final.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Nodo completo y pool',
    teaser: 'Varios nodos, primer pool activo: cómo encaja la red.',
    lesezeit: '3 min',
    einleitung: 'Un nodo completo descarga la cadena, verifica cada bloque por sí mismo y ' +
      'construye sus propios bloques. Ya funcionan varios nodos a la vez que se ' +
      'sincronizan por P2P: la cadena ya no depende de un único servidor.',
    bausteine: [
      { art: 'schritte', titel: 'Qué hace un nodo', punkte: [
        'Primero las cabeceras: descarga la cadena de otros nodos y verifica cadena y ' +
          'trabajo localmente antes de adoptar un bloque.',
        'Acepta transacciones en su mempool y entrega jobs a los mineros.',
        'Cuando un minero encuentra un bloque, el nodo lo envía y lo reparte a sus peers.',
        'Todo tiene límites: tamaños de mensaje, plazos y plazas por peer son fijos; ' +
          'un solo peer no puede sobrecargar un nodo.',
      ] },
      { art: 'absatz', text: 'El nodo funciona en cualquier máquina con Node 22; su ' +
        'almacenamiento es un único archivo SQLite. Cualquiera puede ejecutar el suyo y ' +
        'verificar la cadena sin tener que confiar en nadie.' },
      { art: 'schritte', titel: 'Minería en pool, cómo funciona', punkte: [
        'El pool nunca retiene dinero ajeno. El reparto se convierte en la coinbase del ' +
          'bloque (versión de consenso 2: coinbase con varios destinatarios).',
        'PPLNS: se pagan las últimas N unidades de trabajo, incluso entre bloques ' +
          'encontrados. El pool hopping no compensa.',
        'El reparto está en el bloque, verificable por cualquiera.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'En la pestaña «Minería» la app elige el pool con ' +
        'más plazas libres; en «Cambiar» eliges uno tú mismo. El pool informa de potencia, ' +
        'número de mineros y comisión antes de que empieces.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Primero estabilizar, luego crecer, después nuevas funciones.',
    lesezeit: '2 min',
    einleitung: 'Ninguna fecha que no se vaya a cumplir. En su lugar, estados que ' +
      'cualquiera puede comprobar en el explorador y en el código fuente.',
    bausteine: [
      { art: 'schritte', titel: 'Hecho', punkte: [
        'Cadena, wallet, transacciones en el bloque, minero en el teléfono.',
        'Comisión por byte y un mercado de comisiones basado en la cola real.',
        'Minería en pool con pago PPLNS directamente desde el bloque; selección de pool en las apps.',
        'P2P entre nodos completos; varios nodos independientes funcionan a la vez.',
        'App de Android con minería en segundo plano, como APK en GitHub.',
        'YSKAR Node Core 0.7.1 para Windows y Linux.',
      ] },
      { art: 'schritte', titel: 'Ahora', punkte: [
        'Estabilizar la red y corregir pequeños problemas.',
      ] },
      { art: 'schritte', titel: 'Previsto', punkte: [
        'Node Core: varias GPU a la vez, y después minería por GPU para AMD e Intel (OpenCL).',
        `Actualización de la red (soft fork) en el bloque ${z(7000)}.`,
        'YSKAR Wallet en Google Play.',
      ] },
      { art: 'schritte', titel: 'Más adelante', punkte: [
        'Minería Stratum, cuando la red haya alcanzado cierto tamaño.',
        'Canales de pago directos entre remitente y destinatario.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'El código es abierto. Cada paso de esta lista ' +
        'corresponde a un documento en el repositorio.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: '¿YSKAR es un airdrop o un tap-to-earn?',
    antwort: 'No. No hay nada que tocar y no se reparte nada. Los YSR solo ' +
      'nacen como reward de bloque por trabajo de cálculo real que el nodo ' +
      'ha vuelto a verificar.' },
  { frage: '¿Cuánto recibe mi teléfono?',
    antwort: 'En un pool recibes una parte de cada bloque que encuentra el pool, según tu trabajo: ' +
      'aproximadamente tu hashrate dividido por el del pool, por ' +
      `${REWARD} YSR, menos la comisión. La pestaña «Minería» calcula esta estimación con tus ` +
      'valores reales. En solo, todo depende de que tu dispositivo encuentre un bloque por sí mismo.' },
  { frage: '¿YSR tiene precio?',
    antwort: 'No. YSR no tiene precio y no se negocia en ningún exchange. Nadie debería minar ' +
      'esperando que eso cambie.' },
  { frage: '¿Qué pasa si pierdo mis doce palabras?',
    antwort: 'El saldo se pierde. No existe «olvidé mi contraseña»: ni nosotros ni ' +
      'Telegram podemos restaurar las palabras. Escríbelas en papel, no como captura de pantalla.' },
  { frage: '¿Quién opera la cadena?',
    antwort: 'Nadie en solitario. Varios nodos completos funcionan a la vez, se sincronizan ' +
      'por P2P y vuelven a verificar cada bloque por sí mismos. La app lee a través de un ' +
      'espejo; cualquiera puede ejecutar su propio nodo y entonces ni siquiera necesita eso.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-10-12',
    titel: 'Node Core 0.7.1 para Windows y Linux',
    text: 'El nodo de escritorio con wallet y minería se distribuye ahora en paquetes ' +
      'separados para Windows y Linux.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-30',
    titel: 'App de Android «YSKAR Wallet»',
    text: 'Notificaciones push para pagos entrantes, desbloquear y enviar con la huella, ' +
      'minería con la pantalla bloqueada. Como APK en GitHub, y la app ya está disponible en varios idiomas.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Nuevo diseño y escaneo QR',
    text: 'La app ahora muestra qué es YSKAR, y las direcciones se pueden escanear con la ' +
      'cámara al enviar.',
  },
  {
    datum: '2026-09-09',
    titel: 'La cadena ha arrancado',
    text: 'Bloque génesis minado, inscripción «proof, not promise». La minería está ' +
      'abierta a todos.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
