// ============ ROY SPEED — body-tracked AR endless runner ============
import * as THREE from 'three';
import { audio } from './audio.js';
import { PoseTracker } from './pose.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage'), video = $('cam'), glCanvas = $('gl');
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
const simCanvas = $('simbg'), simCtx = simCanvas.getContext('2d');
const overlay = $('poseOverlay');
const popupsEl = $('popups');

const bestKey = (d) => 'nova_rush_best_' + d;
const getBest = (d) => parseInt(localStorage.getItem(bestKey(d)) || '0', 10);
const setBest = (d, v) => localStorage.setItem(bestKey(d), String(v));

const LANES = [-2.6, 0, 2.6];
const DIFFS = {
  recruit: { base: 12, max: 24, ramp: 0.006, gap: 1.2, label: 'RECRUIT' },
  pilot:   { base: 14, max: 30, ramp: 0.008, gap: 1.0, label: 'PILOT' },
  ace:     { base: 16, max: 36, ramp: 0.010, gap: 0.85, label: 'ACE' }
};
const POWER_CFG = {
  magnet: { color: 0xa06bff, icon: '◎', name: 'Magnet', dur: 8 },
  x2:     { color: 0xffc233, icon: '×2', name: 'Double Score', dur: 10 },
  shield: { color: 0x3df5a6, icon: '⛨', name: 'Shield', dur: 0 },
  jet:    { color: 0x22d3ee, icon: '▲', name: 'Jetpack', dur: 5 }
};
const CHARS = [
  { id: 'nova',  name: 'Nova',  trim: 0x22d3ee, visor: 0xff2d95, legs: 0xa06bff, shoes: 0xffc233, glow: 0x22d3ee, perk: 'Magnet range +30%', magnet: 1.3, cost: 0 },
  { id: 'blaze', name: 'Blaze', trim: 0xffc233, visor: 0xff3b4e, legs: 0xff2d95, shoes: 0x22d3ee, glow: 0xffc233, perk: 'Jump height +12% — easy rooftops', jump: 1.12, cost: 100 },
  { id: 'volt',  name: 'Volt', trim: 0x3df5a6, visor: 0x22d3ee, legs: 0x22d3ee, shoes: 0xffc233, glow: 0x3df5a6, perk: 'Speed +8%, score +15%', speed: 1.08, score: 1.15, cost: 300 },
  { id: 'nyx',   name: 'Nyx', trim: 0xa06bff, visor: 0xff2d95, legs: 0xff2d95, shoes: 0x3df5a6, glow: 0xa06bff, perk: 'Free shield every run', shield: true, cost: 600 }
];
const ZONES = [
  { name: 'City Gate',    rail: 0xff2d95, cap: 0xa06bff, ring: 0x22d3ee, fog: 0x060312, sun: [255, 45, 149], grid: 0xa06bff },
  { name: 'Neon Bazaar',  rail: 0xffc233, cap: 0xff2d95, ring: 0xffc233, fog: 0x140609, sun: [255, 194, 51], grid: 0xff2d95 },
  { name: 'Sky Bridge',  rail: 0x22d3ee, cap: 0x3df5a6, ring: 0xa06bff, fog: 0x03101a, sun: [34, 211, 238], grid: 0x22d3ee },
  { name: 'Volt Grid', rail: 0x3df5a6, cap: 0x22d3ee, ring: 0xff2d95, fog: 0x04120c, sun: [61, 245, 166], grid: 0x3df5a6 }
];
const bankKey = 'nova_rush_bank';
const getBank = () => parseInt(localStorage.getItem(bankKey) || '0', 10);
const addBank = (n) => localStorage.setItem(bankKey, String(getBank() + n));
const bestDistKey = 'nova_rush_bestdist';
const getBestDist = () => parseInt(localStorage.getItem(bestDistKey) || '0', 10);
const runsKey = 'nova_rush_runs';
const getRuns = () => parseInt(localStorage.getItem(runsKey) || '0', 10);
const buzz = (p) => {
  if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
    try { navigator.vibrate(p); } catch {}
  }
};
const MISSION_POOL = [
  { id: 'coins',  name: 'Collect coins',   target: [30, 50, 80], unit: '' },
  { id: 'dist',   name: 'Run distance',        target: [300, 600, 1000], unit: 'm' },
  { id: 'jumps',  name: 'Jump',      target: [8, 12, 18], unit: '' },
  { id: 'slides', name: 'Slide',    target: [5, 8, 12], unit: '' },
  { id: 'near',   name: 'Near misses',     target: [3, 5, 8], unit: '' },
  { id: 'roof',   name: 'Run on train roofs', target: [60, 120, 200], unit: 'm' },
  { id: 'powers', name: 'Grab power-ups', target: [2, 3, 4], unit: '' },
  { id: 'trains', name: 'Ride train roofs', target: [3, 5, 8], unit: '' }
];
const charCfg = () => CHARS.find(c => c.id === S.char) || CHARS[0];

const S = {
  phase: 'menu', mode: 'touch', diff: 'pilot', paused: false,
  score: 0, coins: 0, dist: 0, jumps: 0, topSpeed: 0,
  speed: 8, lane: 1, x: 0, y: 0, vy: 0,
  slideT: 0, jetT: 0, magnetT: 0, x2T: 0, shield: false,
  boardT: 0, boardCool: 0, invulnT: 0,
  spawnT: 1.2, skyT: 0, crashT: 0, countT: 0,
  milestone: 500, shakeT: 0, bodyLostT: 0, bodyWarned: false,
  camOn: false, camVisible: false, runT: 0, coachT: 0,
  char: localStorage.getItem('nova_rush_char') || 'nova',
  onRoof: false, trainsRidden: 0, missions: [],
  zone: 0, slowT: 0, dustT: 0, sparkT: 0, boardFxT: 0
};
const obstacles = [], coins = [], powers = [], bursts = [], rings = [];
let tracker = null, stream = null;

// ---------- three ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true });
} catch (e) {
  document.body.innerHTML = '<div style="display:grid;place-items:center;height:100vh;color:#f2ecff;font-family:sans-serif;text-align:center;padding:20px">Sorry — this device does not support WebGL, so the game cannot run.</div>';
  throw e;
}
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060312, 0.011);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 220);
scene.add(camera);
scene.add(new THREE.AmbientLight(0x443366, 1.05));
scene.add(new THREE.HemisphereLight(0x8b5cf6, 0x0a0618, 0.5));
const keyL = new THREE.PointLight(0x22d3ee, 40, 60); keyL.position.set(5, 8, 4); scene.add(keyL);
const rimL = new THREE.PointLight(0xff2d95, 34, 60); rimL.position.set(-6, 4, -6); scene.add(rimL);
const tmpV = new THREE.Vector3();

// one-time baked neon environment so metals pick up colored reflections
{
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#1b0f3a'); g.addColorStop(0.44, '#3a1670');
  g.addColorStop(0.52, '#ff2d95'); g.addColorStop(0.58, '#22d3ee');
  g.addColorStop(0.78, '#0a0618'); g.addColorStop(1, '#05030c');
  x.fillStyle = g; x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 16; i++) {
    const bx = Math.random() * 512, by = 96 + Math.random() * 70;
    const rg = x.createRadialGradient(bx, by, 0, bx, by, 26);
    const col = ['255,194,51', '61,245,166', '160,107,255'][i % 3];
    rg.addColorStop(0, 'rgba(' + col + ',.9)'); rg.addColorStop(1, 'rgba(' + col + ',0)');
    x.fillStyle = rg; x.fillRect(bx - 26, by - 26, 52, 52);
  }
  const envTex = new THREE.CanvasTexture(c);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(envTex).texture;
  pmrem.dispose(); envTex.dispose();
}

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTexture();
function glowSprite(color, scale, opacity = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity }));
  s.scale.setScalar(scale);
  return s;
}

// ---------- textures ----------
function makeRoadTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#0d0620'; x.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(160,107,255,' + (Math.random() * 0.08).toFixed(3) + ')'; x.fillRect(Math.random() * 256, Math.random() * 512, 2, 2); }
  x.strokeStyle = 'rgba(160,107,255,.22)'; x.lineWidth = 3;
  for (let y = 0; y < 512; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
  const lane = (u, col, w, dash) => {
    x.strokeStyle = col; x.lineWidth = w; x.shadowColor = col; x.shadowBlur = 10;
    x.setLineDash(dash);
    x.beginPath(); x.moveTo(u * 256, 0); x.lineTo(u * 256, 512); x.stroke();
    x.setLineDash([]); x.shadowBlur = 0;
  };
  lane(0.03, '#ff2d95', 6, []); lane(0.97, '#ff2d95', 6, []);
  lane(0.3646, '#22d3ee', 4, [42, 26]); lane(0.6354, '#22d3ee', 4, [42, 26]);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 22);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function makeShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,.62)');
  g.addColorStop(0.6, 'rgba(0,0,0,.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function makeBoardTexture(text, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,4,22,.9)'; x.fillRect(0, 0, 512, 256);
  x.strokeStyle = col; x.lineWidth = 8; x.strokeRect(8, 8, 496, 240);
  x.font = '900 64px Orbitron, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = col; x.shadowBlur = 26;
  x.fillStyle = '#f2ecff';
  x.fillText(text, 256, 128);
  return new THREE.CanvasTexture(c);
}
const roadTex = makeRoadTexture();
const shadowMat = new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false });
function makeTrainSideTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#08131f'; x.fillRect(0, 0, 512, 128);
  x.fillStyle = 'rgba(34,211,238,.2)'; x.fillRect(0, 96, 512, 6);
  x.fillStyle = '#ff2d95'; x.fillRect(0, 108, 512, 4);
  for (let i = 0; i < 8; i++) {
    const wx = 12 + i * 63;
    x.fillStyle = i % 3 === 2 ? 'rgba(155,232,255,.95)' : 'rgba(34,211,238,.7)';
    x.fillRect(wx, 26, 40, 34);
    x.fillStyle = 'rgba(8,19,31,.9)'; x.fillRect(wx + 18, 26, 3, 34);
    x.strokeStyle = 'rgba(155,232,255,.5)'; x.lineWidth = 2; x.strokeRect(wx, 26, 40, 34);
  }
  for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(4,10,18,.85)'; x.fillRect(60 + i * 128, 12, 4, 104); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function makeTrainRoofTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#0a1626'; x.fillRect(0, 0, 128, 512);
  x.strokeStyle = 'rgba(61,245,166,.55)'; x.lineWidth = 3; x.strokeRect(6, 6, 116, 500);
  x.strokeStyle = 'rgba(34,211,238,.25)'; x.lineWidth = 2;
  for (let y = 40; y < 512; y += 56) { x.beginPath(); x.moveTo(10, y); x.lineTo(118, y); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function makeCityWindowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 128);
  for (let yy = 6; yy < 122; yy += 10) for (let xx = 6; xx < 58; xx += 10) {
    if (Math.random() < 0.42) {
      x.fillStyle = Math.random() < 0.25 ? 'rgba(255,194,51,.9)' : 'rgba(120,220,255,.75)';
      x.fillRect(xx, yy, 5, 6);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeHFadeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 8);
  return new THREE.CanvasTexture(c);
}
const trainSideTex = makeTrainSideTexture();
const trainRoofTex = makeTrainRoofTexture();

