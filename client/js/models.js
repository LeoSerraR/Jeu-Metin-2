// Modèles 3D low-poly construits en code, avec leurs animations.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = opts.basic ? new THREE.MeshBasicMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, depthWrite: opts.opacity ? false : true, side: opts.side || THREE.FrontSide })
      : new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei ?? 1, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
    matCache.set(key, m);
  }
  return matCache.get(key);
}

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.castShadow = !opts || !opts.noShadow;
  return m;
}
const box = (w, h, d, c, o) => mesh(new THREE.BoxGeometry(w, h, d), c, o);
const cyl = (rt, rb, h, c, seg = 8, o) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, o);
const sph = (r, c, o, ws = 10, hs = 8) => mesh(new THREE.SphereGeometry(r, ws, hs), c, o);
const cone = (r, h, c, seg = 8, o) => mesh(new THREE.ConeGeometry(r, h, seg), c, o);
function at(obj, x, y, z, rx = 0, ry = 0, rz = 0) { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; }
function pivot(x, y, z, ...children) { const g = new THREE.Group(); g.position.set(x, y, z); children.forEach((c) => g.add(c)); return g; }

// Géométrie colorée fusionnée (pour le décor instancié)
function colored(geo, color) {
  const g = geo.toNonIndexed();
  const c = new THREE.Color(color), arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
function tr(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  return geo.applyMatrix4(m);
}

// ======================================================= Décor
export const PROPS = {
  tree: () => mergeGeometries([
    colored(tr(new THREE.CylinderGeometry(0.1, 0.16, 1.2, 6), 0, 0.6, 0), "#5b3b24"),
    colored(tr(new THREE.IcosahedronGeometry(0.75, 0), 0, 1.55, 0), "#3c8236"),
    colored(tr(new THREE.IcosahedronGeometry(0.55, 0), 0.35, 1.95, 0.15), "#4b9a41"),
    colored(tr(new THREE.IcosahedronGeometry(0.5, 0), -0.35, 1.85, -0.2), "#2f6b2b"),
  ]),
  sakura: () => mergeGeometries([
    colored(tr(new THREE.CylinderGeometry(0.09, 0.15, 1.2, 6), 0, 0.6, 0, 0, 0, 0.08), "#4a2f1c"),
    colored(tr(new THREE.IcosahedronGeometry(0.75, 0), 0, 1.55, 0), "#f0a3c0"),
    colored(tr(new THREE.IcosahedronGeometry(0.55, 0), 0.4, 1.9, 0.1), "#f8c4d6"),
    colored(tr(new THREE.IcosahedronGeometry(0.45, 0), -0.4, 1.75, -0.2), "#e07fa6"),
  ]),
  pine: () => mergeGeometries([
    colored(tr(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), 0, 0.3, 0), "#4a2f1c"),
    colored(tr(new THREE.ConeGeometry(0.8, 1.1, 7), 0, 0.95, 0), "#1f4d2c"),
    colored(tr(new THREE.ConeGeometry(0.62, 0.95, 7), 0, 1.5, 0), "#255a33"),
    colored(tr(new THREE.ConeGeometry(0.42, 0.8, 7), 0, 2.0, 0), "#2c6a3c"),
  ]),
  bamboo: () => mergeGeometries([0, 1, 2, 3, 4].flatMap((i) => {
    const x = Math.cos(i * 1.3) * 0.25, z = Math.sin(i * 1.3) * 0.25, h = 1.8 + (i % 3) * 0.4;
    return [colored(tr(new THREE.CylinderGeometry(0.035, 0.04, h, 5), x, h / 2, z, 0.04 * (i - 2), 0, 0.03 * (i - 2)), i % 2 ? "#7fae4a" : "#6a9a3c"),
      colored(tr(new THREE.ConeGeometry(0.16, 0.5, 4), x + 0.1, h - 0.1, z, 0, 0, 1.2), "#86b84f")];
  })),
  rock: () => mergeGeometries([
    colored(tr(new THREE.DodecahedronGeometry(0.45, 0), 0, 0.25, 0, 0.3, 0.5, 0), "#8a867e"),
    colored(tr(new THREE.DodecahedronGeometry(0.28, 0), 0.35, 0.15, 0.2, 0.7, 0, 0.2), "#77736c"),
  ]),
  lantern: () => mergeGeometries([
    colored(tr(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), 0, 0.75, 0), "#3a2b20"),
    colored(tr(new THREE.BoxGeometry(0.45, 0.06, 0.06), 0, 1.5, 0), "#3a2b20"),
    colored(tr(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 8), 0.18, 1.25, 0), "#d13a2f"),
    colored(tr(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 8), 0.18, 1.44, 0), "#2b1d14"),
  ]),
  stalagmite: () => mergeGeometries([
    colored(tr(new THREE.ConeGeometry(0.45, 2.0, 6), 0, 1.0, 0), "#4a4058"),
    colored(tr(new THREE.ConeGeometry(0.25, 1.1, 5), 0.35, 0.55, 0.2), "#5a4f6a"),
  ]),
  pillar: () => mergeGeometries([
    colored(tr(new THREE.CylinderGeometry(0.35, 0.4, 3.2, 8), 0, 1.6, 0), "#d9d3bf"),
    colored(tr(new THREE.BoxGeometry(0.95, 0.25, 0.95), 0, 0.12, 0), "#2f8f6f"),
    colored(tr(new THREE.BoxGeometry(0.95, 0.25, 0.95), 0, 3.2, 0), "#2f8f6f"),
    colored(tr(new THREE.TorusGeometry(0.38, 0.05, 4, 12), 0, 2.2, 0, Math.PI / 2), "#e9c46a"),
  ]),
  statue: () => mergeGeometries([
    colored(tr(new THREE.BoxGeometry(0.9, 0.4, 0.9), 0, 0.2, 0), "#6b6b6b"),
    colored(tr(new THREE.BoxGeometry(0.45, 0.8, 0.35), 0, 0.8, 0), "#a07038"),
    colored(tr(new THREE.BoxGeometry(0.3, 0.3, 0.3), 0, 1.35, 0), "#a07038"),
    colored(tr(new THREE.BoxGeometry(0.15, 0.6, 0.15), 0.32, 0.85, 0), "#a07038"),
    colored(tr(new THREE.BoxGeometry(0.15, 0.6, 0.15), -0.32, 0.85, 0), "#a07038"),
  ]),
};
const propCache = {};
export function propGeometry(t) { if (!propCache[t]) propCache[t] = PROPS[t](); return propCache[t]; }

