// Graphismes dessinés par le code (aucune image externe nécessaire).
// Projection isométrique : une case = losange de 64 x 32 pixels.
const TW = 64, TH = 32;
const Art = {};

Art.iso = (x, y) => [(x - y) * (TW / 2), (x + y) * (TH / 2)];

function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }
Art.hash = hash;
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
Art.shade = shade;

// ---------- Sol ----------
const TILE_COLORS = {
  0: ["#5f9a3c", "#679f42", "#5a9338", "#6aa646"],     // herbe
  1: ["#3f6e33", "#44753a", "#3b672f", "#46783a"],     // herbe sombre (forêt)
  2: ["#b08a5a", "#a9835a", "#b5905f", "#a68056"],     // chemin
  3: ["#9a9488", "#a19b8e", "#948e83", "#9d978b"],     // pavés
  4: ["#2f6f9e", "#2f6f9e", "#2f6f9e", "#2f6f9e"],     // eau
  5: ["#d8c48e", "#d2be88", "#dcc894", "#d4c08a"],     // sable
};
Art.tileCache = {};

function diamond(ctx, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(ox + TW / 2, oy); ctx.lineTo(ox + TW, oy + TH / 2);
  ctx.lineTo(ox + TW / 2, oy + TH); ctx.lineTo(ox, oy + TH / 2); ctx.closePath();
}

Art.tile = function (type, variant) {
  const key = type + "_" + variant;
  if (Art.tileCache[key]) return Art.tileCache[key];
  const c = mk(TW + 2, TH + 2), g = c.getContext("2d");
  const base = TILE_COLORS[type][variant % 4];
  g.translate(1, 1);
  diamond(g, 0, 0); g.fillStyle = base; g.fill();
  g.save(); diamond(g, 0, 0); g.clip();
  const r = (i) => hash(variant * 1000 + type * 77 + i);
  if (type === 0 || type === 1) {
    for (let i = 0; i < 26; i++) {
      const x = r(i) * TW, y = r(i + 50) * TH;
      g.strokeStyle = shade(base, r(i + 99) > 0.5 ? 0.18 : -0.18);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r(i + 7) - 0.5) * 3, y - 3 - r(i + 3) * 3); g.stroke();
    }
    if (type === 0 && variant === 3) {
      for (let i = 0; i < 3; i++) {
        g.fillStyle = ["#f4e27a", "#f2a5c0", "#ffffff"][i];
        g.beginPath(); g.arc(14 + r(i + 200) * 36, 8 + r(i + 300) * 16, 1.6, 0, 7); g.fill();
      }
    }
  } else if (type === 2 || type === 5) {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = shade(base, r(i) > 0.5 ? 0.12 : -0.15);
      g.beginPath(); g.ellipse(r(i + 20) * TW, r(i + 40) * TH, 1 + r(i + 60) * 2, 0.8 + r(i + 80), 0, 0, 7); g.fill();
    }
  } else if (type === 3) {
    g.strokeStyle = shade(base, -0.25); g.lineWidth = 1;
    for (let k = 0; k <= 2; k++) {
      const a = Art.iso(k / 2, 0), b = Art.iso(k / 2, 1);
      g.beginPath(); g.moveTo(a[0] + TW / 2, a[1]); g.lineTo(b[0] + TW / 2, b[1]); g.stroke();
      const c2 = Art.iso(0, k / 2), d = Art.iso(1, k / 2);
      g.beginPath(); g.moveTo(c2[0] + TW / 2, c2[1]); g.lineTo(d[0] + TW / 2, d[1]); g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(0, 0, TW, TH / 2);
  }
  g.restore();
  Art.tileCache[key] = c;
  return c;
};