// ---------- track ----------
const scrollTies = new THREE.Group();
const scrollPillars = new THREE.Group();
const scrollArches = new THREE.Group();
scene.add(scrollTies, scrollPillars, scrollArches);
const railMats = [], wallMats = [], ringMats = [], archMats = [], shaftMats = [];
let capMat = null, dashMat = null, gridMat = null, beaconMat = null, horizonMat = null;
let themeTargets = [];
const zoneSun = [255, 45, 149];
function makeSignTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(6,3,18,.85)'; x.fillRect(0, 0, 512, 128);
  x.strokeStyle = '#22d3ee'; x.lineWidth = 6; x.strokeRect(6, 6, 500, 116);
  x.font = '900 64px Orbitron, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = '#ff2d95'; x.shadowBlur = 24;
  x.fillStyle = '#f2ecff';
  x.fillText('ROY SPEED', 256, 68);
  return new THREE.CanvasTexture(c);
}
function buildTrack() {
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(9.6, 176),
    new THREE.MeshStandardMaterial({ color: 0x0d0620, map: roadTex, emissive: 0xffffff, emissiveMap: roadTex, emissiveIntensity: 0.42, transparent: true, opacity: 0.94, roughness: 0.38, metalness: 0.5 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -76);
  scene.add(road);

  const tieGeo = [], dashGeo = [];
  const pushQuad = (arr, cx, cy, cz, w, l) => {
    arr.push(cx - w / 2, cy, cz - l / 2, cx + w / 2, cy, cz - l / 2, cx + w / 2, cy, cz + l / 2,
             cx - w / 2, cy, cz - l / 2, cx + w / 2, cy, cz + l / 2, cx - w / 2, cy, cz + l / 2);
  };
  for (let z = -168; z <= 12; z += 6) {
    pushQuad(tieGeo, 0, 0.02, z, 9.4, 0.35);
    pushQuad(dashGeo, -1.3, 0.03, z + 3, 0.12, 2.2);
    pushQuad(dashGeo, 1.3, 0.03, z + 3, 0.12, 2.2);
  }
  const mk = (arr, color, op) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  };
  scrollTies.add(mk(tieGeo, 0x2a1650, 0.55));
  dashMat = null;

  const railMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, c] of [[-4.6, 0xff2d95], [4.6, 0xff2d95]]) {
    const rm = railMat(c);
    railMats.push(rm);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 176), rm);
    rail.position.set(x, 0.1, -76);
    scene.add(rail);
    const wm = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    wallMats.push(wm);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(176, 1.1), wm);
    wall.rotation.y = Math.PI / 2;
    wall.position.set(x, 0.6, -76);
    scene.add(wall);
  }

  // wet-road neon reflection strips hugging the rails
  const fadeTex = makeHFadeTexture();
  for (const x of [-4.15, 4.15]) {
    const rm = new THREE.MeshBasicMaterial({ map: fadeTex, color: 0xff2d95, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    railMats.push(rm);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 176), rm);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.02, -76);
    scene.add(strip);
  }

  const pilGeo = [], capGeo = [], beaconPos = [];
  for (let z = -168; z <= 12; z += 12) {
    for (const x of [-7.6, 7.6]) {
      const h = 3 + Math.abs(Math.sin(z * 0.7)) * 4;
      pilGeo.push(x - 0.3, 0, z - 0.3, x + 0.3, 0, z - 0.3, x + 0.3, h, z - 0.3, x - 0.3, 0, z - 0.3, x + 0.3, h, z - 0.3, x - 0.3, h, z - 0.3);
      pushQuad(capGeo, x, h + 0.05, z, 0.9, 0.9);
      beaconPos.push(x, h + 0.25, z);
    }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pilGeo, 3));
  pg.computeVertexNormals();
  scrollPillars.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x140a2e, emissive: 0x31165e, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 })));
  const capMesh = mk(capGeo, 0xa06bff, 0.8);
  capMat = capMesh.material;
  scrollPillars.add(capMesh);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3));
  beaconMat = new THREE.PointsMaterial({ color: 0xa06bff, size: 1.7, map: glowTex, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  scrollPillars.add(new THREE.Points(bGeo, beaconMat));

  const grid = new THREE.GridHelper(240, 60, 0xa06bff, 0x22d3ee);
  grid.material.transparent = true;
  grid.material.opacity = 0.1;
  grid.position.y = -0.35;
  scene.add(grid);
  gridMat = grid.material;
  window.__grid = grid;

  for (let i = 0; i < 6; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2 + Math.random() * 2, 0.06, 8, 40),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0x22d3ee : 0xff2d95, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.set((Math.random() * 2 - 1) * 14, 3 + Math.random() * 6, -30 - Math.random() * 110);
    scene.add(ring);
    rings.push(ring);
    ringMats.push(ring.material);
  }

  const signTex = makeSignTexture();
  for (let z = -180; z <= 0; z += 90) {
    const am = new THREE.MeshStandardMaterial({ color: 0x140a2e, emissive: 0xa06bff, emissiveIntensity: 1.1, roughness: 0.4 });
    archMats.push(am);
    for (const x of [-5.2, 5.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.5, 0.25), am);
      post.position.set(x, 2.75, z);
      scrollArches.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.3, 0.3), am);
    top.position.set(0, 5.5, z);
    scrollArches.add(top);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    sign.position.set(0, 5.3, z);
    scrollArches.add(sign);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.6, 5.4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xa06bff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    shaft.position.set(0, 2.8, z);
    shaftMats.push(shaft.material);
    scrollArches.add(shaft);
  }

  // zone-tinted horizon glow behind the skyline
  horizonMat = new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff2d95, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(200, 74), horizonMat);
  horizon.position.set(0, 13, -178);
  scene.add(horizon);
}
buildTrack();

// ---------- speed streaks (camera-local) ----------
const streakCount = IS_MOBILE ? 80 : 130;
const streakPos = new Float32Array(streakCount * 3);
for (let i = 0; i < streakCount; i++) {
  streakPos[i * 3] = (Math.random() * 2 - 1) * 18;
  streakPos[i * 3 + 1] = (Math.random() * 2 - 1) * 10;
  streakPos[i * 3 + 2] = -8 - Math.random() * 62;
}
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streakMat = new THREE.PointsMaterial({ color: 0x9be8ff, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex });
const streaks = new THREE.Points(streakGeo, streakMat);
streaks.visible = false;
camera.add(streaks);

// ---------- landing impact rings ----------
const impactRings = [];
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  scene.add(m);
  impactRings.push({ m, life: 0 });
}
function impactRing(x, y, color) {
  const r = impactRings.find(r => r.life <= 0) || impactRings[0];
  r.life = 0.4;
  r.m.visible = true;
  r.m.position.set(x, y + 0.06, 0);
  r.m.material.color.setHex(color);
  r.m.scale.setScalar(1);
}
function setZone(idx, announce) {
  S.zone = idx;
  const z = ZONES[idx];
  themeTargets = [];
  for (const m of railMats) themeTargets.push({ m, c: new THREE.Color(z.rail) });
  for (const m of wallMats) themeTargets.push({ m, c: new THREE.Color(z.rail) });
  for (const m of archMats) themeTargets.push({ m, c: new THREE.Color(z.cap), emissive: true });
  if (capMat) themeTargets.push({ m: capMat, c: new THREE.Color(z.cap) });
  if (beaconMat) themeTargets.push({ m: beaconMat, c: new THREE.Color(z.cap) });
  for (const m of shaftMats) themeTargets.push({ m, c: new THREE.Color(z.cap) });
  if (dashMat) themeTargets.push({ m: dashMat, c: new THREE.Color(z.ring) });
  if (gridMat) themeTargets.push({ m: gridMat, c: new THREE.Color(z.grid) });
  ringMats.forEach((m, i) => themeTargets.push({ m, c: new THREE.Color(i % 2 ? z.ring : z.rail) }));
  themeTargets.push({ fog: true, c: new THREE.Color(z.fog) });
  if (announce) {
    showBanner('ZONE: ' + z.name, 'Entering new district');
    audio.zone();
    buzz(12);
  }
}
setZone(0, false);

// ---------- distant city + billboards + dust ----------
const cityGeo = new THREE.BoxGeometry(1, 1, 1);
const cityWinTex = makeCityWindowTexture();
const cityMat = new THREE.MeshStandardMaterial({ color: 0x0a0618, emissive: 0x9fd8ff, emissiveMap: cityWinTex, emissiveIntensity: 1.15, roughness: 0.7 });
const city = new THREE.InstancedMesh(cityGeo, cityMat, 64);
const m4 = new THREE.Matrix4();
for (let i = 0; i < 64; i++) {
  const side = i % 2 ? 1 : -1;
  const hgt = 4 + Math.abs(Math.sin(i * 7.3)) * 12;
  const wdt = 2.5 + Math.abs(Math.sin(i * 3.1)) * 3;
  m4.makeScale(wdt, hgt, 3.5);
  m4.setPosition(side * (12 + (i % 7) * 1.6), hgt / 2 - 0.4, -10 - (i * 5.3) % 160);
  city.setMatrixAt(i, m4);
}
city.instanceMatrix.needsUpdate = true;
scene.add(city);
const scrollBoards = new THREE.Group();
scene.add(scrollBoards);
const boardDefs = [['COIN ×2', '#ffc233', -8.6, -20], ['ROY SPEED', '#22d3ee', 8.6, -70], ['JETPACK', '#ff2d95', -8.6, -120]];
for (const [txt, col, bx, bz] of boardDefs) {
  const b = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: makeBoardTexture(txt, col), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  b.position.set(bx, 4.6 + Math.abs(bx) * 0.1, bz);
  b.rotation.y = bx < 0 ? 0.4 : -0.4;
  scrollBoards.add(b);
}
const dustN = IS_MOBILE ? 90 : 160;
const dustPos = new Float32Array(dustN * 3);
for (let i = 0; i < dustN; i++) { dustPos[i * 3] = (Math.random() * 2 - 1) * 14; dustPos[i * 3 + 1] = Math.random() * 8; dustPos[i * 3 + 2] = -140 + Math.random() * 150; }
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xa06bff, size: 0.07, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex }));
scene.add(dust);

// ---------- runner ----------
const runner = new THREE.Group();
const limb = (w, h, d, color, em) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
  new THREE.MeshStandardMaterial({ color, emissive: em, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.5 }));
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 12),
  new THREE.MeshStandardMaterial({ color: 0x101a30, emissive: 0x22d3ee, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.5 }));
