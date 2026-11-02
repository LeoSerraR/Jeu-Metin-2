// Logique du monde : joueurs, monstres, pierres maudites, combat, butin, forge, boutique.
const { ITEMS, MONSTERS, STONES, SKILLS, UPGRADE, SHOP, KINGDOMS, xpToNext, MAX_LEVEL } = require("./data");
const { generateMap } = require("./map");
const store = require("./store");

const TICK = 50;               // 20 mises à jour par seconde
const VIEW = 26;               // rayon de visibilité (en cases)
const INV_SIZE = 30;
const PLAYER_SPEED = 4.2;      // cases par seconde
const SPAWNS = [
  ["loup", 1, 40], ["loup_noir", 2, 26], ["sanglier", 2, 24],
  ["bandit", 3, 34], ["chef_bandit", 3, 7], ["spectre", 4, 22],
];
const STONE_RULES = [
  { key: "pierre_maudite", zones: [2], max: 3 },
  { key: "pierre_chaos", zones: [3, 4], max: 2 },
];

const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = (v) => Math.round(v * 100) / 100;

class Game {
  constructor(io) {
    this.io = io;
    this.map = generateMap();
    this.players = new Map();
    this.monsters = new Map();
    this.drops = new Map();
    this.respawns = [];
    this.fx = [];
    this.nid = 1;
    this.dropsDirty = true;
    this.nextStoneCheck = 0;
    for (const [type, zone, count] of SPAWNS) {
      for (let i = 0; i < count; i++) {
        const spot = this.randomFree(zone);
        if (spot) this.spawnMonster(type, spot[0] + 0.5, spot[1] + 0.5);
      }
    }
    // Quelques pierres dès le départ
    for (const rule of STONE_RULES) for (let i = 0; i < rule.max - 1; i++) this.spawnStone(rule, true);
    setInterval(() => this.tick(), TICK);
    setInterval(() => this.saveAll(), 30000);
  }

  id(prefix) { return prefix + (this.nid++).toString(36); }

  randomFree(zone) {
    const list = this.map.freeByZone[zone];
    for (let tries = 0; tries < 30; tries++) {
      const s = list[Math.floor(Math.random() * list.length)];
      if (s && this.map.walkable(s[0] + 0.5, s[1] + 0.5)) return s;
    }
    return null;
  }

  // ---------- Monstres ----------
  spawnMonster(type, x, y, opts = {}) {
    const def = MONSTERS[type];
    const m = {
      id: this.id("m"), type, def, x, y, homeX: x, homeY: y, hp: def.hp, maxHp: def.hp,
      state: "idle", target: null, nextAtk: 0, wanderAt: Date.now() + rnd(1000, 6000), tx: x, ty: y,
      dir: rnd(0, Math.PI * 2), dmgBy: new Map(), fromStone: !!opts.fromStone, moving: false,
      angle: rnd(0, Math.PI * 2),
    };
    if (opts.aggroTarget) { m.state = "chase"; m.target = opts.aggroTarget; }
    this.monsters.set(m.id, m);
    return m;
  }

  spawnStone(rule, silent) {
    const zone = rule.zones[Math.floor(Math.random() * rule.zones.length)];
    const spot = this.randomFree(zone);
    if (!spot) return;
    const def = STONES[rule.key];
    const s = {
      id: this.id("s"), type: rule.key, def, isStone: true, x: spot[0] + 0.5, y: spot[1] + 0.5,
      hp: def.hp, maxHp: def.hp, dmgBy: new Map(), wave: 0, dir: 0, born: Date.now(),
    };
    this.monsters.set(s.id, s);
    this.map.blocked[spot[0] + spot[1] * this.map.w] = true;
    s.tile = spot;
    if (!silent) this.system(`💥 Une ${def.name} s'est écrasée ${["", "", "dans les collines", "dans la forêt des bandits", "dans la vallée des spectres"][zone]} !`);
  }

