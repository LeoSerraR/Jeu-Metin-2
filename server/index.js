// Point d'entrée du serveur : site web + connexion temps réel des joueurs.
const path = require("path");
const http = require("http");
const os = require("os");
const express = require("express");
const { Server } = require("socket.io");
const { Game } = require("./game");
const store = require("./store");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, "..", "client")));
app.get("/sante", (req, res) => res.json({ ok: true, joueurs: game.players.size }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
const game = new Game(io);

const NAME_RE = /^[A-Za-z0-9À-ÿ_-]{3,14}$/;

io.on("connection", (socket) => {
  let budget = 60, last = Date.now();
  const allowed = () => {
    const now = Date.now();
    budget = Math.min(60, budget + ((now - last) / 1000) * 40);
    last = now;
    if (budget < 1) return false;
    budget--;
    return true;
  };

  socket.on("login", (data, cb) => {
    if (typeof cb !== "function" || socket.player || !allowed()) return;
    const name = String((data && data.name) || "").trim();
    const password = String((data && data.password) || "");
    const kingdom = Math.max(0, Math.min(2, Math.floor(+(data && data.kingdom) || 0)));
    if (!NAME_RE.test(name)) return cb({ ok: false, error: "Nom invalide (3 à 14 lettres ou chiffres)." });
    if (password.length < 4 || password.length > 64) return cb({ ok: false, error: "Mot de passe : 4 caractères minimum." });
    let acc = store.getAccount(name);
    if (!acc) {
      if (data.mode !== "create") return cb({ ok: false, error: "Ce personnage n'existe pas. Créez-le d'abord." });
      acc = store.createAccount(name, password, kingdom);
      store.save();
    } else {
      if (data.mode === "create") return cb({ ok: false, error: "Ce nom est déjà pris." });
      if (!store.checkPassword(acc, password)) return cb({ ok: false, error: "Mot de passe incorrect." });
    }
    cb({ ok: true });
    game.join(socket, acc);
  });

  const on = (event, handler) => socket.on(event, (data) => {
    if (!socket.player || !allowed()) return;
    try { handler(socket.player, data || {}); } catch (e) { console.error(event, e); }
  });
  on("mv", (p, d) => game.onMove(p, d));
  on("atk", (p, d) => game.onAttack(p, d));
  on("skill", (p, d) => game.onSkill(p, d));
  on("use", (p, d) => game.onUse(p, d));
  on("usekey", (p, d) => game.onUseKey(p, d));
  on("unequip", (p, d) => game.onUnequip(p, d));
  on("swap", (p, d) => game.onSwap(p, d));
  on("sell", (p, d) => game.onSell(p, d));
  on("buy", (p, d) => game.onBuy(p, d));
  on("upgrade", (p, d) => game.onUpgrade(p, d));
  on("chat", (p, d) => game.onChat(p, d));
  on("respawn", (p) => game.onRespawn(p));

  socket.on("disconnect", () => { if (socket.player) game.leave(socket.player); });
});

server.listen(PORT, () => {
  console.log(`\n⚔  Lames de Jade est lancé !`);
  console.log(`   Sur cet ordinateur :   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) console.log(`   Sur ton téléphone (même Wi-Fi) : http://${a.address}:${PORT}`);
  }
  console.log("");
});

const shutdown = () => { game.saveAll(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
