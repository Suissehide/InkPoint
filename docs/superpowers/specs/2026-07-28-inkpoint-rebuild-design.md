# Ink Point — refonte complète (v1)

**Date :** 2026-07-28
**Statut :** validé, prêt pour le plan d'implémentation
**Portée :** v1 — le jeu solo, complet et jouable en ligne

---

## 1. Contexte

Ink Point existe depuis 2021 : un prototype en JavaScript vanilla adossé à CreateJS/EaselJS et jQuery, dont toute la logique tient dans un `js/script.js` de 547 lignes, avec les bibliothèques tierces (34 000 lignes) commitées dans le dépôt. Le concept — un curseur qui esquive des points au clavier, des bombes pour se frayer un passage — reste bon. Le code, lui, ne sert plus de base.

On repart de zéro. Le concept d'origine est conservé et élargi vers le roguelike ; l'ancien code est entièrement remplacé.

### Objectifs

Trois attentes, par ordre de priorité :

1. **Un jeu fini et poli**, jouable en ligne, agréable à montrer : le *feel*, le *juice*, une UI soignée.
2. **Un terrain de jeu technique** : ECS, shaders GLSL, et à terme du netcode.
3. **Une base extensible** : ajouter du contenu (ennemis, power-ups, cartes) doit être une question de données, pas de code.

### Découpage en sous-projets

Le périmètre initial couvrait aussi un leaderboard et du multijoueur. Ce sont des sous-systèmes indépendants, chacun avec son propre cycle spec → plan → implémentation :

| Version | Périmètre | Statut |
|---|---|---|
| **v1** | Jeu solo complet : gameplay, roguelike, UI, menus, i18n, déploiement | **Cette spec** |
| v2 | Backend : leaderboard en ligne, méta-progression persistante entre les runs | Hors périmètre |
| v3 | Netcode : mode multijoueur | Hors périmètre |

La v1 est conçue pour ne pas fermer la porte aux deux suivantes — voir §6.3 sur la séparation simulation/rendu, qui en est la condition technique.

---

## 2. Direction artistique — « Encre de nuit »

Encre sombre, traits blanc-cassé légèrement lumineux, comme une plume sur un papier noir. Cette direction préserve l'identité du nom « Ink Point » tout en offrant le contraste nécessaire aux effets lumineux.

### Palette — et sa règle

Chaque couleur a un rôle unique et exclusif. C'est ce qui rend le jeu lisible quand l'écran se remplit.

| Rôle | Valeur | Usage — exclusif |
|---|---|---|
| Fond | `#0a0f1e` | L'encre du papier |
| Fond profond | `#060a14` | Overlays, écrans modaux |
| Trait | `#eae4d6` | Joueur, cadre, HUD, texte |
| **Danger** | `#e04f4f` | **Les ennemis, et rien d'autre** |
| Explosion | `#ffd166` | Bombe, rareté « Rare » |
| Gel | `#8fd8ff` | Zone de gel, ennemis gelés |

La règle du rouge est absolue : aucun élément d'interface, aucune particule, aucun texte n'est rouge. « Rouge = ça me tue » doit devenir un réflexe, pas une information à décoder.

**Accessibilité :** la couleur n'est jamais le seul canal. Le danger se distingue aussi par la **forme** (les ennemis sont les seuls disques pleins) et par le **mouvement** (ils sont les seuls à poursuivre le joueur).

### Le *boil*

Le trait frémit comme en animation traditionnelle : deux variantes de chaque contour, alternées. Cadencé à **8 images/seconde en temps réel**, indépendamment du framerate de rendu — sinon l'effet devient une vibration désagréable sur un écran 144 Hz.

Techniquement : un *displacement shader* alimenté par une texture de bruit, dont la graine change 8 fois par seconde par paliers.

### Typographie

Les polices du projet d'origine sont conservées — `Fh Ink` (titres) et `Ink Pen` (interface) — mais **converties d'OTF en WOFF2** (gain de poids ≈ 70 %, et l'OTF n'est pas garanti sur tous les navigateurs). Chiffres tabulaires pour le score, afin qu'il ne tressaute pas.

