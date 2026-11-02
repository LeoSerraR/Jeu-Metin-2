// Données du jeu : classes, compétences, objets, monstres, boss, donjons.
// Tout l'équilibrage se règle ici.

// ---------------------------------------------------------------- Classes
const CLASSES = {
  lame:     { name: "Lame",     desc: "Guerrier robuste, frappe plusieurs ennemis à la fois.", weapon: "sword",  hp: [135, 30], mp: [55, 7],  atk: [12, 3.2], def: [3, 1.1], range: 1.6, atkCd: 560, crit: 0.08 },
  ombre:    { name: "Ombre",    desc: "Assassin rapide aux dagues, coups critiques et poisons.", weapon: "dagger", hp: [110, 24], mp: [60, 8],  atk: [11, 3.4], def: [2, 0.9], range: 1.5, atkCd: 420, crit: 0.18 },
  mystique: { name: "Mystique", desc: "Épéiste des arts noirs, mêle lame et sortilèges.", weapon: "sword",  hp: [120, 26], mp: [75, 10], atk: [12, 3.3], def: [2, 1.0], range: 1.6, atkCd: 560, crit: 0.08 },
  chaman:   { name: "Chaman",   desc: "Mage de soutien : foudre à distance, soins et protections.", weapon: "fan",    hp: [100, 22], mp: [95, 13], atk: [10, 3.0], def: [2, 0.9], range: 6.5, atkCd: 720, crit: 0.08 },
};