// Reflets animés sur l'eau
Art.drawWater = function (ctx, sx, sy, x, y, t) {
  ctx.drawImage(Art.tile(4, 0), sx - TW / 2 - 1, sy - 1);
  const ph = t / 900 + (x * 0.7 + y * 1.3);
  ctx.strokeStyle = `rgba(190,230,255,${0.25 + 0.2 * Math.sin(ph)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const ox = Math.sin(ph) * 6;
  ctx.moveTo(sx - 10 + ox, sy + TH / 2 - 2); ctx.lineTo(sx + 2 + ox, sy + TH / 2 - 2);
  ctx.moveTo(sx + 4 - ox, sy + TH / 2 + 5); ctx.lineTo(sx + 14 - ox, sy + TH / 2 + 5);
  ctx.stroke();
};

// ---------- Objets du décor (pré-dessinés) ----------
Art.objCache = {};
Art.object = function (t, variant) {
  const key = t + variant;
  if (Art.objCache[key]) return Art.objCache[key];
  const r = (i) => hash(variant * 131 + i * 17 + t.length * 1000);
  let c, g, ax, ay;
  const shadow = (gg, x, y, rx, ry) => { gg.fillStyle = "rgba(0,0,0,0.25)"; gg.beginPath(); gg.ellipse(x, y, rx, ry, 0, 0, 7); gg.fill(); };
  if (t === "tree" || t === "sakura") {
    c = mk(110, 150); g = c.getContext("2d"); ax = 55; ay = 140;
    shadow(g, ax, ay - 4, 30, 12);
    g.fillStyle = "#5b3b24"; g.fillRect(ax - 5, ay - 55, 10, 52);
    g.fillStyle = "#4a2f1c"; g.fillRect(ax + 1, ay - 55, 4, 52);
    const pal = t === "sakura" ? ["#e98fb0", "#f4b3cb", "#d9759b", "#fbd3e1"] : ["#2f6b2b", "#3c8236", "#2a5e26", "#4b9a41"];
    for (let i = 0; i < 9; i++) {
      const a = r(i) * Math.PI * 2, d = r(i + 9) * 22;
      g.fillStyle = pal[i % 3];
      g.beginPath(); g.arc(ax + Math.cos(a) * d, ay - 85 + Math.sin(a) * d * 0.7 - (i > 5 ? 12 : 0), 18 + r(i + 30) * 10, 0, 7); g.fill();
    }
    g.fillStyle = pal[3];
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(ax - 12 + r(i + 50) * 24, ay - 108 + r(i + 60) * 20, 6 + r(i) * 5, 0, 7); g.fill(); }
  } else if (t === "pine") {
    c = mk(90, 160); g = c.getContext("2d"); ax = 45; ay = 150;
    shadow(g, ax, ay - 4, 22, 9);
    g.fillStyle = "#4a2f1c"; g.fillRect(ax - 4, ay - 30, 8, 28);
    const pal = ["#1f4d2c", "#255a33", "#2c6a3c"];
    for (let i = 0; i < 4; i++) {
      const y = ay - 25 - i * 26, w = 36 - i * 7 + r(i) * 4;
      g.fillStyle = pal[i % 3];
      g.beginPath(); g.moveTo(ax - w, y); g.lineTo(ax, y - 44); g.lineTo(ax + w, y); g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,0.15)";
      g.beginPath(); g.moveTo(ax, y); g.lineTo(ax, y - 44); g.lineTo(ax + w, y); g.closePath(); g.fill();
    }
  } else if (t === "bamboo") {
    c = mk(70, 150); g = c.getContext("2d"); ax = 35; ay = 140;
    shadow(g, ax, ay - 3, 20, 8);
    for (let i = 0; i < 5; i++) {
      const x = ax - 14 + i * 7 + r(i) * 3, h = 90 + r(i + 5) * 40;
      g.strokeStyle = i % 2 ? "#7fae4a" : "#6a9a3c"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x, ay - 3); g.lineTo(x + (r(i + 8) - 0.5) * 8, ay - h); g.stroke();
      g.strokeStyle = "#4f7a2c"; g.lineWidth = 1;
      for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(x - 2, ay - k * h / 5); g.lineTo(x + 2, ay - k * h / 5); g.stroke(); }
      g.fillStyle = "#86b84f";
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + 6, ay - h + 10 + k * 14, 8, 2.5, 0.5, 0, 7); g.fill(); }
    }
  } else if (t === "rock") {
    c = mk(60, 50); g = c.getContext("2d"); ax = 30; ay = 40;
    shadow(g, ax, ay - 2, 20, 7);
    g.fillStyle = "#7d7a74";
    g.beginPath(); g.moveTo(ax - 18, ay - 4); g.lineTo(ax - 12, ay - 22); g.lineTo(ax + 4, ay - 28); g.lineTo(ax + 17, ay - 14); g.lineTo(ax + 15, ay - 2); g.closePath(); g.fill();
    g.fillStyle = "#94918a";
    g.beginPath(); g.moveTo(ax - 12, ay - 22); g.lineTo(ax + 4, ay - 28); g.lineTo(ax + 2, ay - 12); g.lineTo(ax - 8, ay - 10); g.closePath(); g.fill();
  } else if (t === "lantern") {
    c = mk(40, 90); g = c.getContext("2d"); ax = 20; ay = 84;
    shadow(g, ax, ay - 2, 9, 4);
    g.fillStyle = "#3a2b20"; g.fillRect(ax - 2, ay - 60, 4, 58);
    g.fillRect(ax - 9, ay - 62, 18, 3);
    const grd = g.createRadialGradient(ax, ay - 48, 2, ax, ay - 48, 18);
    grd.addColorStop(0, "rgba(255,170,80,0.55)"); grd.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(ax, ay - 48, 18, 0, 7); g.fill();
    g.fillStyle = "#c8312b"; g.beginPath(); g.ellipse(ax, ay - 48, 7, 10, 0, 0, 7); g.fill();
    g.fillStyle = "#f2c14e"; g.fillRect(ax - 7, ay - 50, 14, 2);
  }
  const o = { c, ax, ay };
  Art.objCache[key] = o;
  return o;
};

// Maison au toit de pagode, 3 x 3 cases
Art.house = function (variant) {
  const key = "house" + variant;
  if (Art.objCache[key]) return Art.objCache[key];
  const c = mk(260, 250), g = c.getContext("2d");
  const ox = 130, oy = 60; // position de iso(0,0) dans l'image
  const P = (x, y, z = 0) => { const [a, b] = Art.iso(x, y); return [ox + a, oy + b - z]; };
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const wallH = 52;
  const walls = ["#e9dcc0", "#e2d2b1", "#d8c7a6", "#efe3c9"][variant % 4];
  const roof = ["#8e2b2b", "#2d4a6b", "#6b2d5c", "#2d6b4a"][variant % 4];
  // ombre
  g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath();
  [P(0, 0), P(3.4, 0), P(3.4, 3.4), P(0, 3.4)].forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.fill();
  // murs (faces avant)
  poly([P(0, 3), P(3, 3), P(3, 3, wallH), P(0, 3, wallH)], shade(walls, -0.12));
  poly([P(3, 0), P(3, 3), P(3, 3, wallH), P(3, 0, wallH)], walls);
  // poutres
  g.strokeStyle = "#5a3a22"; g.lineWidth = 3;
  for (const [a, b] of [[P(0, 3), P(0, 3, wallH)], [P(3, 3), P(3, 3, wallH)], [P(3, 0), P(3, 0, wallH)], [P(1.5, 3), P(1.5, 3, wallH)], [P(3, 1.5), P(3, 1.5, wallH)]]) {
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // porte et fenêtres
  poly([P(3, 1.1), P(3, 1.9), P(3, 1.9, 32), P(3, 1.1, 32)], "#4a2f1c");
  poly([P(0.5, 3, 22), P(1.1, 3, 22), P(1.1, 3, 38), P(0.5, 3, 38)], "#f2c14e");
  poly([P(1.9, 3, 22), P(2.5, 3, 22), P(2.5, 3, 38), P(1.9, 3, 38)], "#f2c14e");
  // toit
  const e = 0.55, top = wallH, peak = wallH + 50;
  const A = P(-e, -e, top), B = P(3 + e, -e, top), C = P(3 + e, 3 + e, top), D = P(-e, 3 + e, top);
  const R1 = P(1.2, 1.5, peak), R2 = P(1.8, 1.5, peak);
  poly([A, B, R2, R1], shade(roof, 0.1));
  poly([A, R1, D], shade(roof, -0.1));
  poly([B, C, R2], roof);
  poly([D, C, R2, R1], shade(roof, -0.25));
  // tuiles
  g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const a = [D[0] + (C[0] - D[0]) * t, D[1] + (C[1] - D[1]) * t], b = [R1[0] + (R2[0] - R1[0]) * t, R1[1] + (R2[1] - R1[1]) * t];
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    const c2 = [B[0] + (C[0] - B[0]) * t, B[1] + (C[1] - B[1]) * t];
    g.beginPath(); g.moveTo(c2[0], c2[1]); g.lineTo(R2[0], R2[1]); g.stroke();
  }
  // pointes recourbées
  g.strokeStyle = shade(roof, -0.4); g.lineWidth = 3;
  for (const p of [A, B, C, D]) { g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0], p[1] - 4, p[0] + (p[0] < ox + 40 ? -8 : 8), p[1] - 10); g.stroke(); }
  g.strokeStyle = "#f2c14e"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(R1[0], R1[1]); g.lineTo(R2[0], R2[1]); g.stroke();
  const o = { c, ax: ox, ay: oy };
  Art.objCache[key] = o;
  return o;
};

// ---------- Personnages ----------
const ARMOR_COL = ["#8a8a8a", "#d9cba6", "#7a5236", "#5a6f8a", "#2f8f6f"];
const BLADE = [null, { c: "#c9a96b", l: 26 }, { c: "#c8ccd2", l: 30 }, { c: "#e8edf5", l: 34, curve: 1 }, { c: "#5fe0a8", l: 38, glow: 1 }];

// dir : angle dans le monde -> direction à l'écran
function screenDir(d) { const x = Math.cos(d), y = Math.sin(d); return [x - y, (x + y) / 2]; }
Art.screenDir = screenDir;

Art.drawPlayer = function (ctx, e, t, kingdomColor) {
  const [dx, dy] = screenDir(e.d);
  const flip = dx < 0 ? -1 : 1;
  const back = dy < -0.15;
  const walk = e.moving ? Math.sin(t / 90) : 0;
  const swing = e.swingT ? Math.max(0, 1 - (t - e.swingT) / 260) : 0;
  const spin = e.spinT && t - e.spinT < 450 ? (t - e.spinT) / 450 : 0;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, 7); ctx.fill();
  if (e.buff) {
    ctx.strokeStyle = `rgba(255,80,60,${0.5 + 0.3 * Math.sin(t / 120)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 8, 0, 0, 7); ctx.stroke();
  }
  ctx.scale(spin ? (Math.cos(spin * Math.PI * 4) >= 0 ? 1 : -1) : flip, 1);
  const armor = ARMOR_COL[e.a || 0], kc = kingdomColor;
  // jambes
  ctx.fillStyle = "#2b2420";
  ctx.fillRect(-6, -16 + Math.max(0, walk) * 2, 5, 15 - Math.max(0, walk) * 2);
  ctx.fillRect(1, -16 + Math.max(0, -walk) * 2, 5, 15 - Math.max(0, -walk) * 2);
  // corps (robe)
  ctx.fillStyle = armor;
  ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.lineTo(8, -38); ctx.lineTo(-8, -38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = kc; ctx.fillRect(-9, -26, 18, 4); // ceinture aux couleurs du royaume
  ctx.fillStyle = shade(armor, -0.25); ctx.fillRect(-1, -38, 2, 12);
  // bras arrière
  if (!back) { ctx.fillStyle = shade(armor, -0.2); ctx.fillRect(-12, -36, 5, 14); }
  // tête
  ctx.fillStyle = "#f0c9a0"; ctx.beginPath(); ctx.arc(0, -45, 8, 0, 7); ctx.fill();
  ctx.fillStyle = "#1d1714";
  if (back) { ctx.beginPath(); ctx.arc(0, -46, 8.5, 0, 7); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(0, -47, 8.3, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.fillRect(3, -46, 2, 2); }
  ctx.beginPath(); ctx.arc(-1, -55, 3.5, 0, 7); ctx.fill(); // chignon
  // casque
  if (e.h === 1) { ctx.fillStyle = "#d8b45a"; ctx.beginPath(); ctx.moveTo(-15, -47); ctx.lineTo(0, -60); ctx.lineTo(15, -47); ctx.closePath(); ctx.fill(); }
  else if (e.h === 2) { ctx.fillStyle = "#8d949e"; ctx.beginPath(); ctx.arc(0, -48, 9.5, Math.PI, 0); ctx.fill(); ctx.fillRect(-10, -49, 20, 3); }
  else if (e.h >= 3) { ctx.fillStyle = "#b8862e"; ctx.beginPath(); ctx.arc(0, -48, 9.5, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#e8534a"; ctx.beginPath(); ctx.moveTo(-3, -57); ctx.lineTo(0, -68); ctx.lineTo(3, -57); ctx.fill(); }
  // arme + bras avant
  const bl = BLADE[e.w || 1] || BLADE[1];
  const ang = swing ? -1.9 + (1 - swing) * 3.2 : back ? -2.4 : -0.9 + walk * 0.1;
  ctx.save(); ctx.translate(7, -33); ctx.rotate(ang);
  ctx.fillStyle = shade(armor, -0.1); ctx.fillRect(-2.5, 0, 5, 13);
  ctx.translate(0, 13);
  ctx.fillStyle = "#3a2618"; ctx.fillRect(-1.5, -3, 3, 7);
  ctx.fillStyle = "#f2c14e"; ctx.fillRect(-4, 3, 8, 2);
  if (bl.glow) { ctx.shadowColor = bl.c; ctx.shadowBlur = 10; }
  ctx.fillStyle = bl.c;
  ctx.beginPath(); ctx.moveTo(-2, 5);
  if (bl.curve) ctx.quadraticCurveTo(6, 5 + bl.l * 0.6, 0, 5 + bl.l); else ctx.lineTo(0, 5 + bl.l);
  ctx.lineTo(2, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
};

Art.drawMonster = function (ctx, e, def, t) {
  const [dx] = screenDir(e.d);
  const flip = dx < 0 ? -1 : 1;
  const s = def.size || 1;
  const step = e.mv ? Math.sin(t / 80 + e.seed * 10) : 0;
  const hit = e.hitT && t - e.hitT < 120;
  const lunge = e.atkT && t - e.atkT < 250 ? Math.sin(((t - e.atkT) / 250) * Math.PI) * 6 : 0;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 0, 16 * s, 6 * s, 0, 0, 7); ctx.fill();
  ctx.scale(flip * s, s);
  ctx.translate(lunge, 0);
  const col = hit ? "#ffffff" : def.color;
  if (def.look === "wolf") {
    ctx.fillStyle = shade(col, -0.25);
    ctx.fillRect(-12, -10 + step * 2, 4, 10); ctx.fillRect(7, -10 - step * 2, 4, 10);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(-1, -15, 15, 8, 0, 0, 7); ctx.fill();
    ctx.fillRect(-10, -10 - step * 2, 4, 10); ctx.fillRect(9, -10 + step * 2, 4, 10);
    ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-24, -24 - step * 3, -26, -14); ctx.lineTo(-14, -14); ctx.fill(); // queue
    ctx.beginPath(); ctx.ellipse(14, -22, 7, 6, 0, 0, 7); ctx.fill(); // tête
    ctx.beginPath(); ctx.moveTo(17, -22); ctx.lineTo(26, -19); ctx.lineTo(17, -17); ctx.fill(); // museau
    ctx.beginPath(); ctx.moveTo(10, -26); ctx.lineTo(12, -34); ctx.lineTo(15, -27); ctx.fill(); // oreille
    ctx.fillStyle = "#ffd23a"; ctx.fillRect(16, -24, 2, 2);
  } else if (def.look === "boar") {
    ctx.fillStyle = shade(col, -0.3);
    ctx.fillRect(-12, -9 + step * 2, 5, 9); ctx.fillRect(8, -9 - step * 2, 5, 9);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, -16, 17, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = shade(col, -0.35);
    for (let i = -10; i < 10; i += 4) { ctx.beginPath(); ctx.moveTo(i, -26); ctx.lineTo(i + 2, -31); ctx.lineTo(i + 4, -26); ctx.fill(); }
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(16, -15, 8, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#c98f8f"; ctx.beginPath(); ctx.ellipse(23, -13, 3, 3.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#f3ead2"; ctx.beginPath(); ctx.moveTo(19, -10); ctx.quadraticCurveTo(25, -12, 24, -20); ctx.lineTo(21, -11); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(16, -19, 2, 2);
  } else if (def.look === "bandit") {
    ctx.fillStyle = "#2b2420";
    ctx.fillRect(-6, -16 + Math.max(0, step) * 2, 5, 15); ctx.fillRect(1, -16 + Math.max(0, -step) * 2, 5, 15);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.lineTo(8, -38); ctx.lineTo(-8, -38); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(-9, -26, 18, 3);
    ctx.fillStyle = "#e3b98f"; ctx.beginPath(); ctx.arc(0, -45, 8, 0, 7); ctx.fill();
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(-8, -46, 16, 6); // masque
    ctx.fillStyle = "#ff4040"; ctx.fillRect(2, -44, 3, 2);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -48, 8.5, Math.PI, 0); ctx.fill();
    ctx.save(); ctx.translate(8, -30); ctx.rotate(lunge ? -0.2 : 0.6);
    ctx.fillStyle = "#cfd3d8"; ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.lineTo(0, 20); ctx.lineTo(1.5, 0); ctx.fill();
    ctx.restore();
  } else if (def.look === "ghost") {
    const fl = Math.sin(t / 300 + e.seed * 6) * 4;
    ctx.globalAlpha = hit ? 1 : 0.78;
    const grd = ctx.createLinearGradient(0, -50, 0, 0);
    grd.addColorStop(0, col); grd.addColorStop(1, "rgba(127,216,208,0)");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(-14, -6 + fl); ctx.quadraticCurveTo(-18, -50 + fl, 0, -54 + fl); ctx.quadraticCurveTo(18, -50 + fl, 14, -6 + fl);
    for (let i = 14; i > -14; i -= 7) ctx.quadraticCurveTo(i - 2, 2 + fl, i - 7, -6 + fl);
    ctx.fill();
    ctx.fillStyle = "#0b1a2a"; ctx.beginPath(); ctx.ellipse(3, -38 + fl, 2.5, 4, 0, 0, 7); ctx.ellipse(9, -38 + fl, 2.5, 4, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
};

Art.drawStone = function (ctx, e, def, t) {
  const pct = e.hp / e.mh;
  const pulse = 0.5 + 0.5 * Math.sin(t / 300);
  const hit = e.hitT && t - e.hitT < 100;
  ctx.save();
  // aura
  const grd = ctx.createRadialGradient(0, -10, 4, 0, -10, 60);
  grd.addColorStop(0, def.color + "88"); grd.addColorStop(1, def.color + "00");
  ctx.fillStyle = grd; ctx.globalAlpha = 0.5 + pulse * 0.4;
  ctx.beginPath(); ctx.ellipse(0, -4, 60, 30, 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.ellipse(0, 0, 24, 10, 0, 0, 7); ctx.fill();
  if (hit) ctx.translate((Math.random() - 0.5) * 4, 0);
  // obélisque
  ctx.fillStyle = hit ? "#555" : "#22202b";
  ctx.beginPath(); ctx.moveTo(-18, -2); ctx.lineTo(-13, -70); ctx.lineTo(0, -88); ctx.lineTo(13, -70); ctx.lineTo(18, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#34313f";
  ctx.beginPath(); ctx.moveTo(0, -88); ctx.lineTo(13, -70); ctx.lineTo(18, -2); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill();
  // runes lumineuses
  ctx.strokeStyle = def.color; ctx.lineWidth = 2; ctx.shadowColor = def.color; ctx.shadowBlur = 8 + pulse * 8;
  ctx.beginPath();
  ctx.moveTo(-6, -60); ctx.lineTo(0, -66); ctx.lineTo(6, -60); ctx.lineTo(0, -54); ctx.closePath();
  ctx.moveTo(-5, -40); ctx.lineTo(5, -40); ctx.moveTo(0, -46); ctx.lineTo(0, -30);
  ctx.moveTo(-6, -20); ctx.lineTo(6, -14);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // fissures selon les dégâts
  ctx.strokeStyle = "#0a0a0a"; ctx.lineWidth = 1.5;
  const cracks = Math.floor((1 - pct) * 6);
  for (let i = 0; i < cracks; i++) {
    const y = -75 + i * 12;
    ctx.beginPath(); ctx.moveTo(-12 + i * 3, y); ctx.lineTo(-4 + i, y + 7); ctx.lineTo(-9 + i * 2, y + 13); ctx.stroke();
  }
  ctx.restore();
};

Art.drawNpc = function (ctx, n, t) {
  const looks = { smith: { body: "#5a3a22", hat: "#2b2420", extra: "hammer" }, merchant: { body: "#8e2b6b", hat: null, extra: "bag" }, guide: { body: "#e9dcc0", hat: "#d8b45a", extra: "staff" } };
  const L = looks[n.kind];
  const bob = Math.sin(t / 600 + n.x) * 1;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 0, 14, 6, 0, 0, 7); ctx.fill();
  ctx.translate(0, bob);
  ctx.fillStyle = L.body;
  ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(8, -38); ctx.lineTo(-8, -38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f0c9a0"; ctx.beginPath(); ctx.arc(0, -45, 8, 0, 7); ctx.fill();
  if (n.kind === "guide") { ctx.fillStyle = "#f5f5f5"; ctx.beginPath(); ctx.moveTo(-5, -42); ctx.lineTo(0, -28); ctx.lineTo(5, -42); ctx.fill(); }
  if (L.hat) { ctx.fillStyle = L.hat; ctx.beginPath(); ctx.moveTo(-14, -47); ctx.lineTo(0, -60); ctx.lineTo(14, -47); ctx.closePath(); ctx.fill(); }
  else { ctx.fillStyle = "#1d1714"; ctx.beginPath(); ctx.arc(0, -47, 8.3, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#e8534a"; ctx.fillRect(4, -54, 4, 4); }
  if (L.extra === "hammer") { ctx.fillStyle = "#3a2618"; ctx.fillRect(10, -34, 3, 20); ctx.fillStyle = "#8d949e"; ctx.fillRect(6, -38, 11, 7); }
  if (L.extra === "bag") { ctx.fillStyle = "#c9a96b"; ctx.beginPath(); ctx.arc(11, -18, 7, 0, 7); ctx.fill(); }
  if (L.extra === "staff") { ctx.strokeStyle = "#6b4a2b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(12, -58); ctx.stroke(); ctx.fillStyle = "#5fe0a8"; ctx.beginPath(); ctx.arc(12, -60, 4, 0, 7); ctx.fill(); }
  ctx.restore();
  // bulle au-dessus de la tête
  const by = -80 + Math.sin(t / 400) * 3;
  ctx.fillStyle = "rgba(15,11,9,0.85)"; ctx.strokeStyle = "#e9c46a"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, by, 10, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#e9c46a"; ctx.strokeStyle = "#e9c46a";
  if (n.kind === "guide") { ctx.font = "800 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", 0, by + 5); }
  else if (n.kind === "smith") { ctx.save(); ctx.translate(0, by); ctx.rotate(-0.6); ctx.fillRect(-1, -3, 2, 10); ctx.fillRect(-5, -6, 10, 4); ctx.restore(); }
  else { ctx.beginPath(); ctx.ellipse(0, by + 2, 6, 3, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, by - 2, 6, 3, 0, 0, 7); ctx.fillStyle = "#f7dc8f"; ctx.fill(); }
};

// ---------- Icônes des objets ----------
Art.iconCache = {};
Art.icon = function (key, items, size = 40) {
  const ck = key + size;
  if (Art.iconCache[ck]) return Art.iconCache[ck];
  const it = items[key] || { icon: "gold" };
  const c = mk(size, size), g = c.getContext("2d");
  g.scale(size / 40, size / 40);
  const tierCol = ["#999", "#c9a96b", "#c8ccd2", "#e8edf5", "#5fe0a8"][it.tier || 0];
  switch (it.icon) {
    case "sword":
      g.translate(20, 20); g.rotate(-Math.PI / 4);
      if (it.tier === 4) { g.shadowColor = tierCol; g.shadowBlur = 8; }
      g.fillStyle = tierCol; g.beginPath(); g.moveTo(-2.5, -16); g.lineTo(0, -19); g.lineTo(2.5, -16); g.lineTo(2.5, 6); g.lineTo(-2.5, 6); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#f2c14e"; g.fillRect(-7, 6, 14, 3);
      g.fillStyle = "#4a2f1c"; g.fillRect(-2, 9, 4, 9);
      break;
    case "armor":
      g.fillStyle = ARMOR_COL[it.tier] || "#888";
      g.beginPath(); g.moveTo(8, 10); g.lineTo(15, 6); g.lineTo(25, 6); g.lineTo(32, 10); g.lineTo(30, 18); g.lineTo(27, 17); g.lineTo(27, 34); g.lineTo(13, 34); g.lineTo(13, 17); g.lineTo(10, 18); g.closePath(); g.fill();
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(19, 8, 2, 26);
      g.fillStyle = "#f2c14e"; g.fillRect(13, 23, 14, 3);
      break;
    case "helmet":
      if (it.tier === 1) { g.fillStyle = "#d8b45a"; g.beginPath(); g.moveTo(4, 26); g.lineTo(20, 8); g.lineTo(36, 26); g.closePath(); g.fill(); }
      else { g.fillStyle = it.tier === 2 ? "#8d949e" : "#b8862e"; g.beginPath(); g.arc(20, 24, 12, Math.PI, 0); g.fill(); g.fillRect(6, 23, 28, 5); if (it.tier === 3) { g.fillStyle = "#e8534a"; g.beginPath(); g.moveTo(17, 12); g.lineTo(20, 2); g.lineTo(23, 12); g.fill(); } }
      break;
    case "potion_r": case "potion_R": case "potion_b": {
      const col = it.icon === "potion_b" ? "#3f7fe8" : "#e03a3a", big = it.icon === "potion_R";
      g.fillStyle = "#e6e6e6"; g.fillRect(16, 6, 8, 6);
      g.fillStyle = "#8a5a2b"; g.fillRect(15, 4, 10, 4);
      g.fillStyle = col; g.beginPath(); g.arc(20, 24, big ? 13 : 10, 0, 7); g.fill();
      g.fillStyle = "rgba(255,255,255,0.45)"; g.beginPath(); g.arc(16, 20, 3, 0, 7); g.fill();
      break;
    }
    case "ore":
      g.fillStyle = "#4a4560"; g.beginPath(); g.moveTo(8, 28); g.lineTo(14, 10); g.lineTo(28, 8); g.lineTo(33, 24); g.lineTo(22, 33); g.closePath(); g.fill();
      g.fillStyle = "#b48cff"; g.shadowColor = "#b48cff"; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(18, 14); g.lineTo(24, 18); g.lineTo(20, 26); g.lineTo(15, 21); g.closePath(); g.fill();
      break;
    case "fang":
      g.fillStyle = "#f3ead2"; g.beginPath(); g.moveTo(12, 8); g.quadraticCurveTo(30, 14, 26, 34); g.quadraticCurveTo(22, 20, 12, 14); g.fill();
      break;
    case "tusk":
      g.fillStyle = "#efe0bd"; g.beginPath(); g.moveTo(8, 30); g.quadraticCurveTo(14, 6, 34, 8); g.quadraticCurveTo(18, 14, 14, 32); g.fill();
      break;
    case "cloth":
      g.fillStyle = "#1a1a1a"; g.fillRect(6, 15, 28, 9); g.fillStyle = "#7a1f2b"; g.fillRect(6, 18, 28, 3);
      g.fillStyle = "#1a1a1a"; g.beginPath(); g.moveTo(30, 20); g.lineTo(36, 32); g.lineTo(32, 33); g.fill();
      break;
    case "ecto":
      g.fillStyle = "rgba(127,216,208,0.85)"; g.beginPath(); g.arc(20, 22, 11, 0, 7); g.fill();
      g.fillStyle = "#0b1a2a"; g.fillRect(15, 18, 3, 4); g.fillRect(22, 18, 3, 4);
      break;
    default: // pièces
      for (let i = 0; i < 3; i++) { g.fillStyle = "#c8962e"; g.beginPath(); g.ellipse(14 + i * 6, 28 - i * 6, 9, 5, 0, 0, 7); g.fill(); g.fillStyle = "#f2c14e"; g.beginPath(); g.ellipse(14 + i * 6, 27 - i * 6, 8, 4, 0, 0, 7); g.fill(); }
  }
  Art.iconCache[ck] = c;
  return c;
};
