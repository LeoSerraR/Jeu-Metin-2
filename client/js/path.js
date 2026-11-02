// Recherche de chemin A* sur la grille (utilisé par le jeu et par les bots de test).
(function (root) {
  function findPath(w, h, blocked, sx, sy, tx, ty, maxNodes) {
    sx = Math.floor(sx); sy = Math.floor(sy); tx = Math.floor(tx); ty = Math.floor(ty);
    maxNodes = maxNodes || 6000;
    const idx = (x, y) => x + y * w;
    const free = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !blocked[idx(x, y)];
    if (!free(tx, ty)) {
      // case cible bloquée : viser la case libre la plus proche
      let best = null, bd = 1e9;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (free(tx + dx, ty + dy)) {
          const d = Math.hypot(tx + dx - sx, ty + dy - sy) + Math.hypot(dx, dy) * 3;
          if (d < bd) { bd = d; best = [tx + dx, ty + dy]; }
        }
      }
      if (!best) return null;
      tx = best[0]; ty = best[1];
    }
    if (sx === tx && sy === ty) return [];
    const open = [[0, sx, sy]], g = new Map(), from = new Map();
    g.set(idx(sx, sy), 0);
    const hfn = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    let visited = 0;
    while (open.length && visited < maxNodes) {
      // file de priorité simple (tas binaire)
      const cur = open[0], last = open.pop();
      if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[i], open[m]] = [open[m], open[i]]; i = m; } }
      const [, x, y] = cur;
      visited++;
      if (x === tx && y === ty) {
        const path = []; let k = idx(x, y);
        while (k !== idx(sx, sy)) { path.push([k % w + 0.5, Math.floor(k / w) + 0.5]); k = from.get(k); }
        return path.reverse();
      }
      const gc = g.get(idx(x, y));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!free(nx, ny)) continue;
        if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue; // pas de coupe en diagonale
        const ng = gc + (dx && dy ? 1.414 : 1), k = idx(nx, ny);
        if (ng < (g.has(k) ? g.get(k) : 1e9)) {
          g.set(k, ng); from.set(k, idx(x, y));
          const node = [ng + hfn(nx, ny), nx, ny];
          open.push(node);
          let i = open.length - 1;
          while (i > 0) { const pi = (i - 1) >> 1; if (open[pi][0] <= open[i][0]) break; [open[pi], open[i]] = [open[i], open[pi]]; i = pi; }
        }
      }
    }
    return null;
  }
  root.findPath = findPath;
  if (typeof module !== "undefined") module.exports = { findPath };
})(typeof window !== "undefined" ? window : globalThis);