// Types de compétences :
//  aoe (autour de soi), cone, single (une cible), dash (ruée), ground (zone ciblée), bolt (éclair en chaîne),
//  line (rayon), buff (soi), party (alliés proches), heal (soin de groupe), shield (bouclier)
// Effets possibles : stun (s), slow {pct, s}, dot {mult, s}, lifesteal, critBuff
const SKILLS = {
  lame: [
    { id: 1, name: "Tourbillon d'acier", icon: "whirl",  lvl: 1,  mp: 22, cd: 6,  kind: "aoe",   radius: 2.4, mult: 1.6, desc: "Tourne sur vous-même et frappe tout autour." },
    { id: 2, name: "Frappe du Tigre",    icon: "tiger",  lvl: 3,  mp: 18, cd: 5,  kind: "single", range: 2.2, mult: 2.8, stun: 1, desc: "Coup puissant qui étourdit 1 s." },
    { id: 3, name: "Charge du Buffle",   icon: "charge", lvl: 6,  mp: 25, cd: 9,  kind: "dash",  dist: 5, width: 1.4, mult: 1.8, stun: 0.8, desc: "Fonce en avant et renverse les ennemis." },
    { id: 4, name: "Cri de guerre",      icon: "horn",   lvl: 10, mp: 30, cd: 25, kind: "buff",  dur: 12, buff: { atk: 0.3 }, desc: "+30 % d'attaque pendant 12 s." },
    { id: 5, name: "Peau de fer",        icon: "iron",   lvl: 15, mp: 30, cd: 30, kind: "buff",  dur: 10, buff: { def: 0.6 }, desc: "+60 % de défense pendant 10 s." },
    { id: 6, name: "Fracas sismique",    icon: "quake",  lvl: 20, mp: 55, cd: 18, kind: "aoe",   radius: 3.6, mult: 3.2, slow: { pct: 0.4, s: 3 }, desc: "Frappe le sol : énormes dégâts et ralentissement." },
  ],
  ombre: [
    { id: 1, name: "Lames jumelles",     icon: "twin",   lvl: 1,  mp: 15, cd: 3,  kind: "single", range: 1.9, mult: 2.2, desc: "Deux coups rapides sur une cible." },
    { id: 2, name: "Dague empoisonnée",  icon: "poison", lvl: 3,  mp: 18, cd: 6,  kind: "single", range: 1.9, mult: 1.2, dot: { mult: 0.55, s: 6 }, desc: "Empoisonne la cible pendant 6 s." },
    { id: 3, name: "Pas de l'ombre",     icon: "shadow", lvl: 6,  mp: 20, cd: 8,  kind: "dash",  dist: 5, width: 1.2, mult: 1.5, critBuff: 3, desc: "Traverse les ennemis ; critique garanti 3 s." },
    { id: 4, name: "Éventail de lames",  icon: "fan",    lvl: 10, mp: 25, cd: 7,  kind: "cone",  range: 3.2, arc: 0.8, mult: 1.9, desc: "Lance des dagues en éventail." },
    { id: 5, name: "Voile de brume",     icon: "mist",   lvl: 15, mp: 30, cd: 25, kind: "buff",  dur: 8, buff: { speed: 0.35, crit: 0.25 }, desc: "+35 % vitesse et +25 % critique pendant 8 s." },
    { id: 6, name: "Mille entailles",    icon: "thousand", lvl: 20, mp: 50, cd: 18, kind: "aoe", radius: 2.6, mult: 4.0, desc: "Une tempête de coups autour de vous." },
  ],
  mystique: [
    { id: 1, name: "Lame spectrale",     icon: "spectral", lvl: 1, mp: 18, cd: 4, kind: "cone",  range: 2.7, arc: 0.75, mult: 1.8, desc: "Un arc d'énergie noire devant vous." },
    { id: 2, name: "Flamme noire",       icon: "flame",  lvl: 3,  mp: 22, cd: 6,  kind: "ground", range: 6, radius: 2, mult: 1.5, dot: { mult: 0.4, s: 5 }, desc: "Embrase une zone : brûlure 5 s." },
    { id: 3, name: "Drain d'âme",        icon: "drain",  lvl: 6,  mp: 25, cd: 8,  kind: "single", range: 5, mult: 2.0, lifesteal: 0.5, desc: "Vole la vie de la cible." },
    { id: 4, name: "Aura de terreur",    icon: "terror", lvl: 10, mp: 35, cd: 16, kind: "aoe",   radius: 3.2, mult: 1.0, stun: 2, desc: "Étourdit tout autour pendant 2 s." },
    { id: 5, name: "Pacte des ténèbres", icon: "pact",   lvl: 15, mp: 30, cd: 25, kind: "buff",  dur: 12, buff: { atk: 0.4, def: -0.2, lifesteal: 0.08 }, desc: "+40 % attaque et vol de vie, mais -20 % défense." },
    { id: 6, name: "Éclipse",            icon: "eclipse", lvl: 20, mp: 60, cd: 20, kind: "ground", range: 7, radius: 3.6, mult: 4.2, desc: "Fait s'effondrer les ténèbres sur une zone." },
  ],
  chaman: [
    { id: 1, name: "Éclair",             icon: "bolt",   lvl: 1,  mp: 15, cd: 2.5, kind: "bolt", range: 7.5, mult: 1.9, chain: 2, desc: "La foudre rebondit sur 3 ennemis." },
    { id: 2, name: "Souffle de guérison", icon: "heal",  lvl: 3,  mp: 25, cd: 6,  kind: "heal",  radius: 7, mult: 2.4, flat: 45, desc: "Soigne vous et vos alliés proches." },
    { id: 3, name: "Bénédiction",        icon: "bless",  lvl: 6,  mp: 35, cd: 30, kind: "party", radius: 9, dur: 25, buff: { def: 0.3, atk: 0.15 }, desc: "+30 % défense et +15 % attaque au groupe." },
    { id: 4, name: "Orage",              icon: "storm",  lvl: 10, mp: 40, cd: 12, kind: "ground", range: 7, radius: 3, mult: 2.6, stun: 1, desc: "La foudre frappe une zone et étourdit." },
    { id: 5, name: "Bouclier de jade",   icon: "shield", lvl: 15, mp: 30, cd: 15, kind: "shield", radius: 8, mult: 3, flat: 60, dur: 10, desc: "Protège l'allié le plus blessé (ou vous)." },
    { id: 6, name: "Dragon de foudre",   icon: "dragon", lvl: 20, mp: 60, cd: 18, kind: "line",  length: 9, width: 1.8, mult: 3.8, desc: "Un dragon de foudre traverse les ennemis." },
  ],
};

