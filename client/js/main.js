// Lames de Jade : client 3D (affichage, caméra libre, commandes, interface).
import * as THREE from "three";
import * as M from "./models.js";

const $ = (s) => document.querySelector(s);
const canvas = $("#game"), overlay = $("#overlay"), octx = overlay.getContext("2d");
const ATK_RANGE_MELEE = 1.5, BASE_SPEED = 4.2;
const ZONES = ["Village de Bambou", "Plaine des Loups", "Collines Venteuses", "Forêt des Bandits", "Vallée des Spectres"];
const SKILL_ICONS = { whirl: "🌀", tiger: "🐯", charge: "🐂", horn: "📯", iron: "🛡️", quake: "💥", twin: "⚔️", poison: "☠️", shadow: "👤", fan: "🗡️", mist: "🌫️", thousand: "✴️",
  spectral: "👻", flame: "🔥", drain: "🩸", terror: "😱", pact: "📜", eclipse: "🌑", bolt: "⚡", heal: "💚", bless: "✨", storm: "⛈️", shield: "🔰", dragon: "🐉" };
const THEMES = {
  monde:  { sky: 0x9cc6e6, fog: [35, 80], hemi: [0xdff1ff, 0x4a6b3a, 1.0], sun: 1.6, wall: "#555" },
  tour:   { sky: 0x1b130e, fog: [18, 45], hemi: [0xffc890, 0x2a1a10, 0.75], sun: 0.9, wall: "#5a3b26", wallTop: "#7a5236" },
  nid:    { sky: 0x110d18, fog: [16, 40], hemi: [0xb9a0ff, 0x1a1024, 0.65], sun: 0.6, wall: "#2f2838", wallTop: "#43394f" },
  temple: { sky: 0x0d2420, fog: [22, 55], hemi: [0xc9fff0, 0x10302a, 0.8], sun: 1.0, wall: "#cfc8b0", wallTop: "#2f8f6f" },
};
const TILE_COL = { 0: "#5f9a3c", 1: "#3f6e33", 2: "#b08a5a", 3: "#9a9488", 4: "#2a6a96", 5: "#d8c48e", 6: "#444", 7: "#4a3f52", 8: "#a7c9b6", 9: "#8a6a48" };
const isTouch = "ontouchstart" in window || matchMedia("(pointer: coarse)").matches;
if (isTouch) document.body.classList.add("touch");
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

const G = {
  socket: null, myId: null, map: null, kind: "over", items: {}, mdefs: {}, sdefs: {}, classes: {}, skills: {}, shop: [], kingdoms: [], dungeons: {},
  me: { x: 0, y: 0, d: 0, moving: false, path: [], targetId: null, interact: null, nextAtk: 0, repathAt: 0 },
  self: null, stat: { hp: 1, mp: 1, mh: 1, mm: 1, dead: 0, spd: 1, buffs: [] },
  ents: new Map(), drops: new Map(), stoneTiles: new Set(), floats: [], cds: {}, keys: new Set(), joy: { x: 0, y: 0, active: false },
  mouse: { x: 0, y: 0, down: false, holdMove: false }, cam: { yaw: Math.PI / 4, pitch: 0.82, dist: 14, tx: 0, ty: 0 },
  lastSent: 0, sentMoving: false, openPanel: null, atkHeld: false, started: false, dg: null,
};
window.G = G;

// ======================================================= Moteur 3D
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);
let worldGroup = new THREE.Group(); scene.add(worldGroup);
const fxGroup = new THREE.Group(); scene.add(fxGroup);
const gateMeshes = new Map();
const animated = [];

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 68 : 50; // plus large en mode portrait
  camera.updateProjectionMatrix();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  overlay.width = w * dpr; overlay.height = h * dpr; G.dpr = dpr;
}
addEventListener("resize", resize);
resize();

// ======================================================= Connexion
let loginMode = "login", kingdom = 0, chosenCls = "lame";
try { const n = localStorage.getItem("ldj_name"); if (n) $("#l-name").value = n; } catch (e) { /* stockage indisponible */ }
document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
  loginMode = b.dataset.mode;
  $("#create-extra").classList.toggle("hidden", loginMode !== "create");
  $("#l-submit").textContent = loginMode === "create" ? "Créer et jouer" : "Entrer dans le monde";
});
document.querySelectorAll(".kd").forEach((b) => b.onclick = () => { document.querySelectorAll(".kd").forEach((x) => x.classList.toggle("selected", x === b)); kingdom = +b.dataset.k; });
document.querySelectorAll(".cl").forEach((b) => b.onclick = () => { document.querySelectorAll(".cl").forEach((x) => x.classList.toggle("selected", x === b)); chosenCls = b.dataset.c; });

$("#login-form").onsubmit = (ev) => {
  ev.preventDefault();
  $("#l-error").textContent = ""; $("#l-submit").disabled = true;
  if (!G.socket) connect();
  const send = () => G.socket.emit("login", { name: $("#l-name").value.trim(), password: $("#l-pass").value, kingdom, cls: chosenCls, mode: loginMode }, (r) => {
    $("#l-submit").disabled = false;
    if (!r.ok) { $("#l-error").textContent = r.error; return; }
    try { localStorage.setItem("ldj_name", $("#l-name").value.trim()); } catch (e) { /* rien */ }
  });
  if (G.socket.connected) send(); else G.socket.once("connect", send);
};

function connect() {
  const s = io({ reconnection: false, transports: ["websocket", "polling"] });
  G.socket = s;
  s.on("connect_error", () => { $("#l-error").textContent = "Impossible de joindre le serveur."; $("#l-submit").disabled = false; G.socket = null; });
  s.on("welcome", onWelcome);
  s.on("world", (w) => { loadWorld(w.map, w.kind); });
  s.on("mapdelta", onMapDelta);
  s.on("s", onSnap);
  s.on("self", onSelf);
  s.on("msg", (m) => toast(m.text, m.kind));
  s.on("chat", onChat);
  s.on("correct", (c) => { G.me.x = c.x; G.me.y = c.y; G.me.path = []; });
  s.on("cd", (c) => { G.cds[c.n] = { until: performance.now() + c.ms, ms: c.ms }; });
  s.on("upgrade_result", onUpgradeResult);
  s.on("kicked", (r) => { $("#dc-reason").textContent = r; });
  s.on("disconnect", () => { if (G.myId) $("#disconnected").classList.remove("hidden"); });
}

function onWelcome(w) {
  G.myId = w.id;
  Object.assign(G, { items: w.items, mdefs: w.monsters, sdefs: w.stones, classes: w.classes, skills: w.skills, shop: w.shop, kingdoms: w.kingdoms, dungeons: w.dungeons, upgrade: w.upgrade });
  loadWorld(w.map, w.kind);
  buildInventory();
  $("#login").classList.add("hidden");
  $("#hud").classList.remove("hidden");
  document.querySelectorAll(".hb.pot canvas").forEach((c) => c.getContext("2d").drawImage(Art.icon(c.parentElement.dataset.key, G.items, 32), 0, 0));
  addChat({ sys: true, text: "Bienvenue dans les Lames de Jade ! Clic droit maintenu (ou glisser au doigt) pour tourner la caméra. /aide pour les commandes." });
  G.started = true;
}

// ======================================================= Construction du monde 3D
function loadWorld(md, kind) {
  $("#loading").classList.remove("hidden");
  G.kind = kind;
  G.map = { w: md.w, h: md.h, tiles: md.tiles, theme: md.theme, blocked: [...md.blocked].map((c) => c === "1"), objects: md.objects, npcs: md.npcs || [] };
  for (const e of G.ents.values()) scene.remove(e.obj);
  G.ents.clear();
  for (const d of G.drops.values()) scene.remove(d.obj);
  G.drops.clear();
  G.me.path = []; G.me.targetId = null; G.me.interact = null; G.me.placed = false;
  scene.remove(worldGroup);
  worldGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
  worldGroup = new THREE.Group(); scene.add(worldGroup);
  gateMeshes.clear(); animated.length = 0;
  const th = THEMES[md.theme] || THEMES.monde;
  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.sky, th.fog[0], th.fog[1]);
  hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
  sun.intensity = th.sun;
  buildTerrain(md, th);
  buildObjects(md);
  buildMinimap();
  closePanels();
  setTimeout(() => $("#loading").classList.add("hidden"), 150);
}

function buildTerrain(md, th) {
  const { w, h, tiles } = md;
  const pos = [], col = [], c = new THREE.Color();
  let hasWater = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = tiles[x + y * w];
    if (t === 6) continue;
    if (t === 4) hasWater = true;
    const yy = t === 4 ? -0.35 : 0;
    c.set(TILE_COL[t] || "#777");
    c.offsetHSL(0, 0, (hash(x * 7919 + y * 104729) - 0.5) * 0.08);
    for (const [qx, qy] of [[x, y], [x, y + 1], [x + 1, y + 1], [x, y], [x + 1, y + 1], [x + 1, y]]) { pos.push(qx, yy, qy); col.push(c.r, c.g, c.b); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  worldGroup.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: md.theme === "monde" ? 0x2f5a2a : th.wall }));
  outer.rotation.x = -Math.PI / 2; outer.position.set(w / 2, -0.4, h / 2);
  worldGroup.add(outer);
  if (hasWater) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x3f8fc8, transparent: true, opacity: 0.72 }));
    water.rotation.x = -Math.PI / 2; water.position.set(w / 2, -0.12, h / 2);
    worldGroup.add(water);
    animated.push((t) => { water.material.opacity = 0.68 + Math.sin(t * 1.5) * 0.05; });
  }
  const walls = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[x + y * w] !== 6) continue;
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && tiles[nx + ny * w] !== 6) { edge = true; break; }
    }
    if (edge) walls.push([x, y]);
  }
  if (walls.length) {
    const wh = 1.5; // murs bas pour ne pas cacher le combat
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, wh, 1), new THREE.MeshLambertMaterial({ color: th.wall, flatShading: true }), walls.length);
    const top = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.18, 1.02), new THREE.MeshLambertMaterial({ color: th.wallTop || th.wall }), walls.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    walls.forEach(([x, y], i) => {
      const hh = wh * (0.85 + hash(x * 31 + y * 17) * 0.3);
      m4.compose(new THREE.Vector3(x + 0.5, hh / 2, y + 0.5), q, new THREE.Vector3(1, hh / wh, 1)); im.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x + 0.5, hh, y + 0.5), q, new THREE.Vector3(1, 1, 1)); top.setMatrixAt(i, m4);
    });
    im.castShadow = true; im.receiveShadow = true;
    worldGroup.add(im, top);
  }
}

