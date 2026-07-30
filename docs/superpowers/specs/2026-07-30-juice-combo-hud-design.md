# Ink Point — Timer, combo lisible et juice au kill

**Date :** 2026-07-30
**Statut :** validé, prêt pour le plan d'implémentation
**Portée :** HUD (timer, combo), pondération du score, effets de rétroaction au kill, réglage de la distorsion

---

## 1. Contexte

Le jeu marque déjà des points aux kills et tient déjà un combo : `src/sim/systems/score.ts` donne 25 points par ennemi tué, multipliés par un facteur qui monte d'un cran tous les 5 kills jusqu'à ×10, avec une fenêtre de 2,5 s. Rien de tout cela n'est perceptible en jeu :

- le multiplicateur est un texte de 14 px à 75 % d'opacité, posé en bas à droite, sans barre de temps restant ni réaction au franchissement d'un palier ;
- aucun retour à l'écran ne relie un kill à des points — le score défile, c'est tout ;
- la survie rapporte 10 points/s, ce qui domine le score en pratique : tuer n'est pas encore le geste qui paie.

Côté ressenti, un kill produit aujourd'hui une secousse (`2 + kills × 1,5`), 7 particules rondes projetées dans un cercle uniforme, et un hitstop de 60 ms. C'est le socle correct sur lequel il manque tout l'étage.

Enfin, la durée de la run n'existe qu'à l'écran de mort, alors que c'est la seule mesure de performance qui accompagne le joueur du début à la fin.

### Objectifs

1. Rendre le score lisible comme une **récompense au kill**, pas comme un compteur de temps passé.
2. Rendre le combo **visible, vivant et pilote du ressenti** : plus il monte, plus chaque kill claque.
3. Afficher le **temps de run** dans le HUD.
4. **Baisser la distorsion permanente** (boil, grain, vignette) pour laisser la place aux effets ponctuels.

### Hors périmètre

- Aucun moteur audio (le réglage « volume des effets » reste inerte, cf. `settings.ts`).
- Aucun retour haptique (`navigator.vibrate`, API manette) : le jeu n'a pas de support manette, et l'API vibration ne fait rien sur desktop.
- Aucun point flottant « +25 » au-dessus des ennemis tués : le combo porte cette information à lui seul.

---

## 2. Architecture

Une couche `fx` dédiée, pilotée par une **intensité de combo** unique.

`src/app/juice.ts` garde son rôle actuel — traduire `world.events` en effets ressentis, sans jamais écrire dans la simulation — mais délègue à des modules de `src/render/` au lieu de grossir. Il calcule une intensité `0 → 1` dérivée du multiplicateur de combo et la passe à chaque effet : un seul chiffre module secousse, particules, flash et anneaux, plutôt que des réglages dispersés dans chaque module.

```
world.events ──▶ app/juice.ts ──┬──▶ render/camera.ts      (secousse directionnelle)
                  │             ├──▶ render/particles.ts   (éclats dirigés)
       intensité  │             ├──▶ render/fx/flash.ts    (voile plein écran)
       de combo ──┘             └──▶ render/fx/shockwave.ts (anneaux)
                                └──▶ ui/screens/hud.ts     (tremblement)
```

Le sens de circulation reste unidirectionnel : `render/` et `ui/` ne remontent jamais vers `sim/`.

### Découpage des fichiers

| Fichier | Rôle | État |
|---|---|---|
| `src/sim/systems/score.ts` | Pondération du score, paliers de combo | Modifié |
| `src/render/fx/flash.ts` | Voile plein écran qui flashe et retombe | Neuf |
| `src/render/fx/shockwave.ts` | Anneaux qui s'étendent et s'affinent | Neuf |
| `src/render/particles.ts` | Émission dirigée, éclats étirés, éviction du pool | Modifié |
| `src/render/camera.ts` | Kick directionnel + décroissance en trauma² | Modifié |
| `src/app/juice.ts` | Intensité de combo, câblage des effets | Modifié |
| `src/ui/screens/hud.ts` | Timer, montage du combo, `punch()` | Modifié |
| `src/ui/screens/hud-combo.ts` | Multiplicateur, barre de fenêtre, paliers | Neuf |
| `src/render/stage.ts` | Montage de `flash` et `shockwave`, valeurs des filtres | Modifié |

`hud-combo.ts` est extrait plutôt qu'ajouté à `hud.ts` : le combo porte à lui seul un état d'animation (palier franchi, chute) que le reste du HUD n'a pas, et `hud.ts` dépasserait sinon 250 lignes pour trois responsabilités sans rapport.

---

## 3. Le score bascule vers les kills

