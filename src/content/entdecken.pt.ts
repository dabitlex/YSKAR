/**
 * Conteúdo da área "Descobrir" -- Português (Brasil).
 *
 * Dados puros, sem React. Os números vêm de src/lib/core/params.ts, para
 * que um artigo nunca afirme algo diferente da própria cadeia. A
 * formatação dos números vem de fora (idioma).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import { MAX_COINBASE_OUTPUTS } from '@/lib/core/params';
import { MAX_FEE_BPS } from '@/lib/pool/settlement';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhaltePt(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'O que é o YSKAR?',
    teaser: 'Uma cadeia PoW própria. Não é um token na blockchain de outro.',
    lesezeit: '2 min',
    einleitung: 'O YSKAR é uma criptomoeda Proof of Work independente, com cadeia ' +
      'própria, consenso próprio e miner próprio. Não existe nenhum smart contract ' +
      'chamado "YSKAR" em outra blockchain — a própria cadeia é o produto.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Rede', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '09/09/2026' },
        { label: 'Função de hash', wert: 'SHA-256d' },
        { label: 'Tempo de bloco', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'O bloco genesis carrega uma inscrição, e ela é a exigência ' +
        'para tudo o que vem depois: "proof, not promise". Nenhum valor é simulado. ' +
        'Seu aparelho calcula hashes reais, cada nó confere cada share por conta ' +
        'própria, e o seu saldo pode ser reconstruído só a partir dos blocos.' },
      { art: 'absatz', text: 'O uso é pelo Mini App do Telegram ou pelo app Android ' +
        '"YSKAR Wallet". A propriedade, porém, está nas chaves, não no Telegram: quem ' +
        'tem as doze palavras tem o saldo — com ou sem conta no Telegram.' },
      { art: 'hinweis', tone: 'dim', text: 'O YSKAR é um projeto, não um meio de pagamento. ' +
        'Vários full nodes verificam a cadeia de forma independente; cada bloco ' +
        'pode ser conferido no explorer.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Mineração no celular',
    teaser: 'Shares, dificuldade, blocos — como o seu aparelho participa.',
    lesezeit: '3 min',
    einleitung: 'Seu celular calcula hashes SHA-256d sobre um job da rede. ' +
      'É proof of work de verdade — e a dificuldade é escolhida de ' +
      'modo que um celular tenha uma chance real.',
    bausteine: [
      { art: 'schritte', titel: 'Como nasce um bloco', punkte: [
        'O nó entrega um job: o cabeçalho do próximo bloco, válido por 90 segundos.',
        'Seus workers testam nonces. Cada cálculo é um hash real.',
        'Um hash abaixo do alvo de share é um share. O nó o recalcula — ' +
          'sem trabalho não existe share válido.',
        'Se o hash ficar até abaixo da dificuldade do bloco, um bloco foi encontrado. ' +
          `O reward de ${REWARD} YSR vai para o seu endereço.`,
      ] },
      { art: 'absatz', text: 'A carga de cálculo (25–100 %) controla o quanto o seu ' +
        'aparelho é exigido. O número de workers segue os núcleos — a calibração ' +
        'encontra a melhor configuração para o seu celular.' },
      { art: 'absatz', text: 'No Telegram, a tela fica ligada enquanto minera — se ela ' +
        'bloquear, a plataforma pausa o worker. O app Android continua calculando com a ' +
        'tela bloqueada, visível na notificação que mostra o hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Novos usuários mineram em um pool; o modo solo continua ' +
        'disponível em "Mineração → Avançado". Em um pool, o próprio bloco paga todos os participantes — o ' +
        'operador nunca segura o dinheiro de ninguém.' },
    ],
  },
  {
    slug: 'pool-oder-solo', icon: 'Wuerfel', farbe: 'work',
    titel: 'Pool ou solo?',
    teaser: 'Partes pequenas e regulares, ou tudo ou nada.',
    lesezeit: '2 min',
    einleitung: `Em média, a cada ${Number(TARGET_BLOCK_TIME) / 60} minutos um miner da ` +
      `rede encontra um bloco de ${REWARD} YSR. A questão é como você quer receber pela sua parte.`,
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Pool', wert: 'partes pequenas, com regularidade' },
        { label: 'Solo', wert: 'bloco inteiro, raramente' },
      ] },
      { art: 'absatz', text: 'Em um pool, muitos aparelhos mineram juntos. Quando o pool encontra um bloco, ' +
        'o próprio bloco divide o reward pelo trabalho recente (PPLNS). Sua parte depende de quanto ' +
        'o seu hashrate soma ao poder do pool.' },
      { art: 'absatz', text: 'No solo, você fica com o bloco inteiro — mas só se o seu aparelho o encontrar ' +
        'sozinho. Um celular sozinho tem uma chance muito pequena por bloco contra a rede inteira; ' +
        'pode demorar muito até isso acontecer.' },
      { art: 'schritte', titel: 'O que você deve saber sobre pools', punkte: [
        `O operador define uma taxa entre 0 e ${MAX_FEE_BPS / 100} %; o app mostra a taxa antes de você começar.`,
        `Um pool só pode pagar um número limitado de miners por bloco (atualmente ${MAX_COINBASE_OUTPUTS - 1}). ` +
          'Se estiver cheio, você escolhe outro.',
        'Cada pagamento é público no bloco e no explorer.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Novos usuários mineram em um pool. Você muda para solo em ' +
        '"Mineração → Avançado".' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} por bloco, halving a cada ${z(EPOCH_BLOCKS)} blocos.`,
    lesezeit: '3 min',
    einleitung: 'Não há pré-venda, nem alocação para a equipe, nem airdrop. Cada YSR ' +
      'nasce como reward de bloco — para quem encontrou o bloco.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Oferta máx.', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward hoje', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `a cada ${z(EPOCH_BLOCKS)} blocos` },
        { label: 'Tempo de bloco', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} minutos` },
      ] },
      { art: 'balken', titel: 'Emissão ao longo do tempo', werte: [
        { label: `Época 1 · ${REWARD}`, anteil: 1 },
        { label: `Época 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Época 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Uma época são ${z(EPOCH_BLOCKS)} blocos, cerca de ${EPOCHE_TAGE} dias. ` +
        'Depois disso o reward cai pela metade.' },
      { art: 'absatz', text: `Uma season são ${z(SEASON_BLOCKS)} blocos, duas seasons formam uma ` +
        'época. O reward é dividido ao meio por um simples deslocamento de bits, sem ' +
        `arredondamento — por isso a oferta total fica logo abaixo de ${ysr(MAX_SUPPLY)}.` },
      { art: 'kennzahlen', werte: [
        { label: 'Taxa mínima', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Vagas por bloco', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Os números desta página vêm direto dos ' +
        'parâmetros de consenso da cadeia — não de um whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Carteira e segurança',
    teaser: 'Doze palavras, um PIN, assinatura no aparelho.',
    lesezeit: '2 min',
    einleitung: 'Sua carteira são doze palavras. Quem as tiver tem o seu saldo — ' +
      'e quem as perder, perde o saldo. Ninguém pode redefini-las: nem nós, nem o ' +
      'Telegram, ninguém.',
    bausteine: [
      { art: 'schritte', titel: 'O que acontece no aparelho', punkte: [
        'As palavras ficam guardadas no celular, criptografadas com o seu PIN.',
        'Um pagamento é montado e assinado inteiramente no aparelho.',
        'O servidor só vê bytes prontos — ele não consegue alterar o valor ou o ' +
          'destinatário sem quebrar a assinatura.',
      ] },
      { art: 'absatz', text: 'O PIN protege contra alguém pegar o seu celular desbloqueado. ' +
        'Contra um atacante determinado com acesso ao aparelho, a única proteção é ' +
        'não deixar valores altos nele.' },
      { art: 'absatz', text: 'O código QR em "Receber" é gerado no aparelho. Ao enviar, ' +
        'você pode escanear o código de outro usuário com a câmera — o endereço é ' +
        'validado antes de ser usado.' },
      { art: 'hinweis', tone: 'risk', text: 'Um pagamento enviado não pode ser desfeito. ' +
        'Confira o endereço por completo, não só o começo e o fim.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full node e pool',
    teaser: 'Vários nós, primeiro pool ativo — como a rede se encaixa.',
    lesezeit: '3 min',
    einleitung: 'Um full node busca a cadeia, verifica cada bloco por conta própria e ' +
      'monta seus próprios blocos. Vários nós já rodam ao mesmo tempo e se sincronizam ' +
      'por P2P — a cadeia não depende mais de um único servidor.',
    bausteine: [
      { art: 'schritte', titel: 'O que um nó faz', punkte: [
        'Cabeçalhos primeiro: ele busca a cadeia de outros nós e verifica cadeia e ' +
          'trabalho localmente antes de adotar um bloco.',
        'Ele aceita transações no seu mempool e distribui jobs aos miners.',
        'Quando um miner encontra um bloco, o nó o submete e o repassa aos seus peers.',
        'Tudo tem limite: tamanhos de mensagem, prazos e vagas por peer são fixos — ' +
          'um único peer não consegue sobrecarregar um nó.',
      ] },
      { art: 'absatz', text: 'O nó roda em qualquer máquina com Node 22; seu armazenamento ' +
        'é um único arquivo SQLite. Quem quiser pode rodar o seu próprio e verificar a ' +
        'cadeia sem precisar confiar em ninguém.' },
      { art: 'schritte', titel: 'Mineração em pool, como funciona', punkte: [
        'O pool nunca segura o dinheiro de ninguém. A divisão vira a coinbase do ' +
          'bloco (consenso versão 2: coinbase com vários destinatários).',
        'PPLNS: são pagas as últimas N unidades de trabalho — atravessando os blocos ' +
          'encontrados. Pool hopping não compensa.',
        'A divisão está no bloco, para qualquer um conferir.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Na aba "Mineração", o app escolhe o pool com ' +
        'mais vagas livres; em "Trocar" você escolhe um por conta própria. O pool mostra poder de cálculo, ' +
        'número de miners e taxa antes de você começar.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Primeiro estabilizar, depois crescer, depois novas funções.',
    lesezeit: '2 min',
    einleitung: 'Nenhuma data que não se sustente. Em vez disso, estados que qualquer um ' +
      'pode conferir no explorer e no código-fonte.',
    bausteine: [
      { art: 'schritte', titel: 'Concluído', punkte: [
        'Cadeia, carteira, transações no bloco, miner no celular.',
        'Taxa por byte e um mercado de taxas baseado na fila real.',
        'Mineração em pool com pagamento PPLNS direto do bloco; escolha de pool nos apps.',
        'P2P entre full nodes; vários nós independentes rodam ao mesmo tempo.',
        'App Android com mineração em segundo plano — como APK no GitHub.',
        'YSKAR Node Core 0.7.1 para Windows e Linux.',
      ] },
      { art: 'schritte', titel: 'Agora', punkte: [
        'Estabilizar a rede e corrigir pequenos problemas.',
      ] },
      { art: 'schritte', titel: 'Planejado', punkte: [
        'Node Core: várias GPUs ao mesmo tempo, depois mineração por GPU para AMD e Intel (OpenCL).',
        `Atualização da rede (soft fork) no bloco ${z(7000)}.`,
        'YSKAR Wallet no Google Play.',
      ] },
      { art: 'schritte', titel: 'Mais tarde', punkte: [
        'Mineração Stratum, quando a rede atingir um certo tamanho.',
        'Canais de pagamento diretos entre remetente e destinatário.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'O código é aberto. Cada passo aqui ' +
        'corresponde a um documento no repositório.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'O YSKAR é um airdrop ou tap-to-earn?',
    antwort: 'Não. Não há nada para tocar e nada é distribuído. YSR só nascem ' +
      'como reward de bloco por trabalho de cálculo real, conferido de novo pelo nó.' },
  { frage: 'Quanto o meu celular recebe?',
    antwort: 'Em um pool você recebe uma parte de cada bloco que o pool encontra, de acordo com o seu trabalho: ' +
      'aproximadamente o seu hashrate dividido pelo do pool, vezes ' +
      `${REWARD} YSR, menos a taxa. A aba "Mineração" calcula essa estimativa com os seus ` +
      'valores reais. No solo, tudo depende de o seu aparelho encontrar um bloco sozinho.' },
  { frage: 'O YSR tem preço?',
    antwort: 'Não. O YSR não tem preço e não é negociado em nenhuma exchange. Ninguém deve minerar ' +
      'esperando que isso mude.' },
  { frage: 'O que acontece se eu perder minhas doze palavras?',
    antwort: 'O saldo está perdido. Não existe "esqueci a senha": nem nós nem o ' +
      'Telegram podemos restaurar as palavras. Escreva-as em papel — não como captura de tela.' },
  { frage: 'Quem opera a cadeia?',
    antwort: 'Ninguém sozinho. Vários full nodes rodam ao mesmo tempo, se sincronizam ' +
      'por P2P e conferem cada bloco por conta própria. O app lê por meio de um ' +
      'espelho — quem quiser roda o próprio nó e nem precisa dele.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-10-12',
    titel: 'Node Core 0.7.1 para Windows e Linux',
    text: 'O nó de desktop com carteira e mineração agora vem em pacotes ' +
      'separados para Windows e Linux.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-30',
    titel: 'App Android "YSKAR Wallet"',
    text: 'Notificações push para recebimentos, desbloquear e enviar com a digital, ' +
      'mineração com a tela bloqueada. Como APK no GitHub — e o app agora está disponível em vários idiomas.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Novo design e leitura de QR',
    text: 'O app agora mostra o que é o YSKAR — e endereços podem ser escaneados ' +
      'com a câmera na hora de enviar.',
  },
  {
    datum: '2026-09-09',
    titel: 'A cadeia foi lançada',
    text: 'Bloco genesis minerado, inscrição "proof, not promise". A mineração ' +
      'está aberta a todos.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