### Sort des assets existants

- **Polices** — conservées, converties en WOFF2.
- **Images raster** (`cursor.png`, `dot-sprites.png`, `explosion-sprites.png`, `border*.png`, `crown.png`, `PowerUp1.png`) — **supprimées**. Ce sont des sprites pixellisés incompatibles avec la direction vectorielle, et ils ne peuvent pas traverser les shaders. L'historique Git les conserve.
- **Favicons** — refaits. Le clignotement du favicon toutes les secondes de l'ancienne version est abandonné : c'est agressif et ça pollue l'onglet.
- Tout le visuel du jeu est **généré** : formes vectorielles tracées à l'exécution, ou SVG écrits à la main pour les icônes.

---

## 3. Design du jeu

### 3.1 La boucle

```
Menu ──▶ Run ──▶ Vague (40 s) ──▶ Choix de carte ──▶ Vague suivante ...
                    │
                    └── mort ──▶ Game over ──▶ [Espace] ──▶ nouvelle Run
```

**Une vague dure 40 secondes.** Elle ne se termine pas quand l'arène est vide.

Cette décision est structurante et mérite sa justification : le joueur n'a pas d'arme permanente. Ses seuls moyens de tuer sont les power-ups ramassés au sol. Une vague qui exigerait de nettoyer l'arène pourrait devenir insoluble faute d'outil disponible. Avec un chronomètre, **les ennemis survivants restent en jeu à la vague suivante** — ne pas nettoyer se paie en pression accumulée. C'est la source principale de tension du jeu, et ça rend la fin de vague prévisible, donc l'écran de cartes non frustrant.

### 3.2 Contrôles

| Action | Touches |
|---|---|
| Déplacement | `ZQSD` **et** `WASD` **et** flèches (les trois actifs simultanément) |
| Power-ups | `1` `2` `3` — ou `Espace` pour le premier disponible |
| Pause / retour | `Échap` |
| Navigation menus | Flèches + `Espace` / `Entrée` |

**Le jeu est intégralement jouable au clavier.** La souris n'est jamais requise.

Le déplacement est **direct avec une courte inertie** : la direction répond immédiatement, avec une accélération et une glissade d'environ 100 ms. Le curseur pointe dans la direction du mouvement.

- Vitesse de base : **240 px/s**
- Accélération : atteint 90 % de la vitesse max en **~67 ms** (≈ 4 images à 60 Hz)
- Friction à l'arrêt : **~50 ms** (≈ 3 images)

Ces deux valeurs ont été arbitrées en cours d'implémentation. La première rédaction
annonçait ~120 ms et ~80 ms, mais les constantes livrées produisaient un mouvement
deux fois plus vif — et à l'essai, c'est le vif qui a été retenu. La glisse reste
perceptible et alimente la traînée visuelle, mais l'esquive serrée pardonne, ce qui
compte quand l'écran se remplit d'ennemis.
- Le joueur est bloqué par les murs de l'arène (pas de rebond)

### 3.3 Les ennemis

#### Comportement commun

Poursuite avec **accélération progressive** jusqu'à une vitesse maximale, et surtout **un temps de retard** : un ennemi vise la position qu'occupait le joueur il y a ~250 ms. C'est ce délai qui rend l'esquive par changement brusque de direction lisible et gratifiante — sans lui, la poursuite est parfaite et donc injouable.

Chaque ennemi mémorise sa cible dans un tampon circulaire de positions horodatées.

#### Apparition en trois temps

Tout ennemi, quelle que soit son origine, traverse trois états :

| État | Durée | Apparence | Collision |
|---|---|---|---|
| **Fantôme** | totale − 0,4 s | Contour pointillé qui respire, immobile | **Traversable** |
| **Solidification** | 0,4 s | L'encre se remplit, un anneau se resserre | **Traversable** |
| **Actif** | — | Trait plein qui frémit, traînée | **Mortel** |

