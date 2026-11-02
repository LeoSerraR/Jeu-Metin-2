// Génération des cartes : le monde extérieur et les donjons.
// Codes de sol : 0 herbe, 1 herbe sombre, 2 chemin, 3 pavés, 4 eau, 5 sable,
//                6 mur, 7 sol de grotte, 8 dalles de jade, 9 sol de bronze

const VILLAGE = { x: 18, y: 18 };

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rand, cell, W, H) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rand());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = smooth(gx - x0), fy = smooth(gy - y0), v = (i, j) => g[i + j * gw];
    const a = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx, b = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
}

// Outils communs à toutes les cartes
function baseMap(w, h, fill, theme) {
  const m = {
    w, h, theme, tiles: new Array(w * h).fill(fill), blocked: new Array(w * h).fill(false),
    objects: [], npcs: [], oid: 1,
  };
  m.idx = (x, y) => x + y * w;
  m.walkable = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !m.blocked[Math.floor(x) + Math.floor(y) * w];
  m.addObj = (o, block = true) => {
    o.id = "o" + m.oid++;
    m.objects.push(o);
    if (block) {
      const ow = o.w || 1, oh = o.h || 1;
      for (let dx = 0; dx < ow; dx++) for (let dy = 0; dy < oh; dy++) m.blocked[m.idx(o.x + dx, o.y + dy)] = true;
    }
    return o;
  };
  m.wall = (x, y) => { m.tiles[m.idx(x, y)] = 6; m.blocked[m.idx(x, y)] = true; };
  m.floor = (x, y, t) => { m.tiles[m.idx(x, y)] = t; m.blocked[m.idx(x, y)] = false; };
  return m;
}

function distVillage(x, y) { return Math.hypot(x - VILLAGE.x, y - VILLAGE.y); }
function zoneOf(x, y) {
  const d = distVillage(x, y);
  return d < 11 ? 0 : d < 28 ? 1 : d < 50 ? 2 : d < 74 ? 3 : 4;
}