export function house(v) {
  const g = new THREE.Group();
  const walls = ["#e9dcc0", "#e2d2b1", "#d8c7a6", "#efe3c9"][v % 4], roof = ["#8e2b2b", "#2d4a6b", "#6b2d5c", "#2d6b4a"][v % 4];
  g.add(at(box(2.7, 1.6, 2.7, walls), 0, 0.8, 0));
  for (const [x, z] of [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]]) g.add(at(box(0.18, 1.7, 0.18, "#5a3a22"), x, 0.85, z));
  g.add(at(box(0.6, 1.0, 0.05, "#4a2f1c"), 0, 0.5, 1.36));
  for (const x of [-0.85, 0.85]) g.add(at(box(0.4, 0.4, 0.05, "#f2c14e", { emissive: 0x6b4a10 }), x, 1.05, 1.36));
  const r1 = cone(2.6, 1.0, roof, 4); r1.rotation.y = Math.PI / 4; r1.scale.set(1, 1, 1); r1.position.y = 2.05; g.add(r1);
  const r2 = cone(1.5, 0.9, roof, 4); r2.rotation.y = Math.PI / 4; r2.position.y = 2.65; g.add(r2);
  g.add(at(box(0.12, 0.5, 0.12, "#f2c14e"), 0, 3.2, 0));
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

export function portal(color = "#c86bff") {
  const g = new THREE.Group();
  for (const x of [-1.1, 1.1]) g.add(at(cyl(0.12, 0.14, 2.6, "#b3261e"), x, 1.3, 0));
  g.add(at(box(3.0, 0.18, 0.3, "#b3261e"), 0, 2.55, 0));
  g.add(at(box(2.6, 0.14, 0.22, "#2b1d14"), 0, 2.2, 0));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  disc.position.y = 1.15;
  g.add(disc);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 24, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  swirl.position.y = 1.15;
  g.add(swirl);
  g.userData.anim = (t) => { swirl.rotation.z = t * 2; disc.material.opacity = 0.6 + Math.sin(t * 3) * 0.15; };
  return g;
}