// ---------------------------------------------------------------- Objets
// wtype : sword (Lame, Mystique), dagger (Ombre), fan (Chaman)
const ITEMS = {
  epee_bambou:     { name: "Épée de bambou",      type: "weapon", wtype: "sword",  lvl: 1,  atk: 6,  price: 60,   tier: 1 },
  lame_fer:        { name: "Lame de fer",         type: "weapon", wtype: "sword",  lvl: 5,  atk: 15, price: 700,  tier: 2 },
  sabre_croissant: { name: "Sabre du Croissant",  type: "weapon", wtype: "sword",  lvl: 10, atk: 28, price: 2600, tier: 3 },
  glaive_jade:     { name: "Glaive de Jade",      type: "weapon", wtype: "sword",  lvl: 15, atk: 45, price: 7000, tier: 4 },
  dague_bronze:    { name: "Dagues de bronze",    type: "weapon", wtype: "dagger", lvl: 1,  atk: 5,  price: 60,   tier: 1 },
  dague_fer:       { name: "Dagues de fer",       type: "weapon", wtype: "dagger", lvl: 5,  atk: 14, price: 700,  tier: 2 },
  kriss_lune:      { name: "Kriss de lune",       type: "weapon", wtype: "dagger", lvl: 10, atk: 26, price: 2600, tier: 3 },
  crocs_jade:      { name: "Crocs de Jade",       type: "weapon", wtype: "dagger", lvl: 15, atk: 42, price: 7000, tier: 4 },
  eventail_papier: { name: "Éventail de papier",  type: "weapon", wtype: "fan",    lvl: 1,  atk: 5,  price: 60,   tier: 1 },
  eventail_fer:    { name: "Éventail de fer",     type: "weapon", wtype: "fan",    lvl: 5,  atk: 14, price: 700,  tier: 2 },
  eventail_grue:   { name: "Éventail de la Grue", type: "weapon", wtype: "fan",    lvl: 10, atk: 26, price: 2600, tier: 3 },
  eventail_jade:   { name: "Éventail de Jade",    type: "weapon", wtype: "fan",    lvl: 15, atk: 42, price: 7000, tier: 4 },

  // Armes exclusives des boss : impossibles à obtenir ailleurs
  epee_gardien:    { name: "Épée du Gardien de Bronze",   type: "weapon", wtype: "sword",  lvl: 10, atk: 36, price: 9000,  tier: 5, unique: "gardien_bronze", bonus: { hp: 120 } },
  dagues_gardien:  { name: "Dagues jumelles de Bronze",   type: "weapon", wtype: "dagger", lvl: 10, atk: 33, price: 9000,  tier: 5, unique: "gardien_bronze", bonus: { hp: 100 } },
  eventail_lanternes: { name: "Éventail des Mille Lanternes", type: "weapon", wtype: "fan", lvl: 10, atk: 33, price: 9000, tier: 5, unique: "gardien_bronze", bonus: { mp: 80 } },
  croc_reine:      { name: "Croc de la Reine Tisseuse",   type: "weapon", wtype: "sword",  lvl: 14, atk: 52, price: 18000, tier: 5, unique: "reine_tisseuse", bonus: { lifesteal: 0.05 } },
  dagues_venin:    { name: "Dagues Venimeuses",           type: "weapon", wtype: "dagger", lvl: 14, atk: 48, price: 18000, tier: 5, unique: "reine_tisseuse", bonus: { crit: 0.08 } },
  eventail_soie:   { name: "Éventail de Soie Noire",      type: "weapon", wtype: "fan",    lvl: 14, atk: 48, price: 18000, tier: 5, unique: "reine_tisseuse", bonus: { mp: 150 } },
  lame_dragon:     { name: "Lame du Dragon de Jade",      type: "weapon", wtype: "sword",  lvl: 18, atk: 74, price: 40000, tier: 6, unique: "dragon_jade", bonus: { crit: 0.08, hp: 200 } },
  griffes_dragon:  { name: "Griffes du Dragon",           type: "weapon", wtype: "dagger", lvl: 18, atk: 70, price: 40000, tier: 6, unique: "dragon_jade", bonus: { crit: 0.12 } },
  eventail_ciel:   { name: "Éventail du Ciel de Jade",    type: "weapon", wtype: "fan",    lvl: 18, atk: 70, price: 40000, tier: 6, unique: "dragon_jade", bonus: { mp: 200, lifesteal: 0.04 } },

  tunique_lin:     { name: "Tunique de lin",      type: "armor",  lvl: 1,  def: 3,  hp: 20,  price: 60,   tier: 1 },
  cuirasse_cuir:   { name: "Cuirasse de cuir",    type: "armor",  lvl: 5,  def: 8,  hp: 60,  price: 700,  tier: 2 },
  armure_ecailles: { name: "Armure d'écailles",   type: "armor",  lvl: 10, def: 15, hp: 120, price: 2600, tier: 3 },
  armure_jade:     { name: "Armure de Jade",      type: "armor",  lvl: 15, def: 25, hp: 200, price: 7000, tier: 4 },
  chapeau_paille:  { name: "Chapeau de paille",   type: "helmet", lvl: 1,  def: 2,  hp: 10,  price: 50,   tier: 1 },
  casque_fer:      { name: "Casque de fer",       type: "helmet", lvl: 7,  def: 6,  hp: 40,  price: 1200, tier: 2 },
  casque_dragon:   { name: "Casque du Dragon",    type: "helmet", lvl: 13, def: 11, hp: 90,  price: 4500, tier: 3 },

  potion_rouge:    { name: "Potion rouge",        type: "potion", heal: 90,  price: 25,  stack: true },
  grande_potion:   { name: "Grande potion rouge", type: "potion", heal: 300, price: 90,  stack: true },
  potion_bleue:    { name: "Potion bleue",        type: "potion", mana: 60,  price: 25,  stack: true },
  pierre_forge:    { name: "Pierre de forge",     type: "material", price: 120, stack: true },
  croc_loup:       { name: "Croc de loup",        type: "junk", price: 12, stack: true },
  defense_sanglier:{ name: "Défense de sanglier", type: "junk", price: 25, stack: true },
  bandeau_bandit:  { name: "Bandeau de bandit",   type: "junk", price: 45, stack: true },
  ectoplasme:      { name: "Ectoplasme",          type: "junk", price: 80, stack: true },
  rouage_bronze:   { name: "Rouage de bronze",    type: "junk", price: 70, stack: true },
  soie_araignee:   { name: "Soie d'araignée",     type: "junk", price: 90, stack: true },
  ecaille_jade:    { name: "Écaille de jade",     type: "junk", price: 160, stack: true },
};
const WEAPON_BY_TIER = {
  sword: [null, "epee_bambou", "lame_fer", "sabre_croissant", "glaive_jade"],
  dagger: [null, "dague_bronze", "dague_fer", "kriss_lune", "crocs_jade"],
  fan: [null, "eventail_papier", "eventail_fer", "eventail_grue", "eventail_jade"],
};

