// globe.js — classic political desk globe.
//
//   import { createGlobe } from './js/globe.js';
//   const globe = await createGlobe({ radius: 6 });
//   scene.add(globe.group);            // group origin = bottom of the base
//   globe.update(dt, focus);           // per frame; focus 0..1
//
// Scene units: 1 unit ≈ 1 cm. Everything scales with `radius` (6 = reference).
// The ring assembly stands in the group's XY plane (yawed about Y). The axis,
// meridian ring and sphere are tilted 23.4° inside that plane; the sphere spins
// about its own axis (sphere.rotation.y).

import * as THREE from 'three';

const DEG = Math.PI / 180;

// Rough outlines of the Great Lakes ([lon, lat]); the 110m country file draws
// the border straight through them, so they are cut out of the land here.
const GREAT_LAKES = [
  // Superior
  [[-92.1, 46.75], [-91.0, 46.85], [-90.4, 46.6], [-89.3, 46.85], [-88.5, 46.9], [-88.0, 47.4], [-87.6, 47.3], [-87.0, 46.6],
   [-85.9, 46.7], [-85.0, 46.7], [-84.4, 46.5], [-84.6, 46.95], [-85.3, 47.6], [-85.9, 47.95], [-86.6, 48.7], [-87.5, 48.9],
   [-88.3, 48.8], [-88.4, 48.3], [-89.2, 48.4], [-89.8, 48.0], [-90.5, 47.75], [-91.5, 47.1]],
  // Michigan
  [[-87.6, 41.65], [-86.6, 41.85], [-86.2, 42.5], [-86.3, 43.3], [-86.5, 44.0], [-86.2, 44.6], [-85.6, 45.1], [-85.0, 45.5],
   [-84.8, 45.85], [-85.6, 46.0], [-86.6, 45.85], [-87.4, 45.6], [-87.9, 45.1], [-88.0, 44.5], [-87.7, 43.8], [-87.8, 43.0], [-87.8, 42.2]],
  // Huron + Georgian Bay
  [[-84.6, 45.95], [-83.6, 46.2], [-82.5, 46.05], [-81.5, 46.15], [-80.5, 45.95], [-80.0, 45.3], [-79.9, 44.8], [-80.4, 44.5],
   [-81.0, 44.7], [-81.3, 45.2], [-81.7, 44.9], [-81.7, 44.2], [-81.9, 43.6], [-82.5, 43.0], [-82.5, 43.7], [-83.0, 44.1],
   [-83.5, 44.1], [-83.9, 43.7], [-83.3, 44.4], [-83.3, 45.0], [-83.5, 45.4], [-84.0, 45.7]],
  // Erie
  [[-83.5, 41.75], [-83.0, 41.5], [-82.5, 41.4], [-81.7, 41.5], [-81.0, 41.8], [-80.0, 42.2], [-79.0, 42.55], [-78.85, 42.85],
   [-79.5, 42.85], [-80.3, 42.65], [-81.3, 42.65], [-82.0, 42.5], [-82.5, 42.3], [-83.1, 42.1], [-83.4, 41.95]],
  // Ontario (Toronto sits on the north-west shore)
  [[-79.8, 43.3], [-79.0, 43.25], [-78.0, 43.3], [-77.0, 43.3], [-76.3, 43.5], [-76.2, 43.9], [-76.5, 44.1], [-77.2, 44.0],
   [-78.0, 43.95], [-79.0, 43.55], [-79.4, 43.6], [-79.8, 43.5]],
];

// country fills (sRGB): cream, sage, dusty rose, ochre, pale teal, lilac, peach, primrose
const PALETTE = ['#f4e3b0', '#b9d395', '#eeaea4', '#e9bd62', '#9fd6c6', '#c7b2e0', '#f5c193', '#ede68a'];
const ICE = { Antarctica: '#eef0e8', Greenland: '#e6ece4' };