export function gate() {
  const g = new THREE.Group();
  for (let i = -2; i <= 2; i++) g.add(at(cyl(0.05, 0.05, 2.2, "#4b4f57"), i * 0.2, 1.1, 0));
  g.add(at(box(1.0, 0.12, 0.12, "#3a3d44"), 0, 2.1, 0));
  g.add(at(box(1.0, 0.12, 0.12, "#3a3d44"), 0, 0.6, 0));
  return g;
}

export function web() {
  const g = new THREE.Group();
  const m = new THREE.LineBasicMaterial({ color: 0xe8e0f0, transparent: true, opacity: 0.45 });
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9); }
  for (let r = 0.3; r < 1; r += 0.25) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, b = ((i + 1) / 8) * Math.PI * 2;
    pts.push(Math.cos(a) * r, 0, Math.sin(a) * r, Math.cos(b) * r, 0, Math.sin(b) * r);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(geo, m); l.position.y = 0.03;
  g.add(l);
  return g;
}

// ======================================================= Humanoïdes
const ARMOR_COL = ["#8a8a8a", "#d9cba6", "#7a5236", "#5a6f8a", "#2f8f6f"];
const CLASS_LOOK = {
  lame:     { robe: null, skin: "#f0c9a0", hair: "#1d1714", trim: "#c9a96b" },
  ombre:    { robe: "#2a2733", skin: "#e8bf98", hair: "#111018", trim: "#7a1f2b", mask: "#1a1a22" },
  mystique: { robe: "#3b2347", skin: "#e5c2a4", hair: "#d8d0e8", trim: "#9b5de5", spikes: true },
  chaman:   { robe: "#e9e2d0", skin: "#f3d2b3", hair: "#2a1a10", trim: "#2f8f6f", long: true },
};
const BLADE_COL = { 1: "#c9a96b", 2: "#c8ccd2", 3: "#e8edf5", 4: "#5fe0a8", 5: "#e0a84f", 6: "#7cffc8" };

function weaponMesh(wtype, tier, key) {
  const g = new THREE.Group();
  const col = BLADE_COL[tier] || "#c8ccd2";
  const glow = tier >= 4 ? { emissive: new THREE.Color(col).multiplyScalar(0.6).getHex() } : undefined;
  if (wtype === "sword") {
    g.add(at(cyl(0.025, 0.025, 0.2, "#3a2618", 6), 0, -0.05, 0));
    g.add(at(box(0.2, 0.04, 0.06, "#f2c14e"), 0, 0.06, 0));
    const len = 0.7 + Math.min(tier, 6) * 0.06;
    const blade = box(0.07, len, 0.02, col, glow);
    blade.position.y = 0.08 + len / 2;
    if (key && (key.includes("croissant") || key.includes("dragon") || key.includes("reine"))) blade.rotation.z = 0.12;
    g.add(blade);
    g.add(at(cone(0.035, 0.12, col, 4, glow), 0, 0.08 + len + 0.05, 0, 0, Math.PI / 4));
  } else if (wtype === "dagger") {
    g.add(at(cyl(0.022, 0.022, 0.14, "#2a1a10", 6), 0, -0.03, 0));
    g.add(at(box(0.12, 0.03, 0.04, "#8d949e"), 0, 0.05, 0));
    g.add(at(box(0.05, 0.36, 0.015, col, glow), 0, 0.24, 0));
    g.add(at(cone(0.025, 0.08, col, 4, glow), 0, 0.46, 0, 0, Math.PI / 4));
  } else {
    // éventail
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10, Math.PI * 0.15, Math.PI * 0.7), mat(col, { ...(glow || {}), side: THREE.DoubleSide }));
    fan.material.side = THREE.DoubleSide;
    fan.position.y = 0.02; fan.rotation.z = 0;
    g.add(fan);
    g.add(at(cyl(0.02, 0.02, 0.2, "#3a2618", 6), 0, -0.05, 0));
    for (let i = 0; i < 6; i++) { const a = Math.PI * 0.15 + (i / 5) * Math.PI * 0.7; g.add(at(box(0.012, 0.42, 0.012, "#3a2618"), Math.cos(a) * 0.21, 0.02 + Math.sin(a) * 0.21, 0.005, 0, 0, a - Math.PI / 2)); }
  }
  return g;
}