La solidification est la **fin** de la phase d'apparition, pas une phase qui s'y ajoute : les durées annoncées ci-dessous sont des totaux, dont les 0,4 dernières secondes sont la solidification.

La règle de lecture pour le joueur : **pointillé = inoffensif, plein = mortel**.

#### Origines d'apparition

- **Depuis les bords** — durée d'apparition totale **1,0 s**. Support des formations groupées.
- **Autour du joueur (embuscade)** — durée totale **1,6 s**, plus longue car la menace naît près de lui. Contraintes : distance minimale de **180 px** du joueur, jamais à l'intérieur d'une zone de gel active, jamais en dehors de l'arène. Débloqué à partir de la vague 2.

#### Types

| Type | Dispo | Comportement |
|---|---|---|
| **Point** | Vague 1 | Le basique. Poursuite qui accélère jusqu'à sa vitesse max. |
| **Éclat** | Vague 3 | S'immobilise, se télégraphie 0,5 s (le trait s'étire vers sa cible), puis charge en ligne droite à grande vitesse. Ne corrige pas sa trajectoire. |
| **Tache** | Vague 5 | Gros et lent. À sa mort, **se scinde en 3 Points** qui héritent d'une partie de sa vélocité. |

Reprise assumée du `SUB_DOT_COUNT` du prototype d'origine : l'idée était bonne.

#### Formations

Une formation apparaît d'un bloc depuis un bord, ce qui produit une menace lisible plutôt qu'une bouillie. Cinq motifs : **ligne**, **carré**, **cercle**, **V**, **spirale**. Chaque motif est une fonction pure `(count, spacing, origin) → positions[]`, donc trivial à étendre.

### 3.4 Les power-ups

Ramassés au sol, stockés dans **3 emplacements maximum**, déclenchés aux touches `1`/`2`/`3`. Règle de conception : **aucun ne fait le travail d'un autre**.

| Nom (FR / EN) | Rôle | Effet |
|---|---|---|
| **Bombe** / *Blast* | Zone, autour de soi | Anneau qui s'agrandit, tue sur son passage, **persiste quelques instants** avant de disparaître |
| **Gel** / *Freeze* | Contrôle, zone posée | Zone déposée à la position du joueur au déclenchement. Fige les ennemis qui s'y trouvent ou y entrent ; **un ennemi gelé meurt si le joueur le traverse** |
| **Trait d'encre** / *Ink Trail* | Mouvement, persistant | Traînée mortelle derrière le joueur pendant 3 s |
| **Rature** / *Strike* | Zone, directionnel | Un trait traverse toute l'arène dans la direction du joueur et tue sur la ligne. Portée infinie, zone étroite |
| **Buvard** / *Blotter* | Contrôle, attraction | Aspire les ennemis vers un point et les y retient. **Ne tue pas** — sert à préparer un autre power-up |
| **Plume** / *Quill Dash* | Mouvement, fuite | Ruée rapide et invulnérable qui tue ce qu'elle traverse |
| **Halo** / *Halo* | Défense, charge unique | Absorbe un contact mortel puis se brise : l'ennemi fautif est détruit et le joueur gagne 1 s d'invulnérabilité pour se dégager. Visible en permanence sur le curseur |
| **Séchage** / *Dry Spell* | Utilitaire, temps | Ralentit les ennemis pendant 4 s, pas le joueur. **Ne tue personne** |

Le Buvard et le Séchage ne tuent pas : ils n'existent que par leurs combinaisons, ce qui donne de la matière aux cartes d'amélioration.

### 3.5 Les cartes d'amélioration

À la fin de chaque vague, le jeu se met en pause et propose **3 cartes**, navigables aux flèches.

#### Les trois raretés

Contrainte : **aucune couleur nouvelle** — rouge, or et bleu sont déjà réservés. La rareté se lit au traitement du trait, et surtout à la *nature* de l'effet, qui monte d'un cran à chaque palier.