| Constante | Avant | Après |
|---|---|---|
| `SURVIVAL_POINTS_PER_SEC` | 10 | 5 |
| `KILL_POINTS` | 25 | 40 |
| Kills par palier de combo | 5 | 4 |
| `COMBO_MAX_MULTIPLIER` | 10 | 10 (inchangé) |
| `COMBO_WINDOW_MS` | 2500 | 2500 (inchangé) |

À ×3, un kill vaut 120 points, soit 24 secondes de survie. Survivre devient un fond de score, tuer devient le geste qui paie.

`COMBO_WINDOW_MS` passe exporté : le HUD en a besoin pour dessiner la barre de décroissance. `comboMultiplier` reste la seule source de vérité du palier, déjà partagée entre simulation et HUD.

Les assertions de `src/sim/systems/score.test.ts` portant sur 10 pts/s et 25 pts/kill sont mises à jour ; le reste du fichier (incrémentation, expiration de la fenêtre, remise à zéro) est inchangé.

---

## 4. HUD

### 4.1 Timer

Haut-centre — le haut-gauche appartient au score, le haut-droit à la vague. Même traitement que les deux autres blocs : libellé en petites capitales espacées au-dessus du chiffre, opacité basse, `renderNumber` pour la largeur de chiffre stable.

La valeur est `formatDuration(world.time)`, déjà utilisée par l'écran de mort. `world.time` avance avec `world.timeScale` : il gèle pendant un hitstop et ralentit pendant le ralenti de mort. C'est voulu — le HUD affiche exactement la durée que l'écran de mort annoncera.