// Construit un humanoïde articulé. opts : cls, armorTier, helmetTier, kingdomColor, outfit (pour monstres/PNJ)
export function humanoid(opts = {}) {
  const look = CLASS_LOOK[opts.cls] || CLASS_LOOK.lame;
  const robe = opts.robe || look.robe || ARMOR_COL[opts.armorTier || 1];
  const trim = opts.trim || look.trim;
  const skin = opts.skin || look.skin;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const s = opts.scale || 1;
  body.scale.setScalar(s);
  // jambes
  const legL = pivot(-0.11, 0.78, 0, at(box(0.15, 0.72, 0.16, opts.pants || "#2b2420"), 0, -0.36, 0), at(box(0.17, 0.1, 0.24, "#1a1410"), 0, -0.73, 0.04));
  const legR = pivot(0.11, 0.78, 0, at(box(0.15, 0.72, 0.16, opts.pants || "#2b2420"), 0, -0.36, 0), at(box(0.17, 0.1, 0.24, "#1a1410"), 0, -0.73, 0.04));
  body.add(legL, legR);
  // torse et robe
  const torso = new THREE.Group(); torso.position.y = 0.78; body.add(torso);
  torso.add(at(box(0.44, 0.55, 0.26, robe), 0, 0.3, 0));
  torso.add(at(cyl(0.2, look.long ? 0.34 : 0.28, look.long ? 0.6 : 0.35, robe, 8), 0, look.long ? -0.18 : 0.02, 0));
  torso.add(at(box(0.46, 0.08, 0.28, opts.belt || opts.kingdomColor || trim), 0, 0.08, 0));
  torso.add(at(box(0.08, 0.5, 0.02, trim), 0.06, 0.32, 0.135));
  if ((opts.armorTier || 0) >= 2 && !opts.noArmor) {
    const ac = ARMOR_COL[Math.min(opts.armorTier, 4)];
    torso.add(at(box(0.48, 0.3, 0.3, ac), 0, 0.42, 0));
    for (const x of [-0.27, 0.27]) torso.add(at(box(0.18, 0.1, 0.3, ac), x, 0.56, 0, 0, 0, x > 0 ? -0.3 : 0.3));
  }
  if (look.spikes || opts.spikes) for (const x of [-0.27, 0.27]) torso.add(at(cone(0.06, 0.25, "#1a1022", 4), x, 0.68, 0, 0, 0, x > 0 ? -0.5 : 0.5));
  // tête
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  head.add(at(sph(0.17, skin), 0, 0.12, 0));
  head.add(at(sph(0.175, opts.hair || look.hair, undefined, 10, 6), 0, 0.17, -0.03));
  if (!opts.noBun) head.add(at(sph(0.07, opts.hair || look.hair), 0, 0.33, -0.06));
  head.add(at(box(0.04, 0.03, 0.02, "#1a1a1a"), -0.06, 0.13, 0.16));
  head.add(at(box(0.04, 0.03, 0.02, "#1a1a1a"), 0.06, 0.13, 0.16));
  if (look.mask || opts.mask) head.add(at(box(0.36, 0.1, 0.1, opts.mask || look.mask), 0, 0.05, 0.12));
  const ht = opts.helmetTier || 0;
  if (ht === 1 || opts.straw) head.add(at(cone(0.38, 0.22, "#d8b45a", 10), 0, 0.33, 0));
  else if (ht === 2) { head.add(at(sph(0.19, "#8d949e", undefined, 10, 6), 0, 0.18, 0)); head.add(at(box(0.42, 0.04, 0.42, "#6d747e"), 0, 0.17, 0)); }
  else if (ht >= 3) { head.add(at(sph(0.19, "#b8862e", undefined, 10, 6), 0, 0.18, 0)); head.add(at(cone(0.05, 0.25, "#e8534a", 4), 0, 0.42, 0)); }
  if (opts.hat) head.add(at(cone(0.22, 0.3, opts.hat, 8), 0, 0.38, 0));
  // bras
  const armL = pivot(-0.27, 0.52, 0, at(box(0.12, 0.5, 0.13, robe), 0, -0.23, 0), at(sph(0.06, skin), 0, -0.5, 0));
  const armR = pivot(0.27, 0.52, 0, at(box(0.12, 0.5, 0.13, robe), 0, -0.23, 0), at(sph(0.06, skin), 0, -0.5, 0));
  torso.add(armL, armR);
  const handR = new THREE.Group(); handR.position.set(0, -0.5, 0.02); armR.add(handR);
  const handL = new THREE.Group(); handL.position.set(0, -0.5, 0.02); armL.add(handL);
  root.userData = { body, torso, head, armL, armR, legL, legR, handR, handL, s, h: 1.65 * s };
  if (opts.wtype) setWeapon(root, opts.wtype, opts.tier || 1, opts.wkey);
  return root;
}

