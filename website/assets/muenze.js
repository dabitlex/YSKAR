/*
 * yskar.app -- die YSKAR-Muenze im Fluchtpunkt des Warp, als echtes 3D-Modell.
 *
 * Three.js (assets/vendor, MIT). Das Y wird aus dem Pfad in zeichen.svg gelesen
 * und mit abgerundeter Kante extrudiert, der Muenzrand ist ein Drehkoerper.
 * Laeuft nur auf breiten Bildschirmen und nur, solange der Einstieg zu sehen ist.
 * Ohne WebGL bleibt die einfache CSS-Muenze stehen.
 */
let THREE, RoomEnvironment; // erst laden, wenn die Muenze wirklich gezeigt wird

const box = document.querySelector('.muenze3d');
const breit = window.matchMedia('(min-width: 1000px)');
const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const RUNDE_MS = 9000;
const NEIGUNG = 8 * Math.PI / 180;

// ---------------------------------------------------------------- Pfad -> Shapes
// zeichen.svg enthaelt nur M, C, L und Z (aus dem Nachzeichnen).
function formen(d, vb) {
  const [vx, vy, vw] = vb;
  const cx = vx + vw / 2, cy = vy + vw / 2, s = 1.12 / vw; // Y ist 56 % des Muenzdurchmessers (2)
  const P = (x, y) => [(x - cx) * s, -(y - cy) * s];
  const out = [];
  const tok = d.match(/[MCLZ]|-?\d*\.?\d+/g);
  let i = 0, form = null;
  const zahl = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { form = new THREE.Shape(); form.moveTo(...P(zahl(), zahl())); out.push(form); }
    else if (c === 'L') form.lineTo(...P(zahl(), zahl()));
    else if (c === 'C') { const a = P(zahl(), zahl()), b = P(zahl(), zahl()), e = P(zahl(), zahl()); form.bezierCurveTo(a[0], a[1], b[0], b[1], e[0], e[1]); }
    else if (c === 'Z') form.closePath();
  }
  return out;
}

// Verlauf wie im Logo: oben links hell, unten rechts tief.
function verlauf(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, pos = geo.attributes.position;
  const c0 = new THREE.Color('#63D8FF'), c1 = new THREE.Color('#2F7BFF'), c2 = new THREE.Color('#1B4FD1');
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const u = (pos.getX(k) - bb.min.x) / (bb.max.x - bb.min.x);
    const v = (bb.max.y - pos.getY(k)) / (bb.max.y - bb.min.y);
    const t = Math.min(1, Math.max(0, u * 0.35 + v * 0.65));
    if (t < 0.55) c.copy(c0).lerp(c1, t / 0.55); else c.copy(c1).lerp(c2, (t - 0.55) / 0.45);
    col.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// Profil des Muenzrands (r, z): erhabener Ring innen, gerundete Aussenkante.
function randProfil(H) {
  const p = [];
  const bogen = (cx, cy, r, a0, a1, n) => { for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; p.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a))); } };
  p.push(new THREE.Vector2(0.835, H));
  bogen(0.86, H, 0.025, Math.PI, Math.PI / 2, 6);          // Ring steigt an
  bogen(0.925, H, 0.025, Math.PI / 2, 0, 6);               // Ring faellt ab
  p.push(new THREE.Vector2(0.965, H));
  bogen(0.965, H - 0.035, 0.035, Math.PI / 2, 0, 8);       // Aussenkante oben
  bogen(0.965, -H + 0.035, 0.035, 0, -Math.PI / 2, 8);     // Aussenkante unten
  p.push(new THREE.Vector2(0.925 + 0.025, -H));
  bogen(0.925, -H, 0.025, 0, -Math.PI / 2, 6);
  bogen(0.86, -H, 0.025, -Math.PI / 2, -Math.PI, 6);
  p.push(new THREE.Vector2(0.835, -H));
  return p;
}

async function bauen() {
  THREE = await import('./vendor/three.module.min.js');
  ({ RoomEnvironment } = await import('./vendor/RoomEnvironment.js'));
  const svg = await fetch('/assets/img/zeichen.svg?v=1').then((r) => r.text());
  const d = /\bd="([^"]+)"/.exec(svg)[1];
  const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);

  const canvas = document.createElement('canvas');
  canvas.className = 'm-gl';
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0, 6.0);

  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-4, 3, 4); scene.add(key);
  const blau = new THREE.PointLight(0x63d8ff, 18, 12); blau.position.set(3, -2, 3); scene.add(blau);

  const H = 0.075; // halbe Dicke
  const muenze = new THREE.Group();

  const rand = new THREE.Mesh(
    new THREE.LatheGeometry(randProfil(H), 160),
    new THREE.MeshStandardMaterial({ color: 0x2f7bff, metalness: 0.9, roughness: 0.24, side: THREE.DoubleSide })
  );
  rand.rotation.x = Math.PI / 2;
  muenze.add(rand);

  const flaeche = new THREE.MeshStandardMaterial({ color: 0x0a1534, metalness: 0.55, roughness: 0.42 });
  for (const seite of [1, -1]) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.84, 160), flaeche);
    f.position.z = seite * H;
    if (seite < 0) f.rotation.y = Math.PI;
    muenze.add(f);
  }

  const geo = new THREE.ExtrudeGeometry(formen(d, vb), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.016, bevelSegments: 6, curveSegments: 28,
  });
  verlauf(geo);
  const logoMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.22, emissive: 0x1b4fd1, emissiveIntensity: 0.12 });
  for (const seite of [1, -1]) {
    const y = new THREE.Mesh(geo, logoMat);
    if (seite > 0) y.position.z = H + 0.01;
    else { y.rotation.y = Math.PI; y.position.z = -H - 0.01; }
    muenze.add(y);
  }

  const halter = new THREE.Group();
  halter.rotation.x = NEIGUNG;
  halter.add(muenze);
  scene.add(halter);

  function groesse() {
    const r = box.getBoundingClientRect();
    const s = Math.round(r.width * 1.5);
    renderer.setSize(s, s, false);
    canvas.style.width = canvas.style.height = s + 'px';
  }
  groesse();
  window.addEventListener('resize', groesse);

  box.appendChild(canvas);
  box.classList.add('gl');

  if (ruhig) { muenze.rotation.y = -24 * Math.PI / 180; renderer.render(scene, camera); return; }

  let sichtbar = true, start = null;
  new IntersectionObserver((es) => { sichtbar = es[0].isIntersecting; }).observe(box);
  renderer.setAnimationLoop((t) => {
    if (!sichtbar || !breit.matches) return;
    if (start === null) start = t;
    muenze.rotation.y = ((t - start) / RUNDE_MS) * Math.PI * 2;
    renderer.render(scene, camera);
  });
}

if (box && breit.matches && !navigator.connection?.saveData) bauen().catch(() => {});