torso.scale.set(1.1, 1, 0.72);
torso.position.y = 1.15;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0x101a30, emissive: 0x16405a, emissiveIntensity: 0.9, roughness: 0.3 }));
head.position.y = 1.95;
const visor = limb(0.4, 0.12, 0.1, 0x000000, 0xff2d95);
visor.position.set(0, 1.98, 0.26);
const armL = new THREE.Group(), armR = new THREE.Group(), legL = new THREE.Group(), legR = new THREE.Group();
armL.position.set(-0.48, 1.55, 0); armR.position.set(0.48, 1.55, 0);
legL.position.set(-0.2, 0.72, 0); legR.position.set(0.2, 0.72, 0);
const armMeshL = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.46, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x101a30, emissive: 0x22d3ee, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.5 }));
armMeshL.position.y = -0.3; armL.add(armMeshL);
const armMeshR = armMeshL.clone(); armR.add(armMeshR);
const legMeshL = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.52, 4, 8),
  new THREE.MeshStandardMaterial({ color: 0x0c1226, emissive: 0xa06bff, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.5 }));
legMeshL.position.y = -0.36; legL.add(legMeshL);
const legMeshR = legMeshL.clone(); legR.add(legMeshR);
const shoeL = limb(0.24, 0.14, 0.4, 0x000000, 0xffc233); shoeL.position.set(0, -0.72, 0.08); legL.add(shoeL);
const shoeR = shoeL.clone(); legR.add(shoeR);
const board = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 2.3),
  new THREE.MeshStandardMaterial({ color: 0x1a0a18, emissive: 0xff2d95, emissiveIntensity: 1.6, roughness: 0.3 }));
board.position.y = -0.12;
board.visible = false;
const boardGlow = glowSprite(0xff2d95, 3, 0.6);
boardGlow.position.y = -0.2;
boardGlow.visible = false;
const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 20),
  new THREE.MeshBasicMaterial({ color: 0x3df5a6, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
shieldBubble.position.y = 1.1;
shieldBubble.visible = false;
const jetFlame = glowSprite(0x22d3ee, 1.6, 0.9);
jetFlame.position.set(0, 0.6, -0.4);
jetFlame.visible = false;
const chestCore = glowSprite(0x22d3ee, 0.6, 0.55);
chestCore.position.set(0, 1.28, 0.36);
const jetPack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.22),
  new THREE.MeshStandardMaterial({ color: 0x0c1226, emissive: 0x22d3ee, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.7 }));
jetPack.position.set(0, 1.3, -0.32);
const jetCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 10, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
jetCone.rotation.x = Math.PI;
jetCone.position.set(0, 0.72, -0.36);
jetCone.visible = false;
const runnerGlow = glowSprite(0x22d3ee, 2.4, 0.35);
runner.add(torso, head, visor, armL, armR, legL, legR, board, boardGlow, shieldBubble, jetFlame, chestCore, jetPack, jetCone, runnerGlow);
runner.position.set(0, 0, 0);
scene.add(runner);
const runnerShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
runnerShadow.material = shadowMat.clone();
runnerShadow.rotation.x = -Math.PI / 2;
runnerShadow.position.y = 0.03;
scene.add(runnerShadow);

// speed trail ribbon (board / jet / high speed)
const TRAIL_N = 22;
const trailPos = new Float32Array(TRAIL_N * 6);
const trailCol = new Float32Array(TRAIL_N * 6);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
const trailIdx = [];
for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; trailIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
trailGeo.setIndex(trailIdx);
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
trail.visible = false;
trail.frustumCulled = false;
scene.add(trail);
const trailHist = [];
function updateTrail(move) {
  for (const p of trailHist) p.z += move;
  const want = S.boardT > 0 || S.jetT > 0 || S.speed > 22;
  if (want) {
    trailHist.unshift(new THREE.Vector3(S.x, S.y + 0.35, 0.6));
    if (trailHist.length > TRAIL_N) trailHist.pop();
  } else if (trailHist.length) trailHist.pop();
  trail.visible = trailHist.length > 2;
  if (!trail.visible) return;
  const col = new THREE.Color(charCfg().glow);
  for (let i = 0; i < TRAIL_N; i++) {
    const p = trailHist[Math.min(i, trailHist.length - 1)];
    const w = 0.34 * (1 - i / TRAIL_N);
    trailPos[i * 6] = p.x - w; trailPos[i * 6 + 1] = p.y; trailPos[i * 6 + 2] = p.z;
    trailPos[i * 6 + 3] = p.x + w; trailPos[i * 6 + 4] = p.y; trailPos[i * 6 + 5] = p.z;
    const f = Math.pow(1 - i / TRAIL_N, 1.6) * 0.8;
    for (const k of [0, 3]) { trailCol[i * 6 + k] = col.r * f; trailCol[i * 6 + k + 1] = col.g * f; trailCol[i * 6 + k + 2] = col.b * f; }
  }
  trailGeo.attributes.position.needsUpdate = true;
  trailGeo.attributes.color.needsUpdate = true;
}

function applyChar() {
  const c = charCfg();
  torso.material.emissive.setHex(c.trim);
  visor.material.emissive.setHex(c.visor);
  armMeshL.material.emissive.setHex(c.trim);
  legMeshL.material.emissive.setHex(c.legs);
  shoeL.material.emissive.setHex(c.shoes);
  head.material.emissive.setHex(c.trim);
  head.material.emissiveIntensity = 0.35;
  chestCore.material.color.setHex(c.trim);
  jetPack.material.emissive.setHex(c.trim);
  runnerGlow.material.color.setHex(c.glow);
}
function selectChar(id) {
  const c = CHARS.find(x => x.id === id);
  if (!c) return;
  if (getBank() < c.cost) {
    toast('Need ' + (c.cost - getBank()) + ' more coins to unlock — earn them from runs & missions');
    audio.ui();
    return;
  }
  S.char = id;
  localStorage.setItem('nova_rush_char', id);
  applyChar();
  renderChars();
}
function renderChars() {
  const bank = getBank();
  $('charRow').innerHTML = CHARS.map(c => {
    const locked = bank < c.cost;
    return '<button class="char-card' + (c.id === S.char ? ' on' : '') + (locked ? ' locked' : '') + '" data-char="' + c.id + '">' +
    '<svg viewBox="0 0 44 52"><circle cx="22" cy="9" r="7" fill="#101a30"/><rect x="15" y="7" width="14" height="3.4" fill="#' + c.visor.toString(16).padStart(6, '0') + '"/>' +
    '<rect x="14" y="18" width="16" height="19" fill="#' + c.trim.toString(16).padStart(6, '0') + '"/>' +
    '<rect x="7" y="19" width="5" height="14" fill="#' + c.trim.toString(16).padStart(6, '0') + '"/><rect x="32" y="19" width="5" height="14" fill="#' + c.trim.toString(16).padStart(6, '0') + '"/>' +
    '<rect x="15" y="37" width="6" height="12" fill="#' + c.legs.toString(16).padStart(6, '0') + '"/><rect x="23" y="37" width="6" height="12" fill="#' + c.legs.toString(16).padStart(6, '0') + '"/>' +
    '<rect x="14" y="48" width="8" height="3.4" fill="#' + c.shoes.toString(16).padStart(6, '0') + '"/><rect x="22" y="48" width="8" height="3.4" fill="#' + c.shoes.toString(16).padStart(6, '0') + '"/></svg>' +
    '<div class="char-name">' + c.name + '</div><div class="char-perk">' + (locked ? 'Unlock: ' + c.cost + ' bank coins' : c.perk) + '</div></button>';
  }).join('');
}
function renderStats() {
  $('bankStart').textContent = getBank().toLocaleString('en-US');
  $('bestDistStart').textContent = getBestDist() + 'm';
  $('runsStart').textContent = getRuns().toLocaleString('en-US');
  $('bankRunners').textContent = getBank().toLocaleString('en-US');
}
$('charRow').addEventListener('click', (e) => {
  const b = e.target.closest('.char-card');
  if (!b) return;
  audio.ensure(); audio.ui();
  selectChar(b.dataset.char);
});