export function setWeapon(root, wtype, tier, key) {
  const u = root.userData;
  for (const h of [u.handR, u.handL]) while (h.children.length) h.remove(h.children[0]);
  const w = weaponMesh(wtype, tier, key);
  w.rotation.x = Math.PI / 2; // pointe vers l'avant quand le bras pend
  u.handR.add(w);
  if (wtype === "dagger") { const w2 = weaponMesh(wtype, tier, key); w2.rotation.x = Math.PI / 2; u.handL.add(w2); }
  u.wtype = wtype;
}

// Animation d'un humanoïde. st : { moving, t, swingT, spinT, castT, dead, deadT }
export function animHumanoid(root, st, t) {
  const u = root.userData;
  const walk = st.moving ? Math.sin(t * 10) : 0;
  u.legL.rotation.x = walk * 0.6; u.legR.rotation.x = -walk * 0.6;
  u.armL.rotation.set(-walk * 0.5, 0, 0.08);
  u.armR.rotation.set(walk * 0.4 - 0.25, 0, -0.08);
  u.body.position.y = st.moving ? Math.abs(Math.sin(t * 10)) * 0.05 : Math.sin(t * 2) * 0.01;
  u.body.rotation.set(0, 0, 0);
  u.torso.rotation.set(0, 0, 0);
  const sw = st.swingT != null ? (t - st.swingT) / 0.28 : 9;
  if (sw >= 0 && sw < 1) {
    const e = Math.sin(sw * Math.PI);
    u.armR.rotation.x = -1.9 + sw * 2.4; u.armR.rotation.z = -0.4 * e;
    u.torso.rotation.y = 0.5 - sw * 1.0;
    if (u.wtype === "dagger") u.armL.rotation.x = -1.6 + (1 - sw) * 1.8;
  }
  const sp = st.spinT != null ? (t - st.spinT) / 0.45 : 9;
  if (sp >= 0 && sp < 1) { u.body.rotation.y = sp * Math.PI * 4; u.armR.rotation.set(-1.5, 0, -1.2); u.armL.rotation.set(-1.5, 0, 1.2); }
  const ca = st.castT != null ? (t - st.castT) / 0.5 : 9;
  if (ca >= 0 && ca < 1) { u.armR.rotation.set(-2.6, 0, -0.3); u.armL.rotation.set(-2.6, 0, 0.3); }
  if (st.dead) { u.body.rotation.x = -Math.PI / 2; u.body.position.y = 0.15; }
}

