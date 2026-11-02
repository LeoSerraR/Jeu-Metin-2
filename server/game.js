// Logique du monde : joueurs, classes et compétences, monstres, pierres, boss, donjons, objets.
const D = require("./data");
const { CLASSES, SKILLS, ITEMS, WEAPON_BY_TIER, MONSTERS, BOSS_PATTERNS, STONES, DUNGEONS, UPGRADE, SHOP, KINGDOMS, xpToNext, MAX_LEVEL } = D;
const { generateOverworld, generateDungeon } = require("./map");
const store = require("./store");

const TICK = 50;
const VIEW = 30;
const INV_SIZE = 30;
const BASE_SPEED = 4.2;
const SPAWNS = [["loup", 1, 40], ["loup_noir", 2, 26], ["sanglier", 2, 24], ["bandit", 3, 34], ["chef_bandit", 3, 7], ["spectre", 4, 22]];
const STONE_RULES = [{ key: "pierre_maudite", zones: [2], max: 3 }, { key: "pierre_chaos", zones: [3, 4], max: 2 }];
const GEAR = ["weapon", "armor", "helmet"];

const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.floor(rnd(a, b + 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = (v) => Math.round(v * 100) / 100;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

class World {
  constructor(id, map, kind, dkey) {
    Object.assign(this, { id, map, kind, dkey, monsters: new Map(), drops: new Map(), respawns: [], pending: [], dropsDirty: true, created: Date.now(), emptySince: Date.now(), state: {} });
  }
}

function mapPayload(m) {
  return {
    w: m.w, h: m.h, theme: m.theme, tiles: m.tiles, npcs: m.npcs,
    objects: m.objects.map((o) => ({ id: o.id, t: o.t, x: o.x, y: o.y, w: o.w, h: o.h, v: o.v, dungeon: o.dungeon })),
    blocked: m.blocked.map((b) => (b ? 1 : 0)).join(""),
  };
}

// Formes des attaques de boss (en cases)
function inShape(s, x, y) {
  const d = Math.hypot(x - s.x, y - s.y);
  if (s.s === "circle") return d <= s.r;
  if (s.s === "donut") return d >= s.ri && d <= s.ro;
  if (s.s === "cone") return d <= s.r && angDiff(Math.atan2(y - s.y, x - s.x), s.a) <= s.arc;
  if (s.s === "line") {
    const dx = Math.cos(s.a), dy = Math.sin(s.a), px = x - s.x, py = y - s.y;
    const t = px * dx + py * dy, perp = Math.abs(-px * dy + py * dx);
    return t >= -0.5 && t <= s.len && perp <= s.w / 2;
  }
  return false;
}

class Game {
  constructor(io) {
    this.io = io;
    this.players = new Map();
    this.worlds = new Map();
    this.nid = 1;
    this.fx = new Map(); // monde -> effets de ce tick
    this.over = new World("w0", generateOverworld(), "over");
    this.worlds.set("w0", this.over);
    this.nextStoneCheck = 0;
    for (const [type, zone, count] of SPAWNS) for (let i = 0; i < count; i++) {
      const s = this.randomFree(zone);
      if (s) this.spawnMonster(this.over, type, s[0] + 0.5, s[1] + 0.5);
    }
    for (const rule of STONE_RULES) for (let i = 0; i < rule.max - 1; i++) this.spawnStone(rule, true);
    setInterval(() => this.tick(), TICK);
    setInterval(() => this.saveAll(), 30000);
  }

  id(prefix) { return prefix + (this.nid++).toString(36); }
  emitFx(w, f) { if (!this.fx.has(w.id)) this.fx.set(w.id, []); this.fx.get(w.id).push(f); }
  playersIn(w) { return [...this.players.values()].filter((p) => p.world === w.id); }
  worldOf(p) { return this.worlds.get(p.world) || this.over; }

  randomFree(zone) {
    const list = this.over.map.freeByZone[zone];
    for (let t = 0; t < 30; t++) {
      const s = list[Math.floor(Math.random() * list.length)];
      if (s && this.over.map.walkable(s[0] + 0.5, s[1] + 0.5)) return s;
    }
    return null;
  }

  // ================================================== Monstres
  spawnMonster(w, type, x, y, opts = {}) {
    const def = MONSTERS[type];
    const m = {
      id: this.id("m"), type, def, x, y, homeX: x, homeY: y, hp: def.hp, maxHp: def.hp, state: "idle", target: null, nextAtk: 0,
      wanderAt: Date.now() + rnd(1000, 6000), tx: x, ty: y, dir: rnd(0, Math.PI * 2), dmgBy: new Map(), fromStone: !!opts.fromStone,
      moving: false, angle: rnd(0, Math.PI * 2), stunUntil: 0, slowUntil: 0, slowPct: 0, dots: [], room: opts.room, noRespawn: !!opts.noRespawn,
    };
    if (opts.aggroTarget) { m.state = "chase"; m.target = opts.aggroTarget; }
    if (def.boss) { m.boss = true; m.cds = {}; m.castUntil = 0; m.nextPattern = 0; m.phase = 1; }
    w.monsters.set(m.id, m);
    return m;
  }

  spawnStone(rule, silent) {
    const zone = rule.zones[Math.floor(Math.random() * rule.zones.length)];
    const spot = this.randomFree(zone);
    if (spot) this.placeStone(this.over, rule.key, spot[0], spot[1], silent ? null : ["", "", "dans les collines", "dans la forêt des bandits", "dans la vallée des spectres"][zone]);
  }

  placeStone(w, key, tx, ty, where) {
    const def = STONES[key];
    const s = { id: this.id("s"), type: key, def, isStone: true, x: tx + 0.5, y: ty + 0.5, hp: def.hp, maxHp: def.hp, dmgBy: new Map(), wave: 0, dir: 0, tile: [tx, ty], dots: [], stunUntil: 0, slowUntil: 0 };
    w.monsters.set(s.id, s);
    w.map.blocked[tx + ty * w.map.w] = true;
    if (where) this.system(`💥 Une ${def.name} s'est écrasée ${where} !`);
    return s;
  }

  moveEntity(w, e, tx, ty, speed, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 0.05) { e.moving = false; return true; }
    const step = Math.min(d, speed * dt), nx = e.x + (dx / d) * step, ny = e.y + (dy / d) * step;
    e.dir = Math.atan2(dy, dx); e.moving = true;
    const ok = w.map.walkable;
    if (ok(nx, ny)) { e.x = nx; e.y = ny; } else if (ok(nx, e.y)) e.x = nx; else if (ok(e.x, ny)) e.y = ny; else { e.moving = false; return true; }
    return step >= d;
  }

  monsterSpeed(m, now) { return m.def.speed * (now < m.slowUntil ? 1 - m.slowPct : 1); }

  updateMonster(w, m, now, dt) {
    if (m.isStone) return;
    // Dégâts sur la durée (poison, brûlure)
    for (const d of m.dots) {
      if (now >= d.next && now <= d.until) {
        d.next += 1000;
        const p = this.players.get(d.by);
        if (p && p.world === w.id) this.damageMonster(w, p, m, d.dps, now, { noCrit: true, flat: true, dot: true });
        if (!w.monsters.has(m.id)) return;
      }
    }
    m.dots = m.dots.filter((d) => now <= d.until);
    if (now < m.stunUntil) { m.moving = false; return; }
    if (m.boss) return this.updateBoss(w, m, now, dt);
    const def = m.def, players = this.playersIn(w);
    if (m.state === "idle") {
      if (def.aggro) for (const p of players) if (!p.dead && dist(p, m) < (w.kind === "over" ? 5 : 7)) { m.state = "chase"; m.target = p.id; break; }
      if (m.state === "idle") {
        if (now > m.wanderAt) { m.tx = m.homeX + rnd(-3, 3); m.ty = m.homeY + rnd(-3, 3); m.wanderAt = now + rnd(3000, 8000); }
        this.moveEntity(w, m, m.tx, m.ty, def.speed * 0.45, dt);
      }
    }
    if (m.state === "chase") {
      const p = this.players.get(m.target);
      const fromHome = Math.hypot(m.x - m.homeX, m.y - m.homeY);
      if (!p || p.dead || p.world !== w.id || fromHome > (w.kind === "over" ? 15 : 30)) { m.state = "return"; m.target = null; return; }
      const d = dist(p, m);
      if (d > 1.15) this.moveEntity(w, m, p.x + Math.cos(m.angle) * 0.9, p.y + Math.sin(m.angle) * 0.9, this.monsterSpeed(m, now), dt);
      else { m.moving = false; m.dir = Math.atan2(p.y - m.y, p.x - m.x); }
      if (d <= 1.5 * Math.max(1, def.size || 1) && now >= m.nextAtk) {
        m.nextAtk = now + 1400;
        this.emitFx(w, { k: "matk", id: m.id });
        this.hurtPlayer(p, Math.round(def.atk * rnd(0.85, 1.15)), now);
      }
    }
    if (m.state === "return") {
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25 * dt);
      if (this.moveEntity(w, m, m.homeX, m.homeY, def.speed * 1.4, dt) || Math.hypot(m.x - m.homeX, m.y - m.homeY) < 0.3) { m.state = "idle"; m.hp = m.maxHp; m.dmgBy.clear(); }
    }
  }

  // ================================================== Boss
  updateBoss(w, m, now, dt) {
    const players = this.playersIn(w).filter((p) => !p.dead);
    const near = players.filter((p) => dist(p, m) < 13);
    if (m.state !== "fight") {
      if (near.length) { m.state = "fight"; this.worldMsg(w, `⚠ ${m.def.name} entre en combat !`, "bad"); }
      return;
    }
    if (!players.length || players.every((p) => dist(p, m) > 28)) {
      m.state = "idle"; m.hp = m.maxHp; m.dmgBy.clear(); m.x = m.homeX; m.y = m.homeY; m.flying = false;
      return;
    }
    const pct = m.hp / m.maxHp;
    if (m.type === "dragon_jade") {
      const phase = pct > 0.66 ? 1 : pct > 0.33 ? 2 : 3;
      if (phase !== m.phase) {
        m.phase = phase;
        if (phase === 2) { this.worldMsg(w, "🐉 Le Dragon s'envole ! Évitez les météores !", "bad"); m.flying = true; m.flyUntil = now + 16000; m.x = m.homeX; m.y = m.homeY; }
        if (phase === 3) { this.worldMsg(w, "🐉 Le Dragon est enragé !", "bad"); m.flying = false; }
      }
      if (m.flying && now > m.flyUntil) { m.flying = false; this.worldMsg(w, "Le Dragon se pose : frappez-le !", "gold"); }
    }
    if (now < m.castUntil) { m.moving = false; return; }

    // Choix d'une attaque spéciale
    if (now >= m.nextPattern) {
      const enrage = m.phase === 3 ? 0.7 : 1;
      const ready = BOSS_PATTERNS[m.type].filter((pt) => (m.cds[pt.name] || 0) <= now && (!pt.below || pct < pt.below) &&
        (!pt.phase || pt.phase.includes(m.flying ? 2 : m.phase)) && !(m.flying && pt.phase && !pt.phase.includes(2)));
      if (ready.length) {
        const pt = ready[Math.floor(Math.random() * ready.length)];
        m.cds[pt.name] = now + pt.cd * 1000 * enrage;
        this.castPattern(w, m, pt, players, now);
        m.nextPattern = now + (pt.tele || 0.5) * 1000 + 900 * enrage;
        return;
      }
    }
    if (m.flying) { m.moving = false; return; }
    // Combat normal : poursuite et coups
    let tgt = this.players.get(m.target);
    if (!tgt || tgt.dead || tgt.world !== w.id) { tgt = near[0] || players[0]; m.target = tgt && tgt.id; }
    if (!tgt) return;
    const d = dist(tgt, m), reach = 1.2 + (m.def.size || 1) * 0.5;
    if (d > reach) this.moveEntity(w, m, tgt.x, tgt.y, this.monsterSpeed(m, now), dt);
    else { m.moving = false; m.dir = Math.atan2(tgt.y - m.y, tgt.x - m.x); }
    if (d <= reach + 0.4 && now >= m.nextAtk) {
      m.nextAtk = now + 1600;
      this.emitFx(w, { k: "matk", id: m.id });
      this.hurtPlayer(tgt, Math.round(m.def.atk * rnd(0.9, 1.1)), now);
    }
  }

  castPattern(w, m, pt, players, now) {
    if (pt.summon) {
      for (let i = 0; i < pt.summon.n; i++) {
        const a = rnd(0, Math.PI * 2), x = m.x + Math.cos(a) * 2.5, y = m.y + Math.sin(a) * 2.5;
        if (w.map.walkable(x, y)) this.spawnMonster(w, pt.summon.type, x, y, { aggroTarget: players[Math.floor(Math.random() * players.length)].id, noRespawn: true });
      }
      this.emitFx(w, { k: "wave", id: m.id });
      this.worldMsg(w, `${m.def.name} : ${pt.name} !`, "bad");
      return;
    }
    const target = this.players.get(m.target) && this.players.get(m.target).world === w.id ? this.players.get(m.target) : players[Math.floor(Math.random() * players.length)];
    const shapes = [];
    const mk = (x, y, a) => {
      if (pt.shape === "circle") return { s: "circle", x, y, r: pt.r };
      if (pt.shape === "donut") return { s: "donut", x, y, ri: pt.rIn, ro: pt.rOut };
      if (pt.shape === "cone") return { s: "cone", x, y, r: pt.r, a, arc: pt.arc };
      return { s: "line", x, y, a, len: pt.len, w: pt.w };
    };
    const aim = target ? Math.atan2(target.y - m.y, target.x - m.x) : m.dir;
    let moveTo = null;
    if (pt.at === "self") shapes.push(mk(m.x, m.y, aim));
    else if (pt.at === "target") { shapes.push(mk(m.x, m.y, aim)); m.dir = aim; }
    else if (pt.at === "behind") shapes.push(mk(m.x, m.y, aim + Math.PI));
    else if (pt.at === "each") for (const p of players) shapes.push(mk(p.x, p.y, 0));
    else if (pt.at === "farthest") {
      const far = players.reduce((a, b) => (dist(b, m) > dist(a, m) ? b : a), players[0]);
      shapes.push(mk(far.x, far.y, 0));
      if (pt.jump) moveTo = { x: far.x, y: far.y };
    } else if (pt.at === "random") {
      const c = w.map.center || { x: m.x, y: m.y };
      for (let i = 0; i < pt.n; i++) {
        let x = 0, y = 0;
        for (let t = 0; t < 12; t++) {
          x = c.x + rnd(-12, 12); y = c.y + rnd(-12, 12);
          if (w.map.walkable(x, y)) break;
        }
        shapes.push(mk(x, y, 0));
      }
      // en phase de vol, une pluie vise toujours aussi les joueurs
      if (m.flying) for (const p of players) shapes.push(mk(p.x + rnd(-0.6, 0.6), p.y + rnd(-0.6, 0.6), 0));
    }
    if (pt.dashToEnd) {
      let ex = m.x, ey = m.y;
      for (let s = 0; s <= pt.len; s += 0.25) {
        const x = m.x + Math.cos(aim) * s, y = m.y + Math.sin(aim) * s;
        if (!w.map.walkable(x, y)) break;
        ex = x; ey = y;
      }
      moveTo = { x: ex, y: ey };
    }
    m.castUntil = now + pt.tele * 1000;
    m.moving = false;
    w.pending.push({ at: now + pt.tele * 1000, shapes, pt, boss: m, moveTo });
    this.emitFx(w, { k: "tele", id: m.id, n: pt.name, ms: pt.tele * 1000, shapes: shapes.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v]))) });
  }

  resolvePending(w, now) {
    for (let i = w.pending.length - 1; i >= 0; i--) {
      const pe = w.pending[i];
      if (now < pe.at) continue;
      w.pending.splice(i, 1);
      if (!w.monsters.has(pe.boss.id)) continue;
      const pt = pe.pt;
      for (const p of this.playersIn(w)) {
        if (p.dead || !pe.shapes.some((s) => inShape(s, p.x, p.y))) continue;
        this.hurtPlayer(p, Math.round(pe.boss.def.atk * pt.dmg * rnd(0.9, 1.1)), now, true);
        if (pt.slow) { p.slowUntil = now + pt.slow.s * 1000; p.slowPct = pt.slow.pct; }
        if (pt.poison) p.dots.push({ dmg: Math.round(p.maxHp * pt.poison.pct), until: now + pt.poison.s * 1000, next: now + 1000 });
      }
      if (pe.moveTo) { pe.boss.x = pe.moveTo.x; pe.boss.y = pe.moveTo.y; }
      this.emitFx(w, { k: "boom", id: pe.boss.id, shapes: pe.shapes.map((s) => ({ s: s.s, x: r2(s.x), y: r2(s.y), r: s.r || s.ro || 1 })) });
    }
  }

  // ================================================== Dégâts
  damageMonster(w, p, m, raw, now, opts = {}) {
    if (!w.monsters.has(m.id)) return 0;
    if (m.shielded || m.flying) { this.emitFx(w, { k: "immune", id: m.id }); return 0; }
    let dmg = opts.flat ? Math.round(raw) : Math.max(1, Math.round(raw - m.def.def * 0.6));
    let crit = false;
    if (!opts.noCrit && (now < p.critUntil || Math.random() < this.critChance(p, now))) { crit = true; dmg = Math.round(dmg * 1.7); }
    dmg = Math.max(1, Math.min(dmg, Math.ceil(m.hp)));
    m.hp -= dmg;
    m.dmgBy.set(p.id, (m.dmgBy.get(p.id) || 0) + dmg);
    p.inCombat = now;
    const ls = (opts.lifesteal || 0) + this.buffSum(p, "lifesteal", now) + this.gearBonus(p, "lifesteal");
    if (ls > 0 && !opts.dot) p.hp = Math.min(p.maxHp, p.hp + dmg * ls);
    this.emitFx(w, { k: "dmg", id: m.id, v: dmg, c: crit ? 1 : 0, by: p.id, dot: opts.dot ? 1 : 0 });
    if (m.isStone) this.stoneHit(w, m, p);
    else if (m.state !== "chase" && !m.boss) {
      m.state = "chase"; m.target = p.id;
      for (const o of w.monsters.values()) if (!o.isStone && !o.boss && o !== m && o.type === m.type && o.state === "idle" && dist(o, m) < 4) { o.state = "chase"; o.target = p.id; }
    }
    if (m.boss && !m.target) m.target = p.id;
    if (m.hp <= 0) this.killMonster(w, m, now);
    return dmg;
  }

  applyEffects(w, p, m, sk, now) {
    if (!w.monsters.has(m.id) || m.isStone) return;
    if (sk.stun && !m.boss) m.stunUntil = Math.max(m.stunUntil, now + sk.stun * 1000);
    if (sk.slow) { m.slowUntil = now + sk.slow.s * 1000; m.slowPct = m.boss ? sk.slow.pct / 2 : sk.slow.pct; }
    if (sk.dot) m.dots.push({ dps: Math.round(this.atkEff(p, now) * sk.dot.mult), until: now + sk.dot.s * 1000, next: now + 1000, by: p.id });
  }

  stoneHit(w, s, p) {
    const due = Math.min(4, Math.floor((1 - s.hp / s.maxHp) / 0.2));
    while (s.wave < due) {
      s.wave++;
      for (let i = 0; i < s.def.waveSize; i++) {
        const type = s.def.waves[Math.floor(Math.random() * s.def.waves.length)];
        let x = s.x, y = s.y;
        for (let t = 0; t < 10; t++) {
          const a = rnd(0, Math.PI * 2), r = rnd(1.5, 3);
          if (w.map.walkable(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r)) { x = s.x + Math.cos(a) * r; y = s.y + Math.sin(a) * r; break; }
        }
        const m = this.spawnMonster(w, type, x, y, { fromStone: true, aggroTarget: p.id });
        m.homeX = s.x; m.homeY = s.y;
      }
      this.emitFx(w, { k: "wave", id: s.id });
    }
  }

  resolveDrop(key, owner) {
    if (!key.startsWith("@w")) return key;
    const p = this.players.get(owner);
    const wtype = p ? CLASSES[p.cls].weapon : ["sword", "dagger", "fan"][rint(0, 2)];
    return WEAPON_BY_TIER[wtype][+key.slice(2)];
  }

  killMonster(w, m, now) {
    w.monsters.delete(m.id);
    this.emitFx(w, { k: "die", id: m.id, x: r2(m.x), y: r2(m.y), b: m.boss ? 1 : 0, s: m.isStone ? 1 : 0 });
    const def = m.def;
    let top = null, topDmg = 0;
    for (const [pid, d] of m.dmgBy) if (d > topDmg) { topDmg = d; top = pid; }
    for (const [pid, d] of m.dmgBy) {
      const p = this.players.get(pid);
      if (!p || p.world !== w.id || dist(p, m) > 25) continue;
      let xp = def.xp;
      if (m.isStone || m.boss) xp = Math.round(def.xp * (0.5 + 0.5 * d / m.maxHp));
      else if (pid !== top) continue;
      const diff = p.lvl - def.lvl;
      if (diff > 5) xp = Math.round(xp * Math.max(0.1, 1 - (diff - 5) * 0.2));
      this.giveXp(p, xp);
    }
    this.createDrop(w, "gold", rint(def.gold[0], def.gold[1]), m.x, m.y, top);
    for (const [key, chance] of def.drops) if (Math.random() < chance) this.createDrop(w, this.resolveDrop(key, top), 1, m.x, m.y, top);
    if (m.boss) this.bossLoot(w, m);
    if (m.isStone) {
      w.map.blocked[m.tile[0] + m.tile[1] * w.map.w] = false;
      if (w.kind === "over") { const p = this.players.get(top); this.system(`✨ ${p ? p.name : "Un héros"} a détruit une ${def.name} !`); }
    } else if (!m.fromStone && !m.noRespawn && w.kind === "over") {
      w.respawns.push({ at: now + rnd(15000, 30000), type: m.type, x: m.homeX, y: m.homeY });
    }
    if (w.kind === "dungeon") this.dungeonEvent(w, "kill", m, now);
  }

  bossLoot(w, m) {
    // Une arme exclusive garantie, adaptée à la classe d'un participant, et une chance d'en avoir une seconde
    const parts = [...m.dmgBy.keys()].map((id) => this.players.get(id)).filter((p) => p && p.world === w.id);
    const uniques = Object.entries(ITEMS).filter(([, it]) => it.unique === m.type);
    const give = (p) => {
      const wtype = p ? CLASSES[p.cls].weapon : null;
      const pool = uniques.filter(([, it]) => !wtype || it.wtype === wtype);
      const [key] = pool[Math.floor(Math.random() * pool.length)] || uniques[0];
      this.createDrop(w, key, 1, m.x, m.y, p ? p.id : null, 30000);
      if (p) this.system(`🏆 ${p.name} a vaincu ${m.def.name} et obtient ${ITEMS[key].name} !`);
    };
    give(parts[Math.floor(Math.random() * parts.length)]);
    if (Math.random() < 0.35) give(parts[Math.floor(Math.random() * parts.length)]);
  }

  createDrop(w, key, n, x, y, owner, lock = 15000) {
    if (!key) return;
    let dx = x, dy = y;
    for (let t = 0; t < 8; t++) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.3, 1.4);
      if (w.map.walkable(x + Math.cos(a) * r, y + Math.sin(a) * r)) { dx = x + Math.cos(a) * r; dy = y + Math.sin(a) * r; break; }
    }
    const d = { id: this.id("d"), key, n, x: r2(dx), y: r2(dy), owner, ownerUntil: Date.now() + lock, expires: Date.now() + 180000 };
    w.drops.set(d.id, d);
    w.dropsDirty = true;
  }

  // ================================================== Donjons
  enterDungeon(p, key) {
    const dg = DUNGEONS[key];
    if (!dg || p.dead || p.world !== "w0") return;
    const portal = this.over.map.objects.find((o) => o.t === "portal" && o.dungeon === key);
    if (!portal || Math.hypot(portal.x + 0.5 - p.x, portal.y + 0.5 - p.y) > 3.5) return this.msg(p, "Approchez-vous du portail.", "bad");
    if (p.lvl < dg.lvl) return this.msg(p, `Niveau ${dg.lvl} requis pour ${dg.name}.`, "bad");
    const now = Date.now();
    let w = [...this.worlds.values()].find((x) => x.dkey === key && now < x.openUntil && !x.state.done && this.playersIn(x).length < 5);
    if (!w) w = this.createDungeon(key);
    p.overPos = { x: portal.x + 0.5, y: portal.y + 2.5 };
    this.changeWorld(p, w, w.map.spawn.x + rnd(-0.8, 0.8), w.map.spawn.y + rnd(-0.5, 0.5));
    this.msg(p, dg.concept, "info");
    this.worldMsg(w, `${p.name} entre dans ${dg.name}.`, "info");
  }

  createDungeon(key) {
    const map = generateDungeon(key);
    const w = new World(this.id("w"), map, "dungeon", key);
    w.openUntil = Date.now() + 3 * 60000;
    const sp = (type, x, y, o = {}) => this.spawnMonster(w, type, x, y, o);
    if (key === "tour") {
      const R = map.rooms;
      const fill = (ri, list) => list.forEach((type, i) => {
        const r = R[ri], a = (i / list.length) * Math.PI * 2;
        sp(type, r.cx + Math.cos(a) * 3.5, r.cy + Math.sin(a) * 3.5, { room: ri, noRespawn: true });
      });
      fill(1, ["lanterne_hantee", "lanterne_hantee", "lanterne_hantee", "lanterne_hantee", "lanterne_hantee"]);
      fill(2, ["soldat_bronze", "soldat_bronze", "lanterne_hantee", "soldat_bronze", "lanterne_hantee", "lanterne_hantee"]);
      fill(3, ["soldat_bronze", "soldat_bronze", "soldat_bronze", "soldat_bronze", "lanterne_hantee", "lanterne_hantee", "soldat_bronze"]);
      const b = sp("gardien_bronze", R[4].cx, R[4].cy, { room: 4, noRespawn: true });
      w.boss = b;
      w.state = { room: 1 };
    } else if (key === "nid") {
      w.state = { seals: 4 };
      for (const [sx, sy] of map.seals) this.placeStone(w, "sceau_toile", sx, sy);
      const b = sp("reine_tisseuse", map.center.x, map.center.y - 2, { noRespawn: true });
      b.shielded = true; w.boss = b;
      for (let i = 0; i < 8; i++) {
        const a = rnd(0, Math.PI * 2), r = rnd(6, 13), x = map.center.x + Math.cos(a) * r, y = map.center.y + Math.sin(a) * r;
        if (map.walkable(x, y)) sp("araignee", x, y, { noRespawn: true });
      }
    } else {
      w.state = { endsAt: Date.now() + DUNGEONS.temple.timeLimit * 1000 };
      for (const gy of [54, 46, 38]) {
        sp("garde_jade", map.corridor.x + 0.5, gy, { noRespawn: true });
        sp("salamandre", map.corridor.x - 1.5, gy + 1, { noRespawn: true });
        sp("salamandre", map.corridor.x + 2.5, gy + 1, { noRespawn: true });
      }
      w.boss = sp("dragon_jade", map.center.x, map.center.y, { noRespawn: true });
    }
    this.worlds.set(w.id, w);
    return w;
  }

  dungeonEvent(w, ev, m, now) {
    if (ev !== "kill") return;
    if (m.boss) {
      w.state.done = true;
      const secs = Math.round((now - w.created) / 1000);
      this.worldMsg(w, `🏆 Victoire sur ${m.def.name} en ${Math.floor(secs / 60)} min ${secs % 60} s ! Ramassez le butin puis prenez la sortie.`, "gold");
      return;
    }
    if (w.dkey === "tour" && m.room === w.state.room) {
      const left = [...w.monsters.values()].filter((o) => o.room === w.state.room && !o.boss).length;
      if (!left) {
        const gates = w.map.rooms[w.state.room].gate || [];
        for (const g of gates) w.map.blocked[g.x + g.y * w.map.w] = false;
        w.map.objects = w.map.objects.filter((o) => !gates.includes(o));
        for (const p of this.playersIn(w)) p.socket.emit("mapdelta", { unblock: gates.map((g) => [g.x, g.y]), remove: gates.map((g) => g.id) });
        this.worldMsg(w, w.state.room < 3 ? `La grille s'ouvre ! Salle ${w.state.room + 1} / 4.` : "La dernière grille s'ouvre... le Gardien de Bronze vous attend.", "gold");
        w.state.room++;
      }
    }
    if (w.dkey === "nid" && m.isStone) {
      w.state.seals--;
      if (w.state.seals > 0) this.worldMsg(w, `Un sceau est brisé ! Encore ${w.state.seals}.`, "gold");
      else if (w.boss && w.monsters.has(w.boss.id)) { w.boss.shielded = false; this.worldMsg(w, "Tous les sceaux sont brisés : la Reine est vulnérable !", "gold"); }
    }
  }

  dungeonInfo(w, now) {
    if (w.kind !== "dungeon") return null;
    const dg = DUNGEONS[w.dkey];
    let obj = "";
    if (w.state.done) obj = "Donjon terminé ! Prenez la sortie.";
    else if (w.dkey === "tour") obj = w.state.room <= 3 ? `Salle ${w.state.room} / 4 : vainquez tous les gardiens` : "Vainquez le Gardien de Bronze";
    else if (w.dkey === "nid") obj = w.state.seals > 0 ? `Brisez les sceaux : ${4 - w.state.seals} / 4` : "Vainquez la Reine Tisseuse";
    else obj = "Vainquez le Dragon de Jade";
    return { name: dg.name, obj, t: w.state.endsAt && !w.state.done ? Math.max(0, w.state.endsAt - now) : null };
  }

  changeWorld(p, w, x, y) {
    p.world = w.id; p.x = x; p.y = y; p.lastMove = Date.now();
    p.socket.emit("world", { map: mapPayload(w.map), kind: w.kind, dkey: w.dkey || null });
    p.socket.emit("correct", { x: r2(x), y: r2(y) });
    w.dropsDirty = true;
  }

  leaveDungeon(p, reason) {
    if (p.world === "w0") return;
    const pos = p.overPos || this.over.map.spawn;
    this.changeWorld(p, this.over, pos.x, pos.y);
    if (reason) this.msg(p, reason, "info");
  }

  // ================================================== Joueurs
  newChar(cls) {
    const wkey = WEAPON_BY_TIER[CLASSES[cls].weapon][1];
    return { cls, lvl: 1, xp: 0, gold: 150, x: 18.5, y: 17, dir: Math.PI / 2,
      inv: [{ key: "potion_rouge", n: 6 }, { key: "potion_bleue", n: 4 }],
      eq: { weapon: { key: wkey, plus: 0 }, armor: { key: "tunique_lin", plus: 0 }, helmet: null } };
  }

  join(socket, acc) {
    for (const o of this.players.values()) if (o.name.toLowerCase() === acc.name.toLowerCase()) { o.socket.emit("kicked", "Connexion depuis un autre appareil."); o.socket.disconnect(true); }
    const c = acc.char || this.newChar(acc.cls || "lame");
    const cls = CLASSES[c.cls] ? c.cls : "lame";
    const inv = new Array(INV_SIZE).fill(null);
    (c.inv || []).forEach((it, i) => { if (it && ITEMS[it.key] && i < INV_SIZE) inv[i] = it; });
    const eq = { weapon: null, armor: null, helmet: null };
    for (const s of GEAR) if (c.eq && c.eq[s] && ITEMS[c.eq[s].key]) eq[s] = c.eq[s];
    if (eq.weapon && ITEMS[eq.weapon.key].wtype !== CLASSES[cls].weapon) { inv[inv.findIndex((x) => !x)] = eq.weapon; eq.weapon = { key: WEAPON_BY_TIER[CLASSES[cls].weapon][1], plus: 0 }; }
    const p = {
      id: this.id("p"), socket, name: acc.name, kingdom: acc.kingdom, cls, world: "w0",
      lvl: c.lvl, xp: c.xp, gold: c.gold, x: c.x, y: c.y, dir: c.dir || 0, inv, eq,
      lastMove: Date.now(), nextAtk: 0, cds: {}, buffs: [], dots: [], shield: 0, shieldUntil: 0, slowUntil: 0, slowPct: 0, critUntil: 0,
      nextPotion: 0, dead: false, inCombat: 0, lastChat: 0, invFullMsg: 0,
    };
    if (!this.over.map.walkable(p.x, p.y)) { p.x = 18.5; p.y = 17; }
    this.recalc(p);
    p.hp = c.hp ? Math.min(c.hp, p.maxHp) : p.maxHp;
    p.mp = c.mp ? Math.min(c.mp, p.maxMp) : p.maxMp;
    this.players.set(p.id, p);
    socket.player = p;
    const monsterDefs = Object.fromEntries(Object.entries(MONSTERS).map(([k, v]) => [k, { name: v.name, lvl: v.lvl, look: v.look, color: v.color, size: v.size, boss: !!v.boss }]));
    socket.emit("welcome", {
      id: p.id, map: mapPayload(this.over.map), kind: "over",
      items: ITEMS, monsters: monsterDefs, stones: Object.fromEntries(Object.entries(STONES).map(([k, v]) => [k, { name: v.name, lvl: v.lvl, color: v.color }])),
      classes: CLASSES, skills: SKILLS, shop: SHOP, kingdoms: KINGDOMS, dungeons: DUNGEONS, upgrade: { chances: UPGRADE.chances, max: UPGRADE.max },
    });
    this.over.dropsDirty = true;
    this.sendSelf(p);
    this.system(`${p.name} (${CLASSES[cls].name}, ${KINGDOMS[p.kingdom].name}) a rejoint le monde.`);
    if (!acc.char) this.msg(p, "Bienvenue ! Parle à l'Ancien Wei au centre du village pour les bases.", "info");
  }

  leave(p) {
    if (p.world !== "w0") { const pos = p.overPos || this.over.map.spawn; p.x = pos.x; p.y = pos.y; }
    this.persist(p);
    store.save();
    this.players.delete(p.id);
    this.system(`${p.name} a quitté le monde.`);
  }

  persist(p) {
    const inOver = p.world === "w0" && !p.dead;
    const pos = inOver ? p : p.overPos || this.over.map.spawn;
    store.saveChar(p.name, { cls: p.cls, lvl: p.lvl, xp: p.xp, gold: p.gold, hp: Math.round(p.hp), mp: Math.round(p.mp), x: r2(pos.x), y: r2(pos.y), dir: p.dir, inv: p.inv, eq: p.eq });
  }
  saveAll() { for (const p of this.players.values()) this.persist(p); store.save(); }

  itemStats(slot) {
    if (!slot) return { atk: 0, def: 0, hp: 0 };
    const it = ITEMS[slot.key], plus = slot.plus || 0;
    return {
      atk: it.atk ? Math.round(it.atk * (1 + 0.15 * plus) + plus * 2) : 0,
      def: it.def ? Math.round(it.def + plus * 1.5) : 0,
      hp: (it.hp ? Math.round(it.hp * (1 + 0.1 * plus)) : 0) + ((it.bonus && it.bonus.hp) || 0),
      mp: (it.bonus && it.bonus.mp) || 0,
    };
  }
  gearBonus(p, k) { const w = p.eq.weapon && ITEMS[p.eq.weapon.key]; return (w && w.bonus && w.bonus[k]) || 0; }

  recalc(p) {
    const c = CLASSES[p.cls], L = p.lvl - 1;
    let atk = c.atk[0] + c.atk[1] * L, def = c.def[0] + c.def[1] * L, hp = c.hp[0] + c.hp[1] * L, mp = c.mp[0] + c.mp[1] * L;
    for (const s of GEAR) { const st = this.itemStats(p.eq[s]); atk += st.atk; def += st.def; hp += st.hp; mp += st.mp || 0; }
    p.atk = Math.round(atk); p.def = Math.round(def); p.maxHp = Math.round(hp); p.maxMp = Math.round(mp);
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    if (p.mp > p.maxMp) p.mp = p.maxMp;
  }

  buffSum(p, k, now) { let s = 0; for (const b of p.buffs) if (now < b.until && b[k]) s += b[k]; return s; }
  atkEff(p, now) { return p.atk * (1 + this.buffSum(p, "atk", now)); }
  defEff(p, now) { return p.def * Math.max(0.2, 1 + this.buffSum(p, "def", now)); }
  critChance(p, now) { return CLASSES[p.cls].crit + this.buffSum(p, "crit", now) + this.gearBonus(p, "crit"); }
  speedMult(p, now) { return (1 + this.buffSum(p, "speed", now)) * (now < p.slowUntil ? 1 - p.slowPct : 1); }

  giveXp(p, xp) {
    if (p.lvl >= MAX_LEVEL) return;
    p.xp += xp;
    this.emitFx(this.worldOf(p), { k: "xp", id: p.id, v: xp });
    while (p.lvl < MAX_LEVEL && p.xp >= xpToNext(p.lvl)) {
      p.xp -= xpToNext(p.lvl); p.lvl++;
      this.recalc(p); p.hp = p.maxHp; p.mp = p.maxMp;
      this.emitFx(this.worldOf(p), { k: "lvl", id: p.id });
      this.msg(p, `Niveau ${p.lvl} atteint !`, "gold");
      const sk = SKILLS[p.cls].find((s) => s.lvl === p.lvl);
      if (sk) this.msg(p, `Nouvelle compétence : ${sk.name}`, "gold");
      const dg = Object.values(DUNGEONS).find((d) => d.lvl === p.lvl);
      if (dg) this.msg(p, `Nouveau donjon accessible : ${dg.name}`, "gold");
      if (p.lvl % 5 === 0) this.system(`🎉 ${p.name} a atteint le niveau ${p.lvl} !`);
    }
    this.sendSelf(p);
  }

  hurtPlayer(p, raw, now, special) {
    if (p.dead) return;
    let dmg = Math.max(1, Math.round(raw - this.defEff(p, now) * (special ? 0.4 : 0.7)));
    if (p.shield > 0 && now < p.shieldUntil) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed; dmg -= absorbed;
      if (absorbed) this.emitFx(this.worldOf(p), { k: "absorb", id: p.id, v: absorbed });
      if (!dmg) return;
    }
    p.hp -= dmg; p.inCombat = now;
    const w = this.worldOf(p);
    this.emitFx(w, { k: "dmg", id: p.id, v: dmg });
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.deadAt = now; p.dots = [];
      this.emitFx(w, { k: "die", id: p.id });
      for (const m of w.monsters.values()) if (m.target === p.id && !m.boss) { m.state = "return"; m.target = null; }
      this.msg(p, "Vous êtes mort...", "bad");
    }
  }

  addItem(p, key, n = 1, plus = 0) {
    const it = ITEMS[key];
    if (it.stack) { const s = p.inv.find((x) => x && x.key === key); if (s) { s.n += n; return true; } }
    const i = p.inv.findIndex((x) => !x);
    if (i < 0) return false;
    p.inv[i] = it.stack ? { key, n } : { key, plus };
    return true;
  }
  countItem(p, key) { return p.inv.reduce((a, s) => a + (s && s.key === key ? s.n || 1 : 0), 0); }
  removeItem(p, key, n) {
    for (let i = 0; i < p.inv.length && n > 0; i++) {
      const s = p.inv[i];
      if (s && s.key === key) { const take = Math.min(n, s.n || 1); n -= take; if (s.n) s.n -= take; if (!s.n || s.n <= 0) p.inv[i] = null; }
    }
  }

  pickupNear(w, p, now) {
    for (const d of w.drops.values()) {
      if (Math.hypot(d.x - p.x, d.y - p.y) > 1.1) continue;
      if (d.owner && d.owner !== p.id && now < d.ownerUntil) continue;
      if (d.key === "gold") { p.gold += d.n; this.emitFx(w, { k: "gold", id: p.id, v: d.n }); }
      else if (this.addItem(p, d.key, d.n)) this.msg(p, `Ramassé : ${ITEMS[d.key].name}`, ITEMS[d.key].unique ? "gold" : "loot");
      else { if (now > p.invFullMsg) { this.msg(p, "Inventaire plein !", "bad"); p.invFullMsg = now + 4000; } continue; }
      w.drops.delete(d.id); w.dropsDirty = true;
      this.sendSelf(p);
    }
  }

  near(p, kind, range = 4) {
    if (p.world !== "w0") return false;
    const n = this.over.map.npcs.find((x) => x.kind === kind);
    return n && Math.hypot(n.x - p.x, n.y - p.y) <= range;
  }

  // ================================================== Actions du client
  onMove(p, data) {
    if (p.dead || !data) return;
    const x = +data.x, y = +data.y, now = Date.now(), w = this.worldOf(p);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const elapsed = Math.min(1, (now - p.lastMove) / 1000);
    const max = BASE_SPEED * Math.max(1, this.speedMult(p, now)) * elapsed * 1.35 + 0.35;
    if (Math.hypot(x - p.x, y - p.y) > max || !w.map.walkable(x, y)) { p.socket.emit("correct", { x: r2(p.x), y: r2(p.y) }); p.lastMove = now; return; }
    p.x = x; p.y = y; p.lastMove = now;
    if (Number.isFinite(+data.d)) p.dir = +data.d;
    p.moving = !!data.m;
  }

  findTarget(w, p, targetId, range) {
    const t = targetId && w.monsters.get(targetId);
    const extra = (m) => (m.isStone ? 0.5 : 0) + (m.boss ? (m.def.size || 1) * 0.5 : 0);
    if (t && dist(t, p) <= range + extra(t)) return t;
    let best = null, bd = 99;
    for (const m of w.monsters.values()) {
      const d = dist(m, p);
      if (d > range + extra(m)) continue;
      const score = d - Math.cos(Math.atan2(m.y - p.y, m.x - p.x) - p.dir) * 0.8;
      if (score < bd) { bd = score; best = m; }
    }
    return best;
  }

  onAttack(p, data) {
    const now = Date.now(), c = CLASSES[p.cls], w = this.worldOf(p);
    if (p.dead || now < p.nextAtk) return;
    p.nextAtk = now + c.atkCd - 20;
    const target = this.findTarget(w, p, data && data.t, c.range + 0.3);
    if (target) p.dir = Math.atan2(target.y - p.y, target.x - p.x);
    if (p.cls === "chaman") {
      if (!target) return;
      this.emitFx(w, { k: "shot", id: p.id, to: target.id });
      this.damageMonster(w, p, target, this.atkEff(p, now) * rnd(0.9, 1.1), now);
      return;
    }
    this.emitFx(w, { k: "swing", id: p.id, d: r2(p.dir) });
    if (!target) return;
    const power = this.atkEff(p, now);
    this.damageMonster(w, p, target, power * rnd(0.9, 1.1), now);
    const extraMax = p.cls === "lame" ? 2 : p.cls === "mystique" ? 1 : 0;
    let extra = 0;
    for (const m of [...w.monsters.values()]) {
      if (extra >= extraMax) break;
      if (m === target || m.isStone || !w.monsters.has(m.id) || dist(m, p) > 1.8) continue;
      if (Math.cos(Math.atan2(m.y - p.y, m.x - p.x) - p.dir) < 0.3) continue;
      this.damageMonster(w, p, m, power * 0.6 * rnd(0.9, 1.1), now);
      extra++;
    }
  }

  onSkill(p, data) {
    const now = Date.now(), w = this.worldOf(p);
    const sk = SKILLS[p.cls].find((s) => s.id === +(data && data.n));
    if (!sk || p.dead) return;
    if (p.lvl < sk.lvl) return this.msg(p, `Compétence disponible au niveau ${sk.lvl}.`, "bad");
    if (now < (p.cds[sk.id] || 0)) return;
    if (p.mp < sk.mp) return this.msg(p, "Pas assez de mana.", "bad");
    const power = this.atkEff(p, now);
    const hit = (m, mult) => { const d = this.damageMonster(w, p, m, power * mult * rnd(0.92, 1.08), now, { lifesteal: sk.lifesteal }); if (d) this.applyEffects(w, p, m, sk, now); };
    const fx = { k: "skill", id: p.id, c: p.cls, n: sk.id, d: r2(p.dir) };
    const list = () => [...w.monsters.values()];
    const reach = (m) => (m.isStone ? 0.5 : 0) + (m.boss ? (m.def.size || 1) * 0.5 : 0);

    switch (sk.kind) {
      case "aoe": for (const m of list()) if (dist(m, p) <= sk.radius + reach(m)) hit(m, sk.mult); break;
      case "single": {
        const t = this.findTarget(w, p, data.t, sk.range);
        if (!t) return this.msg(p, "Aucune cible à portée.", "bad");
        p.dir = Math.atan2(t.y - p.y, t.x - p.x); fx.d = r2(p.dir); fx.to = t.id;
        hit(t, sk.mult);
        break;
      }
      case "cone": {
        const t = this.findTarget(w, p, data.t, sk.range + 2);
        if (t) { p.dir = Math.atan2(t.y - p.y, t.x - p.x); fx.d = r2(p.dir); }
        for (const m of list()) if (dist(m, p) <= sk.range + reach(m) && angDiff(Math.atan2(m.y - p.y, m.x - p.x), p.dir) <= sk.arc) hit(m, sk.mult);
        break;
      }
      case "dash": {
        const t = this.findTarget(w, p, data.t, sk.dist + 1);
        if (t) p.dir = Math.atan2(t.y - p.y, t.x - p.x);
        const sx = p.x, sy = p.y;
        let ex = p.x, ey = p.y;
        for (let s = 0.25; s <= sk.dist; s += 0.25) {
          const x = sx + Math.cos(p.dir) * s, y = sy + Math.sin(p.dir) * s;
          if (!w.map.walkable(x, y)) break;
          ex = x; ey = y;
        }
        p.x = ex; p.y = ey; p.lastMove = now;
        p.socket.emit("correct", { x: r2(ex), y: r2(ey) });
        const shape = { s: "line", x: sx, y: sy, a: p.dir, len: Math.hypot(ex - sx, ey - sy) + 0.5, w: sk.width };
        for (const m of list()) if (inShape(shape, m.x, m.y) || dist(m, p) < 1) hit(m, sk.mult);
        if (sk.critBuff) p.critUntil = now + sk.critBuff * 1000;
        Object.assign(fx, { d: r2(p.dir), fx: r2(sx), fy: r2(sy), tx: r2(ex), ty: r2(ey) });
        break;
      }
      case "ground": {
        const t = this.findTarget(w, p, data.t, sk.range);
        const cx = t ? t.x : p.x + Math.cos(p.dir) * 3, cy = t ? t.y : p.y + Math.sin(p.dir) * 3;
        if (t) p.dir = Math.atan2(t.y - p.y, t.x - p.x);
        for (const m of list()) if (Math.hypot(m.x - cx, m.y - cy) <= sk.radius + reach(m)) hit(m, sk.mult);
        Object.assign(fx, { tx: r2(cx), ty: r2(cy), r: sk.radius });
        break;
      }
      case "bolt": {
        let t = this.findTarget(w, p, data.t, sk.range);
        if (!t) return this.msg(p, "Aucune cible à portée.", "bad");
        p.dir = Math.atan2(t.y - p.y, t.x - p.x);
        const chain = [t], pts = [[r2(t.x), r2(t.y)]];
        for (let i = 0; i < sk.chain; i++) {
          let nb = null, nd = 4.5;
          for (const m of list()) if (!chain.includes(m) && dist(m, t) < nd) { nd = dist(m, t); nb = m; }
          if (!nb) break;
          chain.push(nb); pts.push([r2(nb.x), r2(nb.y)]); t = nb;
        }
        chain.forEach((m, i) => hit(m, sk.mult * (i ? 0.75 : 1)));
        fx.pts = pts;
        break;
      }
      case "line": {
        const t = this.findTarget(w, p, data.t, sk.length);
        if (t) p.dir = Math.atan2(t.y - p.y, t.x - p.x);
        const shape = { s: "line", x: p.x, y: p.y, a: p.dir, len: sk.length, w: sk.width };
        for (const m of list()) if (inShape(shape, m.x, m.y)) hit(m, sk.mult);
        fx.d = r2(p.dir); fx.len = sk.length;
        break;
      }
      case "buff": p.buffs.push({ ...sk.buff, until: now + sk.dur * 1000, name: sk.name }); break;
      case "party":
        for (const o of this.playersIn(w)) if (!o.dead && dist(o, p) <= sk.radius) {
          o.buffs = o.buffs.filter((b) => b.name !== sk.name);
          o.buffs.push({ ...sk.buff, until: now + sk.dur * 1000, name: sk.name });
          if (o !== p) this.msg(o, `${p.name} vous accorde : ${sk.name}`, "gold");
          this.emitFx(w, { k: "blessed", id: o.id });
        }
        break;
      case "heal": {
        const amount = Math.round(power * sk.mult + sk.flat);
        for (const o of this.playersIn(w)) if (!o.dead && dist(o, p) <= sk.radius) {
          o.hp = Math.min(o.maxHp, o.hp + amount);
          this.emitFx(w, { k: "heal", id: o.id, v: amount });
        }
        break;
      }
      case "shield": {
        const allies = this.playersIn(w).filter((o) => !o.dead && dist(o, p) <= sk.radius);
        const t = allies.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a), p);
        t.shield = Math.round(power * sk.mult + sk.flat); t.shieldUntil = now + sk.dur * 1000;
        this.emitFx(w, { k: "shielded", id: t.id });
        if (t !== p) this.msg(t, `${p.name} vous protège d'un bouclier.`, "gold");
        break;
      }
    }
    p.mp -= sk.mp;
    p.cds[sk.id] = now + sk.cd * 1000;
    p.nextAtk = now + 350;
    this.emitFx(w, fx);
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
      this.emitFx(this.worldOf(p), { k: "potion", id: p.id, c: it.mana ? "b" : "r" });
      s.n--; if (s.n <= 0) p.inv[i] = null;
      this.sendSelf(p);
    } else if (GEAR.includes(it.type)) {
      if (p.lvl < it.lvl) return this.msg(p, `Niveau ${it.lvl} requis.`, "bad");
      if (it.type === "weapon" && it.wtype !== CLASSES[p.cls].weapon) return this.msg(p, `Votre classe ne peut pas manier cette arme.`, "bad");
      const old = p.eq[it.type];
      p.eq[it.type] = { key: s.key, plus: s.plus || 0 };
      p.inv[i] = old ? { key: old.key, plus: old.plus || 0 } : null;
      this.recalc(p); this.sendSelf(p);
    }
  }

  onUseKey(p, data) {
    const key = data && data.key;
    let i = p.inv.findIndex((s) => s && s.key === key);
    if (i < 0 && key === "potion_rouge") i = p.inv.findIndex((s) => s && s.key === "grande_potion");
    if (i >= 0) this.onUse(p, { slot: i });
  }

  onUnequip(p, data) {
    const slot = data && data.slot;
    if (!GEAR.includes(slot) || !p.eq[slot]) return;
    const i = p.inv.findIndex((x) => !x);
    if (i < 0) return this.msg(p, "Inventaire plein !", "bad");
    p.inv[i] = { key: p.eq[slot].key, plus: p.eq[slot].plus || 0 };
    p.eq[slot] = null;
    this.recalc(p); this.sendSelf(p);
  }

  onSwap(p, data) {
    const a = +data.a, b = +data.b;
    if (!(a >= 0 && a < INV_SIZE && b >= 0 && b < INV_SIZE)) return;
    [p.inv[a], p.inv[b]] = [p.inv[b], p.inv[a]];
    this.sendSelf(p);
  }

  sellPrice(slot) { return Math.floor(ITEMS[slot.key].price * 0.3 * (1 + (slot.plus || 0) * 0.25)); }

  onSell(p, data) {
    if (!this.near(p, "merchant")) return this.msg(p, "Approchez-vous de la marchande.", "bad");
    const i = +data.slot, s = p.inv[i];
    if (!s) return;
    const n = s.n || 1, gain = this.sellPrice(s) * n;
    p.gold += gain; p.inv[i] = null;
    this.msg(p, `Vendu : ${ITEMS[s.key].name}${n > 1 ? " x" + n : ""} (+${gain} taels)`, "gold");
    this.sendSelf(p);
  }

  onBuy(p, data) {
    if (!this.near(p, "merchant")) return this.msg(p, "Approchez-vous de la marchande.", "bad");
    const key = data.key, n = Math.max(1, Math.min(50, Math.floor(+data.n || 1)));
    if (!SHOP.includes(key)) return;
    const it = ITEMS[key], count = it.stack ? n : 1, cost = it.price * count;
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
    if (!GEAR.includes(it.type)) return;
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
      if (result === "destroy") { if (data.from === "eq") p.eq[data.slot] = null; else p.inv[+data.slot] = null; }
    }
    const name = `${it.name} +${ok ? plus + 1 : result === "down" ? plus - 1 : plus}`;
    p.socket.emit("upgrade_result", { ok, result, name });
    if (ok) this.msg(p, `Réussite ! ${name}`, "gold");
    else this.msg(p, result === "destroy" ? `Échec... ${it.name} +${plus} a été détruit.` : result === "down" ? `Échec... l'objet redescend à +${plus - 1}.` : "Échec... l'objet n'a pas changé.", "bad");
    if (ok && plus + 1 >= 7) this.system(`🔨 ${p.name} a forgé ${name} !`);
    this.recalc(p); this.sendSelf(p);
  }

  onEnter(p, data) { this.enterDungeon(p, data && data.key); }
  onExit(p) {
    const w = this.worldOf(p);
    if (w.kind !== "dungeon") return;
    const ex = w.map.objects.find((o) => o.t === "exit");
    if (ex && Math.hypot(ex.x + 0.5 - p.x, ex.y + 0.5 - p.y) > 3.5) return this.msg(p, "Approchez-vous de la sortie.", "bad");
    this.leaveDungeon(p, "Vous quittez le donjon.");
  }

  onChat(p, data) {
    const now = Date.now();
    const text = String((data && data.text) || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!text || now - p.lastChat < 700) return;
    p.lastChat = now;
    if (text.startsWith("/")) {
      if (text === "/aide" || text === "/help") this.msg(p, "Clic gauche : se déplacer / attaquer · Clic droit maintenu : tourner la caméra · Molette : zoom · 1 à 6 : compétences · F1/F2 : potions · I : inventaire", "info");
      else if (text === "/pos") this.msg(p, `Position : ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`, "info");
      else if (text === "/joueurs") this.msg(p, `En ligne : ${[...this.players.values()].map((x) => x.name).join(", ")}`, "info");
      else if (text === "/quitter") this.leaveDungeon(p, "Vous quittez le donjon.");
      else this.msg(p, "Commande inconnue. Tapez /aide", "bad");
      return;
    }
    this.io.emit("chat", { from: p.name, k: p.kingdom, text });
  }

  onRespawn(p) {
    if (!p.dead || Date.now() - p.deadAt < 3000) return;
    const w = this.worldOf(p);
    p.dead = false; p.hp = p.maxHp; p.mp = p.maxMp; p.buffs = []; p.slowUntil = 0;
    const sp = w.map.spawn;
    p.x = sp.x + rnd(-1, 1); p.y = sp.y + rnd(-0.5, 0.5);
    if (!w.map.walkable(p.x, p.y)) { p.x = sp.x; p.y = sp.y; }
    const loss = Math.floor(xpToNext(p.lvl) * 0.04);
    p.xp = Math.max(0, p.xp - loss); p.lastMove = Date.now();
    p.socket.emit("correct", { x: r2(p.x), y: r2(p.y) });
    if (loss) this.msg(p, `Vous perdez ${loss} points d'expérience.`, "bad");
    this.sendSelf(p);
  }

  // ================================================== Messages
  msg(p, text, kind = "info") { p.socket.emit("msg", { text, kind }); }
  worldMsg(w, text, kind) { for (const p of this.playersIn(w)) this.msg(p, text, kind); }
  system(text) { this.io.emit("chat", { sys: true, text }); }
  sendSelf(p) {
    p.socket.emit("self", { name: p.name, kingdom: p.kingdom, cls: p.cls, lvl: p.lvl, xp: p.xp, xpNext: xpToNext(p.lvl), gold: p.gold,
      atk: p.atk, def: p.def, maxHp: p.maxHp, maxMp: p.maxMp, inv: p.inv, eq: p.eq, maxLevel: MAX_LEVEL, crit: Math.round(this.critChance(p, 0) * 100) });
  }

  // ================================================== Boucle
  tick() {
    const now = Date.now(), dt = TICK / 1000;
    for (const w of [...this.worlds.values()]) {
      const players = this.playersIn(w);
      if (w.kind === "dungeon") {
        if (players.length) w.emptySince = now;
        else if (now - w.emptySince > 60000) { this.worlds.delete(w.id); continue; }
        if (w.state.endsAt && !w.state.done && now > w.state.endsAt) {
          for (const p of players) this.leaveDungeon(p, "⏳ Le temps est écoulé... Le temple vous rejette.");
          w.state.done = true;
        }
        if (!players.length) continue;
      }
      for (const m of [...w.monsters.values()]) if (w.monsters.has(m.id)) this.updateMonster(w, m, now, dt);
      this.resolvePending(w, now);
      for (let i = w.respawns.length - 1; i >= 0; i--) {
        const r = w.respawns[i];
        if (now < r.at) continue;
        if (players.some((p) => Math.hypot(p.x - r.x, p.y - r.y) < 4)) { r.at = now + 5000; continue; }
        this.spawnMonster(w, r.type, r.x, r.y); w.respawns.splice(i, 1);
      }
      for (const d of w.drops.values()) if (now > d.expires) { w.drops.delete(d.id); w.dropsDirty = true; }
    }

    if (now > this.nextStoneCheck) {
      this.nextStoneCheck = now + rnd(40000, 80000);
      for (const rule of STONE_RULES) if ([...this.over.monsters.values()].filter((m) => m.isStone && m.type === rule.key).length < rule.max) this.spawnStone(rule);
    }

    for (const p of this.players.values()) {
      if (p.dead) continue;
      const w = this.worldOf(p);
      if (now - p.inCombat > 6000) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.02 * dt); p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.03 * dt); }
      else p.mp = Math.min(p.maxMp, p.mp + p.maxMp * 0.008 * dt);
      p.buffs = p.buffs.filter((b) => now < b.until);
      for (const d of p.dots) if (now >= d.next && now <= d.until) { d.next += 1000; this.hurtPlayer(p, d.dmg + this.defEff(p, now) * 0.7, now); }
      p.dots = p.dots.filter((d) => now <= d.until);
      if (now > p.shieldUntil) p.shield = 0;
      this.pickupNear(w, p, now);
    }

    // État envoyé à chaque joueur : seulement son monde et ce qui est proche
    const fxByWorld = this.fx; this.fx = new Map();
    const cache = new Map();
    for (const p of this.players.values()) {
      const w = this.worldOf(p);
      if (!cache.has(w.id)) {
        const dropList = w.dropsDirty ? [...w.drops.values()].map((d) => ({ id: d.id, k: d.key, n: d.n, x: d.x, y: d.y, o: d.owner })) : null;
        cache.set(w.id, { dropList, plist: this.playersIn(w), mlist: [...w.monsters.values()], info: this.dungeonInfo(w, now) });
      }
      const { dropList, plist, mlist, info } = cache.get(w.id);
      const snap = {
        t: now,
        p: plist.filter((o) => Math.abs(o.x - p.x) < VIEW && Math.abs(o.y - p.y) < VIEW).map((o) => ({
          id: o.id, n: o.name, c: o.cls, x: r2(o.x), y: r2(o.y), d: r2(o.dir), hp: Math.round(o.hp), mh: o.maxHp, l: o.lvl, k: o.kingdom,
          m: o.moving ? 1 : 0, dead: o.dead ? 1 : 0, w: o.eq.weapon ? ITEMS[o.eq.weapon.key].tier : 0, wk: o.eq.weapon ? o.eq.weapon.key : null,
          a: o.eq.armor ? ITEMS[o.eq.armor.key].tier : 0, h: o.eq.helmet ? ITEMS[o.eq.helmet.key].tier : 0,
          b: o.buffs.length ? 1 : 0, sh: o.shield > 0 ? 1 : 0,
        })),
        m: mlist.filter((m) => Math.abs(m.x - p.x) < VIEW && Math.abs(m.y - p.y) < VIEW).map((m) => ({
          id: m.id, t: m.type, x: r2(m.x), y: r2(m.y), d: r2(m.dir), hp: Math.round(m.hp), mh: m.maxHp, s: m.isStone ? 1 : 0, mv: m.moving ? 1 : 0,
          st: now < m.stunUntil ? 1 : 0, sh: m.shielded ? 1 : 0, fl: m.flying ? 1 : 0, cast: m.boss && now < m.castUntil ? 1 : 0,
        })),
        me: { hp: Math.round(p.hp), mp: Math.round(p.mp), mh: p.maxHp, mm: p.maxMp, dead: p.dead ? 1 : 0, spd: r2(this.speedMult(p, now)), shield: Math.round(p.shield),
          buffs: p.buffs.map((b) => ({ n: b.name, t: b.until - now })), slow: now < p.slowUntil ? 1 : 0, poison: p.dots.length ? 1 : 0 },
      };
      if (info) snap.dg = info;
      const fx = fxByWorld.get(w.id);
      if (fx) snap.fx = fx;
      if (dropList) snap.dr = dropList;
      p.socket.emit("s", snap);
    }
    for (const w of this.worlds.values()) w.dropsDirty = false;
  }
}

module.exports = { Game };