function buildObjects(md) {
  const byType = {};
  for (const o of md.objects) {
    if (M.PROPS[o.t]) (byType[o.t] = byType[o.t] || []).push(o);
    else if (o.t === "house") { const hm = M.house(o.v || 0); hm.position.set(o.x + 1.5, 0, o.y + 1.5); worldGroup.add(hm); }
    else if (o.t === "portal" || o.t === "exit") {
      const p = M.portal(o.t === "exit" ? "#6bb8ff" : { tour: "#ffb347", nid: "#c86bff", temple: "#5fe0a8" }[o.dungeon] || "#c86bff");
      p.position.set(o.x + 0.5, 0, o.y + 0.5);
      p.rotation.y = o.t === "exit" ? 0 : Math.PI / 4;
      worldGroup.add(p);
      animated.push(p.userData.anim);
    } else if (o.t === "gate") { const g = M.gate(); g.position.set(o.x + 0.5, 0, o.y + 0.5); g.rotation.y = Math.PI / 2; worldGroup.add(g); gateMeshes.set(o.id, g); }
    else if (o.t === "web") { const wb = M.web(); wb.position.set(o.x + 0.5, 0, o.y + 0.5); wb.rotation.y = hash(o.x * 13 + o.y) * 6; worldGroup.add(wb); }
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [t, list] of Object.entries(byType)) {
    const im = new THREE.InstancedMesh(M.propGeometry(t), material, list.length);
    im.userData.shared = true;
    list.forEach((o, i) => {
      const r = hash(o.x * 92821 + o.y * 68917);
      const fixed = t === "pillar" || t === "statue";
      e.set(0, fixed ? 0 : r * Math.PI * 2, 0); q.setFromEuler(e);
      const s = fixed ? 1 : 0.85 + r * 0.35;
      m4.compose(new THREE.Vector3(o.x + 0.5, 0, o.y + 0.5), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true; im.receiveShadow = t === "rock";
    worldGroup.add(im);
  }
  for (const n of md.npcs || []) {
    const m = M.npc(n.kind);
    m.position.set(n.x, 0, n.y);
    worldGroup.add(m);
    n.obj = m;
  }
}

function onMapDelta(d) {
  for (const [x, y] of d.unblock || []) G.map.blocked[x + y * G.map.w] = false;
  for (const id of d.remove || []) {
    const g = gateMeshes.get(id);
    if (g) { const start = performance.now() / 1000; animated.push((t) => { g.position.y = -2.4 * Math.min(1, t - start); }); }
    G.map.objects = G.map.objects.filter((o) => o.id !== id);
  }
  buildMinimap();
}

// ======================================================= Entités
function playerSig(p) { return [p.c, p.a, p.h, p.wk, p.k].join("|"); }
function makePlayerModel(p) {
  const cls = G.classes[p.c] ? p.c : "lame";
  const wit = p.wk && G.items[p.wk];
  return M.humanoid({ cls, armorTier: p.a || 1, helmetTier: p.h, kingdomColor: G.kingdoms[p.k] ? G.kingdoms[p.k].color : "#fff", wtype: G.classes[cls].weapon, tier: wit ? wit.tier : 1, wkey: p.wk });
}

function upsertEntity(kind, data, now) {
  let e = G.ents.get(data.id);
  if (e && kind === "player" && e.sig !== playerSig(data)) { scene.remove(e.obj); e.obj = makePlayerModel(data); e.sig = playerSig(data); scene.add(e.obj); }
  if (!e) {
    let obj;
    if (kind === "player") obj = makePlayerModel(data);
    else if (data.s) obj = M.stone(G.sdefs[data.t] || { color: "#7b3fe4" });
    else obj = M.monster(G.mdefs[data.t] || { look: "wolf", color: "#888" });
    obj.position.set(data.x, 0, data.y);
    scene.add(obj);
    e = { id: data.id, kind, obj, rx: data.x, ry: data.y, seed: Math.random(), sig: kind === "player" ? playerSig(data) : null };
    if (kind === "player" && data.id === G.myId && !G.me.placed) { G.me.x = data.x; G.me.y = data.y; G.cam.tx = data.x; G.cam.ty = data.y; G.me.placed = true; }
    G.ents.set(data.id, e);
  }
  e.data = data;
  e.seen = now;
  return e;
}

function onSnap(s) {
  if (!G.map) return;
  const now = performance.now();
  for (const p of s.p) upsertEntity("player", p, now);
  G.stoneTiles.clear();
  for (const m of s.m) { upsertEntity("mon", m, now); if (m.s) G.stoneTiles.add(Math.floor(m.x) + Math.floor(m.y) * G.map.w); }
  if (s.dr) syncDrops(s.dr);
  const wasDead = G.stat.dead;
  G.stat = s.me;
  if (s.me.dead && !wasDead) { G.me.path = []; G.me.targetId = null; showDeath(); }
  if (!s.me.dead && wasDead) $("#death").classList.add("hidden");
  if (s.fx) for (const f of s.fx) handleFx(f, now / 1000);
  for (const [id, e] of G.ents) if (e.seen !== now) { scene.remove(e.obj); G.ents.delete(id); }
  if (G.me.targetId && !G.ents.has(G.me.targetId)) G.me.targetId = null;
  G.dg = s.dg || null;
  updateBars();
  updateDungeonPanel();
}

function syncDrops(list) {
  const ids = new Set(list.map((d) => d.id));
  for (const [id, d] of G.drops) if (!ids.has(id)) { scene.remove(d.obj); G.drops.delete(id); }
  for (const d of list) {
    if (G.drops.has(d.id)) continue;
    const tex = new THREE.CanvasTexture(Art.icon(d.k, G.items, 64));
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: d.o && d.o !== G.myId ? 0.45 : 1, depthWrite: false }));
    sp.scale.set(0.6, 0.6, 0.6);
    const g = new THREE.Group(); g.add(sp);
    const it = G.items[d.k];
    if (it && (it.unique || it.tier >= 3 || it.type === "material")) {
      const col = it.unique ? 0xffb347 : it.type === "material" ? 0xb48cff : 0x5fe0a8;
      const beamM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.18, 2.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false }));
      beamM.position.y = 1.25; g.add(beamM);
    }
    g.position.set(d.x, 0.45, d.y);
    scene.add(g);
    G.drops.set(d.id, { ...d, obj: g, sp });
  }
}

// ======================================================= Effets
const PMAX = 900;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const parts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
parts.frustumCulled = false;
scene.add(parts);
const pData = Array.from({ length: PMAX }, () => ({ life: 0 }));
let pNext = 0;
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -999;
function burst(x, y, z, color, n, speed = 3, up = 2) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const k = pNext, p = pData[k]; pNext = (pNext + 1) % PMAX;
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
    Object.assign(p, { x, y, z, vx: Math.cos(a) * v, vy: up * (0.4 + Math.random()), vz: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, t: 0 });
    pCol[k * 3] = c.r; pCol[k * 3 + 1] = c.g; pCol[k * 3 + 2] = c.b;
  }
  pGeo.attributes.color.needsUpdate = true;
}
function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    const p = pData[i];
    if (p.life <= 0) continue;
    p.t += dt;
    if (p.t >= p.life) { p.life = 0; pPos[i * 3 + 1] = -999; continue; }
    p.vy -= 5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    pPos[i * 3] = p.x; pPos[i * 3 + 1] = Math.max(0.02, p.y); pPos[i * 3 + 2] = p.z;
  }
  pGeo.attributes.position.needsUpdate = true;
}

const effects = [];
function addEffect(obj, dur, update) { fxGroup.add(obj); effects.push({ obj, t0: performance.now() / 1000, dur, update }); }
function basic(color, opacity = 0.6) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }); }
function groundRing(x, y, r, color, dur = 0.5, grow = true) {
  const m = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, r * 0.85), r, 40), basic(color, 0.8));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, y);
  addEffect(m, dur, (p) => { const s = grow ? 0.2 + p * 0.8 : 1; m.scale.set(s, s, s); m.material.opacity = 0.8 * (1 - p); });
}
function groundDisc(x, y, r, color, dur = 0.6) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 36), basic(color, 0.5));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, y);
  addEffect(m, dur, (p) => { m.material.opacity = 0.5 * (1 - p); });
}
function slash(e, color = 0xffffff, big = false) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(big ? 1.4 : 0.9, 0.05, 4, 20, Math.PI * 0.9), basic(color, 0.85));
  const d = e.id === G.myId ? G.me.d : e.data ? e.data.d : 0;
  m.position.set(e.rx, 0.9, e.ry);
  m.rotation.set(-Math.PI / 2, 0, -d - Math.PI * 0.45);
  addEffect(m, 0.22, (p) => { m.material.opacity = 0.85 * (1 - p); m.rotation.z += 0.12; });
}
function beam(points, color, width = 0.08, dur = 0.3) {
  const pts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay, az] = points[i], [bx, by, bz] = points[i + 1];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, j = k && k < 6 ? 0.25 : 0;
      pts.push(new THREE.Vector3(ax + (bx - ax) * t + (Math.random() - 0.5) * j, ay + (by - ay) * t + (Math.random() - 0.5) * j, az + (bz - az) * t + (Math.random() - 0.5) * j));
    }
  }
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, width, 4), basic(color, 0.95));
  addEffect(tube, dur, (p) => { tube.material.opacity = 0.95 * (1 - p); });
}
function projectile(from, to, color) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), basic(color, 1));
  addEffect(m, 0.22, (p) => { m.position.set(from.rx + (to.rx - from.rx) * p, 1.1, from.ry + (to.ry - from.ry) * p); });
}
function pillarFx(x, y, color, dur = 1.2, r = 0.7) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 6, 16, 1, true), basic(color, 0.4));
  m.position.set(x, 3, y);
  addEffect(m, dur, (p) => { m.material.opacity = 0.4 * (1 - p); m.scale.x = m.scale.z = 1 - p * 0.5; });
}