// ---------------------------------------------------------------- Monstres
// "@w2" = arme de rang 2 adaptée à la classe de celui qui récupère le butin
const MONSTERS = {
  loup:        { name: "Loup gris", lvl: 1, hp: 60, atk: 9, def: 1, speed: 2.4, xp: 14, aggro: false, gold: [2, 7], look: "wolf", color: "#8d8f96", size: 0.9,
    drops: [["croc_loup", 0.45], ["potion_rouge", 0.08], ["@w1", 0.03], ["chapeau_paille", 0.03]] },
  loup_noir:   { name: "Loup noir", lvl: 4, hp: 150, atk: 17, def: 3, speed: 2.8, xp: 34, aggro: true, gold: [5, 14], look: "wolf", color: "#33343b", size: 1.0,
    drops: [["croc_loup", 0.6], ["potion_rouge", 0.12], ["tunique_lin", 0.04], ["@w2", 0.015]] },
  sanglier:    { name: "Sanglier sauvage", lvl: 6, hp: 260, atk: 23, def: 6, speed: 2.2, xp: 55, aggro: false, gold: [8, 20], look: "boar", color: "#6b4a33", size: 1.1,
    drops: [["defense_sanglier", 0.55], ["potion_rouge", 0.14], ["cuirasse_cuir", 0.025], ["pierre_forge", 0.04]] },
  bandit:      { name: "Bandit masqué", lvl: 9, hp: 420, atk: 33, def: 10, speed: 2.7, xp: 95, aggro: true, gold: [15, 40], look: "bandit", color: "#7a1f2b", size: 1.0,
    drops: [["bandeau_bandit", 0.5], ["grande_potion", 0.08], ["@w2", 0.04], ["casque_fer", 0.03], ["pierre_forge", 0.06]] },
  chef_bandit: { name: "Chef des bandits", lvl: 13, hp: 900, atk: 50, def: 15, speed: 2.6, xp: 210, aggro: true, gold: [40, 90], look: "bandit", color: "#2d1a4a", size: 1.25,
    drops: [["bandeau_bandit", 0.8], ["grande_potion", 0.25], ["@w3", 0.05], ["armure_ecailles", 0.05], ["pierre_forge", 0.2]] },
  spectre:     { name: "Spectre errant", lvl: 15, hp: 1100, atk: 62, def: 18, speed: 2.5, xp: 280, aggro: true, gold: [50, 120], look: "ghost", color: "#7fd8d0", size: 1.1,
    drops: [["ectoplasme", 0.6], ["grande_potion", 0.2], ["casque_dragon", 0.03], ["@w4", 0.012], ["armure_jade", 0.012], ["pierre_forge", 0.2]] },

  // Donjons
  soldat_bronze:   { name: "Soldat de bronze", lvl: 9, hp: 520, atk: 34, def: 12, speed: 2.3, xp: 110, aggro: true, gold: [15, 35], look: "golem", color: "#b0793a", size: 1.0,
    drops: [["rouage_bronze", 0.5], ["grande_potion", 0.1], ["pierre_forge", 0.08]] },
  lanterne_hantee: { name: "Lanterne hantée", lvl: 8, hp: 300, atk: 30, def: 6, speed: 3.0, xp: 80, aggro: true, gold: [10, 25], look: "lantern", color: "#e8534a", size: 0.9,
    drops: [["potion_bleue", 0.2], ["pierre_forge", 0.05]] },
  araignee:        { name: "Araignée tisseuse", lvl: 12, hp: 420, atk: 40, def: 12, speed: 3.0, xp: 150, aggro: true, gold: [20, 45], look: "spider", color: "#3b2f4a", size: 1.0,
    drops: [["soie_araignee", 0.5], ["grande_potion", 0.12], ["pierre_forge", 0.1]] },
  araignee_petite: { name: "Araignéeteau", lvl: 11, hp: 170, atk: 28, def: 6, speed: 3.4, xp: 60, aggro: true, gold: [5, 12], look: "spider", color: "#5a4a6b", size: 0.6,
    drops: [["soie_araignee", 0.2]] },
  garde_jade:      { name: "Garde du temple", lvl: 17, hp: 1300, atk: 72, def: 24, speed: 2.5, xp: 360, aggro: true, gold: [60, 140], look: "guardian", color: "#2f8f6f", size: 1.15,
    drops: [["ecaille_jade", 0.5], ["grande_potion", 0.2], ["pierre_forge", 0.25], ["@w4", 0.02]] },
  salamandre:      { name: "Salamandre de jade", lvl: 16, hp: 850, atk: 62, def: 16, speed: 3.1, xp: 260, aggro: true, gold: [40, 90], look: "lizard", color: "#4fbf7f", size: 1.0,
    drops: [["ecaille_jade", 0.4], ["grande_potion", 0.15]] },

  // Boss
  gardien_bronze: { name: "Gardien de Bronze", lvl: 12, hp: 9000, atk: 55, def: 16, speed: 2.4, xp: 2200, aggro: true, gold: [400, 700], look: "golem", color: "#c08a3e", size: 2.3, boss: true,
    drops: [["pierre_forge", 1], ["pierre_forge", 0.8], ["pierre_forge", 0.5], ["armure_ecailles", 0.25], ["casque_fer", 0.3], ["grande_potion", 1]] },
  reine_tisseuse: { name: "Reine Tisseuse", lvl: 15, hp: 16000, atk: 70, def: 20, speed: 2.6, xp: 4200, aggro: true, gold: [800, 1300], look: "spider", color: "#5b2a6e", size: 2.6, boss: true,
    drops: [["pierre_forge", 1], ["pierre_forge", 1], ["pierre_forge", 0.6], ["casque_dragon", 0.25], ["armure_ecailles", 0.3], ["grande_potion", 1]] },
  dragon_jade:    { name: "Dragon de Jade", lvl: 20, hp: 32000, atk: 95, def: 28, speed: 2.8, xp: 9000, aggro: true, gold: [2000, 3500], look: "dragon", color: "#2fbf8f", size: 3.0, boss: true,
    drops: [["pierre_forge", 1], ["pierre_forge", 1], ["pierre_forge", 1], ["armure_jade", 0.35], ["casque_dragon", 0.4], ["grande_potion", 1]] },
};

