// Génération de la carte (déterministe grâce à une graine).
// Codes de sol : 0 herbe, 1 herbe sombre, 2 chemin, 3 pavés, 4 eau, 5 sable

const W = 96, H = 96;
const VILLAGE = { x: 18, y: 18 };

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(rand, cell) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => rand());
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = smooth(gx - x0), fy = smooth(gy - y0);
    const v = (i, j) => g[i + j * gw];
    const a = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
    const b = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
}

function distVillage(x, y) { return Math.hypot(x - VILLAGE.x, y - VILLAGE.y); }

// Zones de difficulté selon la distance au village
function zoneOf(x, y) {
  const d = distVillage(x, y);
  if (d < 11) return 0;      // village
  if (d < 28) return 1;      // plaine des loups
  if (d < 50) return 2;      // collines
  if (d < 74) return 3;      // forêt des bandits
  return 4;                  // vallée des spectres
}

function generateMap(seed = 20261102) {
  const rand = rng(seed);
  const water = makeNoise(rand, 11);
  const forest = makeNoise(rand, 7);
  const detail = makeNoise(rand, 3);

  const tiles = new Array(W * H).fill(0);
  const blocked = new Array(W * H).fill(false);
  const objects = [];
  const roads = new Array(W * H).fill(false);
  const idx = (x, y) => x + y * W;

  // Routes sinueuses du village vers les zones
  const destinations = [[40, 22], [22, 44], [52, 52], [78, 40], [42, 80], [86, 86], [70, 66]];
  const paths = [[VILLAGE.x, VILLAGE.y, 40, 22], [VILLAGE.x, VILLAGE.y, 22, 44], [VILLAGE.x, VILLAGE.y, 52, 52],
    [40, 22, 78, 40], [22, 44, 42, 80], [52, 52, 70, 66], [70, 66, 86, 86], [78, 40, 70, 66], [42, 80, 70, 66]];
  for (const [ax, ay, bx, by] of paths) {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    const wob = rand() * 10;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
      const off = Math.sin(t * Math.PI * 2 + wob) * 3 * Math.sin(t * Math.PI);
      const x = ax + (bx - ax) * t + (nx / nl) * off, y = ay + (by - ay) * t + (ny / nl) * off;
      for (let ox = -1; ox <= 0; ox++) for (let oy = -1; oy <= 0; oy++) {
        const tx = Math.round(x + ox), ty = Math.round(y + oy);
        if (tx > 1 && ty > 1 && tx < W - 2 && ty < H - 2) roads[idx(tx, ty)] = true;
      }
    }
  }
  void destinations;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), z = zoneOf(x, y), dv = distVillage(x, y);
    let t = z >= 3 ? 1 : 0;
    if (z === 2 && detail(x, y) > 0.62) t = 1;
    if (dv < 10.5) t = 3;
    else if (roads[i]) t = 2;
    else if (water(x, y) > 0.7 && dv > 14) t = 4;
    else if (water(x, y) > 0.66 && dv > 14) t = 5;
    tiles[i] = t;
    if (t === 4) blocked[i] = true;
  }

  const place = (type, x, y) => {
    const i = idx(x, y);
    if (blocked[i] || tiles[i] === 4) return false;
    objects.push({ t: type, x, y });
    blocked[i] = true;
    return true;
  };

  // Bordure de forêt
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) {
      if (tiles[idx(x, y)] === 4) tiles[idx(x, y)] = 1;
      blocked[idx(x, y)] = false;
      place(zoneOf(x, y) >= 3 ? "pine" : "tree", x, y);
    }
  }

  // Village : maisons, lanternes, PNJ
  const houses = [[11, 11], [23, 11], [11, 23], [24, 22]];
  for (const [hx, hy] of houses) {
    objects.push({ t: "house", x: hx, y: hy, w: 3, h: 3 });
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) blocked[idx(hx + dx, hy + dy)] = true;
  }
  for (const [lx, ly] of [[15, 15], [21, 15], [15, 21], [21, 21], [18, 9], [9, 18], [27, 18], [18, 27]]) place("lantern", lx, ly);
  place("sakura", 13, 17); place("sakura", 23, 17);

  // Végétation
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = idx(x, y);
    if (blocked[i] || roads[i] || tiles[i] === 3 || tiles[i] === 4) continue;
    if (distVillage(x, y) < 13) continue;
    const z = zoneOf(x, y), f = forest(x, y), r = rand();
    const density = z >= 3 ? 0.17 : z === 2 ? 0.1 : 0.06;
    if (f > 0.55 && r < density) {
      place(z >= 3 ? (rand() < 0.75 ? "pine" : "tree") : rand() < 0.15 ? "sakura" : rand() < 0.3 ? "bamboo" : "tree", x, y);
    } else if (r < 0.008) place("rock", x, y);
  }

  const npcs = [
    { id: "n1", kind: "smith",    name: "Maître Forgeron Hao", x: 14.5, y: 19.5 },
    { id: "n2", kind: "merchant", name: "Marchande Lin",       x: 22.5, y: 19.5 },
    { id: "n3", kind: "guide",    name: "Ancien Wei",          x: 18.5, y: 14.5 },
  ];
  for (const n of npcs) blocked[idx(Math.floor(n.x), Math.floor(n.y))] = true;

  const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !blocked[idx(Math.floor(x), Math.floor(y))];

  // Liste des cases libres par zone, pour les apparitions
  const freeByZone = [[], [], [], [], []];
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    if (!blocked[idx(x, y)] && tiles[idx(x, y)] !== 3) freeByZone[zoneOf(x, y)].push([x, y]);
  }

  return { w: W, h: H, tiles, objects, blocked, npcs, village: VILLAGE, zoneOf, walkable, freeByZone, rand };
}

module.exports = { generateMap };