// ---------- entities ----------
function makeObstacle(lane, type, z, moving = false, ramp = false) {
  const g = new THREE.Group();
  let depth = 0.6, height = 1;
  if (type === 'low') {
    height = 1.0;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x241005, emissive: 0xffc233, emissiveIntensity: 1.3, roughness: 0.4 }));
    bar.position.y = 0.5;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.16, 0.44),
      new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    stripe.position.y = 0.86;
    g.add(bar, stripe, glowSprite(0xffc233, 2.4, 0.5));
  } else if (type === 'gate') {
    height = 2.6;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1c0716, emissive: 0xff2d95, emissiveIntensity: 1.2 });
    for (const x of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.4), postMat);
      post.position.set(x, 1.3, 0);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x1c0716, emissive: 0xff2d95, emissiveIntensity: 1.5 }));
    bar.position.y = 1.95;
    const warn = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.14, 0.44),
      new THREE.MeshBasicMaterial({ color: 0xff2d95, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    warn.position.y = 1.32;
    g.add(bar, warn, glowSprite(0xff2d95, 2.6, 0.5));
  } else {
    height = 2.6; depth = 30;
    const sideMat = () => new THREE.MeshStandardMaterial({ color: 0x08131f, map: trainSideTex, emissive: 0xffffff, emissiveMap: trainSideTex, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.85 });
    const endMat = () => new THREE.MeshStandardMaterial({ color: 0x08131f, emissive: 0x0e7490, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.6, 30), [
      sideMat(), sideMat(),
      new THREE.MeshStandardMaterial({ color: 0x0a1626, map: trainRoofTex, emissive: 0xffffff, emissiveMap: trainRoofTex, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.8 }),
      endMat(), endMat()
    ]);
    body.position.y = 1.3;
    const winStrip = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.5, 29.4),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
    winStrip.position.y = 1.9;
    const roofMat = new THREE.MeshBasicMaterial({ color: 0x3df5a6, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const rx of [-1.12, 1.12]) {
      const roofRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 30), roofMat);
      roofRail.position.set(rx, 2.63, 0);
      g.add(roofRail);
    }
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62),
      new THREE.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    windshield.position.set(0, 2.05, 15.06);
    const bogieMat = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.8, metalness: 0.4 });
    for (const bz of [-9, 9]) {
      const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 3), bogieMat);
      bogie.position.set(0, 0.25, bz);
      g.add(bogie);
    }
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x0a0618, emissive: 0x31165e, emissiveIntensity: 0.6 });
    for (const vz of [-6, 0, 6]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.2), ventMat);
      vent.position.set(0, 2.66, vz);
      g.add(vent);
    }
    const tShadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 31), shadowMat);
    tShadow.rotation.x = -Math.PI / 2;
    tShadow.position.y = 0.04;
    const headlight = glowSprite(moving ? 0xff3b4e : 0x22d3ee, 3, 0.8);
    headlight.position.set(0, 1.2, 15.1);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.5, 9, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: moving ? 0xff3b4e : 0x22d3ee, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(0, 1.2, 19.6);
    const under = glowSprite(0x0e7490, 5, 0.3);
    under.position.y = 0.15;
    g.add(body, winStrip, windshield, tShadow, headlight, beam, under);
    if (ramp) {
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 4.4),
        new THREE.MeshStandardMaterial({ color: 0x241005, emissive: 0xffc233, emissiveIntensity: 1.2, roughness: 0.4 }));
      wedge.rotation.x = 0.6;
      wedge.position.set(0, 1.3, 16.7);
      g.add(wedge);
    }
  }
  g.position.set(LANES[lane], 0, z);
  scene.add(g);
  const o = { kind: 'ob', type, lane, group: g, depth, height, roof: type === 'train' ? 2.6 : 0, ramp: !!ramp, z, moving, extra: moving ? 5 : 0, passed: false, dead: false };
  obstacles.push(o);
  if (type === 'train' && !moving && Math.random() < 0.6) {
    for (let i = 0; i < 9; i++) makeCoin(lane, z - 9.6 + i * 2.4, 3.55, o.extra);
  }
  return o;
}
function makeCoin(lane, z, y = 0.95, extra = 0) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18),
    new THREE.MeshStandardMaterial({ color: 0x3a2a05, emissive: 0xffc233, emissiveIntensity: 1.8, roughness: 0.25, metalness: 0.8 }));
  c.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a2a05, emissive: 0xffc233, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.9 }));
  g.add(c, rim, glowSprite(0xffc233, 1.1, 0.55));
  g.position.set(LANES[lane], y, z);
  scene.add(g);
  coins.push({ group: g, lane, extra, dead: false, spin: Math.random() * 6 });
}
function makePower(lane, z, type) {
  const cfg = POWER_CFG[type];
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5),
    new THREE.MeshStandardMaterial({ color: 0x0a0a18, emissive: cfg.color, emissiveIntensity: 2.0, roughness: 0.2 }));
  core.position.y = 1.1;
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.72),
    new THREE.MeshBasicMaterial({ color: cfg.color, wireframe: true, transparent: true, opacity: 0.6 }));
  shell.position.y = 1.1;
  g.add(core, shell, glowSprite(cfg.color, 2.6, 0.7));
  g.position.set(LANES[lane], 0, z);
  scene.add(g);
  powers.push({ type, cfg, group: g, core, shell, dead: false, t: 0 });
}
function burst(pos, color, count = 24, power = 1) {
  if (bursts.length > 24) { const b = bursts.shift(); scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); }
  const positions = new Float32Array(count * 3), vels = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
    vels.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 5) * power));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color, size: 0.15 * power, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTex });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  bursts.push({ pts, geo, mat, vels, life: 0.7, max: 0.7 });
}
function removeGroup(g) {
  scene.remove(g);
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

// ---------- spawn director ----------
function coinLine(lane, z, n = 5, y = 0.95) { for (let i = 0; i < n; i++) makeCoin(lane, z - i * 2.2, y); }
function coinArc(lane, z) { for (let i = 0; i < 5; i++) makeCoin(lane, z + 4 - i * 2, 0.95 + Math.sin((i / 4) * Math.PI) * 1.3); }
function spawnRow() {
  const z = -150;
  const r = Math.random();
  const types = ['low', 'gate', 'train'];
  const pick = () => types[Math.floor(Math.random() * 3)];
  if (r < 0.34) {
    const l = Math.floor(Math.random() * 3);
    const t = pick();
    makeObstacle(l, t, z, t === 'train' && Math.random() < 0.2, t === 'train' && Math.random() < 0.35);
    const free = (l + 1 + Math.floor(Math.random() * 2)) % 3;
    if (t === 'low') coinArc(l, z); else coinLine(free, z);
  } else if (r < 0.6) {
    const l1 = Math.floor(Math.random() * 3);
    let l2 = (l1 + 1 + Math.floor(Math.random() * 2)) % 3;
    const t1 = pick(), t2 = pick();
    makeObstacle(l1, t1, z, t1 === 'train' && Math.random() < 0.2, t1 === 'train' && Math.random() < 0.35);
    makeObstacle(l2, t2, z - 2, t2 === 'train' && Math.random() < 0.2, t2 === 'train' && Math.random() < 0.35);
    const free = 3 - l1 - l2;
    coinLine(free, z, 6);
  } else if (r < 0.75) {
    const l = Math.floor(Math.random() * 3);
    makeObstacle(l, 'train', z, Math.random() < 0.25, Math.random() < 0.4);
    const adj = (l + 1) % 3;
    makeObstacle(adj, 'low', z + 3);
    coinArc(adj, z + 3);
  } else if (r < 0.9) {
    for (let l = 0; l < 3; l++) coinLine(l, z - Math.random() * 4, 4);
  } else {
    const l = Math.floor(Math.random() * 3);
    const keys = Object.keys(POWER_CFG);
    makePower(l, z, keys[Math.floor(Math.random() * keys.length)]);
    coinLine((l + 1) % 3, z, 4);
  }
}

// ---------- feedback ----------
function popup(worldPos, text, cls = '') {
  tmpV.copy(worldPos).project(camera);
  if (tmpV.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = ((tmpV.x * 0.5 + 0.5) * innerWidth) + 'px';
  el.style.top = ((-tmpV.y * 0.5 + 0.5) * innerHeight) + 'px';
  popupsEl.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
function toast(msg, warn = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
let bannerTimer = null;
function showBanner(main, sub) {
  $('bannerMain').textContent = main;
  $('bannerSub').textContent = sub || '';
  const b = $('banner');
  b.classList.remove('hidden', 'show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add('hidden'), 1950);
}
function gestureFlash(text, color) {
  const el = $('gestureFlash');
  el.textContent = text;
  el.style.color = color || 'var(--green)';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
const coachTimers = {};
function coachLit(key) {
  const bar = $('bodyCoach');
  if (!bar.classList.contains('show')) return;
  const el = bar.querySelector('[data-g="' + key + '"]');
  if (!el) return;
  el.classList.add('lit');
  clearTimeout(coachTimers[key]);
  coachTimers[key] = setTimeout(() => el.classList.remove('lit'), 600);
}
function hideCoach() {
  $('bodyCoach').classList.remove('show');
  for (const el of document.querySelectorAll('#bodyCoach .bc')) el.classList.remove('lit');
}
function shake(t) { S.shakeT = Math.max(S.shakeT, t); }
function damageFlash() {
  const v = $('vignette');
  v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit');
}

// ---------- train roof support ----------
function supportHeight() {
  let h = 0;
  for (const o of obstacles) {
    if (o.type === 'train' && !o.dead && Math.abs(o.z) < 15.2 && Math.abs(o.group.position.x - S.x) < 1.15) h = 2.6;
  }
  return h;
}

// ---------- missions ----------
const MKEY = 'nova_rush_missions_v1';
let missionDirty = false, lastMissionRender = 0;
const mTier = () => ({ recruit: 0, pilot: 1, ace: 2 })[S.diff];
const mDef = (id) => MISSION_POOL.find(m => m.id === id);
function newMission(exclude) {
  const opts = MISSION_POOL.filter(m => !exclude.includes(m.id));
  const d = opts[Math.floor(Math.random() * opts.length)];
  return { id: d.id, prog: 0, target: d.target[mTier()], done: false };
}
function loadMissions() {
  try {
    const arr = JSON.parse(localStorage.getItem(MKEY) || 'null');
    if (Array.isArray(arr) && arr.length === 3 && arr.every(m => mDef(m.id) && typeof m.prog === 'number')) return arr;
  } catch {}
  const ids = [];
  const out = [];
  for (let i = 0; i < 3; i++) { const m = newMission(ids); ids.push(m.id); out.push(m); }
  return out;
}
function saveMissions() { localStorage.setItem(MKEY, JSON.stringify(S.missions)); }
function refreshMissions() {
  const ids = S.missions.filter(m => !m.done).map(m => m.id);
  S.missions = S.missions.map(m => {
    if (!m.done) return m;
    const nm = newMission(ids);
    ids.push(nm.id);
    return nm;
  });
  saveMissions();
  missionDirty = true;
}
function missionAdd(id, amt) {
  const m = S.missions.find(x => x.id === id);
  if (!m || m.done) return;
  const before = Math.floor(m.prog);
  m.prog = Math.min(m.target, m.prog + amt);
  missionDirty = true;
  if (amt >= 1 && Math.floor(m.prog) !== before) saveMissions();
  if (m.prog >= m.target) {
    m.done = true;
    S.coins += 25;
    S.score += 500 * mult();
    audio.power();
    buzz(20);
    toast('Mission complete: ' + mDef(id).name + ' · +25 coins');
    saveMissions();
    renderMissions();
    if (S.missions.every(x => x.done)) {
      S.coins += 100;
      S.score += 1500 * mult();
      showBanner('ALL MISSIONS COMPLETE!', '+100 coin bonus');
    }
  }
}
function renderMissions() {
  const rows = S.missions.map(m => {
    const d = mDef(m.id);
    const pct = Math.min(100, (m.prog / m.target) * 100);
    return '<div class="m-row' + (m.done ? ' done' : '') + '"><span class="m-name">' + (m.done ? '✓ ' : '') + d.name + '</span>' +
      '<span class="m-prog">' + Math.floor(m.prog) + '/' + m.target + d.unit + '</span>' +
      '<span class="m-bar"><b style="width:' + pct + '%"></b></span></div>';
  }).join('');
  $('missionPanel').innerHTML = rows;
  $('missionStart').innerHTML = rows;
}

// ---------- actions ----------
function setLane(l) {
  if (S.phase !== 'run' || S.paused) return;
  l = Math.max(0, Math.min(2, l));
  if (l === S.lane) return;
  S.lane = l;
  audio.lane();
}
function doJump() {
  if (S.phase !== 'run' || S.paused) return;
  const sup = supportHeight();
  if (S.y > sup + 0.05 || S.jetT > 0) return;
  S.vy = 12.6 * (charCfg().jump || 1);
  S.slideT = 0;
  S.jumps++;
  missionAdd('jumps', 1);
  audio.jump();
  gestureFlash('JUMP', '#3df5a6');
}
function startSlide(dur = 0.65) {
  if (S.phase !== 'run' || S.paused) return;
  const sup = supportHeight();
  if (S.y > sup + 0.05 || S.jetT > 0) return;
  if (S.slideT <= 0) { audio.slide(); missionAdd('slides', 1); }
  S.slideT = Math.max(S.slideT, dur);
  gestureFlash('SLIDE', '#ffc233');
}
function activateBoard() {
  if (S.phase !== 'run' || S.paused) return;
  if (S.boardT > 0 || S.boardCool > 0) return;
  S.boardT = 30;
  audio.board();
  gestureFlash('HOVERBOARD', '#ff2d95');
  toast('Hoverboard active — saves you from one crash');
}
function mult() { return S.x2T > 0 ? 2 : 1; }

function collectPower(p) {
  const pos = p.group.position.clone();
  removeGroup(p.group);
  p.dead = true;
  burst(pos, p.cfg.color, 26, 0.9);
  audio.power();
  buzz(25);
  if (p.type === 'shield') { S.shield = true; popup(pos, '⛨ Shield ready', 'pow'); }
  else if (p.type === 'jet') { S.jetT = p.cfg.dur; audio.setJet(true); popup(pos, '▲ Jetpack!', 'big'); }
  else { S[p.type === 'magnet' ? 'magnetT' : 'x2T'] = p.cfg.dur; popup(pos, p.cfg.icon + ' ' + p.cfg.name, 'pow'); }
  missionAdd('powers', 1);
}

function crash() {
  S.phase = 'crash';
  S.crashT = 1.0;
  S.slowT = 0.5;
  buzz([70, 40, 70]);
  audio.crash();
  audio.setWind(0);
  audio.setJet(false);
  audio.stopMusic();
  shake(0.7);
  damageFlash();
  burst(runner.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff3b4e, 46, 1.5);
}

function savedBy(kind) {
  S.invulnT = 1.2;
  audio.save();
  shake(0.35);
  damageFlash();
  popup(runner.position.clone().add(new THREE.Vector3(0, 2, 0)), kind === 'shield' ? '⛨ Shield save!' : 'Board save!', 'pow');
  burst(runner.position.clone().add(new THREE.Vector3(0, 1, 0)), kind === 'shield' ? 0x3df5a6 : 0xff2d95, 30, 1.2);
}

// ---------- game flow ----------
function resetRun() {
  for (const o of obstacles) if (!o.dead) removeGroup(o.group);
  obstacles.length = 0;
  for (const c of coins) if (!c.dead) removeGroup(c.group);
  coins.length = 0;
  for (const p of powers) if (!p.dead) removeGroup(p.group);
  powers.length = 0;
  for (const b of bursts) { scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); }
  bursts.length = 0;
  popupsEl.innerHTML = '';
  $('powerChips').innerHTML = '';
  Object.assign(S, {
    score: 0, coins: 0, dist: 0, jumps: 0, topSpeed: 0, speed: DIFFS[S.diff].base,
    lane: 1, x: 0, y: 0, vy: 0, slideT: 0, jetT: 0, magnetT: 0, x2T: 0, shield: false,
    boardT: 0, boardCool: 0, invulnT: 0, spawnT: 1.4, skyT: 0, milestone: 500,
    shakeT: 0, bodyLostT: 0, bodyWarned: false, paused: false, runT: 0, coachT: 0,
    onRoof: false, trainsRidden: 0, zone: 0, slowT: 0, dustT: 0, sparkT: 0, boardFxT: 0
  });
  hideCoach();
  setZone(0, false);
  S.shield = !!charCfg().shield;
  refreshMissions();
  renderMissions();
  runner.rotation.set(0, 0, 0);
  runner.position.set(0, 0, 0);
  trailHist.length = 0;
  trail.visible = false;
  jetCone.visible = false;
  for (const k in hudCache) delete hudCache[k];
}
function startCountdown() {
  S.phase = 'count';
  S.countT = 3.4;
  $('screen-start').classList.add('hidden');
  $('screen-calib').classList.add('hidden');
  $('screen-loading').classList.add('hidden');
  $('screen-over').classList.add('hidden');
  $('screen-pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('countdown').classList.remove('hidden');
  updateModeChip();
  syncHUD();
}
function beginRun() {
  S.phase = 'run';
  localStorage.setItem(runsKey, String(getRuns() + 1));
  if (tracker) tracker.pip = true;
  setCamVisible(true);
  acquireWake();
  $('countdown').classList.add('hidden');
  audio.ensure();
  audio.startMusic();
  audio.startWind();
  showBanner('RUN START!', 'Dodge · Jump · Slide');
  if (S.mode === 'body') { $('bodyCoach').classList.add('show'); S.coachT = 9; }
}
function gameOver() {
  S.phase = 'over';
  releaseWake();
  saveMissions();
  const prevBank = getBank();
  addBank(S.coins);
  const newBank = getBank();
  for (const c of CHARS) {
    if (c.cost > prevBank && c.cost <= newBank) {
      toast('Unlocked: ' + c.name + '! Check character select');
      audio.unlock();
      buzz([30, 30, 30]);
    }
  }
  if (Math.floor(S.dist) > getBestDist()) localStorage.setItem(bestDistKey, String(Math.floor(S.dist)));
  renderChars();
  renderStats();
  $('ovBank').textContent = 'Coin bank: ' + newBank.toLocaleString('en-US') + ' · this run +' + S.coins;
  const best = getBest(S.diff);
  const isBest = S.score > best;
  if (isBest) setBest(S.diff, Math.floor(S.score));
  $('finalScore').textContent = Math.floor(S.score).toLocaleString('en-US');
  $('ovDist').textContent = Math.floor(S.dist) + 'm';
  $('ovCoins').textContent = S.coins;
  $('ovJumps').textContent = S.jumps;
  $('ovBest').textContent = Math.max(best, Math.floor(S.score)).toLocaleString('en-US');
  $('newBest').classList.toggle('hidden', !isBest);
  $('ovMissions').textContent = 'Missions: ' + S.missions.filter(m => m.done).length + '/3 complete · Roof rides: ' + S.trainsRidden;
  $('screen-over').classList.remove('hidden');
  $('hud').classList.add('hidden');
}
function setPaused(p) {
  if (S.phase !== 'run' && S.phase !== 'count') return;
  S.paused = p;
  $('screen-pause').classList.toggle('hidden', !p);
  if (p) {
    $('pauseScore').textContent = Math.floor(S.score).toLocaleString('en-US');
    $('pauseCoins').textContent = S.coins;
    audio.stopMusic(); audio.setWind(0); audio.setJet(false);
    releaseWake();
  } else if (S.phase === 'run') {
    acquireWake();
    audio.startMusic(); audio.setWind(S.speed / DIFFS[S.diff].max);
    if (S.jetT > 0) audio.setJet(true);
  }
}
function quitToMenu() {
  S.phase = 'menu';
  S.paused = false;
  releaseWake();
  audio.stopMusic(); audio.stopWind(); audio.setJet(false);
  saveMissions();
  renderMissions();
  renderChars();
  renderStats();
  resetRun();
  S.speed = 8;
  if (tracker) { tracker.dispose(); tracker = null; }
  video.classList.remove('body');
  $('camTint').classList.remove('body');
  stage.classList.remove('body-pip');
  stopCamera();
  $('hud').classList.add('hidden');
  $('countdown').classList.add('hidden');
  for (const id of ['screen-pause', 'screen-over', 'screen-loading', 'screen-calib']) $(id).classList.add('hidden');
  $('screen-start').classList.remove('hidden');
  $('bestStart').textContent = getBest(S.diff).toLocaleString('en-US');
}

// ---------- wake lock ----------
let wakeLock = null;
async function acquireWake() {
  try { if (navigator.wakeLock && S.phase === 'run' && !S.paused) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function releaseWake() {
  if (wakeLock) { try { wakeLock.release(); } catch {} wakeLock = null; }
}

// ---------- camera ----------
async function startCamera() {
  if (stream) { setCamVisible(true); return true; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (video.readyState >= 2) { clearInterval(iv); res(); }
        else if (Date.now() - t0 > 8000) { clearInterval(iv); rej(new Error('timeout')); }
      }, 120);
    });
    try { await video.play(); } catch {}
    if (video.paused) {
      const retry = () => { video.play().catch(() => {}); removeEventListener('pointerdown', retry); };
      addEventListener('pointerdown', retry);
    }
    S.camOn = true;
    setCamVisible(true);
    return true;
  } catch {
    stream = null; S.camOn = false; setCamVisible(false);
    return false;
  }
}
function setCamVisible(v) {
  S.camVisible = v && S.camOn && (S.mode !== 'body' || S.phase === 'calib');
  video.classList.toggle('on', S.camVisible);
  $('camTint').classList.toggle('on', S.camVisible);
  simCanvas.style.display = S.camVisible ? 'none' : 'block';
  $('btnCam').classList.toggle('off', !S.camVisible);
}
function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null;
  S.camOn = false;
  setCamVisible(false);
}

// ---------- mode entry ----------
async function enterBody() {
  audio.ensure(); audio.ui();
  $('screen-start').classList.add('hidden');
  $('screen-loading').classList.remove('hidden');
  $('loadText').textContent = 'Starting camera…';
  const camOk = await startCamera();
  if (!camOk) {
    toast('Camera not found — starting in touch mode', true);
    stage.classList.remove('body-pip');
    S.mode = 'touch';
    resetRun(); startCountdown();
    return;
  }
  try {
    tracker = new PoseTracker(video, overlay);
    tracker.detectInterval = IS_MOBILE ? 45 : 33;
    await tracker.init((m) => { $('loadText').textContent = m; });
    S.mode = 'body';
    tracker.pip = false;
    stage.classList.add('body-pip');
    video.classList.add('body');
    $('camTint').classList.add('body');
    resetRun();
    $('screen-loading').classList.add('hidden');
    $('screen-calib').classList.remove('hidden');
    tracker.startCalibration();
    S.phase = 'calib';
  } catch {
    if (tracker) { tracker.dispose(); tracker = null; }
    toast('Body model failed to load — starting in touch mode', true);
    stage.classList.remove('body-pip');
    S.mode = 'touch';
    resetRun(); startCountdown();
  }
}
async function enterTouch() {
  audio.ensure(); audio.ui();
  S.mode = 'touch';
  $('screen-start').classList.add('hidden');
  if ($('camPref').checked && !S.camOn) {
    $('screen-loading').classList.remove('hidden');
    $('loadText').textContent = 'Starting camera…';
    const ok = await startCamera();
    if (!ok) toast('No camera — running with simulated background');
  } else if (S.camOn) setCamVisible($('camPref').checked);
  resetRun();
  startCountdown();
}

// ---------- input ----------
let pDown = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, label, .screen, .modal')) return;
  pDown = { x: e.clientX, y: e.clientY, t: performance.now() };
});
stage.addEventListener('pointerup', (e) => {
  if (!pDown) return;
  const dx = e.clientX - pDown.x, dy = e.clientY - pDown.y;
  const dt = performance.now() - pDown.t;
  pDown = null;
  if (S.phase !== 'run' || S.paused) return;
  if (Math.abs(dx) > 32 && Math.abs(dx) > Math.abs(dy)) setLane(S.lane + (dx > 0 ? 1 : -1));
  else if (dy < -32) doJump();
  else if (dy > 32) startSlide();
  else if (dt < 260) doJump();
});
addEventListener('pointercancel', () => { pDown = null; });
stage.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'Escape' || k === 'p' || k === 'P') { if (S.phase === 'run' || S.phase === 'count') setPaused(!S.paused); return; }
  if (k === 'm' || k === 'M') { toggleSound(); return; }
  if (S.phase === 'over' && (k === 'r' || k === 'R')) { resetRun(); startCountdown(); return; }
  if (S.phase !== 'run' || S.paused) return;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') setLane(S.lane - 1);
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') setLane(S.lane + 1);
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { e.preventDefault(); doJump(); }
  else if (k === 'ArrowDown' || k === 's' || k === 'S') startSlide();
  else if (k === 'h' || k === 'H') activateBoard();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (S.phase === 'run' || S.phase === 'count') && !S.paused) setPaused(true);
  else if (!document.hidden) acquireWake();
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
$('btnBody').addEventListener('click', enterBody);
$('btnTouch').addEventListener('click', enterTouch);
$('btnSkipCalib').addEventListener('click', () => {
  audio.ui();
  if (tracker) { tracker.dispose(); tracker = null; }
  S.mode = 'touch';
  $('screen-calib').classList.add('hidden');
  resetRun(); startCountdown();
  toast('Touch / keyboard mode active');
});
$('btnPause').addEventListener('click', () => { audio.ui(); setPaused(true); });
$('btnResume').addEventListener('click', () => { audio.ui(); setPaused(false); });
$('btnRestartP').addEventListener('click', () => { audio.ui(); resetRun(); startCountdown(); });
$('btnRestartO').addEventListener('click', () => { audio.ui(); resetRun(); startCountdown(); });
$('btnQuitP').addEventListener('click', () => { audio.ui(); quitToMenu(); });
$('btnQuitO').addEventListener('click', () => { audio.ui(); quitToMenu(); });
$('btnBoard').addEventListener('click', () => activateBoard());
$('btnCam').addEventListener('click', () => {
  audio.ui();
  if (S.mode === 'body' && tracker) {
    tracker.camInPip = !tracker.camInPip;
    $('btnCam').classList.toggle('off', !tracker.camInPip);
    toast(tracker.camInPip ? 'Corner panel: camera on' : 'Corner panel: avatar only');
    return;
  }
  if (!S.camOn) startCamera().then(ok => { if (!ok) toast('Could not start the camera', true); });
  else setCamVisible(!S.camVisible);
});
function toggleSound() {
  audio.ensure();
  audio.setMuted(!audio.muted);
  $('btnSound').classList.toggle('muted', audio.muted);
  $('btnSoundMenu').classList.toggle('muted', audio.muted);
}
$('btnSound').addEventListener('click', toggleSound);
$('btnSoundMenu').addEventListener('click', toggleSound);
$('diffSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  audio.ensure(); audio.ui();
  S.diff = b.dataset.diff;
  for (const x of $('diffSeg').children) x.classList.toggle('on', x === b);
  $('bestStart').textContent = getBest(S.diff).toLocaleString('en-US');
  syncDiffLabels();
});
function syncDiffLabels() {
  const label = DIFFS[S.diff].label;
  $('diffPill').textContent = label;
  $('bestDiffSub').textContent = label + ' difficulty';
}

