// Sauvegarde des comptes joueurs dans data/players.json
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = process.env.SAVE_FILE || path.join(__dirname, "..", "data", "players.json");
let db = {};
let dirty = false;

function load() {
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { db = {}; }
}

function save() {
  if (!dirty) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
  dirty = false;
}

function hash(password, salt) { return crypto.scryptSync(password, salt, 32).toString("hex"); }

function getAccount(name) { return db[name.toLowerCase()] || null; }

function createAccount(name, password, kingdom, cls) {
  const salt = crypto.randomBytes(16).toString("hex");
  const acc = { name, salt, hash: hash(password, salt), kingdom, cls, created: Date.now(), char: null };
  db[name.toLowerCase()] = acc;
  dirty = true;
  return acc;
}

function checkPassword(acc, password) {
  const h = hash(password, acc.salt);
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(acc.hash, "hex"));
}

function saveChar(name, char) {
  const acc = db[name.toLowerCase()];
  if (!acc) return;
  acc.char = char;
  dirty = true;
}

load();
module.exports = { getAccount, createAccount, checkPassword, saveChar, save };