// Attaques des boss. shape : circle (r), donut (rIn, rOut), cone (r, arc = demi-angle en radians), line (len, w)
// at : self (centré sur le boss), target (sur un joueur), each (sur chaque joueur), random (n points au hasard)
const BOSS_PATTERNS = {
  gardien_bronze: [
    { name: "Écrasement", shape: "circle", at: "self", r: 3.6, tele: 1.6, dmg: 1.9, cd: 7 },
    { name: "Charge de bronze", shape: "line", at: "target", len: 10, w: 2.2, tele: 1.3, dmg: 1.7, cd: 9, dashToEnd: true },
    { name: "Pluie de lanternes", shape: "circle", at: "each", r: 2.2, tele: 1.8, dmg: 1.4, cd: 11 },
    { name: "Onde de choc", shape: "donut", at: "self", rIn: 3, rOut: 10, tele: 2.0, dmg: 2.0, cd: 13, below: 0.5 },
  ],
  reine_tisseuse: [
    { name: "Crachat venimeux", shape: "cone", at: "target", r: 8, arc: 0.55, tele: 1.4, dmg: 1.5, cd: 6, poison: { pct: 0.02, s: 6 } },
    { name: "Toiles collantes", shape: "circle", at: "random", n: 5, r: 2.4, tele: 1.6, dmg: 0.8, cd: 10, slow: { pct: 0.5, s: 4 } },
    { name: "Bond de la reine", shape: "circle", at: "farthest", r: 3.2, tele: 1.5, dmg: 2.1, cd: 12, jump: true },
    { name: "Ponte", summon: { type: "araignee_petite", n: 4 }, cd: 16 },
  ],
  dragon_jade: [
    { name: "Souffle de jade", shape: "cone", at: "target", r: 10, arc: 0.75, tele: 1.6, dmg: 2.2, cd: 7, phase: [1, 3] },
    { name: "Coup de queue", shape: "cone", at: "behind", r: 6, arc: 1.0, tele: 1.2, dmg: 1.8, cd: 8, phase: [1, 3] },
    { name: "Pluie de météores", shape: "circle", at: "random", n: 9, r: 2.6, tele: 1.9, dmg: 1.9, cd: 4.5, phase: [2] },
    { name: "Tempête céleste", shape: "donut", at: "self", rIn: 4, rOut: 16, tele: 2.0, dmg: 2.5, cd: 11, phase: [3] },
    { name: "Griffes", shape: "circle", at: "self", r: 3, tele: 1.0, dmg: 1.5, cd: 6, phase: [3] },
  ],
};