// ---------- dashboard navigation ----------
const VIEWS = {
  play: ['Ready to run', 'Pick a control mode and start your run.'],
  runners: ['Choose your runner', 'Each runner has a unique perk — unlock them with bank coins.'],
  missions: ['Active missions', 'Complete objectives for coin and score rewards.'],
  guide: ['How to play', 'Gestures, keys and run rules.']
};
function setView(v) {
  if (!VIEWS[v]) return;
  for (const n of document.querySelectorAll('.nav-item')) n.classList.toggle('active', n.dataset.view === v);
  for (const s of document.querySelectorAll('.view')) s.classList.toggle('active', s.id === 'view-' + v);
  $('viewTitle').textContent = VIEWS[v][0];
  $('viewSub').textContent = VIEWS[v][1];
  $('screen-start').scrollTop = 0;
}
document.querySelector('.dash-nav').addEventListener('click', (e) => {
  const b = e.target.closest('.nav-item');
  if (!b) return;
  audio.ensure(); audio.ui();
  setView(b.dataset.view);
});

// ---------- HUD ----------
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function syncHUD() {
  setText('score', Math.floor(S.score).toLocaleString('en-US'));
  setText('dist', Math.floor(S.dist));
  setText('coins', S.coins);
  setText('bestHud', getBest(S.diff).toLocaleString('en-US'));
  setText('zoneTag', 'ZONE ' + (S.zone + 1));
  $('multTag').classList.toggle('hidden', S.x2T <= 0);
  document.querySelector('.coin-panel').classList.toggle('x2on', S.x2T > 0);
  if (missionDirty && performance.now() - lastMissionRender > 250) {
    renderMissions();
    missionDirty = false;
    lastMissionRender = performance.now();
  }
  const chips = $('powerChips');
  const active = [
    ['magnet', S.magnetT, POWER_CFG.magnet.dur],
    ['x2', S.x2T, POWER_CFG.x2.dur],
    ['jet', S.jetT, POWER_CFG.jet.dur],
    ['shield', S.shield ? 1 : 0, 1],
    ['board', S.boardT, 30]
  ];
  for (const [key, val, max] of active) {
    let el = chips.querySelector('[data-p="' + key + '"]');
    if (val > 0) {
      if (!el) {
        el = document.createElement('div');
        el.className = 'chip ' + key;
        el.dataset.p = key;
        const names = { magnet: '◎ Magnet', x2: '×2 Double Score', jet: '▲ Jetpack', shield: '⛨ Shield', board: '⬗ Hoverboard' };
        el.innerHTML = names[key] + (key === 'shield' ? '' : '<span class="c-bar"><i></i></span>');
        chips.appendChild(el);
      }
      const bar = el.querySelector('i');
      if (bar) bar.style.width = Math.min(100, (val / max) * 100) + '%';
    } else if (el) el.remove();
  }
  const bb = $('btnBoard');
  bb.classList.toggle('on', S.boardT > 0);
  bb.classList.toggle('cool', S.boardCool > 0 && S.boardT <= 0);
  $('speedTint').classList.toggle('on', S.speed > DIFFS[S.diff].max * 0.8 && S.phase === 'run');
}
function updateModeChip() {
  const dot = $('modeDot'), txt = $('modeText');
  if (S.mode === 'body') {
    if (tracker && tracker.present) { dot.className = 'dot'; txt.textContent = 'Body tracking active'; }
    else { dot.className = 'dot warn'; txt.textContent = 'Searching for body… (touch works too)'; }
  } else {
    dot.className = 'dot';
    txt.textContent = 'Touch / Keyboard' + (S.camVisible ? ' · AR Camera' : ' · Simulation');
  }
}