// ======================================================= Monstres
function quadruped(color, o = {}) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const dark = new THREE.Color(color).multiplyScalar(0.7).getHex();
  const len = o.len || 0.9, h = o.h || 0.55, w = o.w || 0.38;
  body.add(at(box(w, o.bh || 0.36, len, color), 0, h, 0));
  const head = new THREE.Group(); head.position.set(0, h + 0.12, len / 2 + 0.05); body.add(head);
  head.add(at(box(w * 0.85, 0.3, 0.32, color), 0, 0, 0.08));
  head.add(at(box(w * 0.5, 0.16, 0.25, dark), 0, -0.06, 0.32));
  if (o.ears) for (const x of [-0.1, 0.1]) head.add(at(cone(0.06, 0.16, dark, 4), x, 0.2, 0.02));
  if (o.tusks) for (const x of [-0.1, 0.1]) head.add(at(cone(0.03, 0.18, "#f3ead2", 4), x, -0.08, 0.45, -1.2));
  if (o.spikes) for (let i = 0; i < 5; i++) body.add(at(cone(0.05, 0.16, dark, 4), 0, h + 0.22, -len / 2 + i * len / 4));
  for (const x of [-0.09, 0.09]) head.add(at(box(0.04, 0.04, 0.02, o.eye || "#ffd23a", { emissive: 0x332200 }), x, 0.06, 0.25));
  const legs = [];
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pivot(x * w * 0.38, h - 0.1, z * len * 0.36, at(box(0.11, h - 0.05, 0.11, dark), 0, -(h - 0.05) / 2, 0));
    body.add(leg); legs.push(leg);
  }
  if (o.tail) { const tail = pivot(0, h + 0.1, -len / 2, at(cyl(0.03, 0.07, 0.45, color, 5), 0, 0, -0.2, -1.1)); body.add(tail); root.userData.tail = tail; }
  Object.assign(root.userData, { body, head, legs, h: h + 0.4 });
  return root;
}

function spider(color, size) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.add(at(sph(0.38, color), 0, 0.45, -0.3));
  body.add(at(sph(0.22, color), 0, 0.42, 0.15));
  for (const x of [-0.08, 0.08]) body.add(at(sph(0.04, "#ff3b3b", { emissive: 0x880000 }), x, 0.5, 0.33));
  body.add(at(box(0.2, 0.05, 0.05, "#c86bff", { emissive: 0x441155 }), 0, 0.7, -0.3));
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const leg = pivot(side * 0.15, 0.45, 0.2 - k * 0.15);
    leg.add(at(cyl(0.025, 0.025, 0.5, "#1a1424", 4), side * 0.22, 0.12, 0, 0, 0, side * 1.0));
    leg.add(at(cyl(0.02, 0.015, 0.55, "#1a1424", 4), side * 0.5, -0.1, 0, 0, 0, -side * 0.5));
    leg.rotation.y = side * (k - 1.5) * 0.35;
    body.add(leg); legs.push(leg);
  }
  Object.assign(root.userData, { body, legs, spider: true, h: 0.9 });
  root.scale.setScalar(size);
  return root;
}

function ghost(color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const m = mat(color, { opacity: 0.7, emissive: new THREE.Color(color).multiplyScalar(0.4).getHex() });
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.3, 10, 1, true), m); c.position.y = 0.95; c.rotation.x = Math.PI; body.add(c);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), m); h.position.y = 1.55; body.add(h);
  for (const x of [-0.11, 0.11]) body.add(at(box(0.08, 0.12, 0.04, "#0b1a2a"), x, 1.58, 0.29));
  Object.assign(root.userData, { body, float: true, h: 1.9 });
  return root;
}

function lanternMonster(color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.add(at(cyl(0.3, 0.3, 0.6, color, 10, { emissive: 0x551100 }), 0, 1.0, 0));
  body.add(at(cyl(0.32, 0.32, 0.06, "#2b1d14", 10), 0, 1.32, 0));
  body.add(at(cyl(0.32, 0.32, 0.06, "#2b1d14", 10), 0, 0.68, 0));
  for (const x of [-0.1, 0.1]) body.add(at(box(0.08, 0.06, 0.03, "#ffe08a", { emissive: 0xffc040 }), x, 1.05, 0.29));
  body.add(at(box(0.18, 0.04, 0.03, "#1a0a05"), 0, 0.9, 0.29));
  Object.assign(root.userData, { body, float: true, h: 1.5 });
  return root;
}

function golem(color, size) {
  const root = humanoid({ robe: color, skin: color, hair: color, pants: new THREE.Color(color).multiplyScalar(0.7).getHex(), trim: "#5fe0e8", noBun: true, belt: "#3a2a1a", scale: 1.0 });
  const u = root.userData;
  u.head.add(at(box(0.36, 0.1, 0.05, "#5fe0e8", { emissive: 0x1a6a70 }), 0, 0.12, 0.17));
  for (const x of [-0.3, 0.3]) u.torso.add(at(box(0.25, 0.25, 0.3, new THREE.Color(color).multiplyScalar(0.8).getHex()), x, 0.62, 0));
  u.handR.add(at(box(0.18, 0.18, 0.18, color), 0, 0, 0));
  u.handL.add(at(box(0.18, 0.18, 0.18, color), 0, 0, 0));
  root.scale.setScalar(size);
  return root;
}

