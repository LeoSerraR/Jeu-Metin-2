// Lames de Jade : client du jeu (affichage, commandes, interface).
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const canvas = $("#game"), ctx = canvas.getContext("2d");
  const SPEED = 4.2, ATK_CD = 560, ATK_RANGE = 1.55;
  const ZONES = ["Village de Bambou", "Plaine des Loups", "Collines Venteuses", "Forêt des Bandits", "Vallée des Spectres"];
  const isTouch = "ontouchstart" in window || matchMedia("(pointer: coarse)").matches;
  if (isTouch) document.body.classList.add("touch");

  const G = {
    socket: null, myId: null, map: null, items: {}, mdefs: {}, sdefs: {}, skills: [], shop: [], kingdoms: [],
    me: { x: 0, y: 0, d: 0, moving: false, path: [], targetId: null, npcTarget: null, dropTarget: null, nextAtk: 0, repathAt: 0, pathGoal: null },
    self: null, stat: { hp: 1, mp: 1, mh: 1, mm: 1, dead: 0, b: 0 },
    players: new Map(), mons: new Map(), drops: [], stoneTiles: new Set(),
    floats: [], parts: [], rings: [], cds: {}, keys: new Set(), joy: { x: 0, y: 0, active: false },
    mouse: { x: 0, y: 0, down: false, overCanvas: false }, hover: null, zoom: 1, cam: { x: 0, y: 0 },
    lastSent: 0, sentMoving: false, openPanel: null, atkHeld: false, deadSince: 0, objects: [],
  };
  window.G = G; // pratique pour déboguer depuis la console

  // ======================= Connexion =======================
  let loginMode = "login", kingdom = 0;
  try { const n = localStorage.getItem("ldj_name"); if (n) $("#l-name").value = n; } catch (e) { /* stockage indisponible */ }
  document.querySelectorAll(".tab").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === b));
    loginMode = b.dataset.mode;
    $("#kingdom-pick").classList.toggle("hidden", loginMode !== "create");
    $("#l-submit").textContent = loginMode === "create" ? "Créer et jouer" : "Entrer dans le monde";
    $("#l-pass").autocomplete = loginMode === "create" ? "new-password" : "current-password";
  });
  document.querySelectorAll(".kd").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".kd").forEach((x) => x.classList.toggle("selected", x === b));
    kingdom = +b.dataset.k;
  });

  $("#login-form").onsubmit = (ev) => {
    ev.preventDefault();
    $("#l-error").textContent = "";
    $("#l-submit").disabled = true;
    if (!G.socket) connect();
    const send = () => G.socket.emit("login", { name: $("#l-name").value.trim(), password: $("#l-pass").value, kingdom, mode: loginMode }, (r) => {
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
    G.map = { w: w.map.w, h: w.map.h, tiles: w.map.tiles, blocked: [...w.map.blocked].map((c) => c === "1") };
    G.npcs = w.map.npcs;
    G.items = w.items; G.mdefs = w.monsters; G.sdefs = w.stones; G.skills = w.skills; G.shop = w.shop; G.kingdoms = w.kingdoms; G.upgrade = w.upgrade;
    G.objects = w.map.objects.map((o, i) => {
      if (o.t === "house") return { ...o, depth: o.x + o.y + 3.2, sprite: Art.house(i), cx: o.x, cy: o.y };
      return { ...o, depth: o.x + o.y + 1, sprite: Art.object(o.t, i % 7), cx: o.x + 0.5, cy: o.y + 0.5 };
    });
    buildMinimap();
    buildInventory();
    buildShop();
    $("#login").classList.add("hidden");
    $("#hud").classList.remove("hidden");
    document.querySelectorAll(".hb.pot canvas").forEach((c) => c.getContext("2d").drawImage(Art.icon(c.parentElement.dataset.key, G.items, 32), 0, 0));
    addChat({ sys: true, text: "Bienvenue dans les Lames de Jade ! Tape /aide pour les commandes." });
    G.started = true;
  }

  // ======================= Réception de l'état =======================
  function onSnap(s) {
    const now = performance.now();
    const seen = new Set();
    for (const p of s.p) {
      seen.add(p.id);
      let e = G.players.get(p.id);
      if (!e) {
        e = { ...p, rx: p.x, ry: p.y };
        G.players.set(p.id, e);
        if (p.id === G.myId) { G.me.x = p.x; G.me.y = p.y; G.me.d = p.d; G.cam.x = p.x; G.cam.y = p.y; }
      } else Object.assign(e, p);
      e.moving = !!p.m;
    }

    const seenM = new Set();
    G.stoneTiles.clear();
    for (const m of s.m) {
      seenM.add(m.id);
      let e = G.mons.get(m.id);
      if (!e) { e = { ...m, rx: m.x, ry: m.y, seed: Math.random() }; G.mons.set(m.id, e); }
      else Object.assign(e, m);
      if (m.s) G.stoneTiles.add(Math.floor(m.x) + Math.floor(m.y) * G.map.w);
    }

    if (s.dr) G.drops = s.dr.map((d) => ({ ...d, born: now }));

    const wasDead = G.stat.dead;
    G.stat = s.me;
    if (s.me.dead && !wasDead) { G.deadSince = now; G.me.path = []; G.me.targetId = null; showDeath(); }
    if (!s.me.dead && wasDead) $("#death").classList.add("hidden");

    if (s.fx) for (const f of s.fx) handleFx(f, now);
    for (const id of G.players.keys()) if (!seen.has(id)) G.players.delete(id);
    for (const id of G.mons.keys()) if (!seenM.has(id)) G.mons.delete(id);
    if (G.me.targetId && !G.mons.has(G.me.targetId)) G.me.targetId = null;
    updateBars();
  }

  function entityPos(id) {
    if (id === G.myId) return { x: G.me.x, y: G.me.y };
    const e = G.players.get(id) || G.mons.get(id);
    return e ? { x: e.rx, y: e.ry } : null;
  }

  function handleFx(f, now) {
    const pos = entityPos(f.id) || (f.x != null ? { x: f.x, y: f.y } : null);
    switch (f.k) {
      case "dmg": {
        const m = G.mons.get(f.id);
        if (m) {
          m.hitT = now;
          if (pos) addFloat(pos, (f.c ? "✦" : "") + f.v, f.by === G.myId ? (f.c ? "#ffd23a" : "#ffffff") : "#b8b0a0", f.c ? 22 : f.by === G.myId ? 17 : 13);
          if (pos) burst(pos, f.c ? "#ffd23a" : "#ffffff", f.c ? 10 : 5, 28);
        } else if (pos) {
          addFloat(pos, "-" + f.v, f.id === G.myId ? "#ff5a4a" : "#d07a70", f.id === G.myId ? 17 : 13);
          if (f.id === G.myId) G.hurtFlash = now;
        }
        break;
      }
      case "die":
        if (pos) burst(pos, G.mons.get(f.id) && G.mons.get(f.id).s ? "#b48cff" : "#d9d2c5", 22, 32);
        if (G.mons.get(f.id) && G.mons.get(f.id).s && pos) G.rings.push({ x: pos.x, y: pos.y, t0: now, dur: 900, r: 4, col: "#b48cff" });
        break;
      case "swing": { const p = G.players.get(f.id); if (p) { p.swingT = now; p.d = f.d; } if (f.id === G.myId) G.me.d = f.d; break; }
      case "matk": { const m = G.mons.get(f.id); if (m) m.atkT = now; break; }
      case "skill": {
        const p = G.players.get(f.id);
        if (!pos) break;
        if (f.n === 1) { if (p) p.spinT = now; G.rings.push({ x: pos.x, y: pos.y, t0: now, dur: 450, r: 2.3, col: "#e8f4ff", spin: 1 }); }
        if (f.n === 2) { if (p) p.swingT = now; G.rings.push({ x: pos.x, y: pos.y, t0: now, dur: 350, d: f.d, col: "#ffb347", line: 1 }); }
        if (f.n === 3) { G.rings.push({ x: pos.x, y: pos.y, t0: now, dur: 700, r: 3, col: "#ff6040" }); burst(pos, "#ff6040", 16, 50); }
        break;
      }
      case "xp": if (f.id === G.myId && pos) addFloat(pos, "+" + f.v + " XP", "#c9a0ff", 13, 0.4); break;
      case "gold": if (f.id === G.myId && pos) addFloat(pos, "+" + f.v + " taels", "#f2c14e", 13, -0.4); break;
      case "lvl":
        if (pos) { G.rings.push({ x: pos.x, y: pos.y, t0: now, dur: 1400, col: "#ffd23a", pillar: 1 }); burst(pos, "#ffd23a", 30, 70); }
        if (f.id === G.myId && pos) addFloat(pos, "NIVEAU SUPÉRIEUR !", "#ffd23a", 20);
        break;
      case "potion": if (pos) burst(pos, f.c === "b" ? "#5a96f0" : "#ef5b52", 10, 30); break;
      case "wave": if (pos) { G.rings.push({ x: pos.x, y: pos.y, t0: now, dur: 800, r: 3.5, col: "#b48cff" }); burst(pos, "#b48cff", 24, 60); } break;
    }
  }

  function onSelf(s) {
    const first = !G.self;
    G.self = s;
    $("#st-name").textContent = s.name;
    $("#st-name").style.color = G.kingdoms[s.kingdom].color;
    $("#st-lvl").textContent = "Niv. " + s.lvl;
    const pct = s.lvl >= s.maxLevel ? 100 : (s.xp / s.xpNext) * 100;
    $("#bar-xp").style.width = pct + "%";
    $("#txt-xp").textContent = s.lvl >= s.maxLevel ? "Niveau maximum" : `XP ${s.xp} / ${s.xpNext} (${pct.toFixed(1)} %)`;
    document.querySelectorAll(".hb.skill").forEach((b) => {
      const sk = G.skills.find((k) => k.id === +b.dataset.n);
      b.classList.toggle("locked", s.lvl < sk.lvl);
      b.querySelector(".lock").textContent = "Niv. " + sk.lvl;
      b.title = `${sk.name} — ${sk.desc} (${sk.mp} PM, ${sk.cd} s)`;
    });
    document.querySelectorAll(".hb.pot").forEach((b) => {
      const key = b.dataset.key;
      let n = s.inv.reduce((a, x) => a + (x && x.key === key ? x.n : 0), 0);
      if (key === "potion_rouge") n += s.inv.reduce((a, x) => a + (x && x.key === "grande_potion" ? x.n : 0), 0);
      b.querySelector("em").textContent = n;
      b.style.opacity = n ? 1 : 0.45;
    });
    renderInventory();
    if (G.openPanel === "shop") renderShop();
    if (G.openPanel === "smith") renderSmith();
    if (first) G.me.d = Math.PI / 2;
  }

  function updateBars() {
    const s = G.stat;
    $("#bar-hp").style.width = (100 * s.hp / s.mh) + "%";
    $("#txt-hp").textContent = `${s.hp} / ${s.mh}`;
    $("#bar-mp").style.width = (100 * s.mp / s.mm) + "%";
    $("#txt-mp").textContent = `${s.mp} / ${s.mm}`;
    $("#st-buff").classList.toggle("hidden", !s.b);
  }

  // ======================= Effets visuels =======================
  function addFloat(pos, text, color, size, dx = 0) {
    G.floats.push({ x: pos.x, y: pos.y, text, color, size, t0: performance.now(), dx: dx + (Math.random() - 0.5) * 0.3 });
  }
  function burst(pos, color, n, speed) {
    const [sx, sy] = Art.iso(pos.x, pos.y);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      G.parts.push({ x: sx, y: sy - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 30, life: 0.5 + Math.random() * 0.4, t: 0, color, r: 1.5 + Math.random() * 2 });
    }
  }

  // ======================= Déplacements =======================
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
    const p = findPath(G.map.w, G.map.h, blockedGrid(), G.me.x, G.me.y, x, y, 5000);
    G.me.path = p || [];
    G.me.pathGoal = [x, y];
    if (p && p.length) p[p.length - 1] = walkable(x, y) ? [x, y] : p[p.length - 1];
    return !!p;
  }
  function stepMove(dx, dy, dist) {
    const me = G.me;
    const nx = me.x + dx * dist, ny = me.y + dy * dist;
    if (walkable(nx, ny)) { me.x = nx; me.y = ny; }
    else if (walkable(nx, me.y)) me.x = nx;
    else if (walkable(me.x, ny)) me.y = ny;
    else return false;
    return true;
  }
  // direction écran -> direction monde
  function screenToWorldDir(kx, ky) {
    const wx = kx / 2 + ky, wy = ky - kx / 2;
    const l = Math.hypot(wx, wy) || 1;
    return [wx / l, wy / l];
  }

  function update(dt, now) {
    const me = G.me;
    if (!G.map) return;
    if (G.stat.dead) { me.moving = false; sendMove(now); return; }

    // Commandes directes (clavier / joystick)
    let kx = 0, ky = 0;
    if (G.keys.has("KeyW") || G.keys.has("ArrowUp")) ky -= 1;
    if (G.keys.has("KeyS") || G.keys.has("ArrowDown")) ky += 1;
    if (G.keys.has("KeyA") || G.keys.has("ArrowLeft")) kx -= 1;
    if (G.keys.has("KeyD") || G.keys.has("ArrowRight")) kx += 1;
    if (G.joy.active && Math.hypot(G.joy.x, G.joy.y) > 0.2) { kx = G.joy.x; ky = G.joy.y; }

    // Maintien du clic : on suit le curseur
    if (G.mouse.down && G.mouse.holdMove && now - (G.mouse.lastHold || 0) > 180) {
      G.mouse.lastHold = now;
      const w = screenToWorld(G.mouse.x, G.mouse.y);
      pathTo(w.x, w.y);
    }

    let moved = false;
    if (kx || ky) {
      const [wx, wy] = screenToWorldDir(kx, ky);
      me.path = []; me.targetId = null; me.npcTarget = null;
      if (stepMove(wx, wy, SPEED * dt)) moved = true;
      me.d = Math.atan2(wy, wx);
    } else {
      // Cible : monstre
      const t = me.targetId && G.mons.get(me.targetId);
      if (t) {
        const d = Math.hypot(t.rx - me.x, t.ry - me.y), range = t.s ? ATK_RANGE + 0.5 : ATK_RANGE;
        if (d > range) {
          if (now > me.repathAt) { me.repathAt = now + 350; pathTo(t.rx, t.ry); }
        } else {
          me.path = [];
          me.d = Math.atan2(t.ry - me.y, t.rx - me.x);
          if (now >= me.nextAtk) { me.nextAtk = now + ATK_CD; G.socket.emit("atk", { t: t.id }); }
        }
      }
      // Cible : PNJ
      if (me.npcTarget) {
        const n = me.npcTarget;
        if (Math.hypot(n.x - me.x, n.y - me.y) < 2.4) { me.path = []; me.npcTarget = null; openNpc(n); }
      }
      // Suivre le chemin
      if (me.path.length) {
        let remain = SPEED * dt;
        while (remain > 0 && me.path.length) {
          const [px, py] = me.path[0];
          const dx = px - me.x, dy = py - me.y, d = Math.hypot(dx, dy);
          if (d < 0.02) { me.path.shift(); continue; }
          const step = Math.min(d, remain);
          me.d = Math.atan2(dy, dx);
          if (!stepMove(dx / d, dy / d, step)) { me.path = []; break; }
          moved = true;
          remain -= step;
          if (step >= d) me.path.shift();
        }
      }
    }
    if (G.atkHeld) tryAttack();
    me.moving = moved;
    sendMove(now);

    // Ferme boutique / forge si on s'éloigne
    if (G.openPanel === "shop" || G.openPanel === "smith") {
      const n = G.npcs.find((x) => x.kind === (G.openPanel === "shop" ? "merchant" : "smith"));
      if (Math.hypot(n.x - me.x, n.y - me.y) > 4.5) closePanels();
    }

    // Lissage des autres entités
    const k = Math.min(1, dt * 12);
    for (const p of G.players.values()) { p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; }
    for (const m of G.mons.values()) { m.rx += (m.x - m.rx) * k; m.ry += (m.y - m.ry) * k; }
    G.cam.x += (me.x - G.cam.x) * Math.min(1, dt * 10);
    G.cam.y += (me.y - G.cam.y) * Math.min(1, dt * 10);
  }

  function sendMove(now) {
    const me = G.me;
    if (now - G.lastSent < 66) return;
    if (!me.moving && !G.sentMoving && me.lastSentX === me.x && me.lastSentY === me.y) return;
    G.lastSent = now;
    G.sentMoving = me.moving;
    me.lastSentX = me.x; me.lastSentY = me.y;
    G.socket.emit("mv", { x: +me.x.toFixed(3), y: +me.y.toFixed(3), d: +me.d.toFixed(2), m: me.moving ? 1 : 0 });
  }

  function nearestMonster(maxD) {
    let best = null, bd = maxD;
    for (const m of G.mons.values()) {
      const d = Math.hypot(m.rx - G.me.x, m.ry - G.me.y) - (m.s ? 0.3 : 0);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function tryAttack() {
    const me = G.me, now = performance.now();
    if (G.stat.dead) return;
    if (!me.targetId || !G.mons.has(me.targetId)) {
      const m = nearestMonster(7);
      if (m) { me.targetId = m.id; me.npcTarget = null; return; }
      if (now >= me.nextAtk) { me.nextAtk = now + ATK_CD; G.socket.emit("atk", {}); }
    }
  }

  function useSkill(n) {
    const sk = G.skills.find((s) => s.id === n);
    if (!sk || !G.self || G.stat.dead) return;
    if (G.self.lvl < sk.lvl) return toast(`${sk.name} : niveau ${sk.lvl} requis.`, "bad");
    const cd = G.cds[n];
    if (cd && performance.now() < cd.until) return;
    if (n === 2 && !G.me.targetId) { const m = nearestMonster(2.5); if (m) G.me.targetId = m.id; }
    G.socket.emit("skill", { n, t: G.me.targetId });
  }
  function usePotion(key) { G.socket.emit("usekey", { key }); }

  // ======================= Caméra et projection =======================
  function view() { return { w: canvas.clientWidth, h: canvas.clientHeight }; }
  function worldToScreen(x, y) {
    const [ix, iy] = Art.iso(x, y), [cx, cy] = Art.iso(G.cam.x, G.cam.y), v = view();
    return [(ix - cx) * G.zoom + v.w / 2, (iy - cy) * G.zoom + v.h / 2];
  }
  function screenToWorld(sx, sy) {
    const v = view(), [cx, cy] = Art.iso(G.cam.x, G.cam.y);
    const ix = (sx - v.w / 2) / G.zoom + cx, iy = (sy - v.h / 2) / G.zoom + cy;
    const a = ix / (TW / 2), b = iy / (TH / 2);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }

  function pick(sx, sy) {
    let best = null, bd = 1e9;
    const consider = (e, x, y, kind, h) => {
      const [px, py] = worldToScreen(x, y);
      const z = G.zoom;
      if (sx > px - 20 * z && sx < px + 20 * z && sy > py - h * z && sy < py + 10 * z) {
        const d = Math.hypot(sx - px, sy - (py - h * z / 2));
        if (d < bd) { bd = d; best = { e, kind }; }
      }
    };
    for (const m of G.mons.values()) consider(m, m.rx, m.ry, "mon", m.s ? 90 : 50);
    for (const n of G.npcs) consider(n, n.x, n.y, "npc", 60);
    for (const d of G.drops) consider(d, d.x, d.y, "drop", 18);
    for (const p of G.players.values()) if (p.id !== G.myId) consider(p, p.rx, p.ry, "player", 56);
    return best;
  }

  // ======================= Dessin =======================
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    G.dpr = dpr;
    G.zoom = Math.max(0.68, Math.min(1.15, Math.min(innerWidth, innerHeight) / 620));
  }
  addEventListener("resize", resize);
  resize();

  function render(now) {
    const v = view(), z = G.zoom;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.fillStyle = "#16210f";
    ctx.fillRect(0, 0, v.w, v.h);
    if (!G.map) return;
    const [cx, cy] = Art.iso(G.cam.x, G.cam.y);
    ctx.setTransform(G.dpr * z, 0, 0, G.dpr * z, G.dpr * (v.w / 2 - cx * z), G.dpr * (v.h / 2 - cy * z));
    const left = cx - v.w / 2 / z - TW, right = cx + v.w / 2 / z + TW, top = cy - v.h / 2 / z - TH * 2, bottom = cy + v.h / 2 / z + TH * 6;
    const inView = (sx, sy, pad = 0) => sx > left - pad && sx < right + pad && sy > top - pad && sy < bottom + pad * 3;

    // Sol
    const m = G.map;
    const range = Math.ceil(Math.max(v.w, v.h) / z / TH) + 2;
    const x0 = Math.max(0, Math.floor(G.cam.x - range)), x1 = Math.min(m.w - 1, Math.ceil(G.cam.x + range));
    const y0 = Math.max(0, Math.floor(G.cam.y - range)), y1 = Math.min(m.h - 1, Math.ceil(G.cam.y + range));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [sx, sy] = Art.iso(x, y);
      if (!inView(sx, sy)) continue;
      const t = m.tiles[x + y * m.w];
      if (t === 4) Art.drawWater(ctx, sx, sy, x, y, now);
      else ctx.drawImage(Art.tile(t, (Art.hash(x * 7919 + y * 104729) * 4) | 0), sx - TW / 2 - 1, sy - 1);
    }

    // Cercle de sélection + butin au sol
    const tgt = G.me.targetId && G.mons.get(G.me.targetId);
    if (tgt) {
      const [sx, sy] = Art.iso(tgt.rx, tgt.ry);
      ctx.strokeStyle = "rgba(255,80,60,0.9)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, tgt.s ? 30 : 20, tgt.s ? 14 : 9, 0, 0, 7); ctx.stroke();
    }
    for (const d of G.drops) {
      const [sx, sy] = Art.iso(d.x, d.y);
      if (!inView(sx, sy)) continue;
      const locked = d.o && d.o !== G.myId;
      const bob = Math.sin(now / 300 + d.x * 3) * 2;
      ctx.globalAlpha = locked ? 0.45 : 1;
      if (d.k !== "gold") {
        const it = G.items[d.k];
        const col = it && it.tier >= 3 ? "#5fe0a8" : it && (it.type === "weapon" || it.type === "armor" || it.type === "helmet") ? "#a6e3ff" : it && it.type === "material" ? "#b48cff" : "#ffffff";
        const grd = ctx.createRadialGradient(sx, sy - 6, 1, sx, sy - 6, 16);
        grd.addColorStop(0, col + "aa"); grd.addColorStop(1, col + "00");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sx, sy - 6, 16, 0, 7); ctx.fill();
      }
      ctx.drawImage(Art.icon(d.k, G.items, 24), sx - 12, sy - 20 + bob);
      ctx.globalAlpha = 1;
    }

    // Effets au sol (cercles)
    for (const r of G.rings) {
      const p = Math.max(0, (now - r.t0) / r.dur);
      if (p > 1 || r.pillar || r.line) continue;
      const [sx, sy] = Art.iso(r.x, r.y);
      ctx.strokeStyle = r.col; ctx.globalAlpha = 1 - p; ctx.lineWidth = 3;
      const rad = r.r * (r.spin ? 1 : p) * TW / 2;
      ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad / 2, 0, 0, 7); ctx.stroke();
      if (r.spin) {
        for (let i = 0; i < 3; i++) {
          const a = p * Math.PI * 4 + i * 2.1;
          ctx.beginPath(); ctx.ellipse(sx, sy - 18, rad * 0.9, rad * 0.45, 0, a, a + 1.2); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Tri par profondeur : décor, PNJ, joueurs, monstres
    const list = [];
    const meDepth = G.me.x + G.me.y;
    const [mex, mey] = Art.iso(G.me.x, G.me.y);
    for (const o of G.objects) {
      const [sx, sy] = Art.iso(o.cx, o.cy);
      if (!inView(sx, sy, 160)) continue;
      list.push({ depth: o.depth, draw: () => {
        let a = 1;
        if (o.depth > meDepth + 0.5 && Math.abs(sx - mex) < (o.t === "house" ? 110 : 34) && sy - mey > 0 && sy - mey < (o.t === "house" ? 190 : 120)) a = 0.45;
        ctx.globalAlpha = a;
        ctx.drawImage(o.sprite.c, sx - o.sprite.ax, sy - o.sprite.ay);
        ctx.globalAlpha = 1;
      } });
    }
    for (const n of G.npcs) {
      const [sx, sy] = Art.iso(n.x, n.y);
      list.push({ depth: n.x + n.y, draw: () => { ctx.save(); ctx.translate(sx, sy); Art.drawNpc(ctx, n, now); ctx.restore(); }, label: () => label(sx, sy - 66, n.name, "#f2c14e") });
    }
    for (const p of G.players.values()) {
      const isMe = p.id === G.myId;
      const x = isMe ? G.me.x : p.rx, y = isMe ? G.me.y : p.ry;
      const [sx, sy] = Art.iso(x, y);
      if (!inView(sx, sy, 60)) continue;
      const e = isMe ? { ...p, d: G.me.d, moving: G.me.moving, swingT: p.swingT, spinT: p.spinT, b: G.stat.b > 0 } : p;
      e.buff = !!e.b;
      const kc = G.kingdoms[p.k] ? G.kingdoms[p.k].color : "#fff";
      list.push({ depth: x + y + 0.01, draw: () => {
        ctx.save(); ctx.translate(sx, sy);
        if (p.dead) { ctx.globalAlpha = 0.5; ctx.rotate(-1.3); }
        Art.drawPlayer(ctx, e, now, kc);
        ctx.restore();
      }, label: () => {
        label(sx, sy - 74, `Niv.${p.l} ${p.n}`, kc);
        if (!isMe && p.hp < p.mh) hpBar(sx, sy - 70, p.hp / p.mh, "#3ccf5a");
      } });
    }
    for (const mo of G.mons.values()) {
      const [sx, sy] = Art.iso(mo.rx, mo.ry);
      if (!inView(sx, sy, 80)) continue;
      const def = mo.s ? G.sdefs[mo.t] : G.mdefs[mo.t];
      if (!def) continue;
      const showInfo = mo.s || mo.hp < mo.mh || mo.id === G.me.targetId || (G.hover && G.hover.e === mo);
      list.push({ depth: mo.rx + mo.ry, draw: () => {
        ctx.save(); ctx.translate(sx, sy);
        if (mo.s) Art.drawStone(ctx, mo, def, now); else Art.drawMonster(ctx, mo, def, now);
        ctx.restore();
      }, label: showInfo ? () => {
        const h = mo.s ? 100 : 56 * (def.size || 1);
        const lv = def.lvl - (G.self ? G.self.lvl : 1);
        const col = lv >= 4 ? "#ff6b5e" : lv >= 1 ? "#ffb347" : lv <= -5 ? "#9a9a9a" : "#ffffff";
        label(sx, sy - h - 6, `${def.name} Niv.${def.lvl}`, col);
        hpBar(sx, sy - h, mo.hp / mo.mh, "#e03a3a", mo.s ? 60 : 40);
      } : null });
    }
    list.sort((a, b) => a.depth - b.depth);
    for (const it of list) it.draw();

    // Effets au-dessus
    for (const r of G.rings) {
      const p = Math.max(0, (now - r.t0) / r.dur);
      if (p > 1) continue;
      const [sx, sy] = Art.iso(r.x, r.y);
      if (r.pillar) {
        const grd = ctx.createLinearGradient(0, sy - 160, 0, sy);
        grd.addColorStop(0, "rgba(255,210,58,0)"); grd.addColorStop(1, `rgba(255,210,58,${0.6 * (1 - p)})`);
        ctx.fillStyle = grd; ctx.fillRect(sx - 22, sy - 160, 44, 160);
      } else if (r.line) {
        const [ddx, ddy] = Art.screenDir(r.d);
        ctx.strokeStyle = r.col; ctx.globalAlpha = 1 - p; ctx.lineWidth = 6 * (1 - p) + 1;
        ctx.beginPath(); ctx.moveTo(sx, sy - 24); ctx.lineTo(sx + ddx * 80, sy - 24 + ddy * 80); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // Arcs de coups d'épée
    for (const p of G.players.values()) {
      if (!p.swingT || now - p.swingT > 220) continue;
      const isMe = p.id === G.myId;
      const [sx, sy] = Art.iso(isMe ? G.me.x : p.rx, isMe ? G.me.y : p.ry);
      const d = isMe ? G.me.d : p.d;
      const [ddx, ddy] = Art.screenDir(d);
      const a = Math.atan2(ddy * 2, ddx), pr = (now - p.swingT) / 220;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - pr)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(sx, sy - 22, 40, 20, 0, a - 1.1 + pr * 0.4, a + 0.6 + pr * 0.6); ctx.stroke();
    }
    // Particules
    const dt = G.frameDt || 0.016;
    G.parts = G.parts.filter((pt) => (pt.t += dt) < pt.life);
    for (const pt of G.parts) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 120 * dt;
      ctx.globalAlpha = 1 - pt.t / pt.life;
      ctx.fillStyle = pt.color; ctx.fillRect(pt.x - pt.r / 2, pt.y - pt.r / 2, pt.r, pt.r);
    }
    ctx.globalAlpha = 1;
    G.rings = G.rings.filter((r) => now - r.t0 < r.dur);

    // Noms et barres de vie
    for (const it of list) if (it.label) it.label();

    // Textes flottants
    ctx.textAlign = "center";
    G.floats = G.floats.filter((f) => now - f.t0 < 1100);
    for (const f of G.floats) {
      const p = Math.max(0, (now - f.t0) / 1100);
      const [sx, sy] = Art.iso(f.x + f.dx * p, f.y + f.dx * p);
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.font = `800 ${f.size}px "Noto Sans", sans-serif`;
      ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.85)";
      const y = sy - 60 - p * 40;
      ctx.strokeText(f.text, sx, y); ctx.fillStyle = f.color; ctx.fillText(f.text, sx, y);
    }
    ctx.globalAlpha = 1;

    // Écran rouge quand on prend des coups
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    if (G.hurtFlash && now - G.hurtFlash < 250) {
      const g = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.7);
      g.addColorStop(0, "rgba(160,0,0,0)"); g.addColorStop(1, `rgba(160,0,0,${0.35 * (1 - (now - G.hurtFlash) / 250)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
    }
    if (G.stat.hp / G.stat.mh < 0.25 && !G.stat.dead) {
      const g = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
      g.addColorStop(0, "rgba(120,0,0,0)"); g.addColorStop(1, `rgba(120,0,0,${0.25 + 0.1 * Math.sin(now / 200)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, v.w, v.h);
    }
  }

  function label(x, y, text, color) {
    ctx.font = '600 11.5px "Noto Sans", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function hpBar(x, y, pct, color, w = 40) {
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * Math.max(0, pct), 4);
  }

  // ======================= Mini-carte =======================
  let miniImg = null;
  const MS = 4; // pixels par case
  function buildMinimap() {
    const m = G.map, c = document.createElement("canvas");
    c.width = (m.w + m.h) * MS / 2 * 2; c.height = (m.w + m.h) * MS / 2;
    const g = c.getContext("2d");
    const cols = { 0: "#4f8434", 1: "#335a2a", 2: "#a9835a", 3: "#8c877c", 4: "#2a5f88", 5: "#c9b47e" };
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const t = m.tiles[x + y * m.w];
      const px = (x - y) * MS + m.h * MS, py = (x + y) * MS / 2;
      g.fillStyle = m.blocked[x + y * m.w] && t !== 4 ? (t === 3 ? "#5a3a2a" : "#22401c") : cols[t];
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + MS, py + MS / 2); g.lineTo(px, py + MS); g.lineTo(px - MS, py + MS / 2); g.fill();
    }
    miniImg = c;
  }
  const mini = $("#minimap"), mctx = mini.getContext("2d");
  function renderMinimap(now) {
    if (!miniImg) return;
    const m = G.map, W = mini.width, H = mini.height;
    const px = (G.me.x - G.me.y) * MS + m.h * MS, py = (G.me.x + G.me.y) * MS / 2;
    mctx.fillStyle = "#0a0807"; mctx.fillRect(0, 0, W, H);
    mctx.drawImage(miniImg, W / 2 - px, H / 2 - py);
    const dot = (x, y, col, r) => {
      const dx = (x - y) * MS + m.h * MS - px + W / 2, dy = (x + y) * MS / 2 - py + H / 2;
      mctx.fillStyle = col; mctx.beginPath(); mctx.arc(dx, dy, r, 0, 7); mctx.fill();
    };
    for (const n of G.npcs) dot(n.x, n.y, "#f2c14e", 2.5);
    for (const mo of G.mons.values()) dot(mo.rx, mo.ry, mo.s ? (Math.sin(now / 200) > 0 ? "#d9b3ff" : "#7b3fe4") : "#e04848", mo.s ? 4 : 1.8);
    for (const p of G.players.values()) if (p.id !== G.myId) dot(p.rx, p.ry, G.kingdoms[p.k].color, 2.8);
    mctx.save(); mctx.translate(W / 2, H / 2);
    const [ddx, ddy] = Art.screenDir(G.me.d); mctx.rotate(Math.atan2(ddy, ddx));
    mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.moveTo(6, 0); mctx.lineTo(-4, -4); mctx.lineTo(-2, 0); mctx.lineTo(-4, 4); mctx.fill();
    mctx.restore();
    const dv = Math.hypot(G.me.x - 18, G.me.y - 18);
    $("#zone-name").textContent = ZONES[dv < 11 ? 0 : dv < 28 ? 1 : dv < 50 ? 2 : dv < 74 ? 3 : 4];
  }

  // ======================= Interface =======================
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
      line.appendChild(b); line.appendChild(document.createTextNode(c.text));
    }
    log.appendChild(line);
    while (log.children.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }
  function onChat(c) {
    addChat(c);
    if (!c.sys) for (const p of G.players.values()) if (p.n === c.from) { const pos = { x: p.id === G.myId ? G.me.x : p.rx, y: p.id === G.myId ? G.me.y : p.ry }; addFloat(pos, c.text.length > 30 ? c.text.slice(0, 30) + "…" : c.text, "#ffffff", 12); }
  }

  const chatInput = $("#chat-input");
  chatInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      const t = chatInput.value.trim();
      if (t) G.socket.emit("chat", { text: t });
      chatInput.value = "";
      chatInput.blur();
      $("#chat").classList.remove("open");
    } else if (e.key === "Escape") { chatInput.blur(); $("#chat").classList.remove("open"); }
  });
  $("#chat-toggle").onclick = () => { $("#chat").classList.toggle("open"); if ($("#chat").classList.contains("open")) chatInput.focus(); };

  // ----- Inventaire -----
  let selSlot = null;
  function buildInventory() {
    const grid = $("#inv-grid");
    grid.innerHTML = "";
    for (let i = 0; i < 30; i++) {
      const d = document.createElement("div");
      d.className = "slot"; d.dataset.i = i;
      d.addEventListener("click", (e) => { e.stopPropagation(); slotClick("inv", i, d); });
      d.addEventListener("contextmenu", (e) => { e.preventDefault(); const s = G.self && G.self.inv[i]; if (s) G.socket.emit("use", { slot: i }); hideTip(); });
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
    if (!s) { if (small) small.style.display = ""; return; }
    if (small) small.style.display = "none";
    const c = Art.icon(s.key, G.items, 40);
    const cv = document.createElement("canvas"); cv.width = 40; cv.height = 40; cv.getContext("2d").drawImage(c, 0, 0);
    d.appendChild(cv);
    if (s.n > 1) { const n = document.createElement("span"); n.className = "n"; n.textContent = s.n; d.appendChild(n); }
    if (s.plus) { const p = document.createElement("span"); p.className = "plus"; p.textContent = "+" + s.plus; d.appendChild(p); }
  }

  function renderInventory() {
    const s = G.self;
    if (!s) return;
    document.querySelectorAll("#inv-grid .slot").forEach((d, i) => fillSlot(d, s.inv[i]));
    document.querySelectorAll(".eq-slot").forEach((d) => fillSlot(d, s.eq[d.dataset.slot]));
    $("#gold").textContent = s.gold.toLocaleString("fr-FR");
    $("#stats").innerHTML = `<div>Niveau <b>${s.lvl}</b></div><div>Attaque <b>${s.atk}</b></div><div>Défense <b>${s.def}</b></div><div>PV max <b>${s.maxHp}</b></div><div>PM max <b>${s.maxMp}</b></div><div style="color:${G.kingdoms[s.kingdom].color}">${G.kingdoms[s.kingdom].name}</div>`;
  }

  function nearNpc(kind) { const n = G.npcs.find((x) => x.kind === kind); return n && Math.hypot(n.x - G.me.x, n.y - G.me.y) <= 4; }

  function itemInfo(s) {
    const it = G.items[s.key];
    const plus = s.plus || 0;
    let h = `<div class="t">${it.name}${plus ? " +" + plus : ""}</div>`;
    if (it.atk) h += `<div>Attaque : ${Math.round(it.atk * (1 + 0.15 * plus) + plus * 2)}</div>`;
    if (it.def) h += `<div>Défense : ${Math.round(it.def + plus * 1.5)}</div>`;
    if (it.hp) h += `<div>PV : +${Math.round(it.hp * (1 + 0.1 * plus))}</div>`;
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
    t.innerHTML = itemInfo(s);
    t.classList.remove("hidden");
    const r = el.getBoundingClientRect();
    t.style.left = Math.max(8, Math.min(innerWidth - 240, r.left - 240)) + "px";
    t.style.top = Math.max(8, Math.min(innerHeight - 160, r.top)) + "px";
  }
  function hideTip() { $("#tooltip").classList.add("hidden"); }
  function hideMenu() { $("#item-menu").classList.add("hidden"); document.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel")); selSlot = null; }

  function slotClick(from, slot, el) {
    const s = from === "eq" ? G.self.eq[slot] : G.self.inv[slot];
    hideTip();
    if (!s) return hideMenu();
    if (selSlot && selSlot.from === from && selSlot.slot === slot) return hideMenu();
    hideMenu();
    selSlot = { from, slot };
    el.classList.add("sel");
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
  function buildShop() { renderShop(); }
  function renderShop() {
    const list = $("#shop-list");
    list.innerHTML = "";
    for (const key of G.shop) {
      const it = G.items[key];
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
    const gold = Math.round(80 * (it.tier || 1) * Math.pow(plus + 1, 1.8));
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
    if (r.ok) burst(G.me, "#ffd23a", 20, 50);
  }

  // ----- PNJ -----
  function openNpc(n) {
    if (n.kind === "merchant") openPanel("shop");
    else if (n.kind === "smith") openPanel("smith");
    else {
      $("#dlg-title").textContent = n.name;
      $("#dlg-body").innerHTML = `
        <p>Bienvenue, jeune Lame. Les <b>Pierres maudites</b> tombent du ciel et répandent des monstres sur nos terres.</p>
        <p>• <b>Clique</b> sur le sol pour marcher, sur un monstre pour l'attaquer. Tu peux aussi utiliser <b>ZQSD</b>/flèches et <b>Espace</b>.<br>
        • <b>1, 2, 3</b> : compétences. <b>4, 5</b> : potions. <b>I</b> : inventaire. <b>Entrée</b> : discuter.<br>
        • Commence par les <b>loups gris</b> autour du village, puis les collines.<br>
        • Frappe une <b>Pierre maudite</b> : elle invoque des vagues de monstres, mais sa destruction rapporte beaucoup d'expérience et des <b>Pierres de forge</b>.<br>
        • Le <b>forgeron</b> améliore ton équipement jusqu'à +9. Attention : à partir de +4, l'échec coûte cher !<br>
        • La <b>marchande</b> vend des potions et rachète ton butin.</p>`;
      openPanel("dialog");
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

  // ----- Mort -----
  function showDeath() {
    $("#death").classList.remove("hidden");
    const b = $("#btn-respawn"); b.disabled = true;
    let s = 3;
    b.textContent = `Revenir au village (${s})`;
    const iv = setInterval(() => { s--; if (s <= 0) { clearInterval(iv); b.disabled = false; b.textContent = "Revenir au village"; } else b.textContent = `Revenir au village (${s})`; }, 1000);
  }
  $("#btn-respawn").onclick = () => G.socket.emit("respawn");

  // ======================= Commandes =======================
  addEventListener("keydown", (e) => {
    if (!G.started || document.activeElement === chatInput) return;
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Enter") { e.preventDefault(); $("#chat").classList.add("open"); chatInput.focus(); return; }
    if (e.code === "Escape") { closePanels(); G.me.targetId = null; return; }
    if (e.code === "KeyI" || e.code === "KeyB") { toggleInv(); return; }
    if (e.code === "Space") { e.preventDefault(); G.atkHeld = true; tryAttack(); return; }
    if (e.code === "Digit1" || e.code === "Numpad1") return useSkill(1);
    if (e.code === "Digit2" || e.code === "Numpad2") return useSkill(2);
    if (e.code === "Digit3" || e.code === "Numpad3") return useSkill(3);
    if (e.code === "Digit4" || e.code === "Numpad4") return usePotion("potion_rouge");
    if (e.code === "Digit5" || e.code === "Numpad5") return usePotion("potion_bleue");
    if (e.code === "Tab") { e.preventDefault(); const m = nearestMonster(10); if (m) G.me.targetId = m.id; return; }
    G.keys.add(e.code);
  });
  addEventListener("keyup", (e) => { G.keys.delete(e.code); if (e.code === "Space") G.atkHeld = false; });
  addEventListener("blur", () => { G.keys.clear(); G.atkHeld = false; G.mouse.down = false; });

  function worldClick(sx, sy) {
    if (!G.started || G.stat.dead) return;
    const hit = pick(sx, sy), me = G.me;
    me.npcTarget = null;
    if (hit && hit.kind === "mon") { me.targetId = hit.e.id; me.repathAt = 0; G.mouse.holdMove = false; return; }
    me.targetId = null;
    if (hit && hit.kind === "npc") { me.npcTarget = hit.e; pathTo(hit.e.x, hit.e.y); G.mouse.holdMove = false; return; }
    if (hit && hit.kind === "drop") { pathTo(hit.e.x, hit.e.y); G.mouse.holdMove = false; return; }
    const w = screenToWorld(sx, sy);
    pathTo(w.x, w.y);
    G.mouse.holdMove = !isTouch;
    const [ix, iy] = [w.x, w.y];
    G.rings.push({ x: ix, y: iy, t0: performance.now(), dur: 400, r: 0.6, col: "#e9c46a" });
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    closePanels(G.openPanel === "inv" ? "inv" : null);
    hideMenu();
    if (document.activeElement === chatInput) chatInput.blur();
    G.mouse.down = true; G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.mouse.lastHold = performance.now();
    worldClick(e.clientX, e.clientY);
  });
  addEventListener("pointerup", () => { G.mouse.down = false; G.mouse.holdMove = false; });
  canvas.addEventListener("pointermove", (e) => {
    G.mouse.x = e.clientX; G.mouse.y = e.clientY;
    if (e.pointerType === "mouse" && G.started) {
      G.hover = pick(e.clientX, e.clientY);
      canvas.style.cursor = G.hover ? (G.hover.kind === "mon" ? "crosshair" : "pointer") : "default";
    }
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Joystick tactile
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
    G.me.path = []; G.me.targetId = null;
  }

  // Barre de raccourcis
  const atkBtn = $("#hb-atk");
  atkBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); G.atkHeld = true; tryAttack(); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => atkBtn.addEventListener(ev, () => { G.atkHeld = false; }));
  document.querySelectorAll(".hb.skill").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); useSkill(+b.dataset.n); }));
  document.querySelectorAll(".hb.pot").forEach((b) => b.addEventListener("pointerdown", (e) => { e.preventDefault(); usePotion(b.dataset.key); }));
  $("#hb-inv").addEventListener("click", toggleInv);

  function updateCooldowns(now) {
    document.querySelectorAll(".hb.skill").forEach((b) => {
      const c = G.cds[+b.dataset.n];
      const p = c ? Math.max(0, (c.until - now) / c.ms) : 0;
      b.querySelector(".cd").style.transform = `scaleY(${p})`;
    });
    const t = G.me.targetId && G.mons.get(G.me.targetId);
    const tf = $("#target-frame");
    if (t) {
      const def = t.s ? G.sdefs[t.t] : G.mdefs[t.t];
      tf.classList.remove("hidden");
      $("#tg-name").textContent = `${def.name} · Niv. ${def.lvl} · ${t.hp.toLocaleString("fr-FR")} / ${t.mh.toLocaleString("fr-FR")}`;
      $("#bar-tg").style.width = (100 * t.hp / t.mh) + "%";
    } else tf.classList.add("hidden");
  }

  // ======================= Boucle =======================
  let last = performance.now(), miniT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; G.frameDt = dt;
    if (G.started) {
      try { update(dt, now); } catch (err) { console.error(err); }
      updateCooldowns(now);
      if (now - miniT > 100) { miniT = now; renderMinimap(now); }
    }
    try { render(now); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