| Rareté | Tirage | Apparence | Nature de l'effet |
|---|---|---|---|
| **Commune** | ~65 % | Trait simple, atténué | Modifie un **chiffre** : vitesse, rayon, durée, cooldown. Cumulable sans limite |
| **Rare** | ~30 % | Double trait doré, légère lueur | Modifie un **comportement** : l'explosion repousse, le gel se propage |
| **Mythique** | ~5 % | **La carte passe en négatif** (fond clair, encre sombre) et frémit | Change une **règle** du jeu. **Une seule par run** |

L'inversion visuelle de la carte mythique est le moment fort de l'écran : elle se remarque avant même d'être lue.

#### Règles de tirage

- Jamais deux cartes identiques dans un même choix.
- **Tirage pondéré vers le build en cours** : investir dans le gel augmente la probabilité de voir des cartes de gel. Sans cette pondération, les builds se dispersent et aucun n'atteint le seuil où il devient satisfaisant. *(À vérifier en playtest — c'est un vrai arbitrage de game design entre cohérence et variété.)*
- Une mythique est **garantie au moins une fois toutes les 10 vagues** si aucune n'est encore sortie.
- Un power-up jamais rencontré ne peut pas apparaître dans une carte qui l'améliore.

#### Exemples

- *Commune* — **Pas léger** : +12 % de vitesse de déplacement
- *Rare* — **Onde de choc** : l'explosion repousse les ennemis qui survivent
- *Mythique* — **Encre vive** : un ennemi gelé qui meurt gèle ses voisins

Les cartes sont **des données**, pas du code : un fichier de définitions déclare identifiant, rareté, cibles, et modificateurs. Ajouter une carte ne doit toucher aucun système.

### 3.6 Difficulté

Une courbe **continue** pilotée par le temps écoulé, pas des paliers. Aucun mur soudain.

| Paramètre | Évolution |
|---|---|
| Intervalle d'apparition | 2,2 s → 0,35 s (décroissance exponentielle) |
| Vitesse max des ennemis | 90 → 145 px/s (asymptotique, ~120 s de constante de temps) |
| Taille des formations | 3 → 12 |
| Proportion d'embuscades | 0 % → 35 % |
| Types disponibles | Point (V1), + Éclat (V3), + Tache (V5) |

Le joueur se déplace à 240 px/s contre 145 px/s au maximum pour les ennemis en poursuite : il reste toujours plus rapide qu'eux. La difficulté vient du **nombre** et de l'**encerclement**, jamais de la vitesse pure — un poursuivant plus rapide que le joueur rendrait la fuite impossible et le jeu injuste.

**Seule exception : la charge de l'Éclat**, à ~420 px/s. Elle est plus rapide que le joueur, et c'est précisément ce qui la rend menaçante — mais elle est télégraphiée 0,5 s à l'avance et ne corrige pas sa trajectoire. On l'esquive par anticipation latérale, pas en fuyant. C'est le seul ennemi qui demande de réagir plutôt que de gérer l'espace.

### 3.7 Mort et score

**Le contact tue immédiatement.** Une seule touche fatale, sauf Halo actif.

Garde-fou : **0,5 s d'invulnérabilité au début de chaque vague**, pour que la carte tout juste choisie ne soit pas immédiatement fatale.

Score :
- **10 points par seconde** survécue
- **25 points par kill**, multipliés par le combo
- Combo : +1 par kill dans une fenêtre glissante de 2,5 s ; le multiplicateur vaut `1 + floor(chaîne / 5)`, plafonné à **×10**

### 3.8 Le *juice*

Ce qui sépare un prototype d'un jeu :

- **Hitstop** — 60 ms de gel de la simulation à chaque kill. C'est l'élément qui fait qu'un kill *se sent*.
- **Screen shake** — amplitude proportionnelle au nombre de morts simultanées, décroissance rapide.
- **Particules d'encre** — éclaboussures à la mort, traînée derrière le joueur.
- **Vignette rouge** — pulse quand un ennemi passe sous ~120 px.
- **Ralenti sur la mort** — la simulation ralentit à 15 % pendant 800 ms avant l'écran de fin.
- **Flash de vague** — bref éclat du cadre au changement de vague.