  moveEntity(e, tx, ty, speed, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 0.05) { e.moving = false; return true; }
    const step = Math.min(d, speed * dt);
    const nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
    e.dir = Math.atan2(dy, dx);
    e.moving = true;
    if (this.map.walkable(nx, ny)) { e.x = nx; e.y = ny; }
    else if (this.map.walkable(nx, e.y)) e.x = nx;
    else if (this.map.walkable(e.x, ny)) e.y = ny;
    else { e.moving = false; return true; }
    return step >= d;
  }

  updateMonster(m, now, dt) {
    if (m.isStone) return;
    const def = m.def;
    if (m.state === "idle") {
      if (def.aggro) {
        for (const p of this.players.values()) {
          if (!p.dead && dist(p, m) < 5) { m.state = "chase"; m.target = p.id; break; }
        }
      }
      if (m.state === "idle") {
        if (now > m.wanderAt) {
          m.tx = m.homeX + rnd(-3, 3); m.ty = m.homeY + rnd(-3, 3);
          m.wanderAt = now + rnd(3000, 8000);
        }
        this.moveEntity(m, m.tx, m.ty, def.speed * 0.45, dt);
      }
    }
    if (m.state === "chase") {
      const p = this.players.get(m.target);
      const fromHome = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (!p || p.dead || fromHome > 15) { m.state = "return"; m.target = null; return; }
      const d = dist(p, m);
      if (d > 1.15) {
        // Chaque monstre vise un point différent autour du joueur pour l'encercler
        this.moveEntity(m, p.x + Math.cos(m.angle) * 0.9, p.y + Math.sin(m.angle) * 0.9, def.speed, dt);
      } else {
        m.moving = false;
        m.dir = Math.atan2(p.y - m.y, p.x - m.x);
      }
      if (d <= 1.5 && now >= m.nextAtk) {
        m.nextAtk = now + 1400;
        const dmg = Math.max(1, Math.round(def.atk * rnd(0.85, 1.15) - p.def * 0.7));
        this.fx.push({ k: "matk", id: m.id });
        this.hurtPlayer(p, dmg, now);
      }
    }
    if (m.state === "return") {
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
      if (this.moveEntity(m, m.homeX, m.homeY, def.speed * 1.4, dt) || Math.hypot(m.x - m.homeX, m.y - m.homeY) < 0.3) {
        m.state = "idle"; m.hp = m.maxHp; m.dmgBy.clear();
      }
    }
  }

  damageMonster(p, m, raw, now) {
    let dmg = Math.max(1, Math.round(raw - m.def.def * 0.6));
    const crit = Math.random() < 0.08;
    if (crit) dmg = Math.round(dmg * 1.6);
    dmg = Math.min(dmg, Math.ceil(m.hp));
    m.hp -= dmg;
    m.dmgBy.set(p.id, (m.dmgBy.get(p.id) || 0) + dmg);
    p.inCombat = now;
    this.fx.push({ k: "dmg", id: m.id, v: dmg, c: crit ? 1 : 0, by: p.id });
    if (m.isStone) this.stoneHit(m, p);
    else if (m.state !== "chase") {
      m.state = "chase"; m.target = p.id;
      // Les monstres du même type autour viennent aider
      for (const o of this.monsters.values()) {
        if (!o.isStone && o !== m && o.type === m.type && o.state === "idle" && dist(o, m) < 4) { o.state = "chase"; o.target = p.id; }
      }
    }
    if (m.hp <= 0) this.killMonster(m, now);
  }

  stoneHit(s, p) {
    const lost = 1 - s.hp / s.maxHp;
    const due = Math.min(4, Math.floor(lost / 0.2));
    while (s.wave < due) {
      s.wave++;
      const def = s.def;
      for (let i = 0; i < def.waveSize; i++) {
        const type = def.waves[Math.floor(Math.random() * def.waves.length)];
        let x = s.x, y = s.y;
        for (let t = 0; t < 10; t++) {
          const a = rnd(0, Math.PI * 2), r = rnd(1.5, 3);
          if (this.map.walkable(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r)) { x = s.x + Math.cos(a) * r; y = s.y + Math.sin(a) * r; break; }
        }
        const m = this.spawnMonster(type, x, y, { fromStone: true, aggroTarget: p.id });
        m.homeX = s.x; m.homeY = s.y;
      }
      this.fx.push({ k: "wave", id: s.id });
    }
  }

  killMonster(m, now) {
    this.monsters.delete(m.id);
    this.fx.push({ k: "die", id: m.id, x: r2(m.x), y: r2(m.y) });
    const def = m.def;
    let top = null, topDmg = 0;
    for (const [pid, d] of m.dmgBy) if (d > topDmg) { topDmg = d; top = pid; }

    // Expérience
    for (const [pid, d] of m.dmgBy) {
      const p = this.players.get(pid);
      if (!p || dist(p, m) > 20) continue;
      let xp = def.xp;
      if (m.isStone) xp = Math.round(def.xp * (0.5 + 0.5 * d / m.maxHp));
      else if (pid !== top) continue;
      const diff = p.lvl - def.lvl;
      if (diff > 5) xp = Math.round(xp * Math.max(0.1, 1 - (diff - 5) * 0.2));
      this.giveXp(p, xp);
    }

    // Butin
    const owner = top;
    const gold = rint(def.gold[0], def.gold[1]);
    this.createDrop("gold", gold, m.x, m.y, owner);
    for (const [key, chance] of def.drops) if (Math.random() < chance) this.createDrop(key, 1, m.x, m.y, owner);

    if (m.isStone) {
      this.map.blocked[m.tile[0] + m.tile[1] * this.map.w] = false;
      const p = this.players.get(top);
      this.system(`✨ ${p ? p.name : "Un héros"} a détruit une ${def.name} !`);
    } else if (!m.fromStone) {
      this.respawns.push({ at: now + rnd(15000, 30000), type: m.type, x: m.homeX, y: m.homeY });
    }
  }

  createDrop(key, n, x, y, owner) {
    let dx = x, dy = y;
    for (let t = 0; t < 8; t++) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.2, 1.1);
      if (this.map.walkable(x + Math.cos(a) * r, y + Math.sin(a) * r)) { dx = x + Math.cos(a) * r; dy = y + Math.sin(a) * r; break; }
    }
    const d = { id: this.id("d"), key, n, x: r2(dx), y: r2(dy), owner, ownerUntil: Date.now() + 15000, expires: Date.now() + 120000 };
    this.drops.set(d.id, d);
    this.dropsDirty = true;
  }

  // ---------- Joueurs ----------
  newChar() {
    return {
      lvl: 1, xp: 0, gold: 150, hp: null, mp: null, x: 18.5, y: 17, dir: Math.PI / 2,
      inv: [{ key: "potion_rouge", n: 6 }, { key: "potion_bleue", n: 3 }],
      eq: { weapon: { key: "epee_bambou", plus: 0 }, armor: { key: "tunique_lin", plus: 0 }, helmet: null },
    };
  }

  join(socket, acc) {
    for (const o of this.players.values()) if (o.name.toLowerCase() === acc.name.toLowerCase()) {
      o.socket.emit("kicked", "Connexion depuis un autre appareil.");
      o.socket.disconnect(true);
    }
    const c = acc.char || this.newChar();
    const inv = new Array(INV_SIZE).fill(null);
    (c.inv || []).forEach((it, i) => { if (it && ITEMS[it.key] && i < INV_SIZE) inv[i] = it; });
    const p = {
      id: this.id("p"), socket, name: acc.name, kingdom: acc.kingdom,
      lvl: c.lvl, xp: c.xp, gold: c.gold, x: c.x, y: c.y, dir: c.dir || 0, inv, eq: c.eq,
      lastMove: Date.now(), nextAtk: 0, cds: {}, buffUntil: 0, nextPotion: 0, dead: false,
      inCombat: 0, lastHurt: 0, anim: 0, lastChat: 0, invFullMsg: 0,
    };
    if (!this.map.walkable(p.x, p.y)) { p.x = 18.5; p.y = 17; }
    this.recalc(p);
    p.hp = c.hp ? Math.min(c.hp, p.maxHp) : p.maxHp;
    p.mp = c.mp ? Math.min(c.mp, p.maxMp) : p.maxMp;
    this.players.set(p.id, p);
    socket.player = p;

    socket.emit("welcome", {
      id: p.id,
      map: { w: this.map.w, h: this.map.h, tiles: this.map.tiles, objects: this.map.objects, npcs: this.map.npcs, blocked: this.map.blocked.map((b) => (b ? 1 : 0)).join("") },
      items: ITEMS, monsters: Object.fromEntries(Object.entries(MONSTERS).map(([k, v]) => [k, { name: v.name, lvl: v.lvl, look: v.look, color: v.color, size: v.size, aggro: v.aggro }])),
      stones: Object.fromEntries(Object.entries(STONES).map(([k, v]) => [k, { name: v.name, lvl: v.lvl, color: v.color }])),
      skills: SKILLS, shop: SHOP, kingdoms: KINGDOMS,
      upgrade: { chances: UPGRADE.chances, max: UPGRADE.max },
    });
    this.dropsDirty = true;
    this.sendSelf(p);
    this.system(`${p.name} (${KINGDOMS[p.kingdom].name}) a rejoint le monde.`);
    if (!acc.char) {
      this.msg(p, "Bienvenue ! Parle à l'Ancien Wei au centre du village pour les bases.", "info");
    }
  }

  leave(p) {
    this.persist(p);
    store.save();
    this.players.delete(p.id);
    this.system(`${p.name} a quitté le monde.`);
  }

  persist(p) {
    store.saveChar(p.name, {
      lvl: p.lvl, xp: p.xp, gold: p.gold, hp: Math.round(p.hp), mp: Math.round(p.mp),
      x: r2(p.dead ? 18.5 : p.x), y: r2(p.dead ? 17 : p.y), dir: p.dir, inv: p.inv, eq: p.eq,
    });
  }

  saveAll() { for (const p of this.players.values()) this.persist(p); store.save(); }

  itemStats(slot) {
    if (!slot) return { atk: 0, def: 0, hp: 0 };
    const it = ITEMS[slot.key], plus = slot.plus || 0;
    return {
      atk: it.atk ? Math.round(it.atk * (1 + 0.15 * plus) + plus * 2) : 0,
      def: it.def ? Math.round(it.def + plus * 1.5) : 0,
      hp: it.hp ? Math.round(it.hp * (1 + 0.1 * plus)) : 0,
    };
  }

  recalc(p) {
    let atk = 12 + 3.2 * (p.lvl - 1), def = 2 + (p.lvl - 1), hp = 120 + 28 * (p.lvl - 1);
    for (const s of ["weapon", "armor", "helmet"]) {
      const st = this.itemStats(p.eq[s]);
      atk += st.atk; def += st.def; hp += st.hp;
    }
    p.atk = Math.round(atk); p.def = Math.round(def); p.maxHp = Math.round(hp);
    p.maxMp = 60 + 8 * (p.lvl - 1);
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }

  giveXp(p, xp) {
    if (p.lvl >= MAX_LEVEL) return;
    p.xp += xp;
    this.fx.push({ k: "xp", id: p.id, v: xp });
    while (p.lvl < MAX_LEVEL && p.xp >= xpToNext(p.lvl)) {
      p.xp -= xpToNext(p.lvl);
      p.lvl++;
      this.recalc(p);
      p.hp = p.maxHp; p.mp = p.maxMp;
      this.fx.push({ k: "lvl", id: p.id });
      this.msg(p, `Niveau ${p.lvl} atteint !`, "gold");
      const sk = SKILLS.find((s) => s.lvl === p.lvl);
      if (sk) this.msg(p, `Nouvelle compétence : ${sk.name}`, "gold");
      if (p.lvl % 5 === 0) this.system(`🎉 ${p.name} a atteint le niveau ${p.lvl} !`);
    }
    this.sendSelf(p);
  }

  hurtPlayer(p, dmg, now) {
    if (p.dead) return;
    p.hp -= dmg;
    p.lastHurt = now; p.inCombat = now;
    this.fx.push({ k: "dmg", id: p.id, v: dmg });
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.deadAt = now;
      this.fx.push({ k: "die", id: p.id });
      for (const m of this.monsters.values()) if (m.target === p.id) { m.state = "return"; m.target = null; }
      this.msg(p, "Vous êtes mort...", "bad");
    }
  }

  addItem(p, key, n = 1, plus = 0) {
    const it = ITEMS[key];
    if (it.stack) {
      const s = p.inv.find((x) => x && x.key === key);
      if (s) { s.n += n; return true; }
    }
    const i = p.inv.findIndex((x) => !x);
    if (i < 0) return false;
    p.inv[i] = it.stack ? { key, n } : { key, plus };
    return true;
  }

  countItem(p, key) { return p.inv.reduce((a, s) => a + (s && s.key === key ? s.n || 1 : 0), 0); }

  removeItem(p, key, n) {
    for (let i = 0; i < p.inv.length && n > 0; i++) {
      const s = p.inv[i];
      if (s && s.key === key) {
        const take = Math.min(n, s.n || 1);
        n -= take;
        if (s.n) s.n -= take;
        if (!s.n || s.n <= 0) p.inv[i] = null;
      }
    }
  }

  pickupNear(p, now) {
    for (const d of this.drops.values()) {
      if (Math.hypot(d.x - p.x, d.y - p.y) > 1.1) continue;
      if (d.owner && d.owner !== p.id && now < d.ownerUntil) continue;
      if (d.key === "gold") {
        p.gold += d.n;
        this.fx.push({ k: "gold", id: p.id, v: d.n });
      } else if (this.addItem(p, d.key, d.n)) {
        this.msg(p, `Ramassé : ${ITEMS[d.key].name}`, "loot");
      } else {
        if (now > p.invFullMsg) { this.msg(p, "Inventaire plein !", "bad"); p.invFullMsg = now + 4000; }
        continue;
      }
      this.drops.delete(d.id);
      this.dropsDirty = true;
      this.sendSelf(p);
    }
  }

  near(p, kind, range = 4) {
    const n = this.map.npcs.find((x) => x.kind === kind);
    return n && Math.hypot(n.x - p.x, n.y - p.y) <= range;
  }

  // ---------- Actions reçues du client ----------
  onMove(p, data) {
    if (p.dead || !data) return;
    const x = +data.x, y = +data.y, now = Date.now();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const elapsed = Math.min(1, (now - p.lastMove) / 1000);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d > PLAYER_SPEED * elapsed * 1.35 + 0.35 || !this.map.walkable(x, y)) {
      p.socket.emit("correct", { x: r2(p.x), y: r2(p.y) });
      p.lastMove = now;
      return;
    }
    p.x = x; p.y = y; p.lastMove = now;
    if (Number.isFinite(+data.d)) p.dir = +data.d;
    p.moving = !!data.m;
  }

  attackPower(p, now) { return p.atk * (now < p.buffUntil ? 1.3 : 1); }

  findTarget(p, targetId, range) {
    const t = targetId && this.monsters.get(targetId);
    if (t && dist(t, p) <= range + (t.isStone ? 0.5 : 0)) return t;
    let best = null, bd = 99;
    for (const m of this.monsters.values()) {
      const d = dist(m, p);
      if (d > range + (m.isStone ? 0.5 : 0)) continue;
      const facing = Math.cos(Math.atan2(m.y - p.y, m.x - p.x) - p.dir);
      const score = d - facing * 0.8;
      if (score < bd) { bd = score; best = m; }
    }
    return best;
  }

  onAttack(p, data) {
    const now = Date.now();
    if (p.dead || now < p.nextAtk) return;
    p.nextAtk = now + 550;
    const target = this.findTarget(p, data && data.t, 1.9);
    if (target) p.dir = Math.atan2(target.y - p.y, target.x - p.x);
    this.fx.push({ k: "swing", id: p.id, d: r2(p.dir) });
    if (!target) return;
    const power = this.attackPower(p, now);
    this.damageMonster(p, target, power * rnd(0.9, 1.1), now);
    // Les coups de la Lame touchent aussi les ennemis proches devant
    let extra = 0;
    for (const m of [...this.monsters.values()]) {
      if (m === target || m.isStone || extra >= 2 || !this.monsters.has(m.id)) continue;
      if (dist(m, p) > 1.7) continue;
      if (Math.cos(Math.atan2(m.y - p.y, m.x - p.x) - p.dir) < 0.3) continue;
      this.damageMonster(p, m, power * 0.6 * rnd(0.9, 1.1), now);
      extra++;
    }
  }

  onSkill(p, data) {
    const now = Date.now();
    const sk = SKILLS.find((s) => s.id === (data && +data.n));
    if (!sk || p.dead) return;
    if (p.lvl < sk.lvl) return this.msg(p, `Compétence disponible au niveau ${sk.lvl}.`, "bad");
    if (now < (p.cds[sk.id] || 0)) return;
    if (p.mp < sk.mp) return this.msg(p, "Pas assez de mana.", "bad");
    p.mp -= sk.mp;
    p.cds[sk.id] = now + sk.cd * 1000;
    p.nextAtk = now + 400;
    const power = this.attackPower(p, now);
    if (sk.id === 1) {
      for (const m of [...this.monsters.values()]) {
        if (this.monsters.has(m.id) && dist(m, p) <= sk.radius + (m.isStone ? 0.5 : 0)) this.damageMonster(p, m, power * sk.mult * rnd(0.9, 1.1), now);
      }
    } else if (sk.id === 2) {
      const t = this.findTarget(p, data.t, sk.range);
      if (t) { p.dir = Math.atan2(t.y - p.y, t.x - p.x); this.damageMonster(p, t, power * sk.mult * rnd(0.95, 1.1), now); }
    } else if (sk.id === 3) {
      p.buffUntil = now + sk.duration * 1000;
    }
    this.fx.push({ k: "skill", id: p.id, n: sk.id, d: r2(p.dir) });
    p.socket.emit("cd", { n: sk.id, ms: sk.cd * 1000 });
  }

  onUse(p, data) {
    const i = data && +data.slot, s = p.inv[i];
    if (!s || p.dead) return;
    const it = ITEMS[s.key];
    if (it.type === "potion") {
      const now = Date.now();
      if (now < p.nextPotion) return;
      p.nextPotion = now + 800;
      if (it.heal) p.hp = Math.min(p.maxHp, p.hp + it.heal);
      if (it.mana) p.mp = Math.min(p.maxMp, p.mp + it.mana);
      this.fx.push({ k: "potion", id: p.id, c: it.mana ? "b" : "r" });
      s.n--; if (s.n <= 0) p.inv[i] = null;
      this.sendSelf(p);
    } else if (["weapon", "armor", "helmet"].includes(it.type)) {
      if (p.lvl < it.lvl) return this.msg(p, `Niveau ${it.lvl} requis.`, "bad");
      const old = p.eq[it.type];
      p.eq[it.type] = { key: s.key, plus: s.plus || 0 };
      p.inv[i] = old ? { key: old.key, plus: old.plus || 0 } : null;
      this.recalc(p);
      this.sendSelf(p);
    }
  }

  onUseKey(p, data) {
    // Raccourci : utiliser la première potion d'un type donné
    const key = data && data.key;
    const i = p.inv.findIndex((s) => s && s.key === key);
    if (i >= 0) this.onUse(p, { slot: i });
    else if (key === "potion_rouge") {
      const j = p.inv.findIndex((s) => s && s.key === "grande_potion");
      if (j >= 0) this.onUse(p, { slot: j });
    }
  }

  onUnequip(p, data) {
    const slot = data && data.slot;
    if (!["weapon", "armor", "helmet"].includes(slot) || !p.eq[slot]) return;
    const i = p.inv.findIndex((x) => !x);
    if (i < 0) return this.msg(p, "Inventaire plein !", "bad");
    p.inv[i] = { key: p.eq[slot].key, plus: p.eq[slot].plus || 0 };
    p.eq[slot] = null;
    this.recalc(p);
    this.sendSelf(p);
  }

  onSwap(p, data) {
    const a = +data.a, b = +data.b;
    if (!(a >= 0 && a < INV_SIZE && b >= 0 && b < INV_SIZE)) return;
    [p.inv[a], p.inv[b]] = [p.inv[b], p.inv[a]];
    this.sendSelf(p);
  }

  sellPrice(slot) {
    const it = ITEMS[slot.key];
    return Math.floor(it.price * 0.3 * (1 + (slot.plus || 0) * 0.25));
  }

  onSell(p, data) {
    if (!this.near(p, "merchant")) return this.msg(p, "Approchez-vous de la marchande.", "bad");
    const i = +data.slot, s = p.inv[i];
    if (!s) return;
    const n = s.n || 1;
    const gain = this.sellPrice(s) * n;
    p.gold += gain;
    p.inv[i] = null;
    this.msg(p, `Vendu : ${ITEMS[s.key].name}${n > 1 ? " x" + n : ""} (+${gain} taels)`, "gold");
    this.sendSelf(p);
  }

  onBuy(p, data) {
    if (!this.near(p, "merchant")) return this.msg(p, "Approchez-vous de la marchande.", "bad");
    const key = data.key, n = Math.max(1, Math.min(50, Math.floor(+data.n || 1)));
    if (!SHOP.includes(key)) return;
    const it = ITEMS[key];
    const count = it.stack ? n : 1;
    const cost = it.price * count;
    if (p.gold < cost) return this.msg(p, "Pas assez de taels.", "bad");
    if (!this.addItem(p, key, count)) return this.msg(p, "Inventaire plein !", "bad");
    p.gold -= cost;
    this.msg(p, `Acheté : ${it.name}${count > 1 ? " x" + count : ""}`, "loot");
    this.sendSelf(p);
  }

  onUpgrade(p, data) {
    if (!this.near(p, "smith")) return this.msg(p, "Approchez-vous du forgeron.", "bad");
    const slot = data.from === "eq" ? p.eq[data.slot] : p.inv[+data.slot];
    if (!slot) return;
    const it = ITEMS[slot.key];
    if (!["weapon", "armor", "helmet"].includes(it.type)) return;
    const plus = slot.plus || 0;
    if (plus >= UPGRADE.max) return this.msg(p, "Cet objet est déjà au maximum.", "bad");
    const gold = UPGRADE.goldCost(it, plus), stones = UPGRADE.stoneCost(plus);
    if (p.gold < gold) return this.msg(p, "Pas assez de taels.", "bad");
    if (this.countItem(p, "pierre_forge") < stones) return this.msg(p, `Il faut ${stones} Pierre(s) de forge.`, "bad");
    p.gold -= gold;
    if (stones) this.removeItem(p, "pierre_forge", stones);
    const ok = Math.random() * 100 < UPGRADE.chances[plus];
    let result = "ok";
    if (ok) slot.plus = plus + 1;
    else {
      result = UPGRADE.failResult(plus);
      if (result === "down") slot.plus = plus - 1;
      if (result === "destroy") {
        if (data.from === "eq") p.eq[data.slot] = null; else p.inv[+data.slot] = null;
      }
    }
    const name = `${it.name} +${ok ? plus + 1 : result === "down" ? plus - 1 : plus}`;
    p.socket.emit("upgrade_result", { ok, result, name });
    if (ok) this.msg(p, `Réussite ! ${name}`, "gold");
    else this.msg(p, result === "destroy" ? `Échec... ${it.name} +${plus} a été détruit.` : result === "down" ? `Échec... l'objet redescend à +${plus - 1}.` : "Échec... l'objet n'a pas changé.", "bad");
    if (ok && plus + 1 >= 7) this.system(`🔨 ${p.name} a forgé ${name} !`);
    this.recalc(p);
    this.sendSelf(p);
  }

  onChat(p, data) {
    const now = Date.now();
    let text = String((data && data.text) || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!text || now - p.lastChat < 700) return;
    p.lastChat = now;
    if (text.startsWith("/")) {
      if (text === "/aide" || text === "/help") {
        this.msg(p, "Clic : se déplacer / attaquer · Espace : attaque · 1-2-3 : compétences · A/E : potions · I : inventaire · Entrée : chat", "info");
      } else if (text === "/pos") this.msg(p, `Position : ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`, "info");
      else if (text === "/joueurs") this.msg(p, `En ligne : ${[...this.players.values()].map((x) => x.name).join(", ")}`, "info");
      else this.msg(p, "Commande inconnue. Tapez /aide", "bad");
      return;
    }
    this.io.emit("chat", { from: p.name, k: p.kingdom, text });
  }

  onRespawn(p) {
    if (!p.dead || Date.now() - p.deadAt < 3000) return;
    p.dead = false;
    p.hp = p.maxHp; p.mp = p.maxMp;
    p.x = 18.5 + rnd(-1.5, 1.5); p.y = 17 + rnd(-1, 1);
    if (!this.map.walkable(p.x, p.y)) { p.x = 18.5; p.y = 17; }
    const loss = Math.floor(xpToNext(p.lvl) * 0.04);
    p.xp = Math.max(0, p.xp - loss);
    p.lastMove = Date.now();
    p.socket.emit("correct", { x: r2(p.x), y: r2(p.y) });
    if (loss) this.msg(p, `Vous perdez ${loss} points d'expérience.`, "bad");
    this.sendSelf(p);
  }

  // ---------- Messages ----------
  msg(p, text, kind = "info") { p.socket.emit("msg", { text, kind }); }
  system(text) { this.io.emit("chat", { sys: true, text }); }

  sendSelf(p) {
    p.socket.emit("self", {
      name: p.name, kingdom: p.kingdom, lvl: p.lvl, xp: p.xp, xpNext: xpToNext(p.lvl), gold: p.gold,
      atk: p.atk, def: p.def, maxHp: p.maxHp, maxMp: p.maxMp, inv: p.inv, eq: p.eq,
      maxLevel: MAX_LEVEL,
    });
  }

  // ---------- Boucle principale ----------
  tick() {
    const now = Date.now(), dt = TICK / 1000;

    for (const m of this.monsters.values()) this.updateMonster(m, now, dt);

    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (now >= r.at) {
        const blockedByPlayer = [...this.players.values()].some((p) => Math.hypot(p.x - r.x, p.y - r.y) < 4);
        if (!blockedByPlayer) { this.spawnMonster(r.type, r.x, r.y); this.respawns.splice(i, 1); }
        else r.at = now + 5000;
      }
    }

    if (now > this.nextStoneCheck) {
      this.nextStoneCheck = now + rnd(40000, 80000);
      for (const rule of STONE_RULES) {
        const count = [...this.monsters.values()].filter((m) => m.isStone && m.type === rule.key).length;
        if (count < rule.max) this.spawnStone(rule);
      }
    }

    for (const d of this.drops.values()) if (now > d.expires) { this.drops.delete(d.id); this.dropsDirty = true; }

    for (const p of this.players.values()) {
      if (p.dead) continue;
      // Régénération hors combat
      if (now - p.inCombat > 6000) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.02 * dt);
        p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.03 * dt);
      } else {
        p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.006 * dt);
      }
      this.pickupNear(p, now);
    }

    // Envoi de l'état à chaque joueur (seulement ce qui est proche)
    const fx = this.fx; this.fx = [];
    const dropList = this.dropsDirty ? [...this.drops.values()].map((d) => ({ id: d.id, k: d.key, n: d.n, x: d.x, y: d.y, o: d.owner })) : null;
    this.dropsDirty = false;
    const plist = [...this.players.values()];
    const mlist = [...this.monsters.values()];
    for (const p of plist) {
      const snap = {
        t: now,
        p: plist.filter((o) => Math.abs(o.x - p.x) < VIEW && Math.abs(o.y - p.y) < VIEW).map((o) => ({
          id: o.id, n: o.name, x: r2(o.x), y: r2(o.y), d: r2(o.dir), hp: Math.round(o.hp), mh: o.maxHp,
          l: o.lvl, k: o.kingdom, m: o.moving ? 1 : 0, dead: o.dead ? 1 : 0, w: o.eq.weapon ? ITEMS[o.eq.weapon.key].tier : 0,
          a: o.eq.armor ? ITEMS[o.eq.armor.key].tier : 0, h: o.eq.helmet ? ITEMS[o.eq.helmet.key].tier : 0,
          b: now < o.buffUntil ? 1 : 0,
        })),
        m: mlist.filter((m) => Math.abs(m.x - p.x) < VIEW && Math.abs(m.y - p.y) < VIEW).map((m) => ({
          id: m.id, t: m.type, x: r2(m.x), y: r2(m.y), d: r2(m.dir), hp: Math.round(m.hp), mh: m.maxHp,
          s: m.isStone ? 1 : 0, mv: m.moving ? 1 : 0,
        })),
        me: { hp: Math.round(p.hp), mp: Math.round(p.mp), mh: p.maxHp, mm: p.maxMp, dead: p.dead ? 1 : 0, b: Math.max(0, p.buffUntil - now) },
      };
      if (fx.length) snap.fx = fx;
      if (dropList) snap.dr = dropList;
      p.socket.emit("s", snap);
    }
  }
}

module.exports = { Game };