// ---------------------------------------------------------------- Pierres maudites et sceaux
const STONES = {
  pierre_maudite: { name: "Pierre maudite", lvl: 5, hp: 1600, def: 4, xp: 400, waves: ["loup_noir", "sanglier"], waveSize: 3, color: "#7b3fe4",
    gold: [80, 160], drops: [["pierre_forge", 0.9], ["pierre_forge", 0.4], ["@w2", 0.12], ["cuirasse_cuir", 0.12], ["casque_fer", 0.06], ["grande_potion", 0.5]] },
  pierre_chaos:   { name: "Pierre du Chaos", lvl: 12, hp: 4500, def: 12, xp: 1400, waves: ["bandit", "chef_bandit", "spectre"], waveSize: 4, color: "#e43f5a",
    gold: [300, 600], drops: [["pierre_forge", 1], ["pierre_forge", 0.7], ["pierre_forge", 0.4], ["@w3", 0.15], ["armure_ecailles", 0.15], ["casque_dragon", 0.08], ["@w4", 0.04], ["armure_jade", 0.04]] },
  sceau_toile:    { name: "Sceau de soie", lvl: 13, hp: 3000, def: 10, xp: 600, waves: ["araignee_petite", "araignee"], waveSize: 3, color: "#c86bff",
    gold: [100, 200], drops: [["soie_araignee", 1], ["pierre_forge", 0.5]] },
};

