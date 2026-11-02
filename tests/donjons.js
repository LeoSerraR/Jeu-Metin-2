// Test des donjons : un bot de haut niveau traverse un donjon et affronte le boss.
// Usage : node tests/donjons.js <tour|nid|temple> (serveur lancé, compte "TestDonjon" préparé)
const { io } = require("socket.io-client");
const { findPath } = require("../client/js/path.js");
const URL = process.env.URL || "http://localhost:3000";
const KEY = process.argv[2] || "tour";
const NAME = process.argv[3] || "TestDonjon";
const LIMIT = +process.env.LIMIT || 240000;
const PORTALS = { tour: [47, 28], nid: [72, 60], temple: [85, 82] };

const s = io(URL, { transports: ["websocket"] });
let map = null, me = null, myId = null, mons = [], path = [], pathAt = 0, inside = false, self = null, hp = 1, mh = 1;
const log = { teles: new Set(), msgs: [], kills: 0, uniques: [], deaths: 0 };
const loadMap = (m) => { map = { w: m.w, h: m.h, blocked: [...m.blocked].map((c) => c === "1"), objects: m.objects }; path = []; };
s.on("connect", () => s.emit("login", { name: NAME, password: "test1234", mode: "login" }, (r) => { if (!r.ok) { console.log("connexion :", r.error); process.exit(1); } }));
s.on("welcome", (w) => { myId = w.id; loadMap(w.map); });
s.on("world", (w) => { loadMap(w.map); inside = w.kind === "dungeon"; console.log("→ monde :", w.map.theme); });
s.on("mapdelta", (d) => { for (const [x, y] of d.unblock) map.blocked[x + y * map.w] = false; });
s.on("correct", (c) => { if (me) { me.x = c.x; me.y = c.y; } path = []; });
s.on("msg", (m) => { log.msgs.push(m.text); if (/Victoire|grille|sceau|vulnérable|Dragon|Reine|Gardien|Ramassé|temps/i.test(m.text)) console.log("  msg:", m.text); if (/Ramassé/.test(m.text)) log.uniques.push(m.text); });
s.on("self", (x) => { self = x; });
s.on("s", (snap) => {
  const p = snap.p.find((o) => o.id === myId);
  if (p && !me) me = { x: p.x, y: p.y };
  mons = snap.m; hp = snap.me.hp; mh = snap.me.mh;
  if (snap.me.dead) { log.deaths++; setTimeout(() => s.emit("respawn"), 3200); }
  if (snap.fx) for (const f of snap.fx) { if (f.k === "tele") log.teles.add(f.n); if (f.k === "die" && f.b) { log.bossDead = true; console.log("  ★ BOSS VAINCU"); } }
  if (snap.dg) log.dg = snap.dg.obj;
  if (snap.dr) log.drops = snap.dr;
});
function walkTo(x, y) {
  if (!path.length || Date.now() - pathAt > 800) { path = findPath(map.w, map.h, map.blocked, me.x, me.y, x, y, 20000) || []; pathAt = Date.now(); }
  const wp = path[0] || [x, y], d = Math.hypot(wp[0] - me.x, wp[1] - me.y), step = Math.min(d, 0.4);
  if (d > 0.01) { me.x += (wp[0] - me.x) / d * step; me.y += (wp[1] - me.y) / d * step; }
  if (d < 0.45) path.shift();
  s.emit("mv", { x: me.x, y: me.y, d: Math.atan2(wp[1] - me.y, wp[0] - me.x), m: 1 });
}
let entered = false, skillN = 1;
setInterval(() => {
  if (!me || !map) return;
  if (hp / mh < 0.5) s.emit("usekey", { key: "potion_rouge" });
  s.emit("usekey", { key: "potion_bleue" });
  if (!inside) {
    if (log.bossDead) return;
    const [px, py] = PORTALS[KEY];
    if (Math.hypot(px + 0.5 - me.x, py + 2.5 - me.y) > 1.5) return walkTo(px + 0.5, py + 2.5);
    if (!entered) { entered = true; s.emit("enter", { key: KEY }); }
    return;
  }
  // ramasser le butin après le boss
  if (log.bossDead && log.drops && log.drops.length) { const d = log.drops[0]; return walkTo(d.x, d.y); }
  const t = mons.filter((m) => !m.sh || mons.every((o) => o.sh || o.id === m.id)).sort((a, b) => (a.s ? -0.5 : 0) + Math.hypot(a.x - me.x, a.y - me.y) - ((b.s ? -0.5 : 0) + Math.hypot(b.x - me.x, b.y - me.y)))[0];
  if (!t) return;
  const d = Math.hypot(t.x - me.x, t.y - me.y);
  if (d > 1.4 + (t.mh > 5000 ? 1 : 0)) return walkTo(t.x, t.y);
  s.emit("atk", { t: t.id });
  s.emit("skill", { n: skillN, t: t.id }); skillN = skillN % 6 + 1;
}, 100);
setTimeout(() => {
  console.log(`\nRésultat ${KEY} : boss vaincu = ${!!log.bossDead}, objectif = "${log.dg}", attaques de boss vues = [${[...log.teles].join(", ")}], morts = ${log.deaths}`);
  console.log("Butin :", log.uniques.join(" | ") || "aucun");
  process.exit(log.bossDead ? 0 : 1);
}, LIMIT);