// ---------- sim background ----------
const stars = [];
for (let i = 0; i < 130; i++) stars.push({ x: Math.random(), y: Math.random() * 0.5, z: 0.3 + Math.random() * 0.7, tw: Math.random() * 6.28 });
let simT = 0;
function drawSim(dt) {
  simT += dt;
  const w = innerWidth, h = innerHeight;
  simCtx.clearRect(0, 0, w, h);
  for (const s of stars) {
    const a = 0.3 + 0.5 * Math.abs(Math.sin(simT * 1.3 + s.tw));
    simCtx.fillStyle = 'rgba(220,210,255,' + (a * s.z).toFixed(2) + ')';
    simCtx.fillRect(s.x * w, s.y * h, s.z * 2, s.z * 2);
  }
  const hy = h * 0.55;
  const sunCol = zoneSun.map(v => Math.round(v)).join(',');
  for (let a = 0; a < 3; a++) {
    const ax = w * (0.2 + 0.3 * a) + Math.sin(simT * 0.25 + a * 2.1) * w * 0.12;
    const ag = simCtx.createRadialGradient(ax, h * 0.12, 0, ax, h * 0.12, w * 0.4);
    const ac = a === 1 ? '34,211,238' : a === 2 ? '61,245,166' : '160,107,255';
    ag.addColorStop(0, 'rgba(' + ac + ',.10)');
    ag.addColorStop(1, 'rgba(' + ac + ',0)');
    simCtx.fillStyle = ag;
    simCtx.fillRect(0, 0, w, h * 0.5);
  }
  const sr = h * 0.2;
  const sun = simCtx.createRadialGradient(w / 2, hy, 4, w / 2, hy, sr);
  sun.addColorStop(0, 'rgba(' + sunCol + ',.85)');
  sun.addColorStop(0.55, 'rgba(' + sunCol + ',.35)');
  sun.addColorStop(1, 'rgba(' + sunCol + ',0)');
  simCtx.fillStyle = sun;
  simCtx.beginPath(); simCtx.arc(w / 2, hy, sr, 0, Math.PI * 2); simCtx.fill();
  simCtx.fillStyle = 'rgba(6,3,18,.9)';
  for (let i = 0; i < 6; i++) {
    const sy = hy - sr * 0.1 + i * sr * 0.16;
    simCtx.fillRect(w / 2 - sr, sy, sr * 2, 2 + i * 0.8);
  }
  simCtx.fillStyle = 'rgba(12,6,30,.55)';
  for (let i = 0; i < 30; i++) {
    const bw = w / 30;
    const bh = 12 + Math.abs(Math.sin(i * 5.1)) * h * 0.1;
    simCtx.fillRect(i * bw, hy - bh, bw - 2, bh);
  }
  simCtx.fillStyle = 'rgba(10,5,26,.92)';
  for (let i = 0; i < 24; i++) {
    const bw = w / 24;
    const bh = 20 + Math.abs(Math.sin(i * 3.7)) * h * 0.16;
    simCtx.fillRect(i * bw, hy - bh, bw - 3, bh);
    simCtx.fillStyle = 'rgba(' + sunCol + ',.14)';
    for (let wy = hy - bh + 6; wy < hy - 4; wy += 9) simCtx.fillRect(i * bw + 3, wy, bw - 9, 2);
    simCtx.fillStyle = 'rgba(10,5,26,.92)';
  }
  simCtx.strokeStyle = 'rgba(' + sunCol + ',.3)';
  simCtx.lineWidth = 1;
  const scroll = (simT * 0.6) % 1;
  simCtx.beginPath();
  for (let i = 0; i < 12; i++) {
    const p = (i + scroll) / 12;
    const y = hy + Math.pow(p, 2.1) * (h - hy);
    simCtx.moveTo(0, y); simCtx.lineTo(w, y);
  }
  for (let i = -8; i <= 8; i++) {
    simCtx.moveTo(w / 2 + i * w * 0.05, hy);
    simCtx.lineTo(w / 2 + i * w * 0.3, h);
  }
  simCtx.stroke();
}

