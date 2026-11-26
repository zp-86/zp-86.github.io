/* Desk scene (three.js 0.169) */
import * as THREE from 'three';

const root = document.documentElement;
const WB = window.WB;
const stage = document.querySelector('.stage');
const canvas = document.getElementById('gl');
const MAT_Y = 0.3;
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const SERIF = 'Newsreader, Georgia, serif';

if (WB && stage && canvas && !root.classList.contains('no-gl')) init().catch(err => { console.warn('workbench:', err && err.message); root.classList.add('no-gl'); });

function mulberry(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry(86);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const smooth = e => e * e * (3 - 2 * e);

async function init(){
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { root.classList.add('no-gl'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const fontsReady = Promise.race([
    Promise.all(['italic 400 80px Newsreader', '400 80px Newsreader', '500 30px "JetBrains Mono"', '600 30px "JetBrains Mono"'].map(f => document.fonts.load(f))),
    new Promise(r => setTimeout(r, 2500))
  ]).catch(() => {});
  const trackReady = import('./forza-track.js').then(m => m.default).catch(() => null);
  const lapsReady = import('./forza-laps.js').then(m => m.default).catch(() => null);
  const globeReady = import('./globe.js').then(m => m.createGlobe({ radius: 6, anisotropy: aniso })).catch(err => { console.warn('globe:', err && err.message); return null; });
  const [, track, lapData] = await Promise.all([fontsReady, trackReady, lapsReady]);

  // ---------- helpers ----------
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const tx = (c, color = true) => { const t = new THREE.CanvasTexture(c); if (color) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
  function rr(w, h, r){
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    return s;
  }
  function flat(w, h, r, seg = 10){
    const g = new THREE.ShapeGeometry(rr(w, h, r), seg);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    g.rotateX(-Math.PI / 2);
    return g;
  }
  const shadowy = o => { o.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } }); return o; };
  function radial(size, stops){
    const [c, x] = cv(size, size); const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, size, size); return c;
  }
  function paperNoise(x, w, h, n, a){
    for (let i = 0; i < n; i++){ x.fillStyle = rnd() < 0.5 ? `rgba(90,70,40,${a * rnd()})` : `rgba(255,255,255,${a * rnd()})`; x.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
  }
  const loadImg = (mat, url) => new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; mat.map = t; mat.needsUpdate = true; });

  // ---------- scene ----------
  const ROOM = new THREE.Color(getComputedStyle(root).getPropertyValue('--room').trim() || '#050a14');
  const scene = new THREE.Scene();
  scene.background = ROOM;
  scene.fog = new THREE.Fog(ROOM, 140, 330);
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 700);

  // dim environment for reflections: a dark room, one cool softbox (the lamp) and a turquoise strip
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ color: 0x060c18, side: THREE.BackSide })));
    const box = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.6, 6.6), side: THREE.DoubleSide }));
    box.position.set(-6, 40, 12); box.lookAt(0, 0, 0); env.add(box);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(70, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.3, 1.2), side: THREE.DoubleSide }));
    strip.position.set(0, 8, -44); env.add(strip);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: 0x0a1a30, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6; env.add(floor);
    scene.environment = pm.fromScene(env, 0.035).texture;
    scene.environmentIntensity = 0.42;
    pm.dispose();
  }

  // lights: one hard lamp pool, almost nothing else
  scene.add(new THREE.HemisphereLight(0x27467a, 0x03060c, 0.05));
  const lamp = new THREE.SpotLight(0xe2ecff, 14000, 0, 0.34, 0.9, 2);
  const LAMP_BASE = new THREE.Vector3(0, 60, 12);
  lamp.position.copy(LAMP_BASE);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 20; lamp.shadow.camera.far = 150;
  lamp.shadow.bias = -0.0003; lamp.shadow.normalBias = 0.04;
  scene.add(lamp, lamp.target);
  const rim = new THREE.SpotLight(0x3fd6c8, 0.8, 0, 0.42, 0.6, 0); rim.position.set(30, 26, -80); rim.target.position.set(8, 4, 0); scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight(0x7f9cd0, 0.07); fill.position.set(40, 20, 60); scene.add(fill);

  // ---------- cutting mat ----------
  function matTexture(){
    const P = 24, W = 90 * P, H = 60 * P, [c, x] = cv(W, H);
    const g = x.createRadialGradient(W * .5, H * .45, 60, W * .5, H * .5, W * .62);
    g.addColorStop(0, '#10294a'); g.addColorStop(.6, '#0c2140'); g.addColorStop(1, '#071630'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 16000; i++){ x.fillStyle = rnd() < .5 ? `rgba(140,190,235,${.02 + rnd() * .03})` : `rgba(0,6,16,${.05 + rnd() * .06})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    const L = 3, R = 87, T = 3, B = 54;
    const line = (x1, y1, x2, y2, w, a) => { x.strokeStyle = `rgba(63,214,200,${a})`; x.lineWidth = w; x.beginPath(); x.moveTo(x1 * P, y1 * P); x.lineTo(x2 * P, y2 * P); x.stroke(); };
    for (let i = L; i <= R; i++){ const k = i - L; line(i, T, i, B, k % 5 ? 1 : 2, k % 10 === 0 ? .3 : k % 5 === 0 ? .2 : .1); }
    for (let j = T; j <= B; j++){ const k = B - j; line(L, j, R, j, k % 5 ? 1 : 2, k % 10 === 0 ? .3 : k % 5 === 0 ? .2 : .1); }
    x.strokeStyle = 'rgba(63,214,200,.45)'; x.lineWidth = 3; x.strokeRect(L * P, T * P, (R - L) * P, (B - T) * P);
    x.strokeStyle = 'rgba(110,235,222,.8)';
    for (let mm = 0; mm <= (R - L) * 10; mm++){
      const xx = (L + mm / 10) * P, len = mm % 10 === 0 ? .95 : mm % 5 === 0 ? .62 : .36;
      x.lineWidth = mm % 10 === 0 ? 2 : 1; x.beginPath(); x.moveTo(xx, 55 * P); x.lineTo(xx, (55 + len) * P); x.stroke();
    }
    x.fillStyle = 'rgba(130,240,228,.9)'; x.font = `500 ${Math.round(.5 * P)}px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'top';
    for (let cm = 0; cm <= R - L; cm++) x.fillText(String(cm), (L + cm) * P, 56.15 * P);
    for (let mm = 0; mm <= (B - T) * 10; mm++){
      const yy = (B - mm / 10) * P, len = mm % 10 === 0 ? .9 : mm % 5 === 0 ? .55 : .3;
      x.lineWidth = mm % 10 === 0 ? 2 : 1; x.beginPath(); x.moveTo(L * P - 2, yy); x.lineTo((L - len) * P, yy); x.stroke();
    }
    x.textAlign = 'right'; x.textBaseline = 'middle'; x.font = `500 ${Math.round(.42 * P)}px ${MONO}`;
    for (let cm = 5; cm <= B - T; cm += 5) x.fillText(String(cm), (L - 1.1) * P, (B - cm) * P);
    x.save(); x.translate(R * P, T * P);
    for (const deg of [15, 30, 45, 60, 75]){
      const a = deg * Math.PI / 180, main = deg === 45;
      x.strokeStyle = `rgba(63,214,200,${main ? .55 : .32})`; x.lineWidth = main ? 2.5 : 1.4; x.setLineDash(deg % 30 === 0 || main ? [] : [12, 9]);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(-Math.cos(a) * 26 * P, Math.sin(a) * 26 * P); x.stroke();
      x.setLineDash([]); x.fillStyle = 'rgba(120,238,226,.75)'; x.font = `600 ${Math.round(.55 * P)}px ${MONO}`; x.textAlign = 'center';
      x.fillText(deg + '°', -Math.cos(a) * 23.5 * P, Math.sin(a) * 23.5 * P - .7 * P);
    }
    for (const r of [8, 16, 24]){ x.strokeStyle = 'rgba(63,214,200,.3)'; x.lineWidth = 1.4; x.beginPath(); x.arc(0, 0, r * P, Math.PI / 2, Math.PI); x.stroke(); }
    x.restore();
    for (let i = 0; i < 70; i++){
      const sx = rnd() * W, sy = rnd() * H, l = (1 + rnd() * 7) * P, a = rnd() * Math.PI;
      x.strokeStyle = `rgba(170,215,240,${.04 + rnd() * .05})`; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
    }
    return tx(c);
  }
  const [nc, nx] = cv(256, 256);
  { const id = nx.createImageData(256, 256); for (let i = 0; i < id.data.length; i += 4){ const v = 110 + rnd() * 50; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } nx.putImageData(id, 0, 0); }
  const noiseTex = new THREE.CanvasTexture(nc); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.repeat.set(14, 9);

  const matTop = new THREE.MeshStandardMaterial({ map: matTexture(), roughness: .9, metalness: 0, bumpMap: noiseTex, bumpScale: .6, envMapIntensity: .07 });
  const matEdge = new THREE.MeshStandardMaterial({ color: 0x0a1a30, roughness: .9 });
  const mat = new THREE.Mesh(new THREE.BoxGeometry(90, MAT_Y, 60), [matEdge, matEdge, matTop, matEdge, matEdge, matEdge]);
  mat.position.y = MAT_Y / 2; mat.receiveShadow = true; scene.add(mat);
  const deskTop = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: .85, metalness: 0, envMapIntensity: .04 }));
  deskTop.rotation.x = -Math.PI / 2; deskTop.receiveShadow = true; scene.add(deskTop);

  const blobTex = new THREE.CanvasTexture(radial(256, [[0, 'rgba(0,0,0,1)'], [.45, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,0)']]));
  function blob(w, d, a){
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: a, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 1; m.userData.a = a; return m;
  }
  const glowTex = new THREE.CanvasTexture(radial(128, [[0, 'rgba(255,255,255,1)'], [.25, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]));

  // ---------- iPhone (two of them) ----------
  const glareTex = (() => { const [c, x] = cv(256, 256); const g = x.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.42, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(.58, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c); })();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x05070b, roughness: .06, metalness: .15, envMapIntensity: 1.5 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x8a95a6, roughness: .22, metalness: 1, envMapIntensity: 1.8 });
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: .25, metalness: 0 });
  const islandMat = new THREE.MeshStandardMaterial({ color: 0x020304, roughness: .3 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2e, roughness: .05, metalness: .3, envMapIntensity: 2 });
  // screen image with its corners cut to a rounded rect (alpha), so crop edges never show
  function roundedScreen(mat, url, radius){
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight, [c, x] = cv(w, h), r = radius * w;
      x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, r) : x.rect(0, 0, w, h); x.clip();
      x.drawImage(img, 0, 0, w, h);
      const t = tx(c); mat.map = t; mat.transparent = true; mat.needsUpdate = true;
    };
    img.src = url;
  }
  function buildPhone(url, opt = {}){
    const g = new THREE.Group();
    const W = 7.15, H = 14.7, D = 0.8, bt = 0.14;
    const geo = new THREE.ExtrudeGeometry(rr(W - .24, H - .24, 1.02), { depth: D - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: .12, bevelSegments: 6, curveSegments: 18 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, bt, 0);
    g.add(new THREE.Mesh(geo, [glassMat, bandMat]));
    const bezel = new THREE.Mesh(flat(6.86, 14.4, .98, 12), bezelMat); bezel.position.y = D + .004; g.add(bezel);
    const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.1, .12, .16), toneMapped: false });
    if (opt.round) roundedScreen(screenMat, url, opt.round); else loadImg(screenMat, url);
    screenMat.color.set(0xffffff);
    const scr = new THREE.Mesh(flat(6.5, 14.06, .84, 12), screenMat); scr.position.y = D + .008; g.add(scr);
    const cover = new THREE.Mesh(flat(6.9, 14.45, 1.0, 12), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: .04, metalness: 0, transparent: true, opacity: .2, depthWrite: false, envMapIntensity: 1.1 })); cover.position.y = D + .02; g.add(cover);
    const glare = new THREE.Mesh(flat(6.9, 14.45, 1.0, 12), new THREE.MeshBasicMaterial({ map: glareTex, transparent: true, opacity: .16, depthWrite: false, blending: THREE.AdditiveBlending })); glare.position.y = D + .03; g.add(glare);
    if (opt.island !== false){
      const isl = new THREE.Mesh(flat(1.9, .54, .27, 8), islandMat); isl.position.set(0, D + .014, -6.6); g.add(isl);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .01, 16), lensMat); lens.position.set(.56, D + .022, -6.6); g.add(lens);
    }
    [[-W / 2 - .02, -3.6, 1.0], [-W / 2 - .02, -2.2, 1.0], [W / 2 + .02, -2.6, 1.6], [-W / 2 - .02, -5.0, .55]].forEach(([bx, bz, bl]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.09, .3, bl), bandMat); b.position.set(bx, D / 2, bz); g.add(b);
    });
    shadowy(g); cover.castShadow = glare.castShadow = false;
    return g;
  }

  // ---------- Tulip: wordmark card and a fallback globe ----------
  function tulipCard(){
    const [c, x] = cv(800, 424);
    const gr = x.createLinearGradient(0, 0, 800, 424); gr.addColorStop(0, '#0f1d38'); gr.addColorStop(1, '#0a1428'); x.fillStyle = gr; x.fillRect(0, 0, 800, 424);
    x.strokeStyle = 'rgba(160,190,255,.25)'; x.lineWidth = 3; x.strokeRect(18, 18, 764, 388);
    const t = tx(c);
    const img = new Image(); img.onload = () => { const w = 560, h = w * 544 / 1024; x.drawImage(img, (800 - w) / 2, (424 - h) / 2, w, h); t.needsUpdate = true; }; img.src = 'assets/tulip-wordmark.png';
    const side = new THREE.MeshStandardMaterial({ color: 0x0a1428, roughness: .7 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(8, .06, 4.24), [side, side, new THREE.MeshStandardMaterial({ map: t, roughness: .5, envMapIntensity: .5 }), side, side, side]);
    m.position.y = .03; return shadowy(m);
  }
  function fallbackGlobe(){
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x18202e, metalness: .7, roughness: .36 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: .3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.3, .9, 48), dark); base.position.y = .45; g.add(base);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.3, .42, 3.4, 16), brass); stem.position.y = 2.6; g.add(stem);
    const tilt = new THREE.Group(); tilt.position.set(0, 4.25, 0); tilt.rotation.z = 23.4 * Math.PI / 180; g.add(tilt);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 64, 40), new THREE.MeshStandardMaterial({ color: 0x0b2a55, roughness: .4 })); sphere.position.y = 6.6; tilt.add(sphere);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(6.55, .15, 10, 72, Math.PI), brass); arc.position.y = 6.6; arc.rotation.z = -Math.PI / 2; tilt.add(arc);
    shadowy(g); g.userData.sphereCenterY = 10.85;
    return { group: g, sphere, update(dt, f){ sphere.rotation.y += dt * (.05 + .35 * f); } };
  }
  function foldedMap(){
    const [c, x] = cv(900, 650);
    x.fillStyle = '#e2dac8'; x.fillRect(0, 0, 900, 650); paperNoise(x, 900, 650, 3000, .08);
    x.fillStyle = '#a9bccb'; x.beginPath(); x.moveTo(0, 0); x.lineTo(380, 0);
    for (let i = 0; i <= 30; i++){ const yy = i / 30 * 650; x.lineTo(380 + Math.sin(i * .9) * 40 + Math.sin(i * 2.3) * 18 - i * 6, yy); }
    x.lineTo(0, 650); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(19,35,59,.18)'; x.lineWidth = 1;
    for (let i = 1; i < 6; i++){ x.beginPath(); x.moveTo(i * 150, 0); x.lineTo(i * 150, 650); x.stroke(); }
    for (let i = 1; i < 5; i++){ x.beginPath(); x.moveTo(0, i * 130); x.lineTo(900, i * 130); x.stroke(); }
    x.strokeStyle = 'rgba(160,110,70,.55)'; x.lineWidth = 4;
    for (let k = 0; k < 5; k++){ x.beginPath(); let px = 400 + rnd() * 100, py = rnd() * 650; x.moveTo(px, py); for (let s = 0; s < 6; s++){ px += 60 + rnd() * 50; py += (rnd() - .5) * 160; x.lineTo(px, py); } x.stroke(); }
    x.strokeStyle = '#1aa79c'; x.lineWidth = 4; x.setLineDash([14, 10]); x.beginPath(); x.moveTo(160, 470); x.quadraticCurveTo(460, 80, 760, 300); x.stroke(); x.setLineDash([]);
    [[160, 470], [760, 300]].forEach(([px, py]) => { x.fillStyle = '#13233b'; x.beginPath(); x.arc(px, py, 10, 0, 7); x.fill(); x.fillStyle = '#3fd6c8'; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); });
    const geo = new THREE.PlaneGeometry(18, 13, 36, 1), p = geo.attributes.position, th = 11 * Math.PI / 180, pw = 4.5;
    for (let i = 0; i < p.count; i++){
      const u = p.getX(i) + 9, k = u / pw, f = k - Math.floor(k), tri = (Math.floor(k) % 2 === 0) ? f : 1 - f;
      p.setX(i, (u - 9) * Math.cos(th)); p.setZ(i, tri * pw * Math.sin(th));
    }
    geo.computeVertexNormals(); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tx(c), roughness: .9, side: THREE.DoubleSide, envMapIntensity: .2 }));
    m.position.y = .02; return shadowy(m);
  }

  // ---------- PCB ----------
  const PCB = { W: 12, H: 5.6 };
  const chips = [{ x: 2.0, y: 1.35, n: 7, lbl: 'U1' }, { x: 5.3, y: 1.35, n: 7, lbl: 'U2' }, { x: 5.3, y: 3.55, n: 7, lbl: 'U3' }, { x: 9.7, y: 4.35, n: 4, lbl: 'U4' }];
  const SW = { x: 2.05, y: 3.6 }, caps = [{ x: 8.2, y: 2.5, l: 'C1' }, { x: 10.15, y: 1.55, l: 'C2' }], leds = [{ x: 11.25, y: 2.95, l: 'D1' }, { x: 11.25, y: 3.85, l: 'D2' }], res = [{ x: 7.55, y: 4.45, l: 'R1' }, { x: 7.55, y: 3.65, l: 'R2' }];
  const pinX = (ch, k) => ch.x + (k - (ch.n - 1) / 2) * .254;
  function pcbTexture(){
    const S = 100, [c, x] = cv(1200, 560);
    const gr = x.createLinearGradient(0, 0, 1200, 560); gr.addColorStop(0, '#0f3474'); gr.addColorStop(1, '#0b2a60'); x.fillStyle = gr; x.fillRect(0, 0, 1200, 560);
    for (let i = 0; i < 5000; i++){ x.fillStyle = `rgba(255,255,255,${rnd() * .025})`; x.fillRect(rnd() * 1200, rnd() * 560, 2, 2); }
    x.lineCap = 'round'; x.lineJoin = 'round';
    const trace = (pts, w = 7) => { x.strokeStyle = '#2a63b4'; x.lineWidth = w; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a * S, b * S) : x.moveTo(a * S, b * S)); x.stroke(); };
    const route = (a, b, m) => {
      const s = Math.min(.14, Math.abs(b[0] - a[0]) / 2, Math.abs(m - a[1]) * .9, Math.abs(b[1] - m) * .9), sx = Math.sign(b[0] - a[0]) || 1, sy1 = Math.sign(m - a[1]) || 1, sy2 = Math.sign(b[1] - m) || 1;
      trace([a, [a[0], m - sy1 * s], [a[0] + sx * s, m], [b[0] - sx * s, m], [b[0], m + sy2 * s], b]);
    };
    for (let k = 0; k < 7; k++) route([pinX(chips[0], k), chips[0].y + .38], [SW.x + (k - 3.5) * .254, SW.y - .38], 2.3 + k * .07);
    for (let k = 0; k < 4; k++) route([pinX(chips[1], k), chips[1].y + .38], [pinX(chips[2], k + 2), chips[2].y - .38], 2.25 + k * .1);
    route([pinX(chips[0], 5), chips[0].y - .38], [pinX(chips[1], 1), chips[1].y - .38], .62);
    route([pinX(chips[0], 6), chips[0].y - .38], [pinX(chips[1], 2), chips[1].y - .38], .5);
    route([pinX(chips[2], 6), chips[2].y + .38], [res[0].x - .3, res[0].y], 4.45);
    route([pinX(chips[2], 5), chips[2].y + .38], [res[1].x - .3, res[1].y], 4.2);
    trace([[res[0].x + .3, res[0].y], [9.1, res[0].y], [9.1, 3.85], [leds[1].x - .14, 3.85]]);
    trace([[res[1].x + .3, res[1].y], [8.9, res[1].y], [8.9, 3.25], [10.6, 3.25], [leds[0].x - .14, leds[0].y]]);
    route([pinX(chips[3], 3), chips[3].y - .38], [caps[0].x + .2, caps[0].y + .3], 3.4);
    route([pinX(chips[3], 0), chips[3].y - .38], [caps[1].x, caps[1].y + .3], 3.0);
    trace([[.35, 4.4], [.35, 5.12], [9.0, 5.12], [pinX(chips[3], 1), 5.12], [pinX(chips[3], 1), chips[3].y + .38]], 12);
    trace([[.35, 1.2], [.35, .3], [11.3, .3], [11.3, leds[0].y - .14]], 12);
    trace([[pinX(chips[1], 6), chips[1].y - .38], [pinX(chips[1], 6), .3]]);
    for (const [vx, vy] of [[3.5, .95], [6.9, 2.5], [9.4, 2.0], [4.0, 4.7], [10.8, 4.75], [7.0, 1.0]]){ x.fillStyle = '#d6b35e'; x.beginPath(); x.arc(vx * S, vy * S, 8, 0, 7); x.fill(); x.fillStyle = '#20180a'; x.beginPath(); x.arc(vx * S, vy * S, 3.4, 0, 7); x.fill(); }
    const pad = (px, py, sq) => { x.fillStyle = '#dcb862'; if (sq) x.fillRect(px * S - 9, py * S - 9, 18, 18); else { x.beginPath(); x.arc(px * S, py * S, 9.5, 0, 7); x.fill(); } x.fillStyle = '#3a2c10'; x.beginPath(); x.arc(px * S, py * S, 3.6, 0, 7); x.fill(); };
    const silk = (t, px, py, sz = 26, al = 'center') => { x.fillStyle = '#eef3f6'; x.font = `600 ${sz}px ${MONO}`; x.textAlign = al; x.textBaseline = 'middle'; x.fillText(t, px * S, py * S); };
    chips.forEach(ch => {
      const w = ch.n * .254 + .25;
      x.strokeStyle = '#eef3f6'; x.lineWidth = 3; x.strokeRect((ch.x - w / 2) * S, (ch.y - .27) * S, w * S, .54 * S);
      x.beginPath(); x.arc((ch.x - w / 2) * S, ch.y * S, 9, -Math.PI / 2, Math.PI / 2); x.stroke();
      for (let k = 0; k < ch.n; k++){ pad(pinX(ch, k), ch.y + .38, k === 0); pad(pinX(ch, k), ch.y - .38, false); }
      silk(ch.lbl, ch.x + w / 2 + .28, ch.y - .02, 24);
    });
    x.strokeStyle = '#eef3f6'; x.lineWidth = 3; x.strokeRect((SW.x - 1.15) * S, (SW.y - .5) * S, 2.3 * S, 1.0 * S);
    for (let k = 0; k < 8; k++){ pad(SW.x + (k - 3.5) * .254, SW.y - .38, k === 0); pad(SW.x + (k - 3.5) * .254, SW.y + .38, false); }
    silk('SW1', SW.x - 1.15, SW.y + .72, 22, 'left');
    caps.forEach(cp => { x.strokeStyle = '#eef3f6'; x.beginPath(); x.arc(cp.x * S, cp.y * S, .54 * S, 0, 7); x.stroke(); pad(cp.x - .12, cp.y, true); pad(cp.x + .12, cp.y, false); silk('+', cp.x - .38, cp.y - .38, 24); silk(cp.l, cp.x, cp.y + .74, 22); });
    leds.forEach(ld => { x.strokeStyle = '#eef3f6'; x.beginPath(); x.arc(ld.x * S, ld.y * S, .3 * S, .5, Math.PI * 2 - .5); x.stroke(); pad(ld.x - .13, ld.y, true); pad(ld.x + .13, ld.y, false); silk(ld.l, ld.x - .62, ld.y, 22); });
    res.forEach(r => { x.strokeStyle = '#eef3f6'; x.strokeRect((r.x - .2) * S, (r.y - .1) * S, .4 * S, .2 * S); pad(r.x - .3, r.y, false); pad(r.x + .3, r.y, false); silk(r.l, r.x, r.y - .27, 20); });
    for (let k = 0; k < 4; k++) pad(.35, 1.4 + k * .8, k === 0);
    silk('J1', .7, 1.0, 20, 'left');
    for (const [hx, hy] of [[.35, .35], [11.65, .35], [11.65, 5.25]]){ x.fillStyle = '#dcb862'; x.beginPath(); x.arc(hx * S, hy * S, 18, 0, 7); x.fill(); x.fillStyle = '#081830'; x.beginPath(); x.arc(hx * S, hy * S, 11, 0, 7); x.fill(); }
    silk('HALF ADDER', 4.3, 5.22, 30);
    return tx(c);
  }
  let ledMat, ledGlow, ledLight;
  function buildPCB(){
    const g = new THREE.Group();
    const top = new THREE.MeshStandardMaterial({ map: pcbTexture(), roughness: .42, metalness: .1, envMapIntensity: 1.1 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xc4b98f, roughness: .7 });
    const bot = new THREE.MeshStandardMaterial({ color: 0x0c2b62, roughness: .5 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(PCB.W, .16, PCB.H), [edge, edge, top, bot, edge, edge]); board.position.y = .08; g.add(board);
    const L = (bx, by) => [bx - PCB.W / 2, by - PCB.H / 2];
    const chipM = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: .55, metalness: .05 });
    const legM = new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: .3, metalness: 1 });
    let legCount = 0; chips.forEach(ch => legCount += ch.n * 2);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, .3, .14), legM, legCount); let li = 0;
    const dm = new THREE.Object3D();
    chips.forEach(ch => {
      const [cx, cz] = L(ch.x, ch.y);
      const body = new THREE.Mesh(new THREE.BoxGeometry(ch.n * .254 + .1, .3, .62), chipM); body.position.set(cx, .16 + .1 + .15, cz); g.add(body);
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .01, 10), new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: .4 })); dot.position.set(cx - (ch.n * .254) / 2 + .1, .16 + .26 + .005, cz + .16); g.add(dot);
      for (let k = 0; k < ch.n; k++) for (const s of [-1, 1]){ const [px] = L(pinX(ch, k), 0); dm.position.set(px, .16 + .12, cz + s * .35); dm.updateMatrix(); legs.setMatrixAt(li++, dm.matrix); }
    });
    g.add(legs);
    const [sx, sz] = L(SW.x, SW.y);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(2.25, .36, .95), new THREE.MeshStandardMaterial({ color: 0xa3302d, roughness: .45 })); sw.position.set(sx, .16 + .18, sz); g.add(sw);
    const tabs = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .08, .26), new THREE.MeshStandardMaterial({ color: 0xf1efe8, roughness: .5 }), 8);
    for (let k = 0; k < 8; k++){ dm.position.set(sx + (k - 3.5) * .254, .16 + .38, sz + ((k * 5) % 3 === 0 ? -.16 : .16)); dm.updateMatrix(); tabs.setMatrixAt(k, dm.matrix); }
    g.add(tabs);
    const [cs, cx2] = cv(256, 128);
    cx2.fillStyle = '#18233a'; cx2.fillRect(0, 0, 256, 128); cx2.fillStyle = '#b9c4d2'; cx2.fillRect(18, 0, 34, 128); cx2.fillStyle = '#18233a'; cx2.font = `600 24px ${MONO}`; for (let i = 0; i < 4; i++) cx2.fillText('−', 26, 22 + i * 30);
    const capSide = new THREE.MeshStandardMaterial({ map: tx(cs), roughness: .35, metalness: .2 });
    const capTop = new THREE.MeshStandardMaterial({ color: 0xa9b2bd, roughness: .3, metalness: .9 });
    caps.forEach(cp => { const [px, pz] = L(cp.x, cp.y); const m = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 1.15, 28), [capSide, capTop, capTop]); m.position.set(px, .16 + .6, pz); m.rotation.y = 2.2; g.add(m); });
    const resM = new THREE.MeshStandardMaterial({ color: 0x6f9ec4, roughness: .45 });
    res.forEach(r => { const [px, pz] = L(r.x, r.y); const m = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .5, 12), resM); m.rotation.z = Math.PI / 2; m.position.set(px, .16 + .14, pz); g.add(m); });
    ledMat = new THREE.MeshStandardMaterial({ color: 0x3ad9a8, emissive: 0x4dffc3, emissiveIntensity: 2.2, roughness: .2, transparent: true, opacity: .92 });
    const ledOff = new THREE.MeshStandardMaterial({ color: 0x2a8a6a, emissive: 0x0d3a2c, emissiveIntensity: .4, roughness: .2, transparent: true, opacity: .9 });
    leds.forEach((ld, i) => {
      const [px, pz] = L(ld.x, ld.y); const m = i === 0 ? ledMat : ledOff;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.24, .27, .36, 18), m); body.position.set(px, .16 + .18, pz); g.add(body);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.24, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); cap.position.set(px, .16 + .36, pz); g.add(cap);
      if (i === 0){
        ledGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4dffc3, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .9 }));
        ledGlow.scale.set(2.6, 2.6, 1); ledGlow.position.set(px, .16 + .45, pz); g.add(ledGlow);
        ledLight = new THREE.PointLight(0x4dffc3, 3, 9, 2); ledLight.position.set(px, .9, pz); g.add(ledLight);
      }
    });
    shadowy(g); legs.castShadow = true; tabs.castShadow = true;
    if (ledGlow) ledGlow.castShadow = false;
    g.position.y = .26;
    const wrap = new THREE.Group(); wrap.add(g); return wrap;
  }
  function craftKnife(){
    const g = new THREE.Group();
    const alu = new THREE.MeshStandardMaterial({ color: 0xa8b3c0, roughness: .38, metalness: 1, envMapIntensity: 1.4 });
    const h = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 10, 18), alu); h.rotation.z = Math.PI / 2; g.add(h);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(.46, .46, 3.2, 18), new THREE.MeshStandardMaterial({ color: 0x1b2638, roughness: .7 })); grip.rotation.z = Math.PI / 2; grip.position.x = 2.4; g.add(grip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.52, .42, 1.3, 18), alu); collar.rotation.z = Math.PI / 2; collar.position.x = 5.6; g.add(collar);
    const s = new THREE.Shape(); s.moveTo(0, -.22); s.lineTo(1.2, -.22); s.lineTo(3.2, .2); s.lineTo(0, .3); s.closePath();
    const bl = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .03, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: .18, metalness: 1, envMapIntensity: 1.8 }));
    bl.position.set(6.2, 0, -.015); g.add(bl);
    g.position.y = .44; return shadowy(g);
  }

  // ---------- lap sheet: best lap plus saved laps (js/forza-laps.js) ----------
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
  const BEST_LAP = { time: '1:24.506', car: 'Hyundai Elantra N' };
  // distance fraction at which a lap reaches a given fraction of its time (time = integral of dx / v)
  function sectorFractions(lap){
    const tr = lap.trace, cum = [0];
    for (let i = 1; i < tr.length; i++) cum.push(cum[i - 1] + (tr[i][0] - tr[i - 1][0]) / Math.max(1, (tr[i][1] + tr[i - 1][1]) / 2));
    const T = cum[cum.length - 1] || 1;
    const at = f => { const goal = f * T; for (let i = 1; i < cum.length; i++) if (cum[i] >= goal){ const k = (goal - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return tr[i - 1][0] + (tr[i][0] - tr[i - 1][0]) * k; } return 1; };
    return [at(lap.s1 / lap.time), at((lap.s1 + lap.s2) / lap.time)];
  }
  function sheetTexture(){
    const W = 1240, H = 1754, [c, x] = cv(W, H), S = W / 21;
    x.fillStyle = '#ebe5d8'; x.fillRect(0, 0, W, H); paperNoise(x, W, H, 9000, .07);
    x.fillStyle = 'rgba(40,70,110,.14)';
    for (let yy = 1.5 * S; yy < H - S; yy += .5 * S) for (let xx = 1.5 * S; xx < W - S; xx += .5 * S) x.fillRect(xx - 1.2, yy - 1.2, 2.4, 2.4);
    const ink = '#13233b', teal = '#0f7d74', mute = 'rgba(19,35,59,.55)';
    // title
    x.fillStyle = 'rgba(63,214,200,.32)'; x.fillRect(84, 104, W - 168, 70);
    x.fillStyle = ink; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    x.font = `italic 400 66px ${SERIF}`; x.fillText('Maple Valley · Lap compare', 96, 160);
    x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); x.moveTo(90, 206); x.lineTo(W - 90, 206); x.stroke();
    // personal best (set in a different session from the saved laps below)
    x.font = `600 22px ${MONO}`; x.fillStyle = mute; x.fillText('BEST LAP', 96, 262);
    x.font = `600 54px ${MONO}`; x.fillStyle = teal; x.fillText(BEST_LAP.time, 96, 322);
    const bestW = x.measureText(BEST_LAP.time).width;
    x.font = `500 24px ${MONO}`; x.fillStyle = ink; x.fillText(BEST_LAP.car.toUpperCase(), 96 + bestW + 36, 318);
    // track outline
    if (track && track.points){
      const pts = track.points, bw = W - 300, bh = 580, sc = Math.min(bw / track.w, bh / track.h), ox = (W - track.w * sc) / 2, oy = 370;
      const P = pts.map(([a, b]) => [ox + a * sc, oy + b * sc]);
      const path = () => { x.beginPath(); P.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); };
      x.lineJoin = 'round'; x.lineCap = 'round';
      path(); x.strokeStyle = 'rgba(19,35,59,.09)'; x.lineWidth = 40; x.stroke();
      path(); x.strokeStyle = 'rgba(19,35,59,.25)'; x.lineWidth = 2; x.setLineDash([3, 9]); x.stroke(); x.setLineDash([]);
      path(); x.strokeStyle = ink; x.lineWidth = 6; x.stroke();
    }
    const laps = (lapData && lapData.laps || []).slice().sort((a, b) => a.time - b.time);
    if (!laps.length) return tx(c);
    // lap table: five fastest
    const rows = laps.slice(0, 5), ty = 1000, rowH = 48, cols = [110, 420, 640, 860, W - 110];
    x.font = `600 21px ${MONO}`; x.textBaseline = 'middle'; x.fillStyle = mute;
    x.textAlign = 'left'; x.fillText('SAVED LAPS', 110, ty - 44);
    ['LAP', 'S1', 'S2', 'S3', 'TIME'].forEach((h, i) => { x.textAlign = i === 0 ? 'left' : 'right'; x.fillText(h, cols[i], ty); });
    x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.moveTo(110, ty + 26); x.lineTo(W - 110, ty + 26); x.stroke();
    const bestSec = ['s1', 's2', 's3'].map(k => Math.min(...rows.map(l => l[k])));
    rows.forEach((l, r) => {
      const yy = ty + 26 + rowH * (r + .5) + 2;
      x.font = `500 24px ${MONO}`; x.textAlign = 'left'; x.fillStyle = ink;
      x.fillText(String(l.lap), cols[0], yy);
      ['s1', 's2', 's3'].forEach((k, i) => { x.fillStyle = l[k] === bestSec[i] ? teal : ink; x.textAlign = 'right'; x.fillText(l[k].toFixed(3), cols[i + 1], yy); });
      x.fillStyle = ink; x.fillText(fmt(l.time), cols[4], yy);
      x.strokeStyle = 'rgba(19,35,59,.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(110, yy + rowH / 2); x.lineTo(W - 110, yy + rowH / 2); x.stroke();
    });
    // speed trace: best lap vs second best
    const A = laps[0], B = laps[1];
    const gx = 110, gy = 1330, gw = W - 220, gh = 270;
    const all = [...A.trace, ...(B ? B.trace : [])].map(p => p[1]);
    const vmin = Math.min(...all) - 6, vmax = Math.max(...all) + 6;
    const X = f => gx + gw * f, Yv = v => gy + gh - (v - vmin) / (vmax - vmin) * gh;
    x.strokeStyle = 'rgba(19,35,59,.35)'; x.lineWidth = 2; x.strokeRect(gx, gy, gw, gh);
    for (let k = 1; k < 4; k++){ const yy = gy + gh * k / 4; x.strokeStyle = 'rgba(19,35,59,.12)'; x.lineWidth = 1; x.beginPath(); x.moveTo(gx, yy); x.lineTo(gx + gw, yy); x.stroke(); }
    const [f1, f2] = sectorFractions(A);
    x.setLineDash([8, 8]); x.strokeStyle = 'rgba(15,125,116,.6)'; x.lineWidth = 2;
    [f1, f2].forEach(f => { x.beginPath(); x.moveTo(X(f), gy); x.lineTo(X(f), gy + gh); x.stroke(); });
    x.setLineDash([]);
    x.fillStyle = ink; x.font = `600 22px ${MONO}`; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    [[0, f1, 'S1'], [f1, f2, 'S2'], [f2, 1, 'S3']].forEach(([a, b, l]) => x.fillText(l, X((a + b) / 2), gy - 14));
    const line = (lap, col, w, dash) => { x.setLineDash(dash || []); x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.beginPath(); lap.trace.forEach(([f, v], k) => k ? x.lineTo(X(f), Yv(v)) : x.moveTo(X(f), Yv(v))); x.stroke(); x.setLineDash([]); };
    if (B) line(B, 'rgba(19,35,59,.5)', 2.5, [7, 6]);
    line(A, teal, 3.5);
    x.textAlign = 'left'; x.font = `600 21px ${MONO}`; x.fillStyle = ink;
    x.fillText('SPEED', gx, gy + gh + 46);
    x.font = `500 21px ${MONO}`;
    x.fillStyle = teal; x.fillRect(gx + 150, gy + gh + 32, 30, 6); x.fillStyle = ink; x.fillText(`LAP ${A.lap} · ${fmt(A.time)}`, gx + 192, gy + gh + 46);
    if (B){ x.fillStyle = 'rgba(19,35,59,.5)'; x.fillRect(gx + 650, gy + gh + 32, 30, 6); x.fillStyle = ink; x.fillText(`LAP ${B.lap} · ${fmt(B.time)}`, gx + 692, gy + gh + 46); }
    return tx(c);
  }
  function buildSheet(){
    const geo = new THREE.PlaneGeometry(21, 29.7, 24, 34), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){
      const X = p.getX(i), Y = p.getY(i), ny = (Y / 14.85 + 1) / 2, nx = (X / 10.5 + 1) / 2;
      const z = Math.pow(Math.max(0, ny - .8) / .2, 2) * 1.5 + Math.pow(Math.max(0, nx - .8) / .2, 2) * Math.max(0, .35 - ny) * 2.6 + Math.sin(nx * 5 + ny * 2) * .07 + .07;
      p.setZ(i, z);
    }
    geo.computeVertexNormals(); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sheetTexture(), roughness: .9, side: THREE.DoubleSide, envMapIntensity: .25 }));
    m.position.y = .02; return shadowy(m);
  }
  function pencil(){
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: 0x1d6a70, roughness: .45, metalness: .05 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, 14.5, 6), paint); body.rotation.z = Math.PI / 2; body.rotation.x = Math.PI / 6; g.add(body);
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(.38, .1, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xd8b98c, roughness: .8 })); wood.rotation.z = -Math.PI / 2; wood.rotation.x = Math.PI / 6; wood.position.x = 7.25 + .8; g.add(wood);
    const lead = new THREE.Mesh(new THREE.CylinderGeometry(.1, .01, .45, 6), new THREE.MeshStandardMaterial({ color: 0x202226, roughness: .4, metalness: .5 })); lead.rotation.z = -Math.PI / 2; lead.position.x = 7.25 + 1.6 + .22; g.add(lead);
    const end = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .02, 6), new THREE.MeshStandardMaterial({ color: 0xd8b98c, roughness: .8 })); end.rotation.z = Math.PI / 2; end.rotation.x = Math.PI / 6; end.position.x = -7.26; g.add(end);
    g.position.y = .33; return shadowy(g);
  }

  // ---------- place everything (the left third of the mat stays empty for the index card) ----------
  const items = [];
  const Y = new THREE.Vector3(0, 1, 0);
  function place(obj, x, z, yaw, opts = {}){
    const holder = new THREE.Group(); holder.position.set(x, MAT_Y, z);
    const pivot = new THREE.Group(); pivot.add(obj); holder.add(pivot);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(Y, yaw); pivot.quaternion.copy(yawQ);
    if (opts.blob){ const b = blob(opts.blob[0], opts.blob[1], opts.blob[2]); b.rotation.z = yaw; holder.add(b); opts.blobMesh = b; }
    scene.add(holder);
    return { holder, pivot, yawQ, faceQ: new THREE.Quaternion(), sp: { x: 0, v: 0 }, sr: { x: 0, v: 0 }, ...opts };
  }
  const globe = (await globeReady) || fallbackGlobe();
  const GC = globe.group.userData.sphereCenterY || 10.85;
  const phone = place(buildPhone('assets/cl-hi-1-sports-board.jpg'), 1, 8, .22, { blob: [10, 18, .55], lift: 7.5, face: .78, o: [8, 24, 23], ty: 7.5, lamp: [1, 0, 8] });
  const globeIt = place(globe.group, 3, -17, 0, { blob: [11, 11, .6], lift: 3.2, face: .18, o: [5, 10, 42], ty: GC + .6, lamp: [3, 4, -17] });
  place(buildPhone('assets/tl-iphone-screen.jpg', { round: .13, island: false }), 14.5, -11, 1.22, { blob: [10, 18, .5] });
  place(tulipCard(), 11.5, 0.5, -.32, { blob: [9.5, 5.5, .3] });
  place(foldedMap(), -26, -23, -.2);
  const pcbIt = place(buildPCB(), 29, -15, -.12, { blob: [14, 8, .5], lift: 6.5, face: .72, o: [-1, 15.5, 14], ty: 6.8, lamp: [29, 0, -15] });
  place(craftKnife(), 40, -22, 2.75);
  const sheetIt = place(buildSheet(), 30, 9.5, -.13, { lift: 4.5, face: .55, o: [-4, 46, 27], ty: 4.5, lamp: [30, 0, 9.5] });
  place(pencil(), 13, 20, .95);
  items.push(phone, globeIt, pcbIt, sheetIt);

  // ---------- camera stations ----------
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const OVERVIEW = {
    side: { t: [11, 0, 0], o: [0, 72, 68], sx: .26, sy: 0, lamp: [10, 0, -3] },
    sheet: { t: [8, 0, 10], o: [0, 66, 58], sx: 0, sy: -.3, lamp: [8, 0, 2] },
  };
  const SHEET_O = [[6, 42, 37], [3, 14, 58], [-1, 28, 24], [-2, 52, 24]];
  const SHEET_TZ = [0, 0, 0, -7];
  let ST = [], layout = '', aspect = 1;
  function stations(){
    layout = WB.layout;
    const sheet = layout === 'sheet';
    const ds = sheet ? 1 : Math.pow(Math.max(1, 1.45 / aspect), .7);
    const ov = OVERVIEW[layout];
    ST = [{ T: V(ov.t), P: V(ov.t).add(V(ov.o).multiplyScalar(ds)), sx: ov.sx, sy: ov.sy, L: V(ov.lamp) }];
    items.forEach((it, i) => {
      const h = it.holder.position, T = new THREE.Vector3(h.x, it.ty, h.z + (sheet ? SHEET_TZ[i] : 0)), o = V(sheet ? SHEET_O[i] : it.o);
      ST.push({ T, P: T.clone().add(o.multiplyScalar(ds)), sx: sheet ? 0 : -.3, sy: sheet ? .42 : .01, L: V(it.lamp) });
    });
    camera.fov = sheet ? 50 : 34;
    items.forEach((it, i) => {
      const st = ST[i + 1], from = it.holder.position.clone().add(new THREE.Vector3(0, it.lift, 0));
      const dir = st.P.clone().sub(from).normalize();
      it.faceQ.setFromUnitVectors(Y, dir);
    });
  }
  function resize(){
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    aspect = w / h; camera.aspect = aspect;
    stations();
  }
  resize();
  new ResizeObserver(resize).observe(stage);

  // pointer: shifts the lamp and parallaxes the camera
  const ptr = { x: 0, y: 0 }, pp = { x: 0, y: 0 };
  const onPtr = (cx, cy) => { ptr.x = cx / innerWidth * 2 - 1; ptr.y = cy / innerHeight * 2 - 1; };
  addEventListener('pointermove', e => onPtr(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', e => { const t = e.touches[0]; if (t) onPtr(t.clientX, t.clientY); }, { passive: true });

  // ---------- loop ----------
  const tgt = new THREE.Vector3(), pos = new THREE.Vector3(), lampT = new THREE.Vector3(), I = new THREE.Quaternion(), q = new THREE.Quaternion(), qs = new THREE.Quaternion(), eu = new THREE.Euler();
  function spring(s, target, k, c, dt){ const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n; for (let i = 0; i < n; i++){ s.v += (k * (target - s.x) - c * s.v) * h; s.x += s.v * h; } }
  let visible = true, running = false, last = performance.now(), time = 0, first = true;
  function frame(now){
    if (!visible || document.hidden){ running = false; return; }
    requestAnimationFrame(frame);
    const dt = Math.min(.1, Math.max(.001, (now - last) / 1000)); last = now;
    const red = WB.reduce; if (!red) time += dt;
    if (WB.layout !== layout) stations();
    const g = WB.g, i = Math.min(3, Math.floor(g)), e = g - i, A = ST[i], B = ST[i + 1];
    tgt.lerpVectors(A.T, B.T, e);
    pos.lerpVectors(A.P, B.P, e);
    pos.y += Math.sin(Math.PI * e) * (layout === 'sheet' ? 16 : 10);
    if (!red){ const k = 1 - Math.pow(.94, dt * 60); pp.x += (ptr.x - pp.x) * k; pp.y += (ptr.y - pp.y) * k; } else { pp.x = pp.y = 0; }
    const pd = pos.distanceTo(tgt) / 40;
    pos.x += pp.x * 1.6 * pd; pos.y -= pp.y * 1.0 * pd;
    camera.position.copy(pos); camera.lookAt(tgt);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] = -(A.sx + (B.sx - A.sx) * e);
    camera.projectionMatrix.elements[9] = -(A.sy + (B.sy - A.sy) * e);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // the lamp swings over whatever is in focus; the pointer nudges it
    lampT.lerpVectors(A.L, B.L, e);
    lamp.target.position.copy(lampT);
    lamp.position.set(LAMP_BASE.x + lampT.x * .55 + pp.x * 8, LAMP_BASE.y, LAMP_BASE.z + lampT.z * .45 + pp.y * 6);
    // objects lift with weight and turn toward the camera
    items.forEach((it, k) => {
      const w = smooth(clamp(1 - Math.abs(g - (k + 1)) * 1.6, 0, 1));
      if (red || first){ it.sp.x = it.sr.x = w; it.sp.v = it.sr.v = 0; }
      else { spring(it.sp, w, 64, 10, dt); spring(it.sr, w, 34, 8, dt); }
      const lp = Math.max(0, it.sp.x), lr = it.sr.x;
      it.pivot.position.y = lp * it.lift + (red ? 0 : Math.sin(time * 1.3 + k) * .12 * lp);
      q.slerpQuaternions(I, it.faceQ, lr * it.face);
      eu.set(red ? 0 : Math.sin(time * .9 + k) * .025 * lr, 0, red ? 0 : Math.cos(time * .7 + k * 2) * .02 * lr);
      qs.setFromEuler(eu);
      it.pivot.quaternion.copy(q).multiply(qs).multiply(it.yawQ);
      if (it.blobMesh){ const b = it.blobMesh; b.material.opacity = b.userData.a * (1 - Math.min(1, lp) * .8); const s = 1 + Math.min(1.2, lp) * .45; b.scale.set(s, s, 1); }
    });
    const gw = smooth(clamp(1 - Math.abs(g - 2) * 1.6, 0, 1));
    if (!red) globe.update(dt, gw);
    const on = red ? true : (time % 1.1) < .55;
    if (ledMat){ ledMat.emissiveIntensity = on ? 2.4 : .25; ledGlow.material.opacity = on ? .95 : .08; ledLight.intensity = on ? 3.2 : 0; }
    renderer.render(scene, camera);
    if (first){ first = false; root.classList.add('gl-on'); }
  }
  function start(){ if (!running && visible && !document.hidden){ running = true; last = performance.now(); requestAnimationFrame(frame); } }
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; start(); }, { rootMargin: '100px' }).observe(document.getElementById('projects'));
  document.addEventListener('visibilitychange', start);
  start();
}
