// Données du jeu : objets, monstres, pierres, compétences, PNJ.
// Tout l'équilibrage se règle ici.

const ITEMS = {
  // Armes (classe Lame)
  epee_bambou:     { name: "Épée de bambou",      type: "weapon", lvl: 1,  atk: 6,  price: 60,   icon: "sword",  tier: 1 },
  lame_fer:        { name: "Lame de fer",         type: "weapon", lvl: 5,  atk: 15, price: 700,  icon: "sword",  tier: 2 },
  sabre_croissant: { name: "Sabre du Croissant",  type: "weapon", lvl: 10, atk: 28, price: 2600, icon: "sword",  tier: 3 },
  glaive_jade:     { name: "Glaive de Jade",      type: "weapon", lvl: 15, atk: 45, price: 7000, icon: "sword",  tier: 4 },

  // Armures
  tunique_lin:     { name: "Tunique de lin",      type: "armor",  lvl: 1,  def: 3,  hp: 20,  price: 60,   icon: "armor",  tier: 1 },
  cuirasse_cuir:   { name: "Cuirasse de cuir",    type: "armor",  lvl: 5,  def: 8,  hp: 60,  price: 700,  icon: "armor",  tier: 2 },
  armure_ecailles: { name: "Armure d'écailles",   type: "armor",  lvl: 10, def: 15, hp: 120, price: 2600, icon: "armor",  tier: 3 },
  armure_jade:     { name: "Armure de Jade",      type: "armor",  lvl: 15, def: 25, hp: 200, price: 7000, icon: "armor",  tier: 4 },

  // Casques
  chapeau_paille:  { name: "Chapeau de paille",   type: "helmet", lvl: 1,  def: 2,  hp: 10,  price: 50,   icon: "helmet", tier: 1 },
  casque_fer:      { name: "Casque de fer",       type: "helmet", lvl: 7,  def: 6,  hp: 40,  price: 1200, icon: "helmet", tier: 2 },
  casque_dragon:   { name: "Casque du Dragon",    type: "helmet", lvl: 13, def: 11, hp: 90,  price: 4500, icon: "helmet", tier: 3 },

  // Consommables
  potion_rouge:    { name: "Potion rouge",        type: "potion", heal: 90,  price: 25,  icon: "potion_r", stack: true },
  grande_potion:   { name: "Grande potion rouge", type: "potion", heal: 300, price: 90,  icon: "potion_R", stack: true },
  potion_bleue:    { name: "Potion bleue",        type: "potion", mana: 60,  price: 25,  icon: "potion_b", stack: true },

  // Matériaux et butin à revendre
  pierre_forge:    { name: "Pierre de forge",     type: "material", price: 120, icon: "ore",   stack: true },
  croc_loup:       { name: "Croc de loup",        type: "junk",     price: 12,  icon: "fang",  stack: true },
  defense_sanglier:{ name: "Défense de sanglier", type: "junk",     price: 25,  icon: "tusk",  stack: true },
  bandeau_bandit:  { name: "Bandeau de bandit",   type: "junk",     price: 45,  icon: "cloth", stack: true },
  ectoplasme:      { name: "Ectoplasme",          type: "junk",     price: 80,  icon: "ecto",  stack: true },
};

// drops : [clé, probabilité]
const MONSTERS = {
  loup: {
    name: "Loup gris", lvl: 1, hp: 60, atk: 9, def: 1, speed: 2.4, xp: 14, aggro: false,
    gold: [2, 7], drops: [["croc_loup", 0.45], ["potion_rouge", 0.08], ["epee_bambou", 0.03], ["chapeau_paille", 0.03]],
    look: "wolf", color: "#8d8f96", size: 0.9,
  },
  loup_noir: {
    name: "Loup noir", lvl: 4, hp: 150, atk: 17, def: 3, speed: 2.8, xp: 34, aggro: true,
    gold: [5, 14], drops: [["croc_loup", 0.6], ["potion_rouge", 0.12], ["tunique_lin", 0.04], ["lame_fer", 0.015]],
    look: "wolf", color: "#33343b", size: 1.0,
  },
  sanglier: {
    name: "Sanglier sauvage", lvl: 6, hp: 260, atk: 23, def: 6, speed: 2.2, xp: 55, aggro: false,
    gold: [8, 20], drops: [["defense_sanglier", 0.55], ["potion_rouge", 0.14], ["cuirasse_cuir", 0.025], ["pierre_forge", 0.04]],
    look: "boar", color: "#6b4a33", size: 1.1,
  },
  bandit: {
    name: "Bandit masqué", lvl: 9, hp: 420, atk: 33, def: 10, speed: 2.7, xp: 95, aggro: true,
    gold: [15, 40], drops: [["bandeau_bandit", 0.5], ["grande_potion", 0.08], ["lame_fer", 0.04], ["casque_fer", 0.03], ["pierre_forge", 0.06]],
    look: "bandit", color: "#7a1f2b", size: 1.0,
  },
  chef_bandit: {
    name: "Chef des bandits", lvl: 13, hp: 900, atk: 50, def: 15, speed: 2.6, xp: 210, aggro: true,
    gold: [40, 90], drops: [["bandeau_bandit", 0.8], ["grande_potion", 0.25], ["sabre_croissant", 0.05], ["armure_ecailles", 0.05], ["pierre_forge", 0.2]],
    look: "bandit", color: "#2d1a4a", size: 1.25,
  },
  spectre: {
    name: "Spectre errant", lvl: 15, hp: 1100, atk: 62, def: 18, speed: 2.5, xp: 280, aggro: true,
    gold: [50, 120], drops: [["ectoplasme", 0.6], ["grande_potion", 0.2], ["casque_dragon", 0.03], ["glaive_jade", 0.012], ["armure_jade", 0.012], ["pierre_forge", 0.2]],
    look: "ghost", color: "#7fd8d0", size: 1.1,
  },
};