// ======================================================= Monde extérieur
function generateOverworld(seed = 20261102) {
  const W = 96, H = 96;
  const rand = rng(seed);
  const water = makeNoise(rand, 11, W, H), forest = makeNoise(rand, 7, W, H), detail = makeNoise(rand, 3, W, H);
  const m = baseMap(W, H, 0, "monde");
  const roads = new Array(W * H).fill(false);
  const paths = [[18, 18, 40, 22], [18, 18, 22, 44], [18, 18, 52, 52], [40, 22, 78, 40], [22, 44, 42, 80], [52, 52, 70, 66],
    [70, 66, 86, 86], [78, 40, 70, 66], [42, 80, 70, 66], [40, 22, 46, 27]];
  for (const [ax, ay, bx, by] of paths) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2), wob = rand() * 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
      const off = Math.sin(t * Math.PI * 2 + wob) * 3 * Math.sin(t * Math.PI);
      const x = ax + (bx - ax) * t + (nx / nl) * off, y = ay + (by - ay) * t + (ny / nl) * off;
      for (let ox = -1; ox <= 0; ox++) for (let oy = -1; oy <= 0; oy++) {
        const tx = Math.round(x + ox), ty = Math.round(y + oy);
        if (tx > 1 && ty > 1 && tx < W - 2 && ty < H - 2) roads[m.idx(tx, ty)] = true;
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = m.idx(x, y), z = zoneOf(x, y), dv = distVillage(x, y);
    let t = z >= 3 ? 1 : 0;
    if (z === 2 && detail(x, y) > 0.62) t = 1;
    if (dv < 10.5) t = 3;
    else if (roads[i]) t = 2;
    else if (water(x, y) > 0.7 && dv > 14) t = 4;
    else if (water(x, y) > 0.66 && dv > 14) t = 5;
    m.tiles[i] = t;
    if (t === 4) m.blocked[i] = true;
  }
  const place = (t, x, y) => {
    if (m.blocked[m.idx(x, y)] || m.tiles[m.idx(x, y)] === 4) return false;
    m.addObj({ t, x, y });
    return true;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) {
      if (m.tiles[m.idx(x, y)] === 4) m.tiles[m.idx(x, y)] = 1;
      m.blocked[m.idx(x, y)] = false;
      place(zoneOf(x, y) >= 3 ? "pine" : "tree", x, y);
    }
  }
  [[11, 11], [23, 11], [11, 23], [24, 22]].forEach(([hx, hy], i) => m.addObj({ t: "house", x: hx, y: hy, w: 3, h: 3, v: i }));
  for (const [lx, ly] of [[15, 15], [21, 15], [15, 21], [21, 21], [18, 9], [9, 18], [27, 18], [18, 27]]) place("lantern", lx, ly);
  place("sakura", 13, 17); place("sakura", 23, 17);

  // Portails des donjons : on dégage le terrain autour
  const portals = [["tour", 47, 28], ["nid", 72, 60], ["temple", 85, 82]];
  for (const [, px, py] of portals) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = px + dx, y = py + dy;
      if (Math.hypot(dx, dy) <= 3.2) { m.tiles[m.idx(x, y)] = Math.hypot(dx, dy) <= 1.6 ? 3 : 2; m.blocked[m.idx(x, y)] = false; }
    }
  }

  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = m.idx(x, y);
    if (m.blocked[i] || roads[i] || m.tiles[i] === 3 || m.tiles[i] === 4 || distVillage(x, y) < 13) continue;
    if (portals.some(([, px, py]) => Math.hypot(px - x, py - y) < 4.5)) continue;
    const z = zoneOf(x, y), f = forest(x, y), r = rand();
    const density = z >= 3 ? 0.17 : z === 2 ? 0.1 : 0.06;
    if (f > 0.55 && r < density) place(z >= 3 ? (rand() < 0.75 ? "pine" : "tree") : rand() < 0.15 ? "sakura" : rand() < 0.3 ? "bamboo" : "tree", x, y);
    else if (r < 0.008) place("rock", x, y);
  }
  for (const [key, px, py] of portals) m.addObj({ t: "portal", x: px, y: py, dungeon: key });

  m.npcs = [
    { id: "n1", kind: "smith",    name: "Maître Forgeron Hao", x: 14.5, y: 19.5 },
    { id: "n2", kind: "merchant", name: "Marchande Lin",       x: 22.5, y: 19.5 },
    { id: "n3", kind: "guide",    name: "Ancien Wei",          x: 18.5, y: 14.5 },
  ];
  for (const n of m.npcs) m.blocked[m.idx(Math.floor(n.x), Math.floor(n.y))] = true;
  m.spawn = { x: 18.5, y: 17 };
  m.zoneOf = zoneOf;
  m.freeByZone = [[], [], [], [], []];
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    if (!m.blocked[m.idx(x, y)] && m.tiles[m.idx(x, y)] !== 3 && !portals.some(([, px, py]) => Math.hypot(px - x, py - y) < 6)) m.freeByZone[zoneOf(x, y)].push([x, y]);
  }
  return m;
}

// ======================================================= Donjons
function rect(m, x0, y0, w, h, t) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.floor(x, y, t);
}

// Tour : salles alignées séparées par des grilles qui s'ouvrent quand la salle est vidée
function genTour() {
  const sizes = [9, 13, 13, 13, 17], corridor = 3;
  const H = 19, cy = 9;
  const W = 2 + sizes.reduce((a, b) => a + b, 0) + corridor * (sizes.length - 1);
  const m = baseMap(W, H, 6, "tour");
  for (let i = 0; i < m.blocked.length; i++) m.blocked[i] = true;
  const rooms = [];
  let x = 1;
  sizes.forEach((s, i) => {
    const y0 = cy - Math.floor(s / 2);
    rect(m, x, y0, s, s, 9);
    rooms.push({ x0: x, y0, x1: x + s, y1: y0 + s, cx: x + s / 2, cy: cy + 0.5 });
    // lanternes aux coins
    for (const [lx, ly] of [[x + 1, y0 + 1], [x + s - 2, y0 + 1], [x + 1, y0 + s - 2], [x + s - 2, y0 + s - 2]]) m.addObj({ t: "lantern", x: lx, y: ly });
    if (i < sizes.length - 1) {
      rect(m, x + s, cy - 1, corridor, 3, 9);
      const gx = x + s + 1;
      rooms[i].gate = [];
      for (let gy = cy - 1; gy <= cy + 1; gy++) rooms[i].gate.push(m.addObj({ t: "gate", x: gx, y: gy }));
    }
    x += s + corridor;
  });
  // la première grille (sortie de l'entrée) est ouverte
  for (const g of rooms[0].gate) { m.blocked[m.idx(g.x, g.y)] = false; g.open = true; }
  m.objects = m.objects.filter((o) => !o.open);
  const b = rooms[4];
  for (const [sx, sy] of [[b.x0 + 3, b.y0 + 3], [b.x1 - 4, b.y0 + 3], [b.x0 + 3, b.y1 - 4], [b.x1 - 4, b.y1 - 4]]) m.addObj({ t: "statue", x: sx, y: sy });
  m.addObj({ t: "exit", x: 2, y: cy });
  m.spawn = { x: 4.5, y: cy + 0.5 };
  m.rooms = rooms;
  return m;
}