// Zones d'alerte des attaques de boss
function telegraph(shape, ms) {
  let geo;
  if (shape.s === "circle") geo = new THREE.CircleGeometry(shape.r, 40);
  else if (shape.s === "donut") geo = new THREE.RingGeometry(shape.ri, shape.ro, 48);
  else if (shape.s === "cone") geo = new THREE.CircleGeometry(shape.r, 32, -shape.arc, shape.arc * 2);
  else geo = new THREE.PlaneGeometry(shape.len + 0.5, shape.w);
  const base = new THREE.Mesh(geo, basic(0xff2a1a, 0.22));
  const fill = new THREE.Mesh(geo, basic(0xff5a2a, 0.45));
  const g = new THREE.Group(); g.add(base, fill);
  g.rotation.x = -Math.PI / 2;
  if (shape.s === "cone" || shape.s === "line") g.rotation.z = -shape.a;
  if (shape.s === "line") base.position.x = (shape.len - 0.5) / 2;
  g.position.set(shape.x, 0.06, shape.y);
  addEffect(g, ms / 1000, (p) => {
    if (shape.s === "line") { fill.scale.set(Math.max(0.001, p), 1, 1); fill.position.x = ((shape.len + 0.5) / 2) * p - 0.5; }
    else fill.scale.set(Math.max(0.001, p), Math.max(0.001, p), 1);
    base.material.opacity = 0.18 + 0.12 * Math.sin(p * 30);
  });
}

function entPos(id) { const e = G.ents.get(id); if (!e) return null; return { rx: id === G.myId ? G.me.x : e.rx, ry: id === G.myId ? G.me.y : e.ry, e }; }
function addFloat(x, y, h, text, color, size, dx = 0) { G.floats.push({ x, y, h, text, color, size, t0: performance.now(), dx: dx + (Math.random() - 0.5) * 30 }); }

function handleFx(f, t) {
  const P = entPos(f.id);
  const x = P ? P.rx : f.x, y = P ? P.ry : f.y, h = P && P.e.obj.userData.h ? P.e.obj.userData.h : 1.7;
  const e = P && P.e;
  if (x == null) return;
  switch (f.k) {
    case "dmg":
      if (e && e.kind === "mon") {
        e.hitT = t;
        addFloat(x, y, h, (f.c ? "✦" : "") + f.v, f.by === G.myId ? (f.c ? "#ffd23a" : f.dot ? "#b8f08a" : "#ffffff") : "#b8b0a0", f.c ? 24 : f.by === G.myId ? 18 : 13);
        burst(x, h * 0.6, y, f.c ? "#ffd23a" : "#ffffff", f.c ? 10 : 4, 2.5, 2);
      } else if (P) {
        addFloat(x, y, h, "-" + f.v, f.id === G.myId ? "#ff5a4a" : "#d07a70", f.id === G.myId ? 18 : 13);
        if (f.id === G.myId) G.hurtFlash = performance.now();
      }
      break;
    case "die":
      burst(x, 0.8, y, f.s ? "#c99cff" : f.b ? "#ffd23a" : "#d9d2c5", f.b ? 80 : f.s ? 50 : 20, f.b ? 6 : 3, 4);
      if (f.s || f.b) { groundRing(x, y, f.b ? 6 : 4, f.s ? 0xb48cff : 0xffd23a, 0.9); pillarFx(x, y, f.s ? 0xb48cff : 0xffd23a, 1, 1.2); }
      break;
    case "swing": if (e) { e.swingT = t; slash(e); } break;
    case "shot": { const to = entPos(f.to); if (e && to) projectile(e, to.e, 0x8fd8ff); if (e) e.castT = t; break; }
    case "matk": if (e) e.atkT = t; break;
    case "skill": if (e) skillFx(e, f, t); break;
    case "xp": if (f.id === G.myId) addFloat(x, y, h, "+" + f.v + " XP", "#c9a0ff", 13, 40); break;
    case "gold": if (f.id === G.myId) addFloat(x, y, h, "+" + f.v + " taels", "#f2c14e", 13, -40); break;
    case "lvl":
      pillarFx(x, y, 0xffd23a, 1.6, 0.8); burst(x, 1, y, "#ffd23a", 50, 3, 5);
      if (f.id === G.myId) addFloat(x, y, h, "NIVEAU SUPÉRIEUR !", "#ffd23a", 22);
      break;
    case "potion": burst(x, 1, y, f.c === "b" ? "#5a96f0" : "#ef5b52", 14, 1.2, 3); break;
    case "heal": burst(x, 0.5, y, "#7dffa8", 18, 1, 4); addFloat(x, y, h, "+" + f.v, "#7dffa8", 15); break;
    case "blessed": groundRing(x, y, 1.2, 0xffe08a, 0.8); burst(x, 0.5, y, "#ffe08a", 12, 1, 3); break;
    case "shielded": groundRing(x, y, 1.0, 0x9fe8ff, 0.7, false); break;
    case "absorb": addFloat(x, y, h, "(" + f.v + ")", "#9fe8ff", 13); break;
    case "immune": addFloat(x, y, h, "INVULNÉRABLE", "#c9a0ff", 14); break;
    case "wave": groundRing(x, y, 5, 0xb48cff, 0.9); burst(x, 1, y, "#b48cff", 40, 4, 4); break;
    case "tele":
      for (const s of f.shapes) telegraph(s, f.ms);
      if (e) { e.castT = t; e.castName = f.n; e.castUntil = t + f.ms / 1000; }
      break;
    case "boom":
      for (const s of f.shapes) { groundDisc(s.x, s.y, s.r, 0xff7a3a, 0.4); burst(s.x, 0.3, s.y, "#ffb347", 10, 3, 3); }
      G.shake = performance.now();
      break;
  }
}

function skillFx(e, f, t) {
  const col = { lame: 0xe8f4ff, ombre: 0x9b5de5, mystique: 0xb03cff, chaman: 0x8fd8ff }[f.c] || 0xffffff;
  if (e.data) e.data.d = f.d;
  const x = e.id === G.myId ? G.me.x : e.rx, y = e.id === G.myId ? G.me.y : e.ry;
  switch (f.c + f.n) {
    case "lame1": case "ombre6": e.spinT = t; groundRing(x, y, f.c === "lame" ? 2.4 : 2.6, col, 0.45, false); slash(e, col, true); burst(x, 0.8, y, "#ffffff", 20, 4, 1); break;
    case "lame6": groundRing(x, y, 3.6, 0xffb347, 0.6); groundDisc(x, y, 3.6, 0x8a5a2a, 0.5); burst(x, 0.2, y, "#c9a96b", 50, 5, 4); G.shake = performance.now(); e.swingT = t; break;
    case "lame4": case "lame5": case "ombre5": case "mystique5":
      pillarFx(x, y, f.c === "mystique" ? 0x9b30ff : f.c === "ombre" ? 0x9b5de5 : f.n === 5 ? 0x9fd8ff : 0xff6040, 0.8, 0.7); burst(x, 1, y, "#ff8060", 20, 2, 3); e.castT = t; break;
    case "lame3": case "ombre3": e.swingT = t; if (f.fx != null) beam([[f.fx, 0.6, f.fy], [f.tx, 0.6, f.ty]], f.c === "ombre" ? 0x5a3a7a : 0xffffff, 0.15, 0.35); break;
    case "mystique2": case "mystique6": case "chaman4":
      e.castT = t;
      if (f.tx != null) {
        groundDisc(f.tx, f.ty, f.r, f.c === "chaman" ? 0x8fd8ff : f.n === 6 ? 0x2a0040 : 0x7a00c0, 0.7);
        groundRing(f.tx, f.ty, f.r, col, 0.6);
        if (f.c === "chaman") for (let i = 0; i < 4; i++) beam([[f.tx + (Math.random() - 0.5) * f.r, 9, f.ty + (Math.random() - 0.5) * f.r], [f.tx + (Math.random() - 0.5) * f.r, 0, f.ty + (Math.random() - 0.5) * f.r]], 0xcff4ff, 0.06, 0.35);
        else burst(f.tx, 0.4, f.ty, f.n === 6 ? "#5a00a0" : "#b03cff", 40, 3, 4);
      }
      break;
    case "chaman1": { e.castT = t; const pts = [[x, 1.2, y], ...(f.pts || []).map(([px, py]) => [px, 0.9, py])]; if (pts.length > 1) beam(pts, 0xcff4ff, 0.06, 0.3); break; }
    case "chaman6": { e.castT = t; const ex = x + Math.cos(f.d) * f.len, ey = y + Math.sin(f.d) * f.len; beam([[x, 1, y], [ex, 1, ey]], 0x8fd8ff, 0.35, 0.5); beam([[x, 1, y], [ex, 1.3, ey]], 0xffffff, 0.08, 0.5); break; }
    case "chaman2": case "chaman3": case "chaman5": e.castT = t; groundRing(x, y, f.n === 2 ? 7 : f.n === 3 ? 9 : 1.5, f.n === 2 ? 0x7dffa8 : 0xffe08a, 0.8); break;
    case "mystique4": e.castT = t; groundRing(x, y, 3.2, 0x7a00c0, 0.6); groundDisc(x, y, 3.2, 0x2a0040, 0.6); break;
    case "mystique3": { const to = f.to && G.ents.get(f.to); e.castT = t; if (to) beam([[to.rx, 1, to.ry], [x, 1, y]], 0xff3060, 0.07, 0.4); break; }
    default:
      e.swingT = t; slash(e, col, f.c === "ombre" || f.c === "mystique");
      if (f.c === "ombre" && f.n === 4) for (let i = -2; i <= 2; i++) beam([[x, 1, y], [x + Math.cos(f.d + i * 0.3) * 3.2, 1, y + Math.sin(f.d + i * 0.3) * 3.2]], 0xc8ccd2, 0.03, 0.25);
      if (f.c === "mystique" && f.n === 1) groundRing(x + Math.cos(f.d) * 1.3, y + Math.sin(f.d) * 1.3, 1.4, 0x9b30ff, 0.35);
  }
}