L'option **Mouvement réduit** (§6.6) ne coupe pas tout, et la distinction n'est pas
cosmétique. Elle existe pour les personnes sujettes au malaise vestibulaire, donc elle
vise ce qui **déplace l'image** : le screen shake, les particules, la pulsation de la
vignette, le flash de vague. Elle laisse en place le **hitstop** et le **ralenti de
mort**, qui ne sont pas des mouvements — le premier est un gel, donc l'absence de
mouvement, et le second *réduit* la vitesse de ce qui bouge. Les couper appauvrirait
le ressenti du jeu sans bénéfice pour personne. Le boil est également désactivé, non
pour des raisons vestibulaires mais parce qu'un trait qui frémit en permanence fatigue
à la lecture prolongée, et parce que c'est le premier effet à sacrifier sur une
machine modeste.

---

## 4. Interface

### 4.1 Cadrage — plein écran, HUD flottant

L'arène occupe toute la fenêtre. Le HUD vit **dans** l'image, discret (opacité basse, dans les coins). Ce choix maximise la surface de jeu et permet aux effets plein écran — shake, flash, vignette — de porter réellement.

Disposition :

| Emplacement | Contenu |
|---|---|
| Haut gauche | `SCORE` en petites capitales espacées, **au-dessus** du chiffre |
| Haut droite | `VAGUE` en petites capitales espacées, **au-dessus** du chiffre |
| Bas gauche | 3 pastilles de power-up, avec arc de cooldown |
| Bas centre | Barre fine de progression de la vague |
| Bas droite | Multiplicateur de combo |

### 4.2 Écrans

- **Menu** — titre, `Jouer` / `Améliorations` / `Réglages`, rappel des touches. **Le jeu tourne en fond au ralenti**, ce qui évite un écran statique et montre immédiatement de quoi il retourne.
- **Fin de vague** — 3 cartes, navigation aux flèches, validation à `Espace`.
- **Pause** (`Échap`) — reprendre, réglages, abandonner.
- **Game over** — « L'encre a séché », score, statistiques de la run (vague atteinte, ennemis tués, durée), meilleur score. **`Espace` relance immédiatement**, sans repasser par le menu : dans ce genre de jeu, chaque seconde entre la mort et la run suivante fait abandonner des joueurs.
- **Réglages** — langue, volumes, mouvement réduit.

### 4.3 Implémentation

Les écrans sont du **DOM stylé avec Tailwind v4**, superposés au canvas — pas des éléments dessinés dans le canvas. Le texte reste sélectionnable, accessible aux lecteurs d'écran, et le layout responsive est gratuit.

Le canvas ne contient que le jeu. Tailwind ne touche jamais au rendu du jeu.

---

## 5. Internationalisation

**Anglais par défaut, français en option.**

- Détection via `navigator.language` au premier lancement, puis choix mémorisé en `localStorage`.
- **Aucune chaîne en dur** dès la première ligne de code : tout passe par des clés. C'est trivial à faire dès le départ et pénible à rétro-fitter.
- Implémentation **maison, ~30 lignes** : des dictionnaires JSON plats et une fonction `t(key, params)`. `i18next` pèserait 40 Ko pour un jeu qui compte une soixantaine de chaînes.
- Clés hiérarchiques par point : `menu.play`, `powerup.blast.name`, `gameover.title`.
- Un test vérifie que **`en.json` et `fr.json` ont exactement les mêmes clés** — c'est le seul moyen fiable d'éviter les trous de traduction.
- Le changement de langue est **immédiat**, sans rechargement.
- Conséquence sur les noms : les jeux de mots intraduisibles sont proscrits. « L'encre a séché » / *Ink Dry* plutôt qu'un calembour.

---

## 6. Architecture technique

### 6.1 Stack