Nouvelle clé i18n `hud.time` (`TIME` / `TEMPS`), ajoutée aux deux locales (`src/i18n/parity.test.ts` l'impose).

### 4.2 Combo

Le combo remonte sous le score, en haut à gauche, et devient le second élément le plus visible du HUD après le score lui-même :

- **Multiplicateur** en gros (`text-3xl`), masqué tant que le combo est à zéro.
- **Barre de fenêtre** sous le multiplicateur, largeur = `comboTimer / COMBO_WINDOW_MS`. Elle se vide en 2,5 s et se remplit d'un coup à chaque kill : c'est le compte à rebours rendu visible.
- **Palier franchi** : pop d'échelle sur le multiplicateur quand `comboMultiplier` change de valeur.
- **Teinte** : `paper` à ×1, glissant vers `blast` (#ffd166) à mesure que le multiplicateur monte.
- **Chute** : quand le combo retombe à zéro, le bloc s'efface franchement plutôt que de disparaître d'un frame à l'autre.

`HudState` gagne `comboTimer`. `hud.update()` reste appelé à chaque frame de rendu et reste la seule entrée de données ; les animations de palier et de chute sont détectées par comparaison avec l'état de la frame précédente, gardé dans le module.

### 4.3 Tremblement

`hud.punch(strength)` relance une keyframe CSS sur le bloc score + combo, appelée depuis `game.ts` sur les kills. Le retrigger passe par retrait/ajout de classe (une animation CSS ne se relance pas seule).

Le tremblement est déjà couvert par les deux gardes de `main.css` (`@media (prefers-reduced-motion)` et `:root.reduced-motion`) : aucun garde supplémentaire à écrire.

---

## 5. Effets au kill

### 5.1 Intensité de combo

`juice.ts` calcule `comboIntensity(multiplier) → 0..1`, normalisé sur la plage ×1 → ×10. Cette valeur module :

| Effet | À ×1 | À ×10 |
|---|---|---|
| Particules par kill | 10 | 22 |
| Amplitude de secousse | ×1 | ×2 |
| Alpha du flash au kill | 0 (aucun) | ~0,05 |
| Anneau d'onde de choc au kill | non | oui |

Le flash et l'anneau n'apparaissent **qu'à partir de ×3** : à bas combo, ils seraient du bruit permanent — un joueur tue en continu — ; à haut combo, ils sont la récompense d'une série tenue.

### 5.2 Particules

`emitBurst` passe d'une liste de paramètres positionnels à un objet d'options : `{ color, count, speed, spread, dir, sizeScale, streak }`.

- `dir` + `spread` remplacent le cercle uniforme actuel : un kill projette ses éclats **à l'opposé du joueur**, dans un cône, ce qui donne une direction lisible à l'impact.
- `streak` dessine des éclats étirés le long de leur vélocité plutôt que des ronds — la forme d'une éclaboussure d'encre projetée.
- Les émissions non directionnelles (mort du joueur, halo brisé) gardent le cercle complet en passant un `spread` de 2π.

Le pool passe de 400 à 700 et **évince les particules les plus anciennes** quand il est plein, au lieu d'ignorer silencieusement les nouvelles émissions. Le comportement actuel fait disparaître le retour visuel exactement pendant les gros combos, c'est-à-dire au moment où il compte le plus.

### 5.3 Flash plein écran

`createFlash(container)` : un rectangle plein écran, alpha qui décroît en ~120 ms, redimensionné avec le renderer. En `Graphics` Pixi plutôt qu'en shader — il continue de fonctionner filtres coupés, et n'ajoute pas d'uniforme à la vignette, dont l'intensité est déjà pilotée par la proximité du danger.

Déclencheurs : kill à haut combo (très léger), power-up utilisé, halo brisé, mort du joueur (le plus franc).

### 5.4 Anneaux d'onde de choc

`createShockwaves(container)` : anneaux qui s'étendent depuis un point tout en s'affinant et s'effaçant, sur ~300 ms. Même couche que les particules, au-dessus des entités.

Déclencheurs : power-up utilisé, halo brisé, mort du joueur, kill au-delà du seuil de combo.

Comme les particules, flash et anneaux avancent en **temps réel** (horloge murale, via `stage.sync`) et non en temps de simulation : un hitstop gèle le monde, jamais l'image.

### 5.5 Secousse

`camera.shake(amount, dir?)` accepte une direction optionnelle : l'offset commence par un **kick dans cette direction** avant de retomber dans le bruit aléatoire actuel. La décroissance passe en trauma² (l'amplitude appliquée est le carré de l'amplitude interne), ce qui donne une retombée plus nerveuse à niveau de secousse égal.

L'amplitude au kill reste `min(18, 2 + kills × 1,5)`, désormais multipliée par l'intensité de combo (jusqu'à ×2, plafond dur `MAX_AMPLITUDE = 26` inchangé).

---

## 6. Distorsion permanente

| Réglage | Avant | Après |
|---|---|---|
| `boil` `uAmount` | 0,0022 | 0,0013 |
| `grain` `uAmount` | 0,05 | 0,032 |
| Plafond de la vignette de danger | 1,0 | 0,75 |

L'image de fond devient plus calme pour que les effets ponctuels du §5 ressortent. Le boil reste perceptible — c'est l'identité visuelle du jeu — mais cesse de concurrencer les impacts.

---

## 7. Mouvement réduit

**Aucun changement de comportement.** `resolveReducedMotion()` applique déjà « réglage explicite du joueur > préférence système `prefers-reduced-motion` », donc désactivé par défaut sauf si le système demande la réduction de mouvement.

Ce que le garde `motionEnabled` couvre après cette tâche :

| Coupé par le mouvement réduit | Jamais coupé |
|---|---|
| Secousse d'écran | Hitstop |
| Particules | Ralenti de mort |
| Anneaux d'onde de choc | Timer |
| Flash plein écran | Score |
| Tremblement du HUD | Multiplicateur de combo et sa barre |
| boil, grain, vignette | |

Le critère reste celui déjà écrit dans `juice.ts` : est coupé ce qui **déplace l'image à l'écran**. Le combo et le timer sont de l'information, pas du mouvement — les couper priverait un joueur du système de score sans bénéfice vestibulaire.

---

## 8. Tests

L'environnement Vitest est `node`, sans DOM : les tests portent sur la logique pure, jamais sur le rendu ni sur le HUD.

| Fichier | Couverture |
|---|---|
| `src/sim/systems/score.test.ts` | Nouvelles valeurs de survie et de kill, palier tous les 4 kills (fichier existant, assertions mises à jour) |
| `src/app/juice.test.ts` | `comboIntensity` : bornes ×1 → 0 et ×10 → 1, monotonie ; mise à l'échelle du nombre de particules et de l'amplitude de secousse (fichier existant, cas ajoutés) |
| `src/render/camera.test.ts` | Kick directionnel au premier pas, décroissance en trauma², plafond d'amplitude inchangé (fichier existant, cas ajoutés) |
| `src/render/particles.test.ts` | Éviction de la plus ancienne à pool plein ; distribution des angles dans le cône `dir ± spread/2` — sur les fonctions pures extraites, sans instancier Pixi (fichier neuf) |
| `src/i18n/parity.test.ts` | Passe sans modification une fois `hud.time` ajouté aux deux locales (fichier existant) |

Les modules `flash.ts` et `shockwave.ts` sont de la géométrie Pixi sans logique dérivable : leur décroissance est vérifiée à l'œil, pas en test unitaire.

---

## 9. Vérification manuelle

1. Le timer monte en haut-centre et gèle visiblement pendant un hitstop.
2. Tuer 4 ennemis dans la fenêtre fait passer le multiplicateur à ×2 avec un pop ; la barre se recharge à chaque kill et se vide en 2,5 s.
3. À haut combo, un kill produit flash, anneau, éclats dirigés et une secousse nettement plus forte qu'à ×1.
4. Le score de fin de run est dominé par les kills, pas par la durée.
5. Mouvement réduit activé dans les Réglages : secousse, particules, anneaux, flash et tremblement disparaissent ; timer, score et combo restent lisibles.