// ======================================================= Déplacements
function walkable(x, y) {
  const m = G.map;
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
  const i = Math.floor(x) + Math.floor(y) * m.w;
  return !m.blocked[i] && !G.stoneTiles.has(i);
}
function blockedGrid() {
  if (!G.stoneTiles.size) return G.map.blocked;
  const b = G.map.blocked.slice();
  for (const i of G.stoneTiles) b[i] = true;
  return b;
}
function pathTo(x, y) {
  const p = findPath(G.map.w, G.map.h, blockedGrid(), G.me.x, G.me.y, x, y, 6000);
  G.me.path = p || [];
  if (p && p.length && walkable(x, y)) p[p.length - 1] = [x, y];
  return !!p;
}
function stepMove(dx, dy, d) {
  const me = G.me, nx = me.x + dx * d, ny = me.y + dy * d;
  if (walkable(nx, ny)) { me.x = nx; me.y = ny; }
  else if (walkable(nx, me.y)) me.x = nx;
  else if (walkable(me.x, ny)) me.y = ny;
  else return false;
  return true;
}
function camVectors() { const yaw = G.cam.yaw; return { fx: -Math.sin(yaw), fy: -Math.cos(yaw), rx: Math.cos(yaw), ry: -Math.sin(yaw) }; }
function myClass() { return G.self ? G.classes[G.self.cls] : G.classes.lame; }

function update(dt, now) {
  const me = G.me;
  if (G.stat.dead) { me.moving = false; sendMove(now); return; }
  const speed = BASE_SPEED * (G.stat.spd || 1);
  let kx = 0, ky = 0;
  if (G.keys.has("KeyW") || G.keys.has("ArrowUp")) ky += 1;
  if (G.keys.has("KeyS") || G.keys.has("ArrowDown")) ky -= 1;
  if (G.keys.has("KeyA") || G.keys.has("ArrowLeft")) kx -= 1;
  if (G.keys.has("KeyD") || G.keys.has("ArrowRight")) kx += 1;
  if (G.joy.active && Math.hypot(G.joy.x, G.joy.y) > 0.2) { kx = G.joy.x; ky = -G.joy.y; }
  if (G.keys.has("KeyQ")) G.cam.yaw += dt * 2;
  if (G.keys.has("KeyE")) G.cam.yaw -= dt * 2;
  if (G.mouse.down && G.mouse.holdMove && now - (G.mouse.lastHold || 0) > 180) {
    G.mouse.lastHold = now;
    const w = groundAt(G.mouse.x, G.mouse.y);
    if (w) pathTo(w.x, w.y);
  }
  let moved = false;
  if (kx || ky) {
    const v = camVectors();
    let wx = v.rx * kx + v.fx * ky, wy = v.ry * kx + v.fy * ky;
    const l = Math.hypot(wx, wy) || 1; wx /= l; wy /= l;
    me.path = []; me.targetId = null; me.interact = null;
    if (stepMove(wx, wy, speed * dt * Math.min(1, Math.hypot(kx, ky)))) moved = true;
    me.d = Math.atan2(wy, wx);
  } else {
    const t = me.targetId && G.ents.get(me.targetId);
    if (t) {
      const def = t.data.s ? null : G.mdefs[t.data.t];
      const extra = t.data.s ? 0.5 : def && def.boss ? (def.size || 1) * 0.5 : 0;
      const range = (myClass().range > 3 ? myClass().range - 0.3 : ATK_RANGE_MELEE) + extra;
      const d = Math.hypot(t.rx - me.x, t.ry - me.y);
      if (d > range) { if (now > me.repathAt) { me.repathAt = now + 350; pathTo(t.rx, t.ry); } }
      else {
        me.path = []; me.d = Math.atan2(t.ry - me.y, t.rx - me.x);
        if (now >= me.nextAtk) { me.nextAtk = now + myClass().atkCd; G.socket.emit("atk", { t: t.id }); }
      }
    }
    if (me.interact) {
      const it = me.interact;
      if (Math.hypot(it.x - me.x, it.y - me.y) < 2.6) { me.path = []; me.interact = null; interactWith(it); }
    }
    if (me.path.length) {
      let remain = speed * dt;
      while (remain > 0 && me.path.length) {
        const [px, py] = me.path[0], dx = px - me.x, dy = py - me.y, d = Math.hypot(dx, dy);
        if (d < 0.02) { me.path.shift(); continue; }
        const step = Math.min(d, remain);
        me.d = Math.atan2(dy, dx);
        if (!stepMove(dx / d, dy / d, step)) { me.path = []; break; }
        moved = true; remain -= step;
        if (step >= d) me.path.shift();
      }
    }
  }
  if (G.atkHeld) tryAttack();
  me.moving = moved;
  sendMove(now);
  if (G.openPanel === "shop" || G.openPanel === "smith") {
    const n = G.map.npcs.find((x) => x.kind === (G.openPanel === "shop" ? "merchant" : "smith"));
    if (!n || Math.hypot(n.x - me.x, n.y - me.y) > 4.5) closePanels();
  }
}

function sendMove(now) {
  const me = G.me;
  if (now - G.lastSent < 66) return;
  if (!me.moving && !G.sentMoving && me.lsx === me.x && me.lsy === me.y) return;
  G.lastSent = now; G.sentMoving = me.moving; me.lsx = me.x; me.lsy = me.y;
  G.socket.emit("mv", { x: +me.x.toFixed(3), y: +me.y.toFixed(3), d: +me.d.toFixed(2), m: me.moving ? 1 : 0 });
}

function nearestMonster(maxD) {
  let best = null, bd = maxD;
  for (const e of G.ents.values()) {
    if (e.kind !== "mon") continue;
    const d = Math.hypot(e.rx - G.me.x, e.ry - G.me.y) - (e.data.s ? 0.3 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function tryAttack() {
  const me = G.me, now = performance.now();
  if (G.stat.dead) return;
  if (!me.targetId || !G.ents.has(me.targetId)) {
    const m = nearestMonster(myClass().range > 3 ? 9 : 7);
    if (m) { me.targetId = m.id; me.interact = null; return; }
    if (now >= me.nextAtk) { me.nextAtk = now + myClass().atkCd; G.socket.emit("atk", {}); }
  }
}
function useSkill(n) {
  if (!G.self || G.stat.dead) return;
  const sk = G.skills[G.self.cls].find((s) => s.id === n);
  if (!sk) return;
  if (G.self.lvl < sk.lvl) return toast(`${sk.name} : niveau ${sk.lvl} requis.`, "bad");
  const cd = G.cds[n];
  if (cd && performance.now() < cd.until) return;
  if (!G.me.targetId && ["single", "bolt", "ground", "cone", "dash", "line"].includes(sk.kind)) { const m = nearestMonster((sk.range || sk.dist || sk.length || 3) + 1); if (m) G.me.targetId = m.id; }
  const t = G.me.targetId && G.ents.get(G.me.targetId);
  if (t) G.me.d = Math.atan2(t.ry - G.me.y, t.rx - G.me.x);
  G.socket.emit("mv", { x: +G.me.x.toFixed(3), y: +G.me.y.toFixed(3), d: +G.me.d.toFixed(2), m: 0 });
  G.socket.emit("skill", { n, t: G.me.targetId });
}
function usePotion(key) { G.socket.emit("usekey", { key }); }

// ======================================================= Caméra et sélection
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmpV = new THREE.Vector3();
function groundAt(sx, sy) {
  ndc.set((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(groundPlane, tmpV);
  return hit ? { x: hit.x, y: hit.z } : null;
}
function toScreen(x, y, z) {
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1) return null;
  return [(tmpV.x + 1) / 2 * innerWidth, (1 - tmpV.y) / 2 * innerHeight];
}
function pick(sx, sy) {
  let best = null, bd = 1e9;
  const consider = (obj, x, y, h, kind, rad = 26) => {
    const a = toScreen(x, 0, y), b = toScreen(x, h, y);
    if (!a || !b) return;
    const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((sx - a[0]) * vx + (sy - a[1]) * vy) / l2));
    const d = Math.hypot(sx - (a[0] + vx * t), sy - (a[1] + vy * t));
    if (d < rad && d < bd) { bd = d; best = { kind, obj, x, y }; }
  };
  for (const e of G.ents.values()) {
    if (e.id === G.myId) continue;
    const big = e.kind === "mon" && e.obj.userData.h > 3;
    consider(e, e.rx, e.ry, (e.obj.userData.h || 1.6) + (e.data.fl ? 3 : 0), e.kind === "mon" ? "mon" : "player", big ? 60 : 28);
  }
  for (const n of G.map.npcs) consider(n, n.x, n.y, 1.7, "npc");
  for (const d of G.drops.values()) consider(d, d.x, d.y, 0.8, "drop", 22);
  for (const o of G.map.objects) if (o.t === "portal" || o.t === "exit") consider(o, o.x + 0.5, o.y + 0.5, 2.5, o.t, 45);
  return best;
}

function updateCamera(dt) {
  const c = G.cam;
  c.tx += (G.me.x - c.tx) * Math.min(1, dt * 10);
  c.ty += (G.me.y - c.ty) * Math.min(1, dt * 10);
  c.pitch = Math.max(0.25, Math.min(1.35, c.pitch));
  c.dist = Math.max(5, Math.min(26, c.dist));
  const cp = Math.cos(c.pitch);
  let sx = 0, sy = 0;
  if (G.shake && performance.now() - G.shake < 250) { sx = (Math.random() - 0.5) * 0.25; sy = (Math.random() - 0.5) * 0.25; }
  camera.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist + sx, 1 + Math.sin(c.pitch) * c.dist + sy, c.ty + Math.cos(c.yaw) * cp * c.dist);
  camera.lookAt(c.tx, 1.0, c.ty);
  sun.position.set(c.tx + 12, 24, c.ty + 8);
  sun.target.position.set(c.tx, 0, c.ty);
}

// ======================================================= Animation des entités
function setAura(e, key, on, make, anim) {
  if (on && !e[key]) { e[key] = make(); e.obj.add(e[key]); }
  if (!on && e[key]) { e.obj.remove(e[key]); e[key] = null; }
  if (e[key]) anim(e[key]);
}
function animateEntities(t, dt) {
  const k = Math.min(1, dt * 12);
  for (const e of G.ents.values()) {
    const d = e.data, isMe = e.id === G.myId;
    if (isMe) { e.rx = G.me.x; e.ry = G.me.y; }
    else { e.rx += (d.x - e.rx) * k; e.ry += (d.y - e.ry) * k; }
    e.obj.position.set(e.rx, 0, e.ry);
    if (!d.s) {
      const target = Math.PI / 2 - (isMe ? G.me.d : d.d);
      let diff = target - e.obj.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.obj.rotation.y += diff * Math.min(1, dt * 14);
    }
    if (e.kind === "player") {
      M.animHumanoid(e.obj, { moving: isMe ? G.me.moving : !!d.m, swingT: e.swingT, spinT: e.spinT, castT: e.castT, dead: !!d.dead }, t);
      setAura(e, "buffAura", !!d.b, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), basic(0xff8050, 0.5)); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m; }, (m) => { m.rotation.z = t; m.material.opacity = 0.35 + Math.sin(t * 4) * 0.15; });
      setAura(e, "shieldAura", !!d.sh, () => new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), basic(0x9fe8ff, 0.18)), (m) => { m.position.y = 0.9; m.material.opacity = 0.15 + Math.sin(t * 5) * 0.05; });
    } else if (d.s) e.obj.userData.anim(t, e.hitT);
    else {
      const def = G.mdefs[d.t] || {};
      M.animMonster(e.obj, { moving: !!d.mv, atkT: e.atkT, seed: e.seed, flying: !!d.fl, casting: !!d.cast }, t);
      const s = def.size || 1;
      e.obj.scale.setScalar(e.hitT && t - e.hitT < 0.1 ? s * 1.06 : s);
      setAura(e, "stun", !!d.st, () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), basic(0xffe08a, 1)); st.position.set(Math.cos(i * 2.1) * 0.3, 0, Math.sin(i * 2.1) * 0.3); g.add(st); } return g; }, (g) => { g.rotation.y = t * 5; g.position.y = (e.obj.userData.h || 1.5) / s + 0.1; });
      setAura(e, "shieldAura", !!d.sh, () => new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), basic(0xc86bff, 0.2)), (m) => { m.position.y = 0.8; m.material.opacity = 0.18 + Math.sin(t * 3) * 0.06; });
    }
  }
  for (const n of G.map.npcs) if (n.obj) {
    M.animHumanoid(n.obj, { moving: false }, t + n.x);
    if (Math.hypot(G.me.x - n.x, G.me.y - n.y) < 6) n.obj.rotation.y = Math.PI / 2 - Math.atan2(G.me.y - n.y, G.me.x - n.x);
  }
  for (const d of G.drops.values()) d.obj.position.y = 0.45 + Math.sin(t * 3 + d.x) * 0.08;
  for (const a of animated) a(t);
}