// Pierres maudites : tombent du ciel, invoquent des vagues quand on les frappe.
const STONES = {
  pierre_maudite: {
    name: "Pierre maudite", lvl: 5, hp: 1600, def: 4, xp: 400, waves: ["loup_noir", "sanglier"], waveSize: 3,
    gold: [80, 160], drops: [["pierre_forge", 0.9], ["pierre_forge", 0.4], ["lame_fer", 0.12], ["cuirasse_cuir", 0.12], ["casque_fer", 0.06], ["grande_potion", 0.5]],
    color: "#7b3fe4",
  },
  pierre_chaos: {
    name: "Pierre du Chaos", lvl: 12, hp: 4500, def: 12, xp: 1400, waves: ["bandit", "chef_bandit", "spectre"], waveSize: 4,
    gold: [300, 600], drops: [["pierre_forge", 1], ["pierre_forge", 0.7], ["pierre_forge", 0.4], ["sabre_croissant", 0.15], ["armure_ecailles", 0.15], ["casque_dragon", 0.08], ["glaive_jade", 0.04], ["armure_jade", 0.04]],
    color: "#e43f5a",
  },
};

const SKILLS = [
  { id: 1, name: "Tourbillon d'acier", mp: 22, cd: 6, lvl: 1, radius: 2.3, mult: 1.6, desc: "Frappe tous les ennemis autour de vous." },
  { id: 2, name: "Frappe du Tigre",    mp: 18, cd: 4, lvl: 5, range: 2.2, mult: 2.8, desc: "Un coup puissant devant vous." },
  { id: 3, name: "Cri de guerre",      mp: 30, cd: 25, lvl: 10, duration: 10, bonus: 0.3, desc: "+30 % d'attaque pendant 10 s." },
];

// Forge : chances de réussite pour passer de +N à +N+1
const UPGRADE = {
  chances: [100, 95, 90, 80, 70, 55, 40, 30, 20],
  max: 9,
  goldCost(item, plus) { return Math.round(80 * (item.tier || 1) * Math.pow(plus + 1, 1.8)); },
  stoneCost(plus) { return plus < 3 ? 0 : 1 + Math.floor((plus - 3) / 2); },
  // Échec : +0..+3 rien perdu (sauf le coût), +4..+5 l'objet perd 1 niveau, +6 et plus l'objet est détruit
  failResult(plus) { return plus < 4 ? "keep" : plus < 6 ? "down" : "destroy"; },
};

const SHOP = ["potion_rouge", "grande_potion", "potion_bleue", "epee_bambou", "tunique_lin", "chapeau_paille", "lame_fer", "cuirasse_cuir", "casque_fer"];

const KINGDOMS = [
  { id: 0, name: "Royaume de l'Aube",      color: "#e8534a" },
  { id: 1, name: "Royaume du Zénith",      color: "#e8b94a" },
  { id: 2, name: "Royaume du Crépuscule", color: "#4a8de8" },
];

function xpToNext(lvl) { return Math.floor(90 * Math.pow(lvl, 1.75)); }
const MAX_LEVEL = 30;

module.exports = { ITEMS, MONSTERS, STONES, SKILLS, UPGRADE, SHOP, KINGDOMS, xpToNext, MAX_LEVEL };
