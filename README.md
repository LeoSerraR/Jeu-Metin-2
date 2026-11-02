# ⚔ Lames de Jade

Un MMORPG 2D isométrique multijoueur, jouable dans le navigateur sur **PC et mobile**.
Univers original d'arts martiaux : trois royaumes, des **Pierres maudites** qui tombent du ciel,
du combat en temps réel, du butin et une forge où l'on améliore son équipement de +0 à +9.

## Lancer le jeu sur ton ordinateur

1. Installe **Node.js** (version « LTS ») depuis https://nodejs.org. C'est gratuit.
2. Télécharge ce dépôt : bouton vert **Code**, puis **Download ZIP**, et décompresse-le.
3. **Windows** : double-clique sur `lancer.bat`.
   **Mac / Linux** : ouvre un terminal dans le dossier et tape `./lancer.sh`.
4. Le jeu s'ouvre sur http://localhost:3000. Crée ton personnage et joue.

### Jouer sur ton téléphone

Le téléphone doit être sur **le même Wi-Fi** que l'ordinateur. Au lancement, la fenêtre du serveur
affiche une adresse du type `http://192.168.x.x:3000` : ouvre-la dans le navigateur du téléphone.
Si ça ne marche pas, autorise Node.js dans le pare-feu Windows quand il le demande.

### Jouer avec des amis

Tous les joueurs connectés au même serveur se voient et jouent ensemble.
Sur le même Wi-Fi, il suffit de partager l'adresse ci-dessus. Pour jouer à distance,
il faudra héberger le serveur en ligne (prévu dans la feuille de route).

## Commandes

| Action | PC | Mobile |
|---|---|---|
| Se déplacer | Clic gauche (maintenir pour suivre la souris), ZQSD ou flèches | Joystick |
| Attaquer | Clic sur un monstre, ou Espace (cible la plus proche) | Bouton ⚔ |
| Compétences | 1, 2, 3 | Boutons 🌀 🐯 📯 |
| Potions | 4 (rouge), 5 (bleue) | Boutons potions |
| Inventaire | I | Bouton 🎒 |
| Cibler le plus proche | Tab | — |
| Discuter | Entrée | Bouton 💬 |
| Parler à un PNJ | Clic dessus | Toucher |

Commandes de chat : `/aide`, `/joueurs`, `/pos`.

## Contenu de la version 0.1

- Carte de 96 × 96 cases : village, Plaine des Loups, Collines Venteuses, Forêt des Bandits, Vallée des Spectres
- Classe **Lame** (guerrier) avec 3 compétences : Tourbillon d'acier, Frappe du Tigre, Cri de guerre
- 6 types de monstres avec IA (errance, agressivité, appel à l'aide, retour au point de départ)
- 2 types de **Pierres maudites** qui invoquent des vagues de monstres
- Butin au sol, réservé 15 s à celui qui a fait le plus de dégâts
- 30 niveaux, 15 équipements, potions, matériaux
- **Forge** +0 à +9 avec risque d'échec, **boutique**, revente du butin
- Comptes protégés par mot de passe, sauvegarde automatique
- Chat global, mini-carte, effets visuels, interface adaptée au tactile

## Structure du projet

```
server/        Serveur Node.js (règles du jeu, multijoueur)
  data.js      Équilibrage : objets, monstres, pierres, compétences, forge
  map.js       Génération de la carte
  game.js      Logique du monde
  index.js     Démarrage, connexions
client/        Ce qui s'affiche dans le navigateur
  js/art.js    Graphismes dessinés par le code
  js/main.js   Affichage, commandes, interface
tests/bots.js  Test automatique avec deux joueurs-robots (npm test, serveur lancé)
ROADMAP.md     Feuille de route
```

Les sauvegardes des joueurs sont dans `data/players.json` (non envoyé sur GitHub).

## Licence et droits

Projet original. Inspiré des MMORPG d'arts martiaux, sans aucun nom, graphisme ou contenu
appartenant à un autre jeu. Tous droits réservés à l'auteur du dépôt.