// ======================================================= Étiquettes 2D par-dessus la 3D
function renderOverlay(now) {
  const w = innerWidth, h = innerHeight, o = octx;
  o.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  o.clearRect(0, 0, w, h);
  o.textAlign = "center"; o.lineJoin = "round";
  const label = (x, y, text, color, size = 11.5) => {
    o.font = `600 ${size}px "Noto Sans", sans-serif`;
    o.lineWidth = 3; o.strokeStyle = "rgba(0,0,0,0.8)"; o.strokeText(text, x, y); o.fillStyle = color; o.fillText(text, x, y);
  };
  const bar = (x, y, pct, color, bw = 44) => { o.fillStyle = "rgba(0,0,0,0.7)"; o.fillRect(x - bw / 2 - 1, y - 1, bw + 2, 6); o.fillStyle = color; o.fillRect(x - bw / 2, y, bw * Math.max(0, pct), 4); };
  for (const e of G.ents.values()) {
    const d = e.data, hh = (e.obj.userData.h || 1.7) + (d.fl ? 3.2 : 0);
    if (Math.hypot(e.rx - G.cam.tx, e.ry - G.cam.ty) > 30) continue;
    const p = toScreen(e.rx, hh + 0.35, e.ry);
    if (!p) continue;
    if (e.kind === "player") {
      label(p[0], p[1], `Niv.${d.l} ${d.n}`, G.kingdoms[d.k] ? G.kingdoms[d.k].color : "#fff");
      if (e.id !== G.myId && d.hp < d.mh) bar(p[0], p[1] + 4, d.hp / d.mh, "#3ccf5a");
    } else {
      const def = d.s ? G.sdefs[d.t] : G.mdefs[d.t];
      if (!def) continue;
      if (!(d.s || d.hp < d.mh || e.id === G.me.targetId || (G.hover && G.hover.obj === e) || def.boss)) continue;
      const lv = def.lvl - (G.self ? G.self.lvl : 1);
      const col = def.boss ? "#ffb347" : lv >= 4 ? "#ff6b5e" : lv >= 1 ? "#ffb347" : lv <= -5 ? "#9a9a9a" : "#ffffff";
      label(p[0], p[1] - 6, `${def.name} Niv.${def.lvl}`, col, def.boss ? 13 : 11.5);
      bar(p[0], p[1], d.hp / d.mh, "#e03a3a", def.boss || d.s ? 70 : 44);
    }
  }
  for (const n of G.map.npcs) { const p = toScreen(n.x, 2.15, n.y); if (p) { label(p[0], p[1], n.name, "#f2c14e"); label(p[0], p[1] - 16, n.kind === "guide" ? "❗" : n.kind === "smith" ? "⚒" : "💰", "#f2c14e", 13); } }
  for (const ob of G.map.objects) {
    if (ob.t !== "portal" && ob.t !== "exit") continue;
    if (Math.hypot(ob.x - G.cam.tx, ob.y - G.cam.ty) > 25) continue;
    const p = toScreen(ob.x + 0.5, 3.1, ob.y + 0.5);
    if (p) label(p[0], p[1], ob.t === "exit" ? "Sortie" : `${G.dungeons[ob.dungeon].name} (niv. ${G.dungeons[ob.dungeon].lvl})`, ob.t === "exit" ? "#9fd8ff" : "#ffb347", 12.5);
  }
  if (G.hover && G.hover.kind === "drop") {
    const d = G.hover.obj, p = toScreen(d.x, 1.1, d.y);
    if (p) label(p[0], p[1], d.k === "gold" ? `${d.n} taels` : G.items[d.k].name, G.items[d.k] && G.items[d.k].unique ? "#ffb347" : "#ffffff");
  }
  G.floats = G.floats.filter((f) => now - f.t0 < 1100);
  for (const f of G.floats) {
    const pr = Math.max(0, (now - f.t0) / 1100);
    const p = toScreen(f.x, f.h + 0.4, f.y);
    if (!p) continue;
    o.globalAlpha = pr < 0.7 ? 1 : 1 - (pr - 0.7) / 0.3;
    o.font = `800 ${f.size}px "Noto Sans", sans-serif`;
    o.lineWidth = 3; o.strokeStyle = "rgba(0,0,0,0.85)";
    const x = p[0] + f.dx * pr, y = p[1] - 10 - pr * 45;
    o.strokeText(f.text, x, y); o.fillStyle = f.color; o.fillText(f.text, x, y);
  }
  o.globalAlpha = 1;
  if (G.hurtFlash && now - G.hurtFlash < 250) {
    const g = o.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "rgba(160,0,0,0)"); g.addColorStop(1, `rgba(160,0,0,${0.35 * (1 - (now - G.hurtFlash) / 250)})`);
    o.fillStyle = g; o.fillRect(0, 0, w, h);
  }
  if (G.stat.hp / G.stat.mh < 0.25 && !G.stat.dead) {
    const g = o.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(120,0,0,0)"); g.addColorStop(1, `rgba(120,0,0,${0.25 + 0.1 * Math.sin(now / 200)})`);
    o.fillStyle = g; o.fillRect(0, 0, w, h);
  }
}

// ======================================================= Mini-carte (tourne avec la caméra)
let miniImg = null;
const MS = 3;
function buildMinimap() {
  const m = G.map, c = document.createElement("canvas");
  c.width = m.w * MS; c.height = m.h * MS;
  const g = c.getContext("2d");
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = m.tiles[x + y * m.w];
    g.fillStyle = t === 6 ? "#0d0a08" : m.blocked[x + y * m.w] && t !== 4 ? (t === 3 ? "#5a3a2a" : t >= 7 ? "#2a2230" : "#22401c") : TILE_COL[t];
    g.fillRect(x * MS, y * MS, MS, MS);
  }
  for (const o of m.objects) if (o.t === "portal" || o.t === "exit") { g.fillStyle = o.t === "exit" ? "#6bb8ff" : "#ffb347"; g.fillRect(o.x * MS - 3, o.y * MS - 3, MS + 6, MS + 6); }
  miniImg = c;
}
const mini = $("#minimap"), mctx = mini.getContext("2d");
function renderMinimap(now) {
  if (!miniImg) return;
  const W = mini.width, H = mini.height, S = 1.6;
  // la direction regardée par la caméra pointe vers le haut de la mini-carte
  const rot = -Math.PI / 2 - Math.atan2(-Math.cos(G.cam.yaw), -Math.sin(G.cam.yaw));
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.fillStyle = "#0a0807"; mctx.fillRect(0, 0, W, H);
  mctx.save();
  mctx.translate(W / 2, H / 2); mctx.rotate(rot); mctx.scale(S, S);
  mctx.drawImage(miniImg, -G.me.x * MS, -G.me.y * MS);
  const dot = (x, y, col, r) => { mctx.fillStyle = col; mctx.beginPath(); mctx.arc((x - G.me.x) * MS, (y - G.me.y) * MS, r, 0, 7); mctx.fill(); };
  for (const n of G.map.npcs) dot(n.x, n.y, "#f2c14e", 2.2);
  for (const e of G.ents.values()) {
    if (e.id === G.myId) continue;
    if (e.kind === "player") dot(e.rx, e.ry, G.kingdoms[e.data.k].color, 2.4);
    else { const def = G.mdefs[e.data.t]; dot(e.rx, e.ry, e.data.s ? (Math.sin(now / 200) > 0 ? "#d9b3ff" : "#7b3fe4") : def && def.boss ? "#ffb347" : "#e04848", e.data.s || (def && def.boss) ? 3.4 : 1.5); }
  }
  mctx.rotate(G.me.d);
  mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.moveTo(4, 0); mctx.lineTo(-2.5, -2.5); mctx.lineTo(-1.2, 0); mctx.lineTo(-2.5, 2.5); mctx.fill();
  mctx.restore();
  if (G.kind === "over") { const dv = Math.hypot(G.me.x - 18, G.me.y - 18); $("#zone-name").textContent = ZONES[dv < 11 ? 0 : dv < 28 ? 1 : dv < 50 ? 2 : dv < 74 ? 3 : 4]; }
  else $("#zone-name").textContent = G.dg ? G.dg.name : "Donjon";
}