function lizard(color) {
  const r = quadruped(color, { len: 1.2, h: 0.32, w: 0.35, bh: 0.22, tail: true, spikes: true, eye: "#ff8a3a" });
  r.userData.tail.scale.set(1.5, 2.2, 1.5);
  return r;
}

function dragon(color) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const dark = new THREE.Color(color).multiplyScalar(0.6).getHex();
  const segs = [];
  for (let i = 0; i < 7; i++) {
    const s = sph(0.42 - i * 0.04, i % 2 ? color : dark, undefined, 8, 6);
    s.position.set(0, 0.9, -i * 0.5); body.add(s); segs.push(s);
    body.add(at(cone(0.08, 0.3, "#e9c46a", 4), 0, 1.3 - i * 0.04, -i * 0.5));
  }
  const head = new THREE.Group(); head.position.set(0, 1.25, 0.55); body.add(head);
  head.add(at(box(0.5, 0.35, 0.6, color), 0, 0, 0));
  head.add(at(box(0.4, 0.15, 0.4, dark), 0, -0.15, 0.35));
  for (const x of [-0.18, 0.18]) { head.add(at(cone(0.06, 0.5, "#e9c46a", 5), x, 0.32, -0.2, -0.6)); head.add(at(box(0.08, 0.06, 0.03, "#ffef8a", { emissive: 0xffd040 }), x, 0.08, 0.31)); }
  for (const x of [-0.25, 0.25]) head.add(at(cyl(0.015, 0.01, 0.8, "#e9c46a", 4), x, -0.05, 0.55, 1.2, 0, x > 0 ? -0.8 : 0.8));
  const wings = [];
  for (const side of [-1, 1]) {
    const w = pivot(side * 0.35, 1.2, -0.4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, side * 2.2, 0.6, -0.3, side * 1.8, -0.2, -1.3, 0, 0, 0, side * 1.8, -0.2, -1.3, side * 0.4, -0.1, -1.0], 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: dark, side: THREE.DoubleSide, flatShading: true }));
    m.castShadow = true; w.add(m); body.add(w); wings.push(w);
  }
  const legs = [];
  for (const [x, z] of [[-0.35, 0.1], [0.35, 0.1], [-0.35, -1.6], [0.35, -1.6]]) { const l = pivot(x, 0.75, z, at(box(0.16, 0.7, 0.16, dark), 0, -0.35, 0)); body.add(l); legs.push(l); }
  Object.assign(root.userData, { body, head, legs, wings, segs, dragon: true, h: 2.2 });
  return root;
}

export function monster(def) {
  let m;
  const c = def.color;
  switch (def.look) {
    case "wolf": m = quadruped(c, { ears: true, tail: true }); break;
    case "boar": m = quadruped(c, { len: 1.0, h: 0.5, w: 0.5, bh: 0.48, tusks: true, spikes: true, eye: "#1a1a1a" }); break;
    case "bandit": m = humanoid({ robe: c, mask: "#1a1a1a", hair: "#2a1a10", wtype: "dagger", tier: 2, belt: "#1a1a1a", scale: 1 }); break;
    case "guardian": m = humanoid({ robe: c, armorTier: 4, helmetTier: 3, wtype: "sword", tier: 4, belt: "#e9c46a", scale: 1 }); break;
    case "ghost": m = ghost(c); break;
    case "lantern": m = lanternMonster(c); break;
    case "golem": m = golem(c, 1); break;
    case "spider": m = spider(c, 1); break;
    case "lizard": m = lizard(c); break;
    case "dragon": m = dragon(c); break;
    default: m = quadruped(c, {});
  }
  const s = def.size || 1;
  if (!m.userData.spider) m.scale.multiplyScalar(s); else m.scale.setScalar(s);
  m.userData.h = (m.userData.h || 1.5) * s;
  m.userData.look = def.look;
  return m;
}