const OCEAN_EQ = '#3f9bb6';    // ocean at the equator
const OCEAN_POLE = '#347f9e';  // ocean toward the poles
const SHELF = '#86cbd3';       // shallow-water bands near coasts
const LAKE = '#59aec4';
const INK = '24,38,52';        // graticule / labels
const BORDER = 'rgba(78,54,44,0.78)';
const COAST = 'rgba(30,38,48,0.9)';
const SERIF = 'Georgia, "Newsreader", "Times New Roman", serif';

// ---------------------------------------------------------------- helpers
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// copy of `src` (optionally resized) with every opaque pixel replaced by `color`
function tinted(src, color, w = src.width, h = src.height) {
  const c = makeCanvas(w, h), x = c.getContext('2d');
  x.drawImage(src, 0, 0, w, h);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, w, h);
  return c;
}

// Gaussian-blurred, tinted copy of `src` drawn into `ctx` via the shadow of an
// off-canvas draw (works where ctx.filter does not).
function blurDraw(ctx, src, blur, color, w, h) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = w * 2;
  ctx.drawImage(src, -w * 2, 0, w, h);
  ctx.restore();
}

// tileable grain: grey values around mid with per-pixel alpha
function noiseTile(rnd, size = 256) {
  const c = makeCanvas(size, size), x = c.getContext('2d');
  const img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = rnd() < 0.5 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = rnd() * 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function canvasTexture(canvas, { srgb, anisotropy }) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.wrapS = THREE.RepeatWrapping;     // antimeridian seam filters cleanly
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// The outlines ship as a module so the globe never depends on a runtime fetch.
async function loadGeoJSON() {
  try {
    const { default: json } = await import('./countries.js');
    return Array.isArray(json?.features) ? json : null;
  } catch {
    return null;
  }
}

// Greedy colouring: start from a name hash, then move any country whose
// colour matches an already-coloured neighbour (shared border vertex).
function assignColours(features, n) {
  const owners = new Map();
  features.forEach((f, i) => {
    for (const k of f.keys) {
      const list = owners.get(k);
      if (list) { if (list[list.length - 1] !== i) list.push(i); } else owners.set(k, [i]);
    }
  });
  const nb = features.map(() => new Set());
  for (const list of owners.values()) {
    if (list.length < 2) continue;
    for (const i of list) for (const j of list) if (i !== j) nb[i].add(j);
  }
  const colour = features.map(f => fnv1a(f.name) % n);
  const done = new Uint8Array(features.length);
  const order = features.map((_, i) => i).sort((a, b) => nb[b].size - nb[a].size);
  for (const i of order) {
    const used = new Set();
    for (const j of nb[i]) if (done[j]) used.add(colour[j]);
    if (used.has(colour[i])) {
      for (let k = 1; k < n; k++) {
        const c = (colour[i] + k) % n;
        if (!used.has(c)) { colour[i] = c; break; }
      }
    }
    done[i] = 1;
  }
  return colour;
}

// ---------------------------------------------------------------- texture
// Equirectangular: x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H.
// This matches three.js SphereGeometry UVs: u = 0 at local -X, growing toward
// +Z; v = 1 at the north pole. A point at (lat, lon) sits on the sphere at
//   ( cos(lat)·cos(lon),  sin(lat),  -cos(lat)·sin(lon) ) · radius
// so the prime meridian faces local +X and lon -90 faces local +Z.
function buildTextures({ W, H, geo, pin, anisotropy }) {
  const rnd = mulberry32(1337);
  const proj = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  const PX = W / 360;                         // texels per degree
  const BW = W >> 1, BH = H >> 1;             // half-res for bump / roughness / shelves
  const grain = noiseTile(rnd);

  // -- features: one Path2D each (even-odd keeps holes local) + vertex keys
  const features = [];
  if (geo) {
    for (const f of geo.features) {
      const g = f.geometry;
      if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      if (!polys.length) continue;
      const path = new Path2D(), keys = new Set();
      for (const poly of polys) for (const ring of poly) {
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const [x, y] = proj(lon, lat);
          i ? path.lineTo(x, y) : path.moveTo(x, y);
          keys.add(Math.round(lon * 1e3) * 1e6 + Math.round(lat * 1e3));
        }
        path.closePath();
      }
      features.push({ path, keys, name: String(f.properties?.name || '') });
    }
  }
  const colours = assignColours(features, PALETTE.length);

  const lakes = new Path2D();
  for (const ring of GREAT_LAKES) {
    ring.forEach(([lon, lat], i) => { const [x, y] = proj(lon, lat); i ? lakes.lineTo(x, y) : lakes.moveTo(x, y); });
    lakes.closePath();
  }

  // -- land mask
  const mask = makeCanvas(W, H), mx = mask.getContext('2d');
  mx.fillStyle = '#fff';
  for (const f of features) mx.fill(f.path, 'evenodd');
  if (features.length) {
    mx.globalCompositeOperation = 'destination-out';
    mx.fill(lakes);
    mx.globalCompositeOperation = 'source-over';
  }
  const maskHalf = makeCanvas(BW, BH);
  maskHalf.getContext('2d').drawImage(mask, 0, 0, BW, BH);

  const map = makeCanvas(W, H), x = map.getContext('2d');

  // -- ocean: latitude gradient + slow mottling
  {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, OCEAN_POLE);
    g.addColorStop(0.30, OCEAN_EQ);
    g.addColorStop(0.50, OCEAN_EQ);
    g.addColorStop(0.70, OCEAN_EQ);
    g.addColorStop(1.00, OCEAN_POLE);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const cx = rnd() * W, cy = rnd() * H, r = 60 + rnd() * 260;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, rnd() < 0.5 ? `rgba(20,70,100,${0.05 + rnd() * 0.07})` : `rgba(150,215,225,${0.04 + rnd() * 0.06})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  // -- shelves: blurred mask quantised into three stepped bands
  if (features.length) {
    const sh = makeCanvas(BW, BH), sx = sh.getContext('2d');
    blurDraw(sx, maskHalf, 46, '#fff', BW, BH);
    sx.drawImage(maskHalf, 0, 0);
    const img = sx.getImageData(0, 0, BW, BH), d = img.data;
    const c = new THREE.Color(SHELF);
    const r = c.r * 255, gg = c.g * 255, b = c.b * 255;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      const o = a > 150 ? 175 : a > 84 ? 120 : a > 34 ? 72 : a > 10 ? 34 : 0;
      d[i - 3] = r; d[i - 2] = gg; d[i - 1] = b; d[i] = o;
    }
    sx.putImageData(img, 0, 0);
    x.drawImage(sh, 0, 0, W, H);
    // lakes read slightly lighter than open sea
    x.fillStyle = LAKE;
    x.fill(lakes);
  }

  // ocean grain
  x.save();
  x.globalAlpha = 0.05;
  x.fillStyle = x.createPattern(grain, 'repeat');
  x.fillRect(0, 0, W, H);
  x.restore();

  // -- political land layer, clipped to the mask
  if (features.length) {
    const land = makeCanvas(W, H), lx = land.getContext('2d');
    features.forEach((f, i) => {
      lx.fillStyle = ICE[f.name] || PALETTE[colours[i]];
      lx.fill(f.path, 'evenodd');
    });
    // paper grain + faint mottling
    lx.save();
    lx.globalAlpha = 0.07;
    lx.fillStyle = lx.createPattern(grain, 'repeat');
    lx.fillRect(0, 0, W, H);
    lx.restore();
    for (let i = 0; i < 220; i++) {
      const cx = rnd() * W, cy = rnd() * H, r = 40 + rnd() * 160;
      const rg = lx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, rnd() < 0.6 ? `rgba(120,90,50,${0.03 + rnd() * 0.05})` : `rgba(255,250,235,${0.04 + rnd() * 0.05})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = rg;
      lx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    // borders
    lx.strokeStyle = BORDER;
    lx.lineWidth = 1.7;
    lx.lineJoin = 'round';
    for (const f of features) lx.stroke(f.path);
    lx.globalCompositeOperation = 'destination-in';
    lx.drawImage(mask, 0, 0);
    x.drawImage(land, 0, 0);

    // coastline: 2px ring outside the mask
    const coast = makeCanvas(W, H), cx = coast.getContext('2d');
    for (const r of [1, 2]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) cx.drawImage(mask, dx * r, dy * r);
    cx.globalCompositeOperation = 'destination-out';
    cx.drawImage(mask, 0, 0);
    cx.globalCompositeOperation = 'source-in';
    cx.fillStyle = COAST;
    cx.fillRect(0, 0, W, H);
    x.drawImage(coast, 0, 0);
  }

  // -- graticule every 15°, equator with degree ticks, dashed tropics and polar circles
  x.save();
  x.lineCap = 'butt';
  x.strokeStyle = `rgba(${INK},0.34)`;
  x.lineWidth = 1.6;
  x.beginPath();
  for (let lat = -75; lat <= 75; lat += 15) {
    if (lat === 0) continue;
    const y = (90 - lat) / 180 * H;
    x.moveTo(0, y); x.lineTo(W, y);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const xx = (lon + 180) / 360 * W;
    x.moveTo(xx, 0); x.lineTo(xx, H);
  }
  x.stroke();
  const eq = H / 2;
  x.strokeStyle = `rgba(${INK},0.72)`;
  x.lineWidth = 3.2;
  x.beginPath(); x.moveTo(0, eq); x.lineTo(W, eq); x.stroke();
  x.lineWidth = 1.4;
  x.beginPath();
  for (let lon = -180; lon < 180; lon += 1) {
    const xx = (lon + 180) * PX, len = lon % 5 === 0 ? 9 : 5;
    x.moveTo(xx, eq - len); x.lineTo(xx, eq + len);
  }
  x.stroke();
  x.strokeStyle = `rgba(${INK},0.6)`;
  x.lineWidth = 2.2;
  x.setLineDash([16, 11]);
  x.beginPath();
  for (const lat of [23.4367, -23.4367]) { const y = (90 - lat) / 180 * H; x.moveTo(0, y); x.lineTo(W, y); }
  x.stroke();
  x.strokeStyle = `rgba(${INK},0.45)`;
  x.lineWidth = 1.6;
  x.setLineDash([8, 9]);
  x.beginPath();
  for (const lat of [66.5633, -66.5633]) { const y = (90 - lat) / 180 * H; x.moveTo(0, y); x.lineTo(W, y); }
  x.stroke();
  x.restore();

  // -- ocean names: spaced serif capitals, widened by 1/cos(lat) so they keep
  //    their proportions on the sphere
  const label = (lines, lon, lat, size, alpha = 0.66, track = 0.5) => {
    const [px, py] = proj(lon, lat);
    x.save();
    x.translate(px, py);
    x.scale(1 / Math.cos(lat * DEG), 1);
    x.font = `400 ${size}px ${SERIF}`;
    x.textBaseline = 'middle';
    x.textAlign = 'left';
    x.fillStyle = `rgba(${INK},${alpha})`;
    const lh = size * 1.28;
    lines.forEach((text, li) => {
      const chars = [...text], gap = size * track;
      const widths = chars.map(ch => x.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
      let cx = -total / 2;
      const cy = (li - (lines.length - 1) / 2) * lh;
      chars.forEach((ch, i) => { x.fillText(ch, cx, cy); cx += widths[i] + gap; });
    });
    x.restore();
  };
  label(['PACIFIC OCEAN'], -140, 8, 64);
  label(['ATLANTIC', 'OCEAN'], -40, 27, 54);
  label(['INDIAN OCEAN'], 79, -17, 50, 0.66, 0.4);
  label(['SOUTHERN OCEAN'], 100, -56.5, 44);
  label(['ARCTIC OCEAN'], 88, 83.7, 22, 0.66, 0.35);

  // -- compass rose cartouche, South Pacific
  {
    const lat = -41, [px, py] = proj(-117, lat), R = 118;
    const ink = `rgba(${INK},0.85)`, paper = 'rgba(244,234,204,0.92)', pale = '#f4ead0';
    x.save();
    x.translate(px, py);
    x.scale(1 / Math.cos(lat * DEG), 1);
    x.fillStyle = paper;
    x.beginPath(); x.arc(0, 0, R * 1.02, 0, Math.PI * 2); x.fill();
    x.strokeStyle = ink;
    x.lineWidth = 3.5;
    x.beginPath(); x.arc(0, 0, R * 1.02, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 1.5;
    x.beginPath(); x.arc(0, 0, R * 0.93, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(0, 0, R * 0.64, 0, Math.PI * 2); x.stroke();
    // 32 ticks between the rings
    x.beginPath();
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2, r0 = i % 4 === 0 ? R * 0.8 : R * 0.86;
      x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      x.lineTo(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93);
    }
    x.stroke();
    // star: each point is two half-triangles, one inked, one pale
    const point = (a, len, w) => {
      const tx = Math.cos(a) * len, ty = Math.sin(a) * len;
      const lx = Math.cos(a - Math.PI / 2) * w, ly = Math.sin(a - Math.PI / 2) * w;
      x.fillStyle = ink;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(tx, ty); x.lineTo(lx, ly); x.closePath(); x.fill();
      x.fillStyle = pale;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(tx, ty); x.lineTo(-lx, -ly); x.closePath(); x.fill();
      x.strokeStyle = ink; x.lineWidth = 1.2;
      x.beginPath(); x.moveTo(lx, ly); x.lineTo(tx, ty); x.lineTo(-lx, -ly); x.stroke();
    };
    for (let i = 0; i < 4; i++) point(Math.PI / 4 + i * Math.PI / 2, R * 0.6, R * 0.1);
    for (let i = 0; i < 4; i++) point(-Math.PI / 2 + i * Math.PI / 2, R * 0.9, R * 0.15);
    x.fillStyle = ink;
    x.beginPath(); x.arc(0, 0, 6, 0, Math.PI * 2); x.fill();
    x.font = `700 ${Math.round(R * 0.3)}px ${SERIF}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const L = R * 1.24;
    x.fillText('N', 0, -L); x.fillText('S', 0, L);
    x.fillText('E', L, 0); x.fillText('W', -L, 0);
    x.restore();
  }

  // -- pin marker: small inked ring under the 3D pin
  if (pin) {
    const [px, py] = proj(pin.lon, pin.lat);
    x.save();
    x.strokeStyle = 'rgba(120,30,28,0.8)';
    x.lineWidth = 2;
    x.beginPath(); x.ellipse(px, py, 9 / Math.cos(pin.lat * DEG), 9, 0, 0, Math.PI * 2); x.stroke();
    x.restore();
  }

  // -- aged varnish: slight warm multiply
  x.save();
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = '#f7efdc';
  x.fillRect(0, 0, W, H);
  x.restore();

  // -- bump: land raised with a soft shoulder, printed ink very slightly proud
  const bump = makeCanvas(BW, BH), bx = bump.getContext('2d');
  bx.fillStyle = '#000';
  bx.fillRect(0, 0, BW, BH);
  if (features.length) {
    blurDraw(bx, maskHalf, 3, 'rgb(150,150,150)', BW, BH);
    bx.drawImage(tinted(maskHalf, 'rgb(150,150,150)'), 0, 0);
  }
  bx.save();
  bx.globalAlpha = 0.06;
  bx.fillStyle = bx.createPattern(grain, 'repeat');
  bx.fillRect(0, 0, BW, BH);
  bx.restore();

  // -- roughness (green channel): sea a touch glossier than land
  const rough = makeCanvas(BW, BH), rx = rough.getContext('2d');
  rx.fillStyle = 'rgb(128,128,128)';
  rx.fillRect(0, 0, BW, BH);
  if (features.length) rx.drawImage(tinted(maskHalf, 'rgb(160,160,160)'), 0, 0);
  rx.save();
  rx.globalAlpha = 0.08;
  rx.fillStyle = rx.createPattern(grain, 'repeat');
  rx.fillRect(0, 0, BW, BH);
  rx.restore();

  return {
    map: canvasTexture(map, { srgb: true, anisotropy }),
    bumpMap: canvasTexture(bump, { srgb: false, anisotropy }),
    roughnessMap: canvasTexture(rough, { srgb: false, anisotropy }),
    hasLand: features.length > 0,
  };
}

// turned walnut: concentric grain rings along the lathe profile (v)
function buildWoodTexture(anisotropy) {
  const W = 1024, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  const rnd = mulberry32(99);
  x.fillStyle = '#5a361f';
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 180; i++) {
    const y0 = rnd() * H, amp = 1 + rnd() * 4, f = (1 + rnd() * 3) * Math.PI * 2 / W, ph = rnd() * 6;
    const dark = rnd() < 0.6;
    x.strokeStyle = dark ? `rgba(34,18,9,${0.12 + rnd() * 0.3})` : `rgba(140,92,52,${0.1 + rnd() * 0.22})`;
    x.lineWidth = 0.6 + rnd() * 2.6;
    x.beginPath();
    for (let xx = 0; xx <= W; xx += 16) {
      const y = y0 + Math.sin(xx * f + ph) * amp;
      xx ? x.lineTo(xx, y) : x.moveTo(xx, y);
    }
    x.stroke();
  }
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = rnd() < 0.5 ? `rgba(25,12,5,${0.05 + rnd() * 0.08})` : `rgba(150,100,60,${0.04 + rnd() * 0.06})`;
    x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 6, 1);
  }
  const t = canvasTexture(c, { srgb: true, anisotropy });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

// meridian ring face: brass with engraved degree scale. Extrude cap UVs are the
// shape's own (x, y), so the texture is laid out in polar form over [-R, R].
function buildRingTexture(ri, ro, anisotropy) {
  const N = 2048, c = makeCanvas(N, N), x = c.getContext('2d');
  const R = ro * 1.04, k = N / (2 * R), C = N / 2;
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, N, N);
  const mid = (ri + ro) / 2, band = ro - ri;
  x.strokeStyle = '#3d2f1a';
  x.lineCap = 'butt';
  // border lines
  x.lineWidth = 2.2;
  for (const r of [ro - band * 0.1, ri + band * 0.1]) { x.beginPath(); x.arc(C, C, r * k, 0, Math.PI * 2); x.stroke(); }
  x.lineWidth = 1.4;
  x.beginPath(); x.arc(C, C, mid * k, 0, Math.PI * 2); x.stroke();
  // degree ticks from the outer border inward
  for (let d = 0; d < 360; d++) {
    const a = d * DEG, len = d % 10 === 0 ? 0.8 : d % 5 === 0 ? 0.6 : 0.36;
    const r0 = (ro - band * 0.1) * k, r1 = (ro - band * 0.1 - band * len) * k;
    x.lineWidth = d % 10 === 0 ? 3 : 1.8;
    x.beginPath();
    x.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
    x.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
    x.stroke();
  }
  const t = canvasTexture(c, { srgb: true, anisotropy });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1 / (2 * R), 1 / (2 * R));
  t.offset.set(0.5, 0.5);
  return t;
}

// ---------------------------------------------------------------- globe
export async function createGlobe(opts = {}) {
  const {
    radius = 6,
    anisotropy = 4,
    textureWidth = 4096,
    pin = { lat: 43.6532, lon: -79.3832 },
    tilt = 23.4,              // degrees, axis tilt inside the meridian plane
    yaw = 0.55,               // radians, rotation of the whole ring assembly about Y
    initialRotation = -1.0,   // radians, starting spin (-1.0 puts the Atlantic toward +Z, Toronto left of centre)
    fillIntensity = 1100,      // in-group spotlight that keeps the globe legible away from the lamp pool
  } = opts;

  const s = radius / 6;        // all fixed dimensions are given for radius 6
  const W = Math.max(512, textureWidth | 0), H = W >> 1;

  const geo = await loadGeoJSON();
  const t0 = performance.now();
  const tex = buildTextures({ W, H, geo, pin, anisotropy });
  const textureMs = performance.now() - t0;
  const woodTex = buildWoodTexture(anisotropy);

  // --- dimensions (reference radius 6)
  const ringR = 6.5 * s;                               // meridian ring centre line
  const ringBand = 0.42 * s, ringDepth = 0.15 * s;
  const ri = ringR - ringBand / 2, ro = ringR + ringBand / 2;
  const cy = 11 * s;                                   // sphere centre height
  const height = cy + ro;                              // top of the meridian ring
  const ringTex = buildRingTexture(ri, ro, anisotropy);

  // materials
  const brass = new THREE.MeshStandardMaterial({ color: 0xd6aa5e, metalness: 0.75, roughness: 0.3, envMapIntensity: 2.5 });
  const brassDark = new THREE.MeshStandardMaterial({ color: 0x7a5a2c, metalness: 0.9, roughness: 0.45, envMapIntensity: 1.4 });
  const ringFace = new THREE.MeshStandardMaterial({ color: 0xd6aa5e, map: ringTex, bumpMap: ringTex, bumpScale: 0.6, metalness: 0.75, roughness: 0.3, envMapIntensity: 2.5 });
  const baseMat = new THREE.MeshPhysicalMaterial({ map: woodTex, color: 0xffffff, metalness: 0, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.9 });
  const globeMat = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    roughnessMap: tex.roughnessMap,
    roughness: 1,
    metalness: 0,
    bumpMap: tex.bumpMap,
    bumpScale: 1.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1,
  });
  const pinHeadMat = new THREE.MeshPhysicalMaterial({ color: 0xb2392f, metalness: 0, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });

  const group = new THREE.Group();
  group.name = 'deskGlobe';

  const torus = (r, t, y, mat, seg = 96, rad = 12) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r * s, t * s, rad, seg), mat);
    m.rotation.x = Math.PI / 2;
    m.position.y = y * s;
    return m;
  };
  const cyl = (rt, rb, h, y, mat, seg = 48) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt * s, rb * s, h * s, seg), mat);
    m.position.y = (y + h / 2) * s;
    return m;
  };

  // --- base: turned walnut lathe profile with brass beads
  const base = new THREE.Group();
  base.name = 'base';
  {
    const prof = [
      [0, 0], [4.2, 0], [4.36, 0.05], [4.42, 0.18], [4.42, 0.36], [4.34, 0.46],
      [4.1, 0.5], [3.85, 0.56], [3.55, 0.68], [3.2, 0.86], [2.9, 1.0], [2.72, 1.08],
      [2.62, 1.12], [2.6, 1.2], [2.45, 1.24], [2.3, 1.3], [2.24, 1.4], [2.24, 1.52],
      [2.12, 1.6], [1.6, 1.66], [1.0, 1.7], [0, 1.7],
    ].map(([r, y]) => new THREE.Vector2(r * s, y * s));
    const lathe = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), baseMat);
    base.add(lathe);
  }
  base.add(
    torus(4.37, 0.055, 0.44, brass),         // bead on the foot
    torus(2.64, 0.05, 1.12, brass, 80),      // bead under the collar
    torus(2.25, 0.04, 1.52, brass, 72, 8),   // collar trim
    cyl(0.5, 0.68, 0.22, 1.66, brass, 40),   // stem foot
    cyl(0.32, 0.4, 0.16, 1.88, brass, 32),
  );
  const stemBottom = 2.0, stemTop = (cy - ro) / s - 0.35;
  base.add(cyl(0.2, 0.25, stemTop - stemBottom, stemBottom, brass, 24));
  group.add(base);

  // --- ring assembly, yawed about Y
  const assembly = new THREE.Group();
  assembly.name = 'assembly';
  assembly.position.y = cy;
  assembly.rotation.y = yaw;
  group.add(assembly);

  // saddle gripping the bottom of the ring
  {
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.5 * s, ringDepth + 0.24 * s), brass);
    saddle.position.y = -ro + 0.05 * s;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.4 * s, 0.36 * s, 24), brass);
    collar.position.y = -ro - 0.33 * s;
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.1 * s, ringDepth + 0.34 * s, 16), brassDark);
    screw.rotation.x = Math.PI / 2;
    screw.position.y = -ro + 0.05 * s;
    assembly.add(saddle, collar, screw);
  }

  // --- tilted axis: ring, sphere, pole pins, finials
  const tiltGroup = new THREE.Group();
  tiltGroup.name = 'tilt';
  tiltGroup.rotation.z = tilt * DEG;
  assembly.add(tiltGroup);

  {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const bevel = 0.025 * s;
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: ringDepth - bevel * 2, curveSegments: 160, bevelEnabled: true,
      bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    });
    g.translate(0, 0, -(ringDepth - bevel * 2) / 2);
    const ring = new THREE.Mesh(g, [ringFace, brass]);
    ring.name = 'meridian';
    tiltGroup.add(ring);
  }

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), globeMat);
  sphere.name = 'globe';
  sphere.rotation.y = initialRotation;
  tiltGroup.add(sphere);

  // axis pins through the ring, nuts on the outside
  for (const sign of [1, -1]) {
    const len = ro - radius + 0.42 * s;
    const pinAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.08 * s, len, 16), brass);
    pinAxis.position.y = sign * (radius - 0.1 * s + len / 2);
    const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.06 * s, 32), brass);
    washer.position.y = sign * (radius + 0.02 * s);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.16 * s, 6), brass);
    nut.position.y = sign * (ro + 0.08 * s);
    tiltGroup.add(pinAxis, washer, nut);
  }
  // north finial: turned spire
  {
    const prof = [
      [0, 0], [0.16, 0], [0.2, 0.05], [0.12, 0.12], [0.1, 0.2], [0.2, 0.32], [0.22, 0.42],
      [0.16, 0.52], [0.07, 0.62], [0.05, 0.72], [0.09, 0.8], [0.06, 0.88], [0, 0.96],
    ].map(([r, y]) => new THREE.Vector2(r * s, y * s));
    const finial = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), brass);
    finial.position.y = ro + 0.16 * s;
    tiltGroup.add(finial);
  }
  // south knob
  {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 24, 16), brass);
    knob.position.y = -(ro + 0.32 * s);
    tiltGroup.add(knob);
  }

  // --- location pin (child of the sphere so it spins with it)
  if (pin) {
    const lat = pin.lat * DEG, lon = pin.lon * DEG;
    const n = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
    const pinGroup = new THREE.Group();
    pinGroup.name = 'pin';
    pinGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    pinGroup.position.copy(n).multiplyScalar(radius - 0.05 * s);
    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * s, 0.03 * s, 0.5 * s, 10), brass);
    needle.position.y = 0.25 * s;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 20, 14), pinHeadMat);
    head.position.y = 0.56 * s;
    pinGroup.add(needle, head);
    sphere.add(pinGroup);
  }

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // --- dedicated fill: narrow spot from front-right, slightly above, range-limited so it
  //     barely reaches the desk behind the globe
  const fill = new THREE.SpotLight(0xfff3e2, fillIntensity, 36 * s, 0.33, 0.6, 2);
  fill.name = 'globeFill';
  fill.position.set(14 * s, cy + 9 * s, 16 * s);
  fill.target.position.set(0, cy - 1.5 * s, 0);
  fill.castShadow = false;
  group.add(fill, fill.target);

  group.userData.sphereCenterY = cy;
  group.userData.sphereCenter = new THREE.Vector3(0, cy, 0);
  group.userData.height = height;
  group.userData.radius = radius;
  group.userData.baseRadius = 4.42 * s;
  group.userData.hasLand = tex.hasLand;
  group.userData.textureMs = textureMs;

  const IDLE = 0.05, FOCUSED = 0.4;
  function update(dt, focus = 0) {
    if (!(dt > 0)) return;
    const f = Math.min(1, Math.max(0, focus || 0));
    sphere.rotation.y += Math.min(dt, 0.1) * (IDLE + (FOCUSED - IDLE) * f);
    // the lamp swings onto the globe when focused; ease the fill back
    fill.intensity = fillIntensity * (1 - 0.5 * f);
  }

  function dispose() {
    group.removeFromParent();
    fill.dispose();
    const mats = new Set();
    group.traverse(o => {
      if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); }
    });
    for (const m of mats) {
      for (const k of ['map', 'roughnessMap', 'bumpMap', 'emissiveMap', 'normalMap']) m[k]?.dispose?.();
      m.dispose();
    }
  }

  return { group, sphere, update, dispose };
}