| Domaine | Choix | Raison |
|---|---|---|
| Langage | **TypeScript** (strict) | |
| Build | **Vite** | |
| Rendu | **PixiJS v8** (WebGL/WebGPU) | Filtres GLSL personnalisés — le boil, le grain et le bloom *sont* des shaders. Pixi dessine et rien d'autre : pas de moteur imposé |
| ECS | **bitECS** | Stockage SoA, très rapide, minuscule, sans opinion sur l'architecture |
| UI DOM | **Tailwind v4** | Menus et cartes uniquement |
| Tests | **Vitest** | La simulation est pure : testable sans navigateur |
| Qualité | ESLint + Prettier, husky + commitlint | Aligné sur la convention Gachapon |

Phaser a été écarté : il accélère les deux premiers jours puis impose son architecture, se marie mal avec un ECS, et fait disparaître l'objectif « terrain de jeu technique ». Le Canvas 2D sans dépendance a été écarté pour une raison décisive : **il ne fait pas de shaders**, ce qui condamnerait la moitié de la direction artistique.

### 6.2 Structure des dossiers

```
InkPoint/
├── deploy/
│   ├── Dockerfile              # builder Node → nginx
│   ├── nginx.conf
│   ├── compose.yaml            # service unique + labels Traefik
│   ├── .env.example
│   └── dokploy/
│       └── docker-compose.dokploy.yml
├── docs/
│   └── superpowers/specs/
├── public/
│   └── fonts/                  # WOFF2
├── src/
│   ├── main.ts                 # point d'entrée
│   ├── app/                    # bootstrap, boucle, machine à états
│   ├── sim/                    # ── ECS PUR — aucun import de rendu ──
│   │   ├── world.ts
│   │   ├── rng.ts              # PRNG à graine (mulberry32)
│   │   ├── components/
│   │   ├── systems/
│   │   └── data/               # enemies, powerups, upgrades, waves, formations
│   ├── render/                 # ── Pixi ──
│   │   ├── stage.ts
│   │   ├── views/              # une vue par archétype
│   │   ├── filters/            # GLSL : boil, grain, vignette, bloom
│   │   └── particles/
│   ├── ui/                     # ── DOM + Tailwind ──
│   │   ├── screens/
│   │   └── components/
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/{en,fr}.json
│   ├── audio/
│   └── styles/
├── .github/workflows/ci.yml
├── .gitignore
├── README.md
└── package.json
```

Les trois dossiers `sim/`, `render/` et `ui/` sont les frontières dures de l'architecture.

### 6.3 La séparation simulation / rendu

**C'est la décision technique centrale de cette spec.**

`src/sim/` ne contient **aucun import de Pixi, du DOM, ou de quoi que ce soit lié au navigateur**. La simulation prend en entrée un état, un pas de temps et des intentions d'entrée ; elle produit un nouvel état. Rien d'autre.

Trois bénéfices, tous décisifs :

1. **Testable sans navigateur** — Vitest exécute la logique de jeu directement, vite, sans DOM ni canvas.
2. **Déterministe** — même graine + mêmes entrées ⇒ même état, image par image. Aucun appel à `Math.random()` dans `sim/` : uniquement le PRNG à graine.
3. **Prête pour le netcode (v3)** — le déterminisme est le prérequis absolu de toute synchronisation par *lockstep* ou *rollback*. Le greffer plus tard sur une simulation non déterministe imposerait une réécriture complète.

Une règle ESLint interdit techniquement les imports de `render/`, `ui/` et `pixi.js` depuis `sim/`. Une convention qu'aucun outil ne fait respecter ne survit pas à trois mois de développement.

### 6.4 Boucle de jeu

**Pas de temps fixe à 60 Hz** avec accumulateur ; le rendu interpole entre deux états de simulation. C'est ce qui garantit qu'une partie se déroule identiquement sur un écran 60 Hz et sur un 144 Hz.

