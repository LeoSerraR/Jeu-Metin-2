# ⚔ Lames de Jade

Un MMORPG **3D** multijoueur, jouable dans le navigateur sur **PC et mobile**, avec caméra libre.
Univers original d'arts martiaux : trois royaumes, quatre classes, des **Pierres maudites** qui tombent du ciel,
des **donjons** aux boss à patterns, du butin et une forge où l'on améliore son équipement de +0 à +9.

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
| Tourner la caméra | Clic droit maintenu, ou A / E | Glisser un doigt sur l'écran |
| Zoom | Molette | Pincer à deux doigts |
| Attaquer | Clic sur un monstre, ou Espace | Bouton d'attaque |
| Compétences | 1 à 6 | Boutons de compétences |
| Potions | F1 / F2 (ou 7 / 8) | Boutons potions |
| Inventaire | I | Bouton 🎒 |
| Cibler le plus proche | Tab | — |
| Discuter | Entrée | Bouton 💬 |
| Parler, entrer dans un donjon | Clic sur le PNJ ou le portail | Toucher |

Commandes de chat : `/aide`, `/joueurs`, `/pos`, `/quitter` (sortir d'un donjon).

## Les 4 classes (6 compétences chacune)

| Classe | Arme | Style |
|---|---|---|
| **Lame** | Épée | Guerrier solide, frappe plusieurs ennemis, charge, cri de guerre, séisme |
| **Ombre** | Dagues | Assassin rapide : critiques, poison, ruée, voile de brume, mille entailles |
| **Mystique** | Épée | Lame et magie noire : flammes, drain de vie, terreur, éclipse |
| **Chaman** | Éventail | À distance : foudre en chaîne, soins de groupe, bénédiction, bouclier, dragon de foudre |

Compétences débloquées aux niveaux 1, 3, 6, 10, 15 et 20.

## Les 3 donjons

| Donjon | Niveau | Concept | Boss |
|---|---|---|---|
| **Tour des Mille Lanternes** | 8 | 4 salles scellées : chaque grille ne s'ouvre que quand la salle est vidée | Gardien de Bronze : écrasement, charge en ligne, pluie de lanternes, onde de choc |
| **Nid de la Reine Tisseuse** | 13 | La reine est invulnérable tant que 4 Sceaux de soie tiennent | Reine Tisseuse : crachat venimeux en cône, toiles qui ralentissent, bond, ponte |
| **Temple du Dragon de Jade** | 18 | Contre-la-montre de 12 minutes, boss en 3 phases | Dragon de Jade : souffle, coup de queue, envol et pluie de météores, tempête en anneau |

Les attaques des boss sont **annoncées au sol par des zones rouges** qui se remplissent : il faut en sortir à temps
(pour l'onde de choc et la tempête, la zone sûre est collée au boss). Chaque boss donne une **arme exclusive**
introuvable ailleurs. Jusqu'à 5 joueurs entrés dans les 3 minutes partagent la même instance.

## Structure du projet

```
server/        Serveur Node.js (règles du jeu, multijoueur)
  data.js      Équilibrage : objets, monstres, pierres, compétences, forge
  map.js       Génération de la carte
  game.js      Logique du monde
  index.js     Démarrage, connexions
client/        Ce qui s'affiche dans le navigateur
  js/models.js Modèles 3D et animations
  js/main.js   Rendu 3D (Three.js), caméra, commandes, interface
  js/art.js    Icônes des objets
tests/bots.js     Test : deux joueurs-robots chassent dans le monde (npm test)
tests/donjons.js  Test : un robot traverse un donjon et bat le boss
ROADMAP.md     Feuille de route
```

Les sauvegardes des joueurs sont dans `data/players.json` (non envoyé sur GitHub).

## Licence et droits

Projet original. Inspiré des MMORPG d'arts martiaux, sans aucun nom, graphisme ou contenu
appartenant à un autre jeu. Tous droits réservés à l'auteur du dépôt.
