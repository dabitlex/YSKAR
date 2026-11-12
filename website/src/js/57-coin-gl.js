/*
 * Die Münze aus Glas, in Echtzeit gerechnet (WebGL): eine dicke Scheibe mit erhabenem Rand, vorn das Zeichen als Relief,
 * hinten die Inschrift aus Block 0. Jeder Bildpunkt schneidet seinen Sehstrahl mit dem Zylinder; das Relief kommt aus einer
 * Höhenkarte, die einmal aus dem Pfad des Zeichens bzw. aus dem Text gerechnet wird. Licht: ein kühles Hauptlicht von oben
 * links, ein warmes Lampenlicht von unten rechts. Ohne WebGL bleibt die gezeichnete Münze stehen (siehe 57-coin.js).
 */
var CoinGL = (function () {
  'use strict';

  function f(v) { var s = v.toFixed(5); return s.indexOf('.') < 0 ? s + '.0' : s; }
  function unit(x, y, z) { var l = Math.sqrt(x * x + y * y + z * z); return 'vec3(' + f(x / l) + ',' + f(y / l) + ',' + f(z / l) + ')'; }

  var L1 = unit(-0.50, 0.72, 0.62), L2 = unit(0.72, -0.50, 0.40), BOX = unit(-0.45, 0.62, 0.64), LAMP = unit(0.70, -0.46, 0.55);
  var VERT = 'attribute vec2 a;varying vec2 vQ;void main(){vQ=a;gl_Position=vec4(a,0.0,1.0);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 vQ;',
    'uniform mat3 uRot;',            // Münze -> Blick
    'uniform sampler2D uFront;', 'uniform sampler2D uBack;',
    'uniform float uPx;',            // Breite eines Bildpunkts in vQ-Einheiten
    'uniform vec2 uBump;',           // Steigung je Einheit der Karte: vorn, hinten
    'uniform vec2 uH;',              // Höhe des Reliefs in Radien: vorn, hinten
    'const float H = 0.092;',        // halbe Dicke bis zur Oberkante des Rands, Radius = 1
    'const float D = 5.4;',          // Abstand der Kamera
    'const float EXT = 1.19;',       // halbe Bildbreite in der Ebene der Münze
    'const float R1 = 0.760;', 'const float R2 = 0.880;',     // Innenflanke des Rands: breit und weich
    'const float RIMH = 0.050;',     // so tief liegt der Grund unter dem Rand
    'const vec3 L1 = ' + L1 + ';', 'const vec3 L2 = ' + L2 + ';',

    // gedachter Raum, der sich im Glas spiegelt: weiche Lichtfläche oben links, kühler Himmel, warmer Schein unten rechts
    'vec3 env(vec3 r) {',
    '  float sky = smoothstep(-0.25, 0.9, r.y);',
    '  float box = smoothstep(0.78, 0.97, dot(r, ' + BOX + '));',
    '  float lamp = smoothstep(0.86, 0.985, dot(r, ' + LAMP + '));',
    '  return vec3(0.30, 0.52, 0.98) * sky * 0.30 + vec3(0.92, 0.97, 1.0) * box * 0.70 + vec3(1.0, 0.76, 0.46) * lamp * 0.55;',
    '}',
    'vec4 tex(vec2 xy, float sgn) {',                        // Rückseite gespiegelt, damit die Schrift richtig steht
    '  vec2 uv = vec2(sgn * xy.x, -xy.y) * 0.5 + 0.5;',
    '  return sgn > 0.0 ? texture2D(uFront, uv) : texture2D(uBack, uv);',
    '}',
    'float depth(vec2 xy, float sgn, float hy) {',           // wie tief die Fläche hier unter der Oberkante des Rands liegt
    '  return max(RIMH * (1.0 - smoothstep(R1, R2, length(xy))) - tex(xy, sgn).b * hy, 0.0);',
    '}',

    'vec4 shade(vec2 q) {',
    '  vec3 rd = normalize(vec3(q * (EXT / D), -1.0));',
    '  vec3 o = vec3(0.0, 0.0, D) * uRot;',                 // Vektor mal Matrix = Rückdrehung in den Raum der Münze
    '  vec3 d = rd * uRot;',
    '  float tb = 1e9;',
    '  float kind = 0.0;',                                   // 1 Vorderseite, 2 Rückseite, 3 Rand
    '  if (abs(d.z) > 1e-5) {',
    '    float zc = d.z < 0.0 ? H : -H;',
    '    float t = (zc - o.z) / d.z;',
    '    vec2 pc = o.xy + d.xy * t;',
    '    if (t > 0.0 && dot(pc, pc) <= 1.0) { tb = t; kind = d.z < 0.0 ? 1.0 : 2.0; }',
    '  }',
    '  float a = dot(d.xy, d.xy);',
    '  if (a > 1e-6) {',
    '    float b = dot(o.xy, d.xy);',
    '    float c = dot(o.xy, o.xy) - 1.0;',
    '    float disc = b * b - a * c;',
    '    if (disc > 0.0) {',
    '      float t = (-b - sqrt(disc)) / a;',
    '      float z = o.z + d.z * t;',
    '      if (t > 0.0 && abs(z) <= H && t < tb) { tb = t; kind = 3.0; }',
    '    }',
    '  }',
    '  if (kind < 0.5) return vec4(0.0);',
    '  vec3 p = o + d * tb;',
    '  vec3 n;',
    '  float top = 0.0; float ao = 1.0; float rim = 0.0; float side = 0.0; float shadow = 0.0; float gloss = 0.0;',
    '  if (kind > 2.5) {',
    '    vec2 dir = normalize(p.xy);',
    '    float zr = p.z / H;',
    '    float ts = smoothstep(0.0, 1.0, abs(zr));',
    '    n = normalize(vec3(dir, sign(zr) * ts * 0.85));',  // zu den Flächen hin abgerundet
    '    side = 1.0;',
    '    gloss = ts;',
    '  } else {',
    '    float sgn = kind < 1.5 ? 1.0 : -1.0;',
    '    float hy = kind < 1.5 ? uH.x : uH.y;',
    // Relief: dem Sehstrahl von der Oberkante des Rands in die Tiefe folgen, bis er die Fläche trifft
    '    vec2 dxy = d.xy / max(abs(d.z), 0.24);',                       // streifend flacher rechnen: ruhiges Bild beim Wenden
    '    float s0 = 0.0;',
    '    float f0 = depth(p.xy, sgn, hy);',
    '    float s1 = 0.0;',
    '    float f1 = f0;',
    '    if (f0 > 0.0) {',
    '      for (int i = 1; i <= 8; i++) {',
    '        s1 = RIMH * float(i) / 8.0;',
    '        f1 = depth(p.xy + dxy * s1, sgn, hy) - s1;',
    '        if (f1 <= 0.0) break;',
    '        s0 = s1; f0 = f1;',
    '      }',
    '      s1 = mix(s0, s1, clamp(f0 / max(f0 - f1, 1e-5), 0.0, 1.0));',
    '    }',
    '    vec2 xy = p.xy + dxy * s1;',
    '    p.xy = xy;',
    '    float r = length(xy);',
    '    vec2 dir = xy / max(r, 1e-4);',
    '    float t1 = clamp((r - R1) / (R2 - R1), 0.0, 1.0);',
    '    float slope = 6.0 * t1 * (1.0 - t1) / (R2 - R1) * RIMH;',     // vom Grund hinauf auf den Rand
    '    float te = clamp((r - 0.885) / 0.115, 0.0, 1.0);',
    '    slope -= te * 1.25;',                                          // der Rand ist ein runder Wulst: gleich hinter dem Scheitel fällt er zur Kante ab
    '    vec2 g = dir * slope;',
    '    vec4 tx = tex(xy, sgn);',
    '    float bump = kind < 1.5 ? uBump.x : uBump.y;',
    '    vec2 tg = (tx.rg * 255.0 - 128.0) / 127.0 * bump;',
    '    g += vec2(sgn * tg.x, -tg.y);',
    '    n = normalize(vec3(-g, sgn));',
    '    gloss = clamp(length(g) * 1.3, 0.0, 1.0);',
    '    top = kind < 1.5 ? smoothstep(0.36, 0.64, tx.b) : smoothstep(0.44, 0.58, tx.b);',   // Schrift mit schärferer Kante
    '    rim = smoothstep(R1, R2, r);',
    '    ao = 1.0 - clamp((tx.a - tx.b) * 0.8, 0.0, 0.16);',            // etwas dunkler am Fuß des Reliefs
    '    ao *= 1.0 - 0.16 * smoothstep(R1 - 0.12, R1 + 0.01, r) * (1.0 - smoothstep(R1 + 0.01, R1 + 0.07, r));',
    '    vec3 lo = L1 * uRot;',                                         // Schlagschatten: vom Punkt aus zum Licht schauen
    '    float occ = tex(xy + lo.xy * hy * 1.1, sgn).b;',                // so weit, wie das Relief hoch ist
    '    shadow = smoothstep(0.25, 0.75, occ) * (1.0 - top);',
    '  }',
    '  vec3 nv = uRot * n;',
    '  vec3 v = -rd;',
    '  float wrap = clamp(dot(nv, L1) * 0.5 + 0.5, 0.0, 1.0);',         // Licht greift um den Körper: mattes Glas
    '  float ndv = max(dot(nv, v), 0.0);',
    '  float fres = pow(1.0 - ndv, 2.6);',
    '  float nh = max(dot(nv, normalize(L1 + v)), 0.0);',
    '  float sp1 = pow(nh, 120.0);',
    '  float sp2 = pow(nh, 18.0);',
    '  float sp3 = pow(nh, 44.0);',
    '  float nl2 = max(dot(nv, L2), 0.0);',
    '  float spw = pow(max(dot(nv, normalize(L2 + v)), 0.0), 36.0);',
    '  vec3 deep = vec3(0.11, 0.25, 0.86);',
    '  vec3 mid = vec3(0.23, 0.44, 0.98);',
    '  vec3 light = vec3(0.60, 0.81, 1.0);',
    '  vec3 col = mix(deep, mid, smoothstep(-0.05, 0.92, wrap));',     // die Fläche bleibt sattes Blau, auch wenn sie zum Licht zeigt
    '  col = mix(col, light, smoothstep(0.93, 1.0, wrap) * 0.30);',
    '  vec3 pv = uRot * p;',
    '  float ga = clamp(0.5 + 0.55 * dot(pv.xy, vec2(-0.57, 0.82)), 0.0, 1.0);',   // weiches Flächenlicht: zur Lichtseite hin heller
    '  col *= mix(0.78, 1.18, ga);',
    '  col = mix(col, col * vec3(1.14, 0.97, 1.03) + vec3(0.09, 0.03, 0.07), smoothstep(0.45, 1.0, ga) * 0.60);',   // Schimmer ins Flieder
    '  col *= ao * (1.0 - 0.20 * shadow);',
    '  vec3 raised = mix(vec3(0.70, 0.92, 1.0), vec3(0.50, 0.72, 1.0), clamp(0.5 - 0.9 * p.y + 0.3 * p.x, 0.0, 1.0));',   // das Zeichen: oben eisig, zum Fuß hin blauer
    '  col = mix(col, mix(col * 1.2, raised * (0.80 + 0.30 * ga), 0.72), top);',
    '  col = mix(col * vec3(0.80, 0.86, 0.98), col, max(top, rim));',   // der Grund liegt tiefer: satteres Blau
    '  col = mix(col, mix(col, vec3(0.72, 0.86, 1.0), 0.34), rim * (1.0 - side));',   // der Rand ist das hellste Glas
    '  float arc = dot(normalize(pv.xy + vec2(1e-4)), vec2(-0.57, 0.82));',           // am Rand entlang: zur Lichtseite Flieder, gegenüber Aqua
    '  col = mix(col, col * vec3(1.12, 0.94, 1.02) + vec3(0.06, 0.0, 0.05), max(rim, side) * smoothstep(0.1, 1.0, arc) * 0.50);',
    '  col = mix(col, col * vec3(0.92, 1.05, 1.0) + vec3(0.0, 0.04, 0.03), max(rim, side) * smoothstep(0.1, 1.0, -arc) * 0.45);',
    '  col = mix(col, mix(col, light, 0.55) * 1.08, side);',            // im Rand der Scheibe sammelt sich das Licht
    '  float far = clamp(0.5 + 0.5 * dot(pv.xy, vec2(0.57, -0.82)), 0.0, 1.0);',   // Licht wandert durchs Glas und tritt gegenüber am Rand aus
    '  col += vec3(0.30, 0.52, 0.85) * far * far * max(rim, side) * 0.30;',
    '  vec3 e = env(reflect(-v, nv));',
    '  col += e * (0.05 + 0.90 * fres);',                               // Spiegelungen streifend deutlich,
    '  col += e * gloss * 0.38;',                                       // und auf allen Rundungen
    '  col += fres * vec3(0.45, 0.70, 1.0) * 0.42;',
    '  col += sp2 * vec3(0.55, 0.76, 1.0) * 0.16;',
    '  col += sp1 * 0.55;',
    '  col += sp3 * gloss * 0.45;',
    '  float lampR = smoothstep(0.90, 0.995, dot(reflect(-v, nv), ' + LAMP + ')) * max(gloss, side);',
    '  col = mix(col, vec3(1.0, 0.82, 0.60), lampR * 0.60);',           // das warme Licht der Lampe spiegelt sich auf den Rundungen
    '  col += vec3(1.0, 0.74, 0.44) * spw * 0.5;',
    '  return vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}',
    'void main() {',                                                    // vier Strahlen je Bildpunkt: glatte Kanten
    '  vec4 c = shade(vQ + vec2(0.125, 0.375) * uPx) + shade(vQ + vec2(-0.375, 0.125) * uPx)',
    '         + shade(vQ + vec2(0.375, -0.125) * uPx) + shade(vQ + vec2(-0.125, -0.375) * uPx);',
    '  gl_FragColor = c * 0.25;',
    '}'
  ].join('\n');

  /** Weichzeichnen einer Fläche N×N mit wiederholtem Kastenfilter (nähert eine Glocke an); r in Bildpunkten. */
  function blur(src, N, r, passes) {
    r = Math.max(1, Math.round(r));
    var a = src, b = new Float32Array(N * N), w = 2 * r + 1, p, x, y, i, sum, row;
    for (p = 0; p < passes; p++) {
      for (y = 0; y < N; y++) {
        row = y * N; sum = 0;
        for (i = -r; i <= r; i++) sum += a[row + (i < 0 ? 0 : i > N - 1 ? N - 1 : i)];
        for (x = 0; x < N; x++) {
          b[row + x] = sum / w;
          sum += a[row + (x + r + 1 < N ? x + r + 1 : N - 1)] - a[row + (x - r > 0 ? x - r : 0)];
        }
      }
      if (a === src) a = new Float32Array(N * N);
      for (x = 0; x < N; x++) {
        sum = 0;
        for (i = -r; i <= r; i++) sum += b[(i < 0 ? 0 : i > N - 1 ? N - 1 : i) * N + x];
        for (y = 0; y < N; y++) {
          a[y * N + x] = sum / w;
          sum += b[(y + r + 1 < N ? y + r + 1 : N - 1) * N + x] - b[(y - r > 0 ? y - r : 0) * N + x];
        }
      }
    }
    return a;
  }

  /**
   * Höhenkarte aus einer Zeichnung (weiß auf schwarz): R, G = Steigung, B = Höhe, A = weit verwischte Höhe (für die Schatten am Fuß).
   * height: Höhe des Reliefs in Radien. Liefert die Karte und den Faktor, mit dem der Shader die Steigung zurückrechnet.
   */
  function relief(N, draw, rFine, rWide, height) {
    var c = document.createElement('canvas'); c.width = c.height = N;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.fillStyle = '#fff';
    draw(x, N);
    var px = x.getImageData(0, 0, N, N).data, n = N * N, m = new Float32Array(n), i, X, Y, g;
    for (i = 0; i < n; i++) m[i] = px[i * 4] / 255;
    var fine = blur(m, N, rFine, 3), wide = blur(m, N, rWide, 2);
    var gx = new Float32Array(n), gy = new Float32Array(n), max = 1e-6;
    for (Y = 1; Y < N - 1; Y++) for (X = 1; X < N - 1; X++) {
      i = Y * N + X;
      gx[i] = (fine[i + 1] - fine[i - 1]) * 0.5; gy[i] = (fine[i + N] - fine[i - N]) * 0.5;
      g = Math.abs(gx[i]); if (g > max) max = g;
      g = Math.abs(gy[i]); if (g > max) max = g;
    }
    var K = 0.98 / max, out = new Uint8Array(n * 4);
    for (i = 0; i < n; i++) {
      out[i * 4] = Math.round(gx[i] * K * 127 + 128);
      out[i * 4 + 1] = Math.round(gy[i] * K * 127 + 128);
      out[i * 4 + 2] = Math.round(fine[i] * 255);
      out[i * 4 + 3] = Math.round(wide[i] * 255);
    }
    return { data: out, n: N, bump: height * N / (2 * K), h: height };
  }

  /** Verbindet die Fläche mit WebGL. Liefert null, wenn das Gerät es nicht kann. */
  function mount(canvas, onRestore) {
    var gl = null, prog, loc, texF, texB, relF = null, relB = null;
    var opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var N = coarse ? 512 : 1024, q = 1;

    function upload(unitNo, tex, rel) {
      gl.activeTexture(gl.TEXTURE0 + unitNo); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rel.n, rel.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, rel.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);     // ohne Stufen: die Karte wird in Schleifen gelesen
    }
    function make() {
      gl = null;
      try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
      if (!gl) return false;
      try {
        var sh = function (type, src) {
          var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader');
          return s;
        };
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'Programm');
      } catch (e) {
        if (window.console) console.warn('[YSKAR] Münze: WebGL nicht nutzbar, die gezeichnete Fassung bleibt.', e);
        gl = null; return false;
      }
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      loc = { rot: gl.getUniformLocation(prog, 'uRot'), px: gl.getUniformLocation(prog, 'uPx'), bump: gl.getUniformLocation(prog, 'uBump'), h: gl.getUniformLocation(prog, 'uH') };
      gl.uniform1i(gl.getUniformLocation(prog, 'uFront'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'uBack'), 1);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      texF = gl.createTexture(); texB = gl.createTexture();
      var blank = { data: new Uint8Array([128, 128, 0, 0]), n: 1, bump: 0, h: 0 };
      upload(0, texF, relF || blank); upload(1, texB, relB || blank);
      return true;
    }
    if (!make()) return null;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); gl = null; });
    canvas.addEventListener('webglcontextrestored', function () { if (make() && onRestore) onRestore(); });

    return {
      /** Vorderseite: das Zeichen aus seinem SVG-Pfad (viewBox 187.5 184 879 879). */
      front: function (pathData) {
        relF = relief(N, function (x, n) {
          var s = n * 0.545 / 879;
          x.save(); x.translate(n * 0.5 - (187.5 + 439.5) * s, n * 0.512 - (184 + 439.5) * s); x.scale(s, s);
          x.fill(new Path2D(pathData)); x.restore();
        }, N * 0.0075, N * 0.024, 0.042);
        if (gl) upload(0, texF, relF);
      },
      /** Rückseite: drei Zeilen Schrift. */
      back: function (lines) {
        relB = relief(N, function (x, n) {
          var fam = '"Geist Mono",ui-monospace,Menlo,Consolas,monospace';
          x.textAlign = 'center'; x.textBaseline = 'alphabetic';
          x.font = '500 ' + (n * 0.050).toFixed(1) + 'px ' + fam; x.fillText(lines[0], n * 0.5, n * 0.400);
          x.font = '500 ' + (n * 0.071).toFixed(1) + 'px ' + fam; x.fillText(lines[1], n * 0.5, n * 0.527);
          x.font = '500 ' + (n * 0.050).toFixed(1) + 'px ' + fam; x.fillText(lines[2], n * 0.5, n * 0.638);
        }, N * 0.0016, N * 0.008, 0.013);
        if (gl) upload(1, texB, relB);
      },
      /** Größe der Zeichenfläche: css = Kantenlänge in CSS-Pixeln. */
      resize: function (css) {
        var dpr = Math.min(3, window.devicePixelRatio || 1), side = Math.max(96, Math.round(Math.min(css * dpr, coarse ? 660 : 1040) * q));
        if (canvas.width !== side) { canvas.width = side; canvas.height = side; }
      },
      /** Güte 1 = volle Auflösung. Dauert ein Bild zu lang, senkt der Aufrufer sie; die Fläche wird dann kleiner gerechnet und vergrößert gezeigt. */
      quality: function (v) { if (v !== undefined) q = Math.max(0.45, Math.min(1, v)); return q; },
      /** Zeichnet die Münze. Winkel in Grad: erst um die eigene Achse (rz), dann wenden (ry), dann neigen (rx). */
      draw: function (rx, ry, rz) {
        if (!gl) return;
        var k = Math.PI / 180, cx = Math.cos(rx * k), sx = Math.sin(rx * k), cy = Math.cos(ry * k), sy = Math.sin(ry * k), cz = Math.cos(rz * k), sz = Math.sin(rz * k);
        // R = Rx · Ry · Rz, spaltenweise übergeben
        gl.uniformMatrix3fv(loc.rot, false, [
          cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz,
          -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz,
          sy, -sx * cy, cx * cy]);
        gl.uniform1f(loc.px, 2 / canvas.width);
        gl.uniform2f(loc.bump, relF ? relF.bump : 0, relB ? relB.bump : 0);
        gl.uniform2f(loc.h, relF ? relF.h : 0, relB ? relB.h : 0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      alive: function () { return !!gl; }
    };
  }
  return { mount: mount };
})();