// Nid : grande grotte ronde, quatre sceaux, la reine au centre
function genNid(rand) {
  const W = 46, H = 46, cx = 23, cy = 22, R = 18;
  const m = baseMap(W, H, 6, "nid");
  for (let i = 0; i < m.blocked.length; i++) m.blocked[i] = true;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05) + Math.sin(Math.atan2(y - cy, x - cx) * 5) * 1.2;
    if (d < R) m.floor(x, y, 7);
  }
  rect(m, cx - 2, cy + 15, 5, 8, 7); // entrée au sud
  m.seals = [[cx - 11, cy - 10], [cx + 11, cy - 10], [cx - 11, cy + 9], [cx + 11, cy + 9]];
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2, r = 6 + rand() * 9;
    const px = Math.round(cx + Math.cos(a) * r), py = Math.round(cy + Math.sin(a) * r);
    if (m.seals.some(([sx, sy]) => Math.hypot(sx - px, sy - py) < 3.5) || Math.hypot(px - cx, py - cy) < 6 || m.blocked[m.idx(px, py)]) continue;
    m.addObj({ t: "stalagmite", x: px, y: py });
  }
  for (let i = 0; i < 20; i++) {
    const a = rand() * Math.PI * 2, r = 3 + rand() * 14, px = Math.round(cx + Math.cos(a) * r), py = Math.round(cy + Math.sin(a) * r);
    if (!m.blocked[m.idx(px, py)]) m.addObj({ t: "web", x: px, y: py }, false);
  }
  m.addObj({ t: "exit", x: cx, y: H - 2 });
  m.spawn = { x: cx + 0.5, y: H - 4.5 };
  m.center = { x: cx + 0.5, y: cy + 0.5 };
  return m;
}

// Temple : long couloir gardé puis arène circulaire du dragon
function genTemple() {
  const W = 42, H = 66, cx = 21;
  const m = baseMap(W, H, 6, "temple");
  for (let i = 0; i < m.blocked.length; i++) m.blocked[i] = true;
  rect(m, cx - 3, 32, 7, 32, 8);
  for (let y = 0; y < 34; y++) for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - 18) < 16) m.floor(x, y, 8);
  for (let y = 36; y < 62; y += 4) { m.addObj({ t: "pillar", x: cx - 3, y }); m.addObj({ t: "pillar", x: cx + 3, y }); }
  for (let a = 0; a < 8; a++) {
    const px = Math.round(cx + Math.cos(a * Math.PI / 4) * 13.5), py = Math.round(18 + Math.sin(a * Math.PI / 4) * 13.5);
    if (py < 31) m.addObj({ t: "pillar", x: px, y: py });
  }
  m.addObj({ t: "exit", x: cx, y: H - 3 });
  m.spawn = { x: cx + 0.5, y: H - 5.5 };
  m.center = { x: cx + 0.5, y: 18.5 };
  m.corridor = { x: cx, y0: 36, y1: 58 };
  return m;
}

function generateDungeon(kind) {
  const rand = rng(Math.floor(Math.random() * 1e9));
  if (kind === "tour") return genTour();
  if (kind === "nid") return genNid(rand);
  return genTemple();
}

module.exports = { generateOverworld, generateDungeon, VILLAGE };