// ---------------------------------------------------------------- Donjons
const DUNGEONS = {
  tour: {
    name: "Tour des Mille Lanternes", lvl: 8, boss: "gardien_bronze", theme: "tour",
    concept: "Chaque salle reste scellée tant que tous ses gardiens ne sont pas vaincus. Gravissez les étages jusqu'au Gardien de Bronze.",
  },
  nid: {
    name: "Nid de la Reine Tisseuse", lvl: 13, boss: "reine_tisseuse", theme: "nid",
    concept: "La Reine est protégée par quatre Sceaux de soie. Brisez-les tous pour pouvoir la blesser.",
  },
  temple: {
    name: "Temple du Dragon de Jade", lvl: 18, boss: "dragon_jade", theme: "temple", timeLimit: 12 * 60,
    concept: "Contre-la-montre : 12 minutes pour vaincre le Dragon. Il change de forme en trois phases.",
  },
};

// ---------------------------------------------------------------- Forge, boutique, royaumes
const UPGRADE = {
  chances: [100, 95, 90, 80, 70, 55, 40, 30, 20],
  max: 9,
  goldCost(item, plus) { return Math.round(80 * Math.min(item.tier || 1, 5) * Math.pow(plus + 1, 1.8)); },
  stoneCost(plus) { return plus < 3 ? 0 : 1 + Math.floor((plus - 3) / 2); },
  failResult(plus) { return plus < 4 ? "keep" : plus < 6 ? "down" : "destroy"; },
};

const SHOP = ["potion_rouge", "grande_potion", "potion_bleue", "tunique_lin", "chapeau_paille", "cuirasse_cuir", "casque_fer",
  "epee_bambou", "lame_fer", "dague_bronze", "dague_fer", "eventail_papier", "eventail_fer"];

const KINGDOMS = [
  { id: 0, name: "Royaume de l'Aube",      color: "#e8534a" },
  { id: 1, name: "Royaume du Zénith",      color: "#e8b94a" },
  { id: 2, name: "Royaume du Crépuscule", color: "#4a8de8" },
];

function xpToNext(lvl) { return Math.floor(90 * Math.pow(lvl, 1.75)); }
const MAX_LEVEL = 30;

module.exports = { CLASSES, SKILLS, ITEMS, WEAPON_BY_TIER, MONSTERS, BOSS_PATTERNS, STONES, DUNGEONS, UPGRADE, SHOP, KINGDOMS, xpToNext, MAX_LEVEL };