```
accumulateur += min(deltaRéel, 250 ms)      // borne : évite la spirale de la mort après un onglet en arrière-plan
pas = plancher(accumulateur / 16,67 + 1e-9) // division, PAS des soustractions répétées
répéter pas fois : simuler(16,67 ms)
accumulateur -= pas × 16,67 ms
rendre(max(0, accumulateur / 16,67))        // alpha d'interpolation, borné dans [0, 1)
```

Le nombre de pas se calcule par **division**, jamais par soustractions successives.
`16,67` n'a pas de représentation binaire exacte, et retrancher cette valeur en
boucle dérive : trois tranches de temps ne produisent alors que deux pas, et le jeu
tourne imperceptiblement trop lentement. L'epsilon de `1e-9` vaut environ 10⁴ fois
l'erreur flottante mesurée et 10⁷ fois moins que le pas lui-même — assez large pour
absorber la dérive, assez étroit pour ne jamais créer de pas fantôme (vérifié sur un
million d'images). Le `max(0, …)` referme la borne basse de l'alpha, qui sous-dépasse
de quelques ULP exactement à la limite de rattrapage.

Le hitstop et le ralenti de mort sont des **multiplicateurs sur le pas de simulation**, jamais sur le rendu — l'affichage ne saccade pas.

### 6.5 Découpage ECS

**Composants** (données pures, SoA) : `Position`, `Velocity`, `Movement` (vitesse actuelle/max/accélération), `Collider` (rayon), `Player`, `Enemy` (type), `Homing` (délai + tampon de positions), `Materializing` (temps restant), `Frozen`, `Dasher` (état + télégraphe), `Splitter`, `Hazard` (zone mortelle : type, rayon, propriétaire), `Lifetime`, `Pickup`, `Invulnerable`, `RenderRef`.

**Systèmes**, exécutés dans un ordre fixe et explicite :

```
input → mouvementJoueur → matérialisation → poursuite → charge(Éclat)
      → intégration → zones(Hazard) → gel → collisions → morts
      → ramassage → vagues → durées de vie → score
```

Le système de collisions utilise une **grille de hachage spatial** (cellules de 64 px). Avec potentiellement 200+ ennemis, une comparaison naïve deux à deux serait le goulot d'étranglement.

`RenderRef` est le seul pont vers Pixi, et il est unidirectionnel : une couche de synchronisation lit l'ECS et met à jour les objets d'affichage. Le rendu ne modifie **jamais** la simulation.

### 6.6 Contenu piloté par les données

Ennemis, power-ups, cartes, formations et courbe de difficulté vivent dans `src/sim/data/` sous forme de définitions typées. Ajouter un ennemi ou une carte se fait en écrivant une entrée, sans toucher à un système. C'est la condition concrète de l'extensibilité demandée.

### 6.7 Persistance

`localStorage` uniquement en v1 : meilleur score, langue, volumes, options d'accessibilité. **Pas de méta-progression persistante** — elle relève de la v2, avec le backend.

### 6.8 Accessibilité

- **Mouvement réduit** — désactive le boil, le shake et les particules ; respecte `prefers-reduced-motion` par défaut.
- Danger codé par forme et mouvement autant que par couleur.
- Tout au clavier, aucune dépendance à la souris.
- Contraste du texte d'interface conforme AA.

---

## 7. Qualité

### Tests (Vitest)

Ce qui est testé, par ordre d'importance :

1. **Déterminisme** — une run rejouée avec la même graine et les mêmes entrées produit la même empreinte d'état. C'est le test qui protège la v3.
2. **Systèmes de simulation** — poursuite avec délai, matérialisation, collisions, gel, scission, effets des power-ups.
3. **Règles de tirage des cartes** — pas de doublon, plafond mythique, garantie des 10 vagues, pondération.
4. **Courbe de difficulté** — monotone, bornée aux valeurs annoncées.
5. **i18n** — parité stricte des clés entre `en.json` et `fr.json`.

Le rendu et les shaders ne sont pas testés automatiquement : coût élevé, valeur faible. Ils se valident à l'œil.

### Outillage

ESLint (config plate) + Prettier ; husky + commitlint en **Conventional Commits**, comme sur Gachapon. TypeScript en mode strict, `noUncheckedIndexedAccess` activé.

### CI — GitHub Actions

À chaque push et pull request : `lint` → `typecheck` → `test` → `build`, puis vérification que l'image Docker se construit.

---

## 8. Déploiement

Cible : **inkpoint.qwetle.fr**, selon la convention du projet Gachapon.

`deploy/` contient :

- **`Dockerfile`** — build multi-étapes : `node:22-alpine` compile, `nginx:alpine` sert le résultat.
- **`nginx.conf`** — fallback SPA, compression, cache long sur les assets hachés, cache court sur `index.html`.
- **`compose.yaml`** — un service unique (`game`), rattaché au réseau externe `proxy`, avec les labels Traefik : `Host(inkpoint.qwetle.fr)`, entrypoint `https`, certresolver `ovh`.
- **`.env.example`** — variables documentées (`APP_IMAGE_NAME`, `VERSION`, `TRAEFIK_HOST`, `NODE_VERSION`…).
- **`dokploy/docker-compose.dokploy.yml`** — variante sans réseau externe ni labels, pour Dokploy.

La v1 est 100 % statique : pas de base de données, pas de Redis, pas de backend. La structure prévoit l'ajout d'un service `back` en v2 sans réorganisation.

`deploy/.env` est ignoré par Git ; seul `.env.example` est versionné.

---

## 9. Hygiène du dépôt

- **`.gitignore`** — `node_modules/`, `dist/`, `.env`, `deploy/.env`, `.idea/`, `.DS_Store`, `coverage/`, `.superpowers/`.
- **Aucune dépendance commitée.** Les 34 000 lignes de CreateJS dans `js/` disparaissent.
- **`README.md`** refait : ce qu'est le jeu, capture d'écran, comment le lancer, comment le construire, comment le déployer, architecture en bref. Le badge Coveralls actuel pointe vers un dépôt qui ne mesure rien — supprimé.
- **Conventional Commits**, vérifiés par commitlint.
- Le fichier `.vscode/settings.json` du dépôt d'origine est supprimé (configuration personnelle).

---

## 10. Ce qui est explicitement hors périmètre

| Exclu de la v1 | Renvoyé à |
|---|---|
| Leaderboard en ligne, comptes | v2 |
| Méta-progression persistante entre les runs | v2 |
| Multijoueur, netcode | v3 |
| Support mobile / tactile | Non planifié — le jeu est pensé au clavier |
| Musique originale | v1 se limite à des effets sonores |
| Synchronisation Claude Design | À rebrancher au moment de l'implémentation de l'UI, une fois les tokens et composants réels existants |

---

## 11. Points à valider en playtest

Des choix de game design assumés, mais qui ne se tranchent qu'en jouant :

1. **Le tirage pondéré vers le build** — rend les runs plus cohérentes, mais moins surprenantes. À doser.
2. **La durée de vague de 40 s** — trop court, l'écran de cartes devient envahissant ; trop long, la progression traîne.
3. **L'accumulation des survivants entre vagues** — c'est la source de tension du jeu, mais aussi le risque n°1 de spirale ingagnable. Un plafond dur du nombre d'ennemis simultanés sera probablement nécessaire.
4. **Huit power-ups dès la v1** — c'est beaucoup à enseigner. Il faudra peut-être en débloquer progressivement au fil des premières vagues.
5. **Le Halo est le seul power-up sans carte d'amélioration.** Les sept autres ont au moins une commune qui modifie un de leurs chiffres ; le Halo n'en a aucun, puisqu'il n'a pas de valeur à faire varier — il absorbe un contact, un point c'est tout. Une carte à règle resterait possible (se régénérer toutes les N vagues, absorber deux contacts) sur le modèle de « Deux mains ». À trancher en jouant : un power-up qu'aucune carte ne touche devient peut-être le parent pauvre d'une run, ou au contraire garde sa valeur justement parce qu'il ne dépend d'aucun investissement.