// ---------- resize ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dpr = Math.min(devicePixelRatio, 2);
  for (const c of [overlay, simCanvas]) {
    c.width = w * dpr; c.height = h * dpr;
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
addEventListener('resize', resize);
resize();

// ---------- update ----------
function updateRun(dt) {
  const D = DIFFS[S.diff];
  const cs = charCfg().speed || 1;
  S.runT += dt;
  S.speed = Math.min(D.max * cs, (D.base + S.dist * D.ramp) * cs) + (S.jetT > 0 ? 4 : 0);
  S.topSpeed = Math.max(S.topSpeed, S.speed);
  const move = S.speed * dt;
  S.dist += move;
  S.score += move * mult() * (charCfg().score || 1);
  missionAdd('dist', move);

  // timers
  const prevJet = S.jetT;
  for (const k of ['magnetT', 'x2T', 'jetT', 'boardT', 'boardCool', 'invulnT']) {
    if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);
  }
  if (prevJet > 0 && S.jetT <= 0) S.invulnT = Math.max(S.invulnT, 1.0);
  if (S.jetT <= 0) audio.setJet(false);
  if (S.slideT > 0) S.slideT = Math.max(0, S.slideT - dt);
  if (S.coachT > 0) { S.coachT -= dt; if (S.coachT <= 0) hideCoach(); }

  // body gestures
  if (S.mode === 'body' && tracker) {
    tracker.update(performance.now(), dt);
    for (const ev of tracker.consumeEvents()) {
      if (ev.type === 'lane') { setLane(ev.lane); coachLit('lane'); }
      else if (ev.type === 'jump') { doJump(); coachLit('jump'); }
      else if (ev.type === 'board') { activateBoard(); coachLit('board'); }
    }
    if (tracker.slideHeld && S.y <= 0.05 && S.jetT <= 0) { S.slideT = Math.max(S.slideT, 0.12); coachLit('slide'); }
    if (tracker.present) { S.bodyLostT = 0; S.bodyWarned = false; }
    else {
      S.bodyLostT += dt;
      if (S.bodyLostT > 2 && !S.bodyWarned) {
        S.bodyWarned = true;
        toast('Body not visible — continue with touch/keyboard', true);
      }
    }
    updateModeChip();
  }

  // milestones & zones
  if (S.dist >= S.milestone) {
    showBanner(S.milestone + ' METERS!', 'Speed rising');
    audio.milestone();
    S.milestone += 500;
  }
  const zi = Math.floor(S.dist / 600) % ZONES.length;
  if (zi !== S.zone) setZone(zi, true);

  // spawn
  S.spawnT -= dt;
  if (S.spawnT <= 0) {
    spawnRow();
    const gap = Math.max(34, Math.min(44, S.speed * 1.1)) * D.gap;
    S.spawnT = gap / S.speed;
  }
  if (S.jetT > 0) {
    S.skyT -= dt;
    if (S.skyT <= 0) { coinLine(S.lane, -140, 4, 4.7); S.skyT = 0.5; }
  }

  // player physics (ground + train roofs)
  const targetX = LANES[S.lane];
  S.x += (targetX - S.x) * Math.min(1, dt * 10);
  const sup = supportHeight();
  const prevY = S.y;
  if (S.jetT > 0) {
    S.y += (4.6 - S.y) * Math.min(1, dt * 4);
    S.vy = 0;
    S.onRoof = false;
  } else {
    S.vy -= 27 * dt;
    S.y += S.vy * dt;
    if (S.y <= sup && S.vy <= 0) {
      if (sup > 0 && !S.onRoof) {
        S.trainsRidden++;
        missionAdd('trains', 1);
        S.score += 30 * mult();
        popup(runner.position.clone().add(new THREE.Vector3(0, 2.4, 0)), 'Train roof! +30', 'big');
        impactRing(S.x, sup, 0x3df5a6);
      }
      if (prevY - sup > 0.5) { audio.land(); shake(0.08); camDip = 0.28; impactRing(S.x, sup, sup > 0 ? 0x3df5a6 : 0x22d3ee); }
      S.y = sup;
      S.vy = 0;
    }
    S.onRoof = sup > 0 && S.vy === 0 && S.y === sup;
    if (S.onRoof) missionAdd('roof', move);
  }

  // runner pose
  const cyc = S.dist * 1.15;
  const groundY = S.onRoof ? 2.6 : 0;
  const sliding = S.slideT > 0 && S.y <= groundY + 0.05;
  const air = S.y > groundY + 0.05;
  runner.position.set(S.x, S.y + (S.boardT > 0 ? 0.25 : 0), 0);
  runner.rotation.z = (targetX - S.x) * -0.14;
  runner.rotation.y = (targetX - S.x) * -0.1;
  if (sliding) {
    runner.rotation.x = -1.05;
    runner.scale.y = 0.62;
    legL.rotation.x = -0.5; legR.rotation.x = -0.3;
    armL.rotation.x = 0.7; armR.rotation.x = 0.7;
  } else {
    runner.rotation.x = air ? -0.18 : 0.06;
    runner.scale.y = 1;
    const sw = air ? 0.9 : Math.sin(cyc) * 0.95;
    legL.rotation.x = air ? -0.9 : sw;
    legR.rotation.x = air ? -0.5 : -sw;
    armL.rotation.x = air ? -2.4 : -sw * 0.8;
    armR.rotation.x = air ? -2.4 : sw * 0.8;
    if (S.jetT > 0) { legL.rotation.x = 0.25; legR.rotation.x = 0.15; armL.rotation.x = 0.5; armR.rotation.x = 0.5; }
    // mirror the player's real pose onto the runner while grounded
    if (S.mode === 'body' && tracker && tracker.present && tracker.poseAngles && !air && !sliding && S.jetT <= 0) {
      const A = tracker.poseAngles, w = 0.75;
      legL.rotation.x += (A.legL.x - legL.rotation.x) * w;
      legR.rotation.x += (A.legR.x - legR.rotation.x) * w;
      armL.rotation.x += (A.armL.x - armL.rotation.x) * w;
      armR.rotation.x += (A.armR.x - armR.rotation.x) * w;
      armL.rotation.z = A.armL.z * w;
      armR.rotation.z = A.armR.z * w;
      legL.rotation.z = A.legL.z * w;
      legR.rotation.z = A.legR.z * w;
      runner.rotation.z += -A.lean * w;
    } else {
      armL.rotation.z = 0; armR.rotation.z = 0; legL.rotation.z = 0; legR.rotation.z = 0;
    }
  }
  board.visible = boardGlow.visible = S.boardT > 0;
  shieldBubble.visible = S.shield;
  jetFlame.visible = S.jetT > 0;
  jetCone.visible = S.jetT > 0;
  if (jetCone.visible) jetCone.scale.set(1, 0.8 + Math.random() * 0.6, 1);
  updateTrail(move);
  if (S.jetT > 0 && Math.random() < 0.5) burst(runner.position.clone().add(new THREE.Vector3(0, 0.4, -0.5)), 0x22d3ee, 4, 0.4);
  if (S.speed > 18 && Math.random() < 0.35) burst(runner.position.clone().add(new THREE.Vector3((Math.random() - 0.5), 0.1, 0.6)), 0xa06bff, 2, 0.3);
  S.dustT -= dt;
  if (!air && S.speed > 10 && S.dustT <= 0) {
    S.dustT = 0.14;
    burst(runner.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.05, 0.5)), 0x6b4d9e, 2, 0.25);
  }
  if (sliding) {
    S.sparkT -= dt;
    if (S.sparkT <= 0) { S.sparkT = 0.07; burst(runner.position.clone().add(new THREE.Vector3(0, 0.1, 0.4)), 0xffc233, 3, 0.4); }
  }
  if (S.boardT > 0) {
    S.boardFxT -= dt;
    if (S.boardFxT <= 0) { S.boardFxT = 0.09; burst(runner.position.clone().add(new THREE.Vector3(0, 0.1, 0.9)), 0xff2d95, 2, 0.35); }
  }
  for (const r of impactRings) {
    if (r.life <= 0) continue;
    r.life -= dt;
    const p = 1 - Math.max(0, r.life) / 0.4;
    r.m.scale.setScalar(1 + p * 2.6);
    r.m.material.opacity = 0.75 * Math.max(0, r.life) / 0.4;
    if (r.life <= 0) r.m.visible = false;
  }

  // world scroll
  scrollTies.position.z = S.dist % 6;
  scrollPillars.position.z = S.dist % 12;
  scrollArches.position.z = S.dist % 90;
  scrollBoards.position.z = S.dist % 150;
  roadTex.offset.y = -(S.dist % 8) / 8;
  window.__grid.position.z = S.dist % 4;
  for (const r of rings) {
    r.position.z += move;
    r.rotation.x += dt * 0.4;
    r.rotation.y += dt * 0.6;
    if (r.position.z > 12) { r.position.z = -140; r.position.x = (Math.random() * 2 - 1) * 14; r.position.y = 3 + Math.random() * 6; }
  }

  // obstacles
  const pH = sliding ? 0.9 : 1.8;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (o.dead) { obstacles.splice(i, 1); continue; }
    o.z += move + o.extra * dt;
    o.group.position.z = o.z;
    if (o.z > 14) { removeGroup(o.group); obstacles.splice(i, 1); continue; }
    if (o.passed) continue;
    const overlap = Math.abs(o.z) < o.depth / 2 + 0.55;
    const sameLane = Math.abs(o.group.position.x - S.x) < 1.5;
    if (o.type === 'train' && o.ramp && sameLane && o.z > -19.2 && o.z < -3.5 && S.y < 2.3) {
      S.vy = 13.6;
      S.slideT = 0;
      audio.jump();
      popup(runner.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 'Ramp launch!', 'big');
      o.passed = true;
      continue;
    }
    if (!overlap || !sameLane) continue;
    let safe = false;
    if (o.type === 'low') safe = S.y > 0.95;
    else if (o.type === 'gate') safe = (S.y + pH < 1.15) || S.y > 2.5;
    else {
      if (S.y >= o.roof - 0.3) { o.passed = true; continue; }
      if (o.z > 14.5) continue;
    }
    if (safe) {
      o.passed = true;
      const margin = o.type === 'low' ? S.y - 0.95 : 1.15 - (S.y + pH);
      if (margin < 0.55 && margin > -0.01) {
        S.score += 50 * mult();
        audio.nearMiss();
        missionAdd('near', 1);
        popup(runner.position.clone().add(new THREE.Vector3(0, 2.2, 0)), 'Near miss +' + (50 * mult()), 'big');
      }
      continue;
    }
    if (S.invulnT > 0) { o.passed = true; continue; }
    if (S.shield) { S.shield = false; savedBy('shield'); o.passed = true; removeGroup(o.group); o.dead = true; obstacles.splice(i, 1); continue; }
    if (S.boardT > 0) { S.boardT = 0; S.boardCool = 6; savedBy('board'); o.passed = true; removeGroup(o.group); o.dead = true; obstacles.splice(i, 1); continue; }
    crash();
    return;
  }

  // coins
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    if (c.dead) { coins.splice(i, 1); continue; }
    c.group.position.z += move + (c.extra || 0) * dt;
    c.spin += dt * 5;
    c.group.rotation.y = c.spin;
    if (S.magnetT > 0) {
      const d = c.group.position.distanceTo(runner.position.clone().add(new THREE.Vector3(0, 1, 0)));
      if (d < 8 * (charCfg().magnet || 1)) c.group.position.lerp(runner.position.clone().add(new THREE.Vector3(0, 1, 0)), Math.min(1, dt * 8));
    }
    if (c.group.position.z > 10) { removeGroup(c.group); coins.splice(i, 1); continue; }
    const dx = c.group.position.x - S.x, dy = c.group.position.y - (S.y + 1), dz = c.group.position.z;
    if (dx * dx + dy * dy + dz * dz < 1.7) {
      S.coins++;
      S.score += 10 * mult();
      audio.coin();
      missionAdd('coins', 1);
      const cp = document.querySelector('.coin-panel');
      cp.classList.remove('pulse'); void cp.offsetWidth; cp.classList.add('pulse');
      burst(c.group.position, 0xffc233, 8, 0.5);
      removeGroup(c.group);
      coins.splice(i, 1);
    }
  }

  // powers
  for (let i = powers.length - 1; i >= 0; i--) {
    const p = powers[i];
    if (p.dead) { powers.splice(i, 1); continue; }
    p.group.position.z += move;
    p.t += dt;
    p.core.rotation.y += dt * 2.4;
    p.shell.rotation.y -= dt * 1.4;
    p.core.position.y = 1.1 + Math.sin(p.t * 3) * 0.15;
    p.shell.position.y = p.core.position.y;
    if (p.group.position.z > 10) { removeGroup(p.group); powers.splice(i, 1); continue; }
    const dx = p.group.position.x - S.x, dz = p.group.position.z;
    if (dx * dx + dz * dz < 2.2 && S.y < 2.5) { collectPower(p); powers.splice(i, 1); }
  }

  // particles
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) { scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); bursts.splice(i, 1); continue; }
    const pos = b.geo.attributes.position;
    for (let j = 0; j < b.vels.length; j++) {
      pos.array[j * 3] += b.vels[j].x * dt;
      pos.array[j * 3 + 1] += b.vels[j].y * dt;
      pos.array[j * 3 + 2] += b.vels[j].z * dt + move * 0.4;
      b.vels[j].multiplyScalar(1 - 1.8 * dt);
    }
    pos.needsUpdate = true;
    b.mat.opacity = b.life / b.max;
  }

  audio.setWind(S.speed / D.max);
  syncHUD();
}