// ======================================================= Interface
function toast(text, kind = "info") {
  const d = document.createElement("div");
  d.className = "toast " + kind; d.textContent = text;
  $("#toasts").appendChild(d);
  setTimeout(() => d.remove(), 3300);
  while ($("#toasts").children.length > 4) $("#toasts").firstChild.remove();
}
function addChat(c) {
  const log = $("#chat-log"), line = document.createElement("div");
  if (c.sys) { line.className = "sys"; line.textContent = c.text; }
  else {
    const b = document.createElement("b");
    b.textContent = c.from + " : ";
    b.style.color = G.kingdoms[c.k] ? G.kingdoms[c.k].color : "#fff";
    line.append(b, document.createTextNode(c.text));
  }
  log.appendChild(line);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function onChat(c) {
  addChat(c);
  if (!c.sys) for (const e of G.ents.values()) if (e.kind === "player" && e.data.n === c.from) addFloat(e.rx, e.ry, 2.3, c.text.length > 30 ? c.text.slice(0, 30) + "…" : c.text, "#ffffff", 12);
}
const chatInput = $("#chat-input");
chatInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") { const t = chatInput.value.trim(); if (t) G.socket.emit("chat", { text: t }); chatInput.value = ""; chatInput.blur(); $("#chat").classList.remove("open"); }
  else if (e.key === "Escape") { chatInput.blur(); $("#chat").classList.remove("open"); }
});
$("#chat-toggle").onclick = () => { $("#chat").classList.toggle("open"); if ($("#chat").classList.contains("open")) chatInput.focus(); };
// recentrer : caméra derrière le personnage
$("#cam-reset").onclick = () => { G.cam.yaw = Math.atan2(-Math.cos(G.me.d), -Math.sin(G.me.d)); G.cam.pitch = 0.82; G.cam.dist = 13; };

function onSelf(s) {
  const first = !G.self || G.self.cls !== s.cls;
  G.self = s;
  $("#st-name").textContent = s.name;
  $("#st-name").style.color = G.kingdoms[s.kingdom].color;
  $("#st-lvl").textContent = `${G.classes[s.cls].name} · Niv. ${s.lvl}`;
  const pct = s.lvl >= s.maxLevel ? 100 : (s.xp / s.xpNext) * 100;
  $("#bar-xp").style.width = pct + "%";
  $("#txt-xp").textContent = s.lvl >= s.maxLevel ? "Niveau maximum" : `XP ${s.xp} / ${s.xpNext} (${pct.toFixed(1)} %)`;
  if (first) buildSkillbar();
  document.querySelectorAll(".hb.skill").forEach((b) => {
    const sk = G.skills[s.cls].find((k) => k.id === +b.dataset.n);
    b.classList.toggle("locked", s.lvl < sk.lvl);
  });
  document.querySelectorAll(".hb.pot").forEach((b) => {
    const key = b.dataset.key;
    let n = s.inv.reduce((a, x) => a + (x && x.key === key ? x.n : 0), 0);
    if (key === "potion_rouge") n += s.inv.reduce((a, x) => a + (x && x.key === "grande_potion" ? x.n : 0), 0);
    b.querySelector("em").textContent = n; b.style.opacity = n ? 1 : 0.45;
  });
  renderInventory();
  if (G.openPanel === "shop") renderShop();
  if (G.openPanel === "smith") renderSmith();
}

function buildSkillbar() {
  const bar = $("#skillbar");
  bar.innerHTML = "";
  for (const sk of G.skills[G.self.cls]) {
    const b = document.createElement("button");
    b.className = "hb skill"; b.dataset.n = sk.id;
    b.title = `${sk.name} — ${sk.desc} (${sk.mp} PM, ${sk.cd} s, niveau ${sk.lvl})`;
    b.innerHTML = `<span class="ico">${SKILL_ICONS[sk.icon] || "✦"}</span><kbd>${sk.id}</kbd><div class="cd"></div><div class="lock">Niv. ${sk.lvl}</div>`;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); useSkill(sk.id); });
    if (!isTouch) { b.addEventListener("mouseenter", () => showSkillTip(sk, b)); b.addEventListener("mouseleave", hideTip); }
    bar.appendChild(b);
  }
  $("#hb-atk .ico").textContent = { lame: "⚔", ombre: "🗡", mystique: "⚔", chaman: "⚡" }[G.self.cls];
}
function showSkillTip(sk, el) {
  const t = $("#tooltip");
  t.innerHTML = `<div class="t">${sk.name}</div><div>${sk.desc}</div><div style="color:#b3a48a">${sk.mp} PM · recharge ${sk.cd} s · niveau ${sk.lvl}</div>`;
  t.classList.remove("hidden");
  const r = el.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(innerWidth - 240, r.left - 90)) + "px";
  t.style.top = Math.max(8, r.top - 90) + "px";
}