export function animMonster(root, st, t) {
  const u = root.userData;
  if (u.legs && !u.spider && !u.dragon && u.body && !u.armR) {
    const w = st.moving ? Math.sin(t * 12 + st.seed * 10) : 0;
    u.legs.forEach((l, i) => (l.rotation.x = (i % 3 === 0 ? 1 : -1) * w * 0.6));
    if (u.tail) u.tail.rotation.y = Math.sin(t * 6) * 0.3;
    u.body.position.y = st.moving ? Math.abs(w) * 0.05 : 0;
    const lunge = st.atkT != null && t - st.atkT < 0.25 ? Math.sin(((t - st.atkT) / 0.25) * Math.PI) : 0;
    if (u.head) u.head.rotation.x = -lunge * 0.5;
    u.body.position.z = lunge * 0.25;
  } else if (u.armR) {
    animHumanoid(root, { moving: st.moving, swingT: st.atkT }, t);
  } else if (u.spider) {
    const w = st.moving ? t * 14 : 0;
    u.legs.forEach((l, i) => (l.rotation.x = Math.sin(w + i) * 0.35));
    const lunge = st.atkT != null && t - st.atkT < 0.25 ? Math.sin(((t - st.atkT) / 0.25) * Math.PI) : 0;
    u.body.position.z = lunge * 0.3;
  } else if (u.dragon) {
    u.segs.forEach((s, i) => (s.position.x = Math.sin(t * 3 - i * 0.6) * 0.12 * i));
    u.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (Math.sin(t * (st.flying ? 8 : 2)) * (st.flying ? 0.6 : 0.15))));
    u.legs.forEach((l, i) => (l.rotation.x = st.moving ? Math.sin(t * 8 + i * 1.5) * 0.5 : 0));
    u.body.position.y = st.flying ? 3 + Math.sin(t * 2) * 0.3 : 0;
    const lunge = st.atkT != null && t - st.atkT < 0.3 ? Math.sin(((t - st.atkT) / 0.3) * Math.PI) : 0;
    u.head.rotation.x = st.casting ? -0.4 : -lunge * 0.5;
  }
  if (u.float) u.body.position.y = Math.sin(t * 2 + st.seed * 6) * 0.12 + 0.1;
}

// ======================================================= Pierres maudites
export function stone(def) {
  const g = new THREE.Group();
  const col = new THREE.Color(def.color);
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 2.4, 5), mat("#22202b"));
  ob.position.y = 1.2; ob.castShadow = true; g.add(ob);
  const tip = cone(0.25, 0.5, "#22202b", 5); tip.position.y = 2.65; g.add(tip);
  const runeMat = new THREE.MeshBasicMaterial({ color: col });
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.02), runeMat);
    const a = (i / 5) * Math.PI * 2;
    r.position.set(Math.sin(a) * 0.43, 0.7 + (i % 3) * 0.45, Math.cos(a) * 0.43); r.rotation.y = a;
    g.add(r);
  }
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.8, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.04; g.add(aura);
  const orbs = new THREE.Group(); g.add(orbs);
  for (let i = 0; i < 4; i++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), runeMat); o.position.set(Math.cos(i * 1.57) * 0.9, 1.6, Math.sin(i * 1.57) * 0.9); orbs.add(o); }
  g.userData = { h: 3.0, anim: (t, hitT) => { orbs.rotation.y = t; aura.material.opacity = 0.25 + Math.sin(t * 3) * 0.12; ob.position.x = hitT != null && t - hitT < 0.1 ? (Math.random() - 0.5) * 0.08 : 0; } };
  return g;
}

export function npc(kind) {
  if (kind === "smith") { const h = humanoid({ robe: "#5a3a22", hair: "#2b2420", noBun: true, wtype: "sword", tier: 1 }); h.userData.handR.clear(); h.userData.handR.add(at(box(0.2, 0.12, 0.12, "#8d949e"), 0, 0, 0.3)); h.userData.handR.add(at(cyl(0.02, 0.02, 0.35, "#3a2618"), 0, 0, 0.15, Math.PI / 2)); return h; }
  if (kind === "merchant") return humanoid({ robe: "#8e2b6b", hair: "#1d1714", trim: "#e9c46a" });
  return humanoid({ robe: "#e9dcc0", hair: "#d8d0d0", straw: true, trim: "#2f8f6f", cls: "chaman" });
}
