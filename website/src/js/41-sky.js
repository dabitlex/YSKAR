/*
 * Der Himmel über dem Fjord: drei Bänder aus Licht (WebGL) und die Lichter am Ufer.
 *
 * Das Foto liegt als <img> im Bild, das Licht wird darüber addiert. Damit Bänder hinter den Bergen
 * verschwinden und sich im Wasser spiegeln, kennt der Shader die Lage des Fotos (uSq) und eine kleine
 * Maske (Rot: Himmel, Grün: Wasser, Blau: Nebel).
 *
 * Die Lichter am Ufer sind kein Schmuck: ihre Zahl ist die Zahl der Knoten, die sich gerade gemeldet haben.
 */
var Sky = (function () {
  'use strict';
  // Ausschnitte des quadratischen Originals (2048 x 2048), wie tools/imgprep.py sie schneidet
  var CROP = { w: { x: 0, y: 396, w: 2048, h: 1366 }, p: { x: 448, y: 0, w: 1152, h: 2048 } }, SQ = 2048;
  var stage, inner, canvas, gl, prog, uni = {}, lightsBox, lights = [], wanted = 0;
  var geo = { left: 0, top: 0, size: 1, W: 1, H: 1 }, res = 0.5, raf = 0, onScreen = true, calm = false, ok = false;
  var state = { power: 0, reveal: 0, shift: 0, t0: 0 }, shiftTo = 0;

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec3 uSq;uniform float uH;uniform float uT;uniform float uPower;uniform float uReveal;uniform float uShift;uniform sampler2D uMask;',
    'float hash(float n){return fract(sin(n)*43758.5453123);}',
    'float n1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(hash(i),hash(i+1.),f);}',
    'float fbm(float x){return n1(x)*.55+n1(x*2.03+11.3)*.3+n1(x*4.01+3.7)*.15;}',
    // ein Band: ein Vorhang aus Licht. Untere Kante scharf und hell, nach oben in feinen Strahlen ausklingend;
    // wo der Vorhang sich faltet (steile Kante), liegt mehr Licht hintereinander.
    'float edgeAt(float u,float t,float sd,float base,float amp){',
    ' return base+amp*(sin(u*10.5+t*.09+sd*2.3)+.5*sin(u*23.+sd*5.1-t*.13)+.1*sin(u*47.+t*.21+sd*9.))+.012*(fbm(u*14.+t*.15+sd*13.)-.5);}',
    // soft = 0: der Vorhang am Himmel; soft = 1: sein weiches Spiegelbild im Wasser (ohne Strahlen, breiter Saum)
    'vec3 band(float u,float h,float t,float sd,float base,float amp,float len,vec3 lo,vec3 hi,float soft){',
    ' float b=edgeAt(u,t,sd,base,amp);',
    ' float d=h-b;',
    ' if(d<-.06||d>len*2.4)return vec3(0.);',
    ' float fold=abs(edgeAt(u+.004,t,sd,base,amp)-b)/.004;',
    ' float rays=mix(pow(fbm(u*78.+t*.3+sd*31.),2.2)*2.1,.9,soft);',
    ' float clump=smoothstep(.3,.72,fbm(u*4.2-t*.04+sd*7.7));',
    ' float rev=smoothstep(0.,.4,uReveal*1.5-abs(u-.5-sd*.05)*1.2);',
    ' float reach=len*(.55+.75*rays);',
    ' float w=mix(.0085,.03,soft);',
    ' float body=smoothstep(-w,w,d)*exp(-max(d,0.)/reach*2.6)*(.2+.62*rays)*(.3+clump);',
    ' float hem=exp(-abs(d)/w)*(.3+.5*clump)*(.55+min(fold,2.)*.35)*mix(1.,.5,soft);',
    ' float fade=mix(smoothstep(.015,.075,h),1.,soft);',
    ' return (mix(lo,hi,clamp(d/len,0.,1.))*body+mix(lo,vec3(.72,.95,1.),.35)*hem)*rev*fade;}',
    'vec3 sky(float u,float h,float t,float soft){',
    ' vec3 c=band(u,h,t,1.,.115,.030,.10,vec3(.30,.84,1.),vec3(.14,.40,1.),soft);',
    ' c+=band(u,h,t,2.,.185,.036,.12,vec3(.22,.62,1.),vec3(.20,.24,.95),soft)*.85;',
    ' c+=band(u,h,t,3.,.250,.028,.09,vec3(.38,.90,.98),vec3(.16,.50,1.),soft)*.6;',
    ' return c*.85;}',
    'void main(){',
    ' vec2 px=vec2(gl_FragCoord.x,uH-gl_FragCoord.y);',
    ' vec2 uv=(px-uSq.xy)/uSq.z;',
    ' vec3 m=texture2D(uMask,clamp(uv,0.,1.)).rgb;',
    ' float t=uT;float u=uv.x+uShift;',
    ' vec3 c=sky(u,.555-uv.y,t,0.)*m.r;',
    // Spiegelung im Wasser: gestaucht, leicht verwackelt, schwächer
    ' if(m.g>.01){',
    '  float hw=(uv.y-.598)*1.15;',
    '  float ur=u+sin(uv.y*190.+t*1.1)*.004*(.4+hw*6.)+sin(uv.y*53.-t*.6)*.005;',
    '  c+=sky(ur,hw*.8+.04,t,1.)*m.g*.42*(1.-m.b*.4);',
    ' }',
    ' c*=uPower;',
    ' c+=(hash(px.x*.37+px.y*91.7+t)-.5)*.012*step(.004,c.g);',
    ' gl_FragColor=vec4(max(c,0.),0.);}'      // Alpha 0 mit vormultiplizierten Farben: das Licht wird zum Foto addiert
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  function setupGL() {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uSq', 'uH', 'uT', 'uPower', 'uReveal', 'uShift', 'uMask'].forEach(function (n) { uni[n] = gl.getUniformLocation(prog, n); });
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    var img = new Image();
    img.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      draw(true);
    };
    img.src = Img.url('fjord-mask');
    gl.uniform1i(uni.uMask, 0);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ok = false; });
    return true;
  }

  /** Lage des Fotos auf der Bühne (object-fit: cover, mittig). */
  function measure() {
    var W = inner.clientWidth, H = inner.clientHeight; if (!W || !H) return false;
    var c = CROP[Img.orient()], s = Math.max(W / c.w, H / c.h);
    geo.W = W; geo.H = H; geo.size = SQ * s;
    geo.left = (W - c.w * s) / 2 - c.x * s; geo.top = (H - c.h * s) / 2 - c.y * s;
    if (ok) {
      res = W > 900 ? 0.45 : 0.5;
      var cw = Math.max(2, Math.round(W * res)), ch = Math.max(2, Math.round(H * res));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
    }
    place();
    return true;
  }
  function draw(force) {
    if (!ok || !gl) return;
    if (!force && state.power < 0.004) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    var t = calm ? 37.0 : (performance.now() - state.t0) / 1000 + 20;
    gl.uniform3f(uni.uSq, geo.left * res, geo.top * res, geo.size * res);
    gl.uniform1f(uni.uH, canvas.height); gl.uniform1f(uni.uT, t);
    gl.uniform1f(uni.uPower, state.power); gl.uniform1f(uni.uReveal, state.reveal); gl.uniform1f(uni.uShift, state.shift);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  var skip = false;
  function loop() {
    raf = 0;
    if (!onScreen || document.hidden || Router.current() !== 'home') return;
    skip = !skip;
    state.shift += (shiftTo - state.shift) * 0.05;
    if (!skip) draw();                       // jedes zweite Bild genügt: das Licht bewegt sich langsam
    raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf && ok && !calm) raf = requestAnimationFrame(loop); else if (calm) draw(true); }

  /* ---------- Lichter am Ufer ---------- */
  // feste Plätze am fernen Ufer (Anteile des quadratischen Originals), aus einem festen Zufallsstrom
  var SPOTS = (function () {
    var out = [], seed = 20260909, i;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var groups = [[0.415, 0.05], [0.525, 0.032], [0.615, 0.045], [0.355, 0.022], [0.655, 0.018]];
    for (i = 0; i < 60; i++) {
      var g = groups[i % 3 === 0 ? (i % 5) : (i % 3)], x = g[0] + (rnd() + rnd() + rnd() - 1.5) * g[1] * 1.6;
      x = Math.min(0.672, Math.max(0.328, x));
      // das Ufer liegt in der Talmitte etwas höher (weiter weg) als an den Seiten
      var y = 0.5805 - 0.0045 * Math.exp(-Math.pow((x - 0.52) / 0.07, 2)) + (rnd() - 0.5) * 0.0045;
      out.push({ x: x, y: y, s: 0.75 + rnd() * 0.9, d: 2.2 + rnd() * 3.4, o: 0.72 + rnd() * 0.28 });
    }
    return out;
  })();
  function place() {
    lights.forEach(function (l) {
      var sp = l._sp;
      l.style.left = (geo.left + sp.x * geo.size).toFixed(1) + 'px';
      l.style.top = (geo.top + sp.y * geo.size).toFixed(1) + 'px';
    });
  }
  function setLights(n, animate) {
    if (!lightsBox) return;
    n = Math.max(0, Math.min(SPOTS.length - 1, n | 0));
    wanted = n;
    var unit = Math.max(2.7, Math.min(4.2, geo.size / 560));       // Lichtgröße folgt der Bildgröße
    while (lights.length < n + 1) {
      var sp = SPOTS[lights.length], el = document.createElement('i');
      el.className = 'light'; el._sp = sp;
      el.style.setProperty('--s', (unit * sp.s).toFixed(2) + 'px');
      el.style.setProperty('--d', sp.d.toFixed(2) + 's'); el.style.setProperty('--o', sp.o.toFixed(2));
      lightsBox.appendChild(el); lights.push(el);
    }
    place();
    lights.forEach(function (l, i) {
      var on = i < n, next = i === n;
      l.classList.toggle('is-next', next);
      if (!animate || calm) { l.classList.toggle('on', on); return; }
      if (on && !l.classList.contains('on')) setTimeout(function () { l.classList.add('on'); }, 500 + Math.random() * 2600);
      else if (!on) l.classList.remove('on');
    });
  }
  function nodes() { return Number(Live.S.summary.knoten || 0); }

  function init() {
    stage = document.getElementById('stage'); if (!stage) return;
    inner = U.$('.stage__inner', stage); canvas = document.getElementById('sky'); lightsBox = document.getElementById('lights');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    state.t0 = performance.now();
    try { ok = setupGL(); } catch (e) { ok = false; }
    stage.classList.toggle('no-gl', !ok);
    measure();
    if (calm) { state.power = 1; state.reveal = 1; }
    var ro = window.ResizeObserver ? new ResizeObserver(function () { measure(); draw(true); }) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', function () { measure(); draw(true); });
    U.on('orient', function () { measure(); draw(true); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (l) { onScreen = l[0].isIntersecting; if (onScreen) wake(); }).observe(stage);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
    U.on('route', function (r) { if (r.page === 'home') { measure(); wake(); } });
    U.on('data', function () { if (lights.length) setLights(nodes(), true); });
    // Mauszeiger verschiebt die Bänder ein wenig (nur mit Maus)
    if (window.matchMedia && window.matchMedia('(pointer:fine)').matches && !calm) {
      window.addEventListener('pointermove', function (e) { shiftTo = (e.clientX / window.innerWidth - 0.5) * 0.03; }, { passive: true });
    }
    wake();
  }
  return {
    init: init, state: state, draw: draw, wake: wake, SPOTS: SPOTS,
    lightUp: function (animate) { setLights(nodes(), animate); },
    ok: function () { return ok; }
  };
})();