function updateBars() {
  const s = G.stat;
  $("#bar-hp").style.width = (100 * s.hp / s.mh) + "%";
  $("#bar-shield").style.width = Math.min(100, 100 * (s.shield || 0) / s.mh) + "%";
  $("#txt-hp").textContent = `${s.hp} / ${s.mh}${s.shield ? " (+" + s.shield + ")" : ""}`;
  $("#bar-mp").style.width = (100 * s.mp / s.mm) + "%";
  $("#txt-mp").textContent = `${s.mp} / ${s.mm}`;
  const fx = [];
  for (const b of s.buffs || []) fx.push(`<span class="good">${b.n} ${Math.ceil(b.t / 1000)}s</span>`);
  if (s.slow) fx.push('<span class="bad">Ralenti</span>');
  if (s.poison) fx.push('<span class="bad">Empoisonné</span>');
  $("#st-effects").innerHTML = fx.join("");
}
function updateDungeonPanel() {
  const p = $("#dungeon-panel");
  if (!G.dg) { p.classList.add("hidden"); return; }
  p.classList.remove("hidden");
  $("#dg-name").textContent = G.dg.name;
  $("#dg-obj").textContent = G.dg.obj;
  if (G.dg.t != null) { const s = Math.ceil(G.dg.t / 1000); $("#dg-time").textContent = `⏳ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  else $("#dg-time").textContent = "";
}

// ----- Inventaire -----
let selSlot = null;
function buildInventory() {
  const grid = $("#inv-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 30; i++) {
    const d = document.createElement("div");
    d.className = "slot"; d.dataset.i = i;
    d.addEventListener("click", (e) => { e.stopPropagation(); slotClick("inv", i, d); });
    d.addEventListener("contextmenu", (e) => { e.preventDefault(); if (G.self && G.self.inv[i]) G.socket.emit("use", { slot: i }); hideTip(); });
    d.addEventListener("mouseenter", () => { const s = G.self && G.self.inv[i]; if (s && !isTouch) showTip(s, d); });
    d.addEventListener("mouseleave", hideTip);
    d.draggable = !isTouch;
    d.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", i); hideTip(); });
    d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("drag-over"); });
    d.addEventListener("dragleave", () => d.classList.remove("drag-over"));
    d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("drag-over"); const a = +e.dataTransfer.getData("text/plain"); if (a !== i) G.socket.emit("swap", { a, b: i }); });
    grid.appendChild(d);
  }
  document.querySelectorAll(".eq-slot").forEach((d) => {
    d.addEventListener("click", (e) => { e.stopPropagation(); slotClick("eq", d.dataset.slot, d); });
    d.addEventListener("contextmenu", (e) => { e.preventDefault(); G.socket.emit("unequip", { slot: d.dataset.slot }); hideTip(); });
    d.addEventListener("mouseenter", () => { const s = G.self && G.self.eq[d.dataset.slot]; if (s && !isTouch) showTip(s, d); });
    d.addEventListener("mouseleave", hideTip);
  });
  $("#panel-inv").addEventListener("click", () => hideMenu());
}
function fillSlot(d, s) {
  const small = d.querySelector("small");
  d.innerHTML = "";
  if (small) d.appendChild(small);
  d.style.borderColor = "";
  if (!s) { if (small) small.style.display = ""; return; }
  if (small) small.style.display = "none";
  const cv = document.createElement("canvas"); cv.width = 40; cv.height = 40; cv.getContext("2d").drawImage(Art.icon(s.key, G.items, 40), 0, 0);
  d.appendChild(cv);
  if (s.n > 1) { const n = document.createElement("span"); n.className = "n"; n.textContent = s.n; d.appendChild(n); }
  if (s.plus) { const p = document.createElement("span"); p.className = "plus"; p.textContent = "+" + s.plus; d.appendChild(p); }
  if (G.items[s.key].unique) d.style.borderColor = "#ffb347";
}
function renderInventory() {
  const s = G.self;
  if (!s) return;
  document.querySelectorAll("#inv-grid .slot").forEach((d, i) => fillSlot(d, s.inv[i]));
  document.querySelectorAll(".eq-slot").forEach((d) => fillSlot(d, s.eq[d.dataset.slot]));
  $("#gold").textContent = s.gold.toLocaleString("fr-FR");
  $("#stats").innerHTML = `<div>${G.classes[s.cls].name} niveau <b>${s.lvl}</b></div><div>Attaque <b>${s.atk}</b></div><div>Défense <b>${s.def}</b></div><div>PV max <b>${s.maxHp}</b></div><div>PM max <b>${s.maxMp}</b></div><div>Critique <b>${s.crit} %</b></div><div style="color:${G.kingdoms[s.kingdom].color}">${G.kingdoms[s.kingdom].name}</div>`;
}
function nearNpc(kind) { if (G.kind !== "over") return false; const n = G.map.npcs.find((x) => x.kind === kind); return n && Math.hypot(n.x - G.me.x, n.y - G.me.y) <= 4; }
const WT_NAME = { sword: "Épée (Lame, Mystique)", dagger: "Dagues (Ombre)", fan: "Éventail (Chaman)" };
function itemInfo(s) {
  const it = G.items[s.key], plus = s.plus || 0;
  let h = `<div class="t" style="${it.unique ? "color:#ffb347" : ""}">${it.name}${plus ? " +" + plus : ""}</div>`;
  if (it.unique) h += `<div style="color:#ffb347">Arme exclusive de boss</div>`;
  if (it.wtype) h += `<div class="${G.self && G.classes[G.self.cls].weapon !== it.wtype ? "r" : ""}">${WT_NAME[it.wtype]}</div>`;
  if (it.atk) h += `<div>Attaque : ${Math.round(it.atk * (1 + 0.15 * plus) + plus * 2)}</div>`;
  if (it.def) h += `<div>Défense : ${Math.round(it.def + plus * 1.5)}</div>`;
  if (it.hp) h += `<div>PV : +${Math.round(it.hp * (1 + 0.1 * plus))}</div>`;
  if (it.bonus) for (const [k, v] of Object.entries(it.bonus)) h += `<div style="color:#9fe8c0">${{ hp: "PV", mp: "PM", crit: "Critique", lifesteal: "Vol de vie" }[k]} : +${k === "crit" || k === "lifesteal" ? Math.round(v * 100) + " %" : v}</div>`;
  if (it.heal) h += `<div>Rend ${it.heal} PV</div>`;
  if (it.mana) h += `<div>Rend ${it.mana} PM</div>`;
  if (it.lvl) h += `<div class="${G.self && G.self.lvl < it.lvl ? "r" : ""}">Niveau requis : ${it.lvl}</div>`;
  if (it.type === "material") h += `<div>Utilisée par le forgeron.</div>`;
  if (it.type === "junk") h += `<div>À revendre à la marchande.</div>`;
  h += `<div style="color:#b3a48a">Revente : ${Math.floor(it.price * 0.3 * (1 + plus * 0.25))} taels</div>`;
  return h;
}
function showTip(s, el) {
  const t = $("#tooltip");
  t.innerHTML = itemInfo(s); t.classList.remove("hidden");
  const r = el.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(innerWidth - 240, r.left - 240)) + "px";
  t.style.top = Math.max(8, Math.min(innerHeight - 200, r.top)) + "px";
}
function hideTip() { $("#tooltip").classList.add("hidden"); }
function hideMenu() { $("#item-menu").classList.add("hidden"); document.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel")); selSlot = null; }
function slotClick(from, slot, el) {
  const s = from === "eq" ? G.self.eq[slot] : G.self.inv[slot];
  hideTip();
  if (!s) return hideMenu();
  if (selSlot && selSlot.from === from && selSlot.slot === slot) return hideMenu();
  hideMenu();
  selSlot = { from, slot }; el.classList.add("sel");
  const it = G.items[s.key], menu = $("#item-menu");
  menu.innerHTML = isTouch ? `<div style="padding:6px 8px;font-size:12.5px;line-height:1.5">${itemInfo(s)}</div>` : "";
  const add = (txt, fn) => { const b = document.createElement("button"); b.textContent = txt; b.onclick = (e) => { e.stopPropagation(); fn(); hideMenu(); }; menu.appendChild(b); };
  const gear = ["weapon", "armor", "helmet"].includes(it.type);
  if (from === "inv") {
    if (it.type === "potion") add("Utiliser", () => G.socket.emit("use", { slot }));
    if (gear) add("Équiper", () => G.socket.emit("use", { slot }));
    if (nearNpc("merchant")) add(`Vendre (${Math.floor(it.price * 0.3 * (1 + (s.plus || 0) * 0.25)) * (s.n || 1)} taels)`, () => G.socket.emit("sell", { slot }));
  } else add("Retirer", () => G.socket.emit("unequip", { slot }));
  if (gear && nearNpc("smith")) add("Améliorer à la forge", () => { smithSel = { from, slot }; openPanel("smith"); });
  add("Fermer", () => {});
  const pr = $("#panel-inv").getBoundingClientRect(), r = el.getBoundingClientRect();
  menu.style.left = Math.min(pr.width - 150, r.left - pr.left + 20) + "px";
  menu.style.top = (r.top - pr.top + 30 + $("#panel-inv").scrollTop) + "px";
  menu.classList.remove("hidden");
}

// ----- Boutique -----
function renderShop() {
  const list = $("#shop-list");
  list.innerHTML = "";
  for (const key of G.shop) {
    const it = G.items[key];
    if (it.wtype && G.self && G.classes[G.self.cls].weapon !== it.wtype) continue;
    const row = document.createElement("div"); row.className = "shop-row";
    const cv = document.createElement("canvas"); cv.width = 36; cv.height = 36; cv.getContext("2d").drawImage(Art.icon(key, G.items, 36), 0, 0);
    const nm = document.createElement("div"); nm.className = "nm";
    nm.innerHTML = `${it.name}<small>${it.price} taels${it.lvl ? " · niveau " + it.lvl : ""}${it.heal ? " · +" + it.heal + " PV" : ""}${it.mana ? " · +" + it.mana + " PM" : ""}${it.atk ? " · Att. " + it.atk : ""}${it.def ? " · Déf. " + it.def : ""}</small>`;
    row.append(cv, nm);
    const gold = G.self ? G.self.gold : 0;
    const mkBtn = (n) => { const b = document.createElement("button"); b.textContent = n > 1 ? "x" + n : "Acheter"; b.disabled = gold < it.price * n; b.onclick = () => G.socket.emit("buy", { key, n }); row.appendChild(b); };
    mkBtn(1); if (it.stack) mkBtn(10);
    list.appendChild(row);
  }
}

// ----- Forge -----
let smithSel = null;
function renderSmith() {
  const box = $("#smith-items"), s = G.self;
  box.innerHTML = "";
  const entries = [];
  for (const k of ["weapon", "armor", "helmet"]) if (s.eq[k]) entries.push({ from: "eq", slot: k, it: s.eq[k] });
  s.inv.forEach((x, i) => { if (x && ["weapon", "armor", "helmet"].includes(G.items[x.key].type)) entries.push({ from: "inv", slot: i, it: x }); });
  if (smithSel && !entries.some((e) => e.from === smithSel.from && e.slot === smithSel.slot)) smithSel = null;
  if (!smithSel && entries.length) smithSel = { from: entries[0].from, slot: entries[0].slot };
  for (const e of entries) {
    const d = document.createElement("div"); d.className = "slot";
    fillSlot(d, e.it);
    if (smithSel && smithSel.from === e.from && smithSel.slot === e.slot) d.classList.add("sel");
    d.onclick = () => { smithSel = { from: e.from, slot: e.slot }; renderSmith(); };
    box.appendChild(d);
  }
  const det = $("#smith-detail");
  if (!smithSel) { det.innerHTML = "<p>Aucun équipement à améliorer.</p>"; return; }
  const slot = smithSel.from === "eq" ? s.eq[smithSel.slot] : s.inv[smithSel.slot];
  const it = G.items[slot.key], plus = slot.plus || 0;
  if (plus >= G.upgrade.max) { det.innerHTML = `<div class="big">${it.name} +${plus}</div><p>Amélioration maximale atteinte.</p>`; return; }
  const gold = Math.round(80 * Math.min(it.tier || 1, 5) * Math.pow(plus + 1, 1.8));
  const stones = plus < 3 ? 0 : 1 + Math.floor((plus - 3) / 2);
  const have = s.inv.reduce((a, x) => a + (x && x.key === "pierre_forge" ? x.n : 0), 0);
  const fail = plus < 4 ? "En cas d'échec, l'objet ne change pas." : plus < 6 ? "⚠ En cas d'échec, l'objet perd un niveau." : "⚠ En cas d'échec, l'objet est DÉTRUIT.";
  det.innerHTML = `<div class="big">${it.name} +${plus} → +${plus + 1}</div>
    <div>Chance de réussite : <b>${G.upgrade.chances[plus]} %</b></div>
    <div>Coût : <b>${gold.toLocaleString("fr-FR")}</b> taels ${s.gold < gold ? '<span class="warn">(pas assez)</span>' : ""}</div>
    ${stones ? `<div>Pierres de forge : <b>${stones}</b> (vous en avez ${have}) ${have < stones ? '<span class="warn">(pas assez)</span>' : ""}</div>` : ""}
    <div class="${plus >= 4 ? "warn" : ""}">${fail}</div>`;
  const b = document.createElement("button");
  b.className = "btn-primary"; b.textContent = "Améliorer";
  b.disabled = s.gold < gold || have < stones;
  b.onclick = () => { b.disabled = true; G.socket.emit("upgrade", smithSel); };
  det.appendChild(b);
}
function onUpgradeResult(r) {
  const p = $("#panel-smith");
  p.classList.remove("flash-ok", "flash-ko"); void p.offsetWidth;
  p.classList.add(r.ok ? "flash-ok" : "flash-ko");
  if (r.ok) burst(G.me.x, 1, G.me.y, "#ffd23a", 30, 2, 3);
}

// ----- PNJ et portails -----
function interactWith(it) {
  if (it.kind === "merchant") openPanel("shop");
  else if (it.kind === "smith") openPanel("smith");
  else if (it.kind === "guide") {
    $("#dlg-title").textContent = it.name;
    $("#dlg-body").innerHTML = `
      <p>Bienvenue, jeune ${G.self ? G.classes[G.self.cls].name : "Lame"}. Les <b>Pierres maudites</b> tombent du ciel et répandent des monstres sur nos terres.</p>
      <p>• <b>Clic gauche</b> : marcher, attaquer, parler. <b>Clic droit maintenu</b> ou <b>Q / E</b> : tourner la caméra. <b>Molette</b> : zoom.<br>
      • <b>1 à 6</b> : compétences (débloquées aux niveaux 1, 3, 6, 10, 15, 20). <b>F1 / F2</b> : potions. <b>I</b> : inventaire.<br>
      • Trois <b>donjons</b> attendent les plus braves : la Tour des Mille Lanternes (niv. 8), le Nid de la Reine Tisseuse (niv. 13) et le Temple du Dragon de Jade (niv. 18). Leurs portails sont marqués en orange sur la mini-carte.<br>
      • Les boss annoncent leurs attaques par des <b>zones rouges</b> au sol : sortez-en avant qu'elles ne se remplissent !<br>
      • Seuls les boss donnent leurs <b>armes exclusives</b>.</p>`;
    openPanel("dialog");
  } else if (it.t === "portal") {
    const dg = G.dungeons[it.dungeon], ok = G.self && G.self.lvl >= dg.lvl;
    $("#dlg-title").textContent = dg.name;
    $("#dlg-body").innerHTML = `<p>${dg.concept}</p><p>Niveau requis : <b class="${ok ? "" : "warn"}">${dg.lvl}</b>. Jusqu'à 5 joueurs : ceux qui entrent dans les 3 minutes rejoignent le même groupe.</p>
      <div class="dg-btns"><button class="btn-ghost" id="dg-no">Plus tard</button><button class="btn-primary" id="dg-go" ${ok ? "" : "disabled"}>Entrer</button></div>`;
    openPanel("dialog");
    $("#dg-no").onclick = () => closePanels();
    $("#dg-go").onclick = () => { G.socket.emit("enter", { key: it.dungeon }); closePanels(); };
  } else if (it.t === "exit") {
    $("#dlg-title").textContent = "Quitter le donjon ?";
    $("#dlg-body").innerHTML = `<p>${G.dg && G.dg.obj.startsWith("Donjon terminé") ? "Bravo, le donjon est terminé." : "Vous pourrez revenir, mais la progression est perdue si tout le groupe part."}</p>
      <div class="dg-btns"><button class="btn-ghost" id="dg-no">Rester</button><button class="btn-primary" id="dg-go">Sortir</button></div>`;
    openPanel("dialog");
    $("#dg-no").onclick = () => closePanels();
    $("#dg-go").onclick = () => { G.socket.emit("exit"); closePanels(); };
  }
}
function openPanel(name) {
  closePanels(name === "smith" || name === "shop" ? "inv" : null);
  G.openPanel = name;
  $("#panel-" + name).classList.remove("hidden");
  if (name === "shop") renderShop();
  if (name === "smith") renderSmith();
  if (name === "inv") renderInventory();
}
function closePanels(keep) {
  for (const n of ["inv", "shop", "smith", "dialog"]) if (n !== keep) $("#panel-" + n).classList.add("hidden");
  G.openPanel = keep && !$("#panel-" + keep).classList.contains("hidden") ? keep : null;
  hideMenu(); hideTip();
}
function toggleInv() {
  const p = $("#panel-inv");
  if (p.classList.contains("hidden")) { p.classList.remove("hidden"); renderInventory(); if (!G.openPanel) G.openPanel = "inv"; }
  else { p.classList.add("hidden"); hideMenu(); if (G.openPanel === "inv") G.openPanel = null; }
}
document.querySelectorAll(".panel .close").forEach((b) => b.onclick = () => {
  const p = b.closest(".panel"); p.classList.add("hidden"); hideMenu();
  if (G.openPanel && p.id === "panel-" + G.openPanel) G.openPanel = null;
});

function showDeath() {
  $("#death").classList.remove("hidden");
  const b = $("#btn-respawn"); b.disabled = true;
  let s = 3;
  const label = G.kind === "over" ? "Revenir au village" : "Revenir à l'entrée du donjon";
  b.textContent = `${label} (${s})`;
  const iv = setInterval(() => { s--; if (s <= 0) { clearInterval(iv); b.disabled = false; b.textContent = label; } else b.textContent = `${label} (${s})`; }, 1000);
}
$("#btn-respawn").onclick = () => G.socket.emit("respawn");

// ======================================================= Commandes
addEventListener("keydown", (e) => {
  if (!G.started || document.activeElement === chatInput || e.target.tagName === "INPUT") return;
  const c = e.code;
  if (c === "Enter") { e.preventDefault(); $("#chat").classList.add("open"); chatInput.focus(); return; }
  if (c === "Escape") { closePanels(); G.me.targetId = null; return; }
  if (c === "KeyI" || c === "KeyB") return toggleInv();
  if (c === "Space") { e.preventDefault(); G.atkHeld = true; tryAttack(); return; }
  const m = c.match(/^(?:Digit|Numpad)([1-8])$/);
  if (m) { const n = +m[1]; if (n <= 6) useSkill(n); else usePotion(n === 7 ? "potion_rouge" : "potion_bleue"); return; }
  if (c === "F1" || c === "F2") { e.preventDefault(); usePotion(c === "F1" ? "potion_rouge" : "potion_bleue"); return; }
  if (c === "Tab") { e.preventDefault(); const t = nearestMonster(12); if (t) G.me.targetId = t.id; return; }
  G.keys.add(c);
});
addEventListener("keyup", (e) => { G.keys.delete(e.code); if (e.code === "Space") G.atkHeld = false; });
addEventListener("blur", () => { G.keys.clear(); G.atkHeld = false; G.mouse.down = false; });

function worldClick(sx, sy) {
  if (!G.started || G.stat.dead) return;
  const hit = pick(sx, sy), me = G.me;
  me.interact = null;
  G.mouse.holdMove = false;
  if (hit && hit.kind === "mon") { me.targetId = hit.obj.id; me.repathAt = 0; return; }
  me.targetId = null;
  if (hit && hit.kind === "npc") { me.interact = hit.obj; pathTo(hit.obj.x, hit.obj.y); return; }
  if (hit && (hit.kind === "portal" || hit.kind === "exit")) { me.interact = { ...hit.obj, x: hit.x, y: hit.y }; pathTo(hit.x, hit.y + 1.5); return; }
  if (hit && hit.kind === "drop") { pathTo(hit.x, hit.y); return; }
  const w = groundAt(sx, sy);
  if (!w) return;
  pathTo(w.x, w.y);
  G.mouse.holdMove = !isTouch;
  groundRing(w.x, w.y, 0.5, 0xe9c46a, 0.4);
}

// Souris : clic gauche = agir, clic droit (ou molette) glissé = caméra, molette = zoom
// Tactile : toucher = agir, glisser = tourner, pincer = zoom
const pointers = new Map();
let camDrag = null, pinch = null;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
  if (document.activeElement === chatInput) chatInput.blur();
  if (e.pointerType === "mouse") {
    if (e.button === 2 || e.button === 1) { camDrag = { x: e.clientX, y: e.clientY }; return; }
    if (e.button === 0) {
      closePanels(G.openPanel === "inv" ? "inv" : null);
      G.mouse.down = true; G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.mouse.lastHold = performance.now();
      worldClick(e.clientX, e.clientY);
    }
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: G.cam.dist };
  }
});
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  G.mouse.x = e.clientX; G.mouse.y = e.clientY;
  if (camDrag) {
    G.cam.yaw -= (e.clientX - camDrag.x) * 0.006; G.cam.pitch += (e.clientY - camDrag.y) * 0.005;
    camDrag = { x: e.clientX, y: e.clientY };
    return;
  }
  if (p && e.pointerType !== "mouse") {
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 12) p.moved = true;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      G.cam.dist = pinch.dist * pinch.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      G.cam.yaw -= dx * 0.003;
    } else if (p.moved) { G.cam.yaw -= dx * 0.008; G.cam.pitch += dy * 0.006; }
    return;
  }
  if (e.pointerType === "mouse" && G.started && !G.mouse.down) {
    G.hover = pick(e.clientX, e.clientY);
    canvas.style.cursor = G.hover ? (G.hover.kind === "mon" ? "crosshair" : "pointer") : "default";
  }
});
const endPointer = (e) => {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (e.pointerType === "mouse") { camDrag = null; G.mouse.down = false; G.mouse.holdMove = false; return; }
  if (pointers.size < 2) pinch = null;
  if (p && !p.moved && performance.now() - p.t < 400 && pointers.size === 0) { closePanels(G.openPanel === "inv" ? "inv" : null); worldClick(e.clientX, e.clientY); }
};
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); G.cam.dist *= 1 + Math.sign(e.deltaY) * 0.1; }, { passive: false });
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

