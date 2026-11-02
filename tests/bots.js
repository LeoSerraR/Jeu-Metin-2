// Test automatique : deux bots se connectent, chassent des monstres et discutent.
const { io } = require("socket.io-client");
const { findPath } = require("../client/js/path.js");
const URL = process.env.URL || "http://localhost:3000";
const DURATION = +process.env.DURATION || 25000;

function bot(name, kingdom) {
  return new Promise((resolve) => {
    const s = io(URL, { transports: ["websocket"] });
    const st = { name, xp: 0, gold: 0, lvl: 1, chats: 0, kills: 0, me: null, mons: [], hp: 0 };
    let me = null, myId = null, target = null;
    s.on("connect", () => {
      s.emit("login", { name, password: "test1234", kingdom, mode: "create" }, (r) => {
        if (!r.ok) s.emit("login", { name, password: "test1234", kingdom }, (r2) => { if (!r2.ok) console.log(name, r2.error); });
      });
    });
    let map = null, path = [], pathFor = null, pathAt = 0;
    s.on("welcome", (w) => { myId = w.id; map = { w: w.map.w, h: w.map.h, blocked: [...w.map.blocked].map((c) => c === "1") }; });
    s.on("self", (x) => { st.xp = x.xp; st.gold = x.gold; st.lvl = x.lvl; st.inv = x.inv.filter(Boolean).length; });
    s.on("chat", (c) => { if (!c.sys) st.chats++; });
    s.on("correct", (c) => { if (me) { me.x = c.x; me.y = c.y; } st.corrections = (st.corrections || 0) + 1; });
    s.on("s", (snap) => {
      const p = snap.p.find((o) => o.id === myId);
      if (p && !me) me = { x: p.x, y: p.y };
      st.hp = snap.me.hp;
      if (snap.fx) for (const f of snap.fx) if (f.k === "die" && f.id === target) st.kills++;
      st.mons = snap.m;
      if (snap.me.dead) s.emit("respawn");
    });
    const loop = setInterval(() => {
      if (!me) return;
      const t = st.mons.filter((m) => !m.s).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      if (!t) return;
      target = t.id;
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d > 1.4) {
        if (pathFor !== t.id || Date.now() - pathAt > 1000 || !path.length) {
          path = findPath(map.w, map.h, map.blocked, me.x, me.y, t.x, t.y) || [];
          pathFor = t.id; pathAt = Date.now();
        }
        const wp = path[0] || [t.x, t.y];
        const wd = Math.hypot(wp[0] - me.x, wp[1] - me.y);
        const step = Math.min(wd, 0.38);
        if (wd > 0.01) { me.x += ((wp[0] - me.x) / wd) * step; me.y += ((wp[1] - me.y) / wd) * step; }
        if (wd < 0.4) path.shift();
        s.emit("mv", { x: me.x, y: me.y, d: Math.atan2(wp[1] - me.y, wp[0] - me.x), m: 1 });
      } else {
        s.emit("atk", { t: t.id });
        s.emit("skill", { n: 1 });
        if (st.hp < 80) s.emit("usekey", { key: "potion_rouge" });
      }
    }, 100);
    setTimeout(() => s.emit("chat", { text: "Bonjour de " + name }), 2000);
    setTimeout(() => { clearInterval(loop); s.disconnect(); resolve(st); }, DURATION);
  });
}

(async () => {
  const res = await Promise.all([bot("BotAlpha", 0), bot("BotBeta", 2)]);
  for (const r of res) console.log(`${r.name}: niveau ${r.lvl}, xp ${r.xp}, taels ${r.gold}, objets ${r.inv}, monstres tués ${r.kills}, messages reçus ${r.chats}, corrections ${r.corrections || 0}`);
  const ok = res.every((r) => r.chats >= 2 && (r.kills > 0 || r.lvl > 1));
  console.log(ok ? "✅ TEST RÉUSSI" : "❌ TEST ÉCHOUÉ");
  process.exit(ok ? 0 : 1);
})();