let camDip = 0;
function updateCamera(dt) {
  const speed01 = S.speed / DIFFS[S.diff].max;
  camDip = Math.max(0, camDip - dt * 1.2);
  const tx = S.x * 0.55, ty = 4.3 + S.y * 0.35 - camDip, tz = 8.2;
  camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
  camera.position.z += (tz - camera.position.z) * Math.min(1, dt * 6);
  if (S.shakeT > 0) {
    S.shakeT = Math.max(0, S.shakeT - dt);
    const a = S.shakeT * 0.3;
    camera.position.x += (Math.random() - 0.5) * a;
    camera.position.y += (Math.random() - 0.5) * a;
  }
  camera.lookAt(S.x * 0.7, 1.5 + S.y * 0.5, -8);
  const targetFov = 62 + speed01 * 10 + (S.jetT > 0 ? 6 : 0) + (S.slowT > 0 ? -8 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  const sop = Math.max(0, Math.min(0.5, (S.speed - 16) / 26)) + (S.jetT > 0 ? 0.15 : 0);
  streakMat.opacity += (sop - streakMat.opacity) * Math.min(1, dt * 4);
  streaks.visible = streakMat.opacity > 0.02;
  if (streaks.visible) {
    const arr = streakGeo.attributes.position.array;
    for (let i = 0; i < streakCount; i++) {
      arr[i * 3 + 2] += S.speed * 2.4 * dt;
      if (arr[i * 3 + 2] > -2) {
        arr[i * 3 + 2] = -70;
        arr[i * 3] = (Math.random() * 2 - 1) * 18;
        arr[i * 3 + 1] = (Math.random() * 2 - 1) * 10;
      }
    }
    streakGeo.attributes.position.needsUpdate = true;
  }
}

function updateMenu(dt) {
  S.dist += 8 * dt;
  scrollTies.position.z = S.dist % 6;
  scrollPillars.position.z = S.dist % 12;
  scrollArches.position.z = S.dist % 90;
  scrollBoards.position.z = S.dist % 150;
  roadTex.offset.y = -(S.dist % 8) / 8;
  window.__grid.position.z = S.dist % 4;
  const cyc = S.dist * 1.15;
  legL.rotation.x = Math.sin(cyc) * 0.9;
  legR.rotation.x = -Math.sin(cyc) * 0.9;
  armL.rotation.x = -Math.sin(cyc) * 0.7;
  armR.rotation.x = Math.sin(cyc) * 0.7;
  runner.position.y = Math.abs(Math.sin(cyc)) * 0.06;
  for (const r of rings) { r.position.z += 8 * dt; r.rotation.x += dt * 0.4; if (r.position.z > 12) r.position.z = -140; }
}

// ---------- main loop ----------
let last = performance.now();
let cdLast = -1;
let perfAcc = 0, perfN = 0, perfDegraded = false;
function loop(now) {
  requestAnimationFrame(loop);
  const raw = Math.min(0.1, (now - last) / 1000);
  let dt = Math.min(0.05, raw);
  last = now;
  perfAcc += raw; perfN++;
  if (perfN >= 90) {
    if (perfAcc / perfN > 0.04 && !perfDegraded && renderer.getPixelRatio() > 1) { perfDegraded = true; renderer.setPixelRatio(1); }
    perfAcc = 0; perfN = 0;
  }
  if (S.slowT > 0) { S.slowT -= dt; dt *= 0.35; }
  if (S.phase === 'menu') {
    updateMenu(dt);
  } else if (S.phase === 'calib') {
    if (tracker) {
      tracker.update(now, dt);
      const pct = Math.min(1, tracker.calibT / 2);
      $('calibRing').style.strokeDashoffset = String(213.6 * (1 - pct));
      $('calibPct').textContent = Math.round(pct * 100) + '%';
      $('calibHint').textContent = tracker.present
        ? (tracker.calibrating ? 'Measuring — stand still…' : 'Calibration complete!')
        : 'No body detected — get your full body in frame';
      if (!tracker.calibrating && tracker.baselineLeg) {
        S.phase = 'count';
        startCountdown();
      }
    }
  } else if (S.phase === 'count') {
    if (tracker) tracker.consumeEvents();
    if (!S.paused) {
      S.countT -= dt;
      const n = Math.ceil(S.countT - 0.4);
      const label = S.countT <= 0.4 ? 'GO' : String(Math.max(1, n));
      if (label !== cdLast) {
        cdLast = label;
        const el = $('cdNum');
        el.textContent = label;
        el.style.color = label === 'GO' ? 'var(--green)' : 'var(--gold)';
        el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
        audio.count(label === 'GO');
      }
      if (S.countT <= 0) { cdLast = -1; beginRun(); }
      updateMenu(dt * 0.4);
    }
  } else if (S.phase === 'run') {
    if (!S.paused) updateRun(dt);
  } else if (S.phase === 'crash') {
    S.crashT -= dt;
    runner.rotation.x += dt * 7;
    runner.position.y = Math.max(0, runner.position.y - dt * 2);
    S.speed = Math.max(0, S.speed - dt * 30);
    scrollTies.position.z = S.dist % 6;
    if (S.crashT <= 0) gameOver();
  }
  if (S.phase !== 'menu') updateCamera(dt);
  else { camera.position.set(0, 4.3, 8.2); camera.lookAt(0, 1.5, -8); }
  const lk = Math.min(1, dt * 1.6);
  for (const t of themeTargets) {
    if (t.fog) scene.fog.color.lerp(t.c, lk);
    else if (t.emissive) { t.m.emissive.lerp(t.c, lk); t.m.color.lerp(t.c, lk * 0.5); }
    else t.m.color.lerp(t.c, lk);
  }
  for (let i = 0; i < 3; i++) zoneSun[i] += (ZONES[S.zone].sun[i] - zoneSun[i]) * lk;
  if (horizonMat) horizonMat.color.setRGB(zoneSun[0] / 255, zoneSun[1] / 255, zoneSun[2] / 255);
  if (gridMat) gridMat.opacity = 0.08 + Math.min(0.08, (S.speed / 40) * 0.08);
  const supNow = (S.phase === 'run' || S.phase === 'crash') ? supportHeight() : 0;
  runnerShadow.position.set(S.x, supNow + 0.03, 0);
  const hAbove = Math.max(0, S.y - supNow);
  const shScale = 2.3 * Math.max(0.35, 1 - hAbove / 6);
  runnerShadow.scale.set(shScale, shScale * 1.5, 1);
  runnerShadow.material.opacity = 0.55 * Math.max(0.25, 1 - hAbove / 7);
  const darr = dustGeo.attributes.position.array;
  const dmove = (S.phase === 'run' ? S.speed : 8) * dt * 0.35;
  for (let i = 0; i < dustN; i++) {
    darr[i * 3 + 2] += dmove;
    darr[i * 3 + 1] += Math.sin(now * 0.001 + i) * 0.002;
    if (darr[i * 3 + 2] > 10) { darr[i * 3 + 2] = -140; darr[i * 3] = (Math.random() * 2 - 1) * 14; darr[i * 3 + 1] = Math.random() * 8; }
  }
  dustGeo.attributes.position.needsUpdate = true;
  if (!S.camVisible) drawSim(dt);
  renderer.render(scene, camera);
}

// ---------- boot ----------
$('bestStart').textContent = getBest(S.diff).toLocaleString('en-US');
syncDiffLabels();
$('btnSoundMenu').classList.toggle('muted', audio.muted);
const savedChar = CHARS.find(c => c.id === S.char);
if (!savedChar || getBank() < savedChar.cost) S.char = 'nova';
S.missions = loadMissions();
applyChar();
renderChars();
renderMissions();
renderStats();
setCamVisible(false);
requestAnimationFrame(loop);

window.NOVA = {
  state: S,
  entities: { obstacles, coins, powers },
  jump: doJump,
  slide: () => startSlide(0.65),
  lane: setLane,
  board: activateBoard,
  crash: () => { if (S.phase === 'run') crash(); },
  spawnRow,
  support: supportHeight,
  selectChar,
  missionAdd,
  debugBody: () => {
    S.mode = 'body';
    stage.classList.add('body-pip');
    if (!tracker) {
      tracker = new PoseTracker(video, overlay);
      tracker.ready = true;
      tracker.detectInterval = IS_MOBILE ? 45 : 33;
      tracker.baselineLeg = 0.35;
    }
    resetRun();
    startCountdown();
  },
  poseFeed: (lm) => { if (tracker) tracker.ingest(lm, performance.now(), 1 / 30); },
  runnerLimbs: () => ({ armLx: armL.rotation.x, armLz: armL.rotation.z, legLx: legL.rotation.x, lean: runner.rotation.z })
};