const joy = $("#joystick"), stick = $("#stick");
joy.addEventListener("pointerdown", (e) => { joy.setPointerCapture(e.pointerId); G.joy.active = true; moveJoy(e); });
joy.addEventListener("pointermove", (e) => { if (G.joy.active) moveJoy(e); });
const endJoy = () => { G.joy.active = false; G.joy.x = G.joy.y = 0; stick.style.transform = ""; };
joy.addEventListener("pointerup", endJoy); joy.addEventListener("pointercancel", endJoy);
function moveJoy(e) {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 10, d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  G.joy.x = dx / max; G.joy.y = dy / max;
  stick.style.transform = `translate(${dx}px, ${dy}px)`;
}

const atkBtn = $("#hb-atk");
atkBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); G.atkHeld = true; tryAttack(); });
["pointerup", "pointerleave", "pointercancel"].forEach((ev) => atkBtn.addEventListener(ev, () => { G.atkHeld = false; }));
document.querySelectorAll(".hb.pot").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); usePotion(b.dataset.key); }));
$("#hb-inv").addEventListener("click", toggleInv);

function updateHud(now) {
  document.querySelectorAll(".hb.skill").forEach((b) => {
    const c = G.cds[+b.dataset.n];
    b.querySelector(".cd").style.transform = `scaleY(${c ? Math.max(0, (c.until - now) / c.ms) : 0})`;
  });
  const t = G.me.targetId && G.ents.get(G.me.targetId);
  const tf = $("#target-frame");
  if (t) {
    const d = t.data, def = d.s ? G.sdefs[d.t] : G.mdefs[d.t];
    tf.classList.remove("hidden");
    $("#tg-name").textContent = `${def.name} · Niv. ${def.lvl} · ${d.hp.toLocaleString("fr-FR")} / ${d.mh.toLocaleString("fr-FR")}`;
    $("#bar-tg").style.width = (100 * d.hp / d.mh) + "%";
    $("#tg-cast").textContent = t.castUntil && now / 1000 < t.castUntil ? `⚠ ${t.castName}` : d.sh ? "Protégée par les sceaux" : d.fl ? "En vol" : "";
  } else tf.classList.add("hidden");
}

// ======================================================= Boucle principale
let last = performance.now(), miniT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  try {
    if (G.started && G.map) {
      update(dt, now);
      animateEntities(t, dt);
      updateCamera(dt);
      updateParticles(dt);
      for (let i = effects.length - 1; i >= 0; i--) {
        const ef = effects[i], p = (t - ef.t0) / ef.dur;
        if (p >= 1) { fxGroup.remove(ef.obj); ef.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); effects.splice(i, 1); continue; }
        ef.update(Math.max(0, p));
      }
      updateHud(now);
      if (now - miniT > 100) { miniT = now; renderMinimap(now); }
      renderer.render(scene, camera);
      renderOverlay(now);
    }
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
