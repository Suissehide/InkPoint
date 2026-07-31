# Ink Point — Retrait du Trait d'encre, Plume élargie, sillage en flèches

**Date :** 2026-07-31
**Statut :** validé, prêt pour le plan d'implémentation
**Portée :** suppression du Trait d'encre et de sa couronne, agrandissement de la Plume, sillage redessiné en chevrons

---

## 1. Contexte

Le Trait d'encre a été refondu la veille en couronne de six piques en orbite. Le playtest tranche : le power-up ne trouve pas sa place et sort du jeu. Ce n'est pas un échec de la refonte — c'est ce à quoi sert un playtest — mais ça emporte tout ce que la couronne avait apporté.

La Plume, elle, devient l'outil central : 274 px de course dans un couloir de 80 px, c'est encore trop court pour casser un encerclement. Et si son sillage montre déjà exactement ce qu'il tue, il ne dit pas dans quel sens la ruée est partie.

### Objectifs

1. **Retirer le Trait d'encre** et toute la couronne de piques.
2. **Agrandir la Plume** : 480 px de course dans un couloir de 140 px.
3. **Faire du sillage une flèche** qui donne la direction, sans jamais cesser d'être exactement la zone mortelle.

### Principe directeur (inchangé)

**Ce qui est affiché est ce qui tue.** Le sillage dessiné *est* le couloir mortel. Les chevrons ne sont pas un indicateur posé à côté : ils sont inscrits dans les disques qui tuent.

### Hors périmètre

- Aucun autre power-up n'est retouché.
- Aucun changement au système de vagues, à la difficulté ni au score.

---

## 2. Retrait du Trait d'encre

### 2.1 Ce que touche la suppression

| Fichier | Ce qui part |
|---|---|
| `sim/data/powerups.ts` | `'trail'` de `PowerUpKind`/`POWERUP_KINDS`/`POWERUP_ID`, `POWERUP_BASE.trail`, `HAZARD_SPIKE` |
| `sim/powerups/activate.ts` | le `case 'trail'` |
| `sim/systems/spikes.ts` + `spikes.test.ts` | fichiers supprimés |
| `sim/step.ts` | l'appel à `spikeSystem` |
| `sim/components/index.ts` | le composant `Orbiting` |
| `sim/systems/hazards.ts` | `HAZARD_SPIKE` dans `LETHAL` |
| `sim/upgrades/stats.ts` | `trailDurationMs` |
| `sim/data/upgrades.ts` | cartes `trail-duration` (commune) et `lasting-trail` (rare) |
| `render/views/hazard.ts` | `drawSpike`, les constantes `SPIKE_*`, la branche et l'entrée `COLORS` |
| `render/stage.ts` | le calcul d'angle propre aux piques |
| `render/views/pickup.ts`, `ui/icons.ts` | le pictogramme et l'icône `trail` |
| `i18n/locales/{en,fr}.json` | 4 clés (2 cartes × nom + description) |

`HAZARD_TRAIL` **reste** : c'est le sillage de la ruée, pas le power-up disparu.

### 2.2 Identifiants

Comme pour la Rature (4) et le Séchage (8), l'identifiant 3 devient un trou : `POWERUP_BY_ID` porte `null` à cet indice, rien n'est renuméroté. Le commentaire déjà présent au-dessus de `POWERUP_ID` est étendu à ce troisième trou.

### 2.3 Conséquence sur le tirage

Le pool passe de 16 à 14 cartes, dont 3 sans `requires` (tirables d'emblée). Sur les cinq power-ups survivants, la répartition est très inégale : la Bombe et le Gel ont quatre cartes chacun, la Plume deux, le Buvard une seule (`blotter-radius`), et le Halo **aucune** — `second-ink` n'a pas de `requires` et se tire sans jamais avoir croisé un Halo. C'est un déséquilibre connu, hors périmètre ici, mais qui se resserre.

---

## 3. La Plume élargie

| Réglage | Avant | Après |
|---|---|---|
| Vitesse | 720 px/s | 720 px/s (inchangée) |
| Durée | 380 ms | **665 ms** |
| Course | 274 px | **≈ 480 px** (30 % de la largeur d'arène) |
| Rayon mortel | 40 | **70** |
| Largeur du couloir | 80 px | **140 px** |
| Cadence du sillage | 30 ms | 30 ms (inchangée) |
| Vie d'un segment | 800 ms | 800 ms (inchangée) |
| Grâce à l'atterrissage | 200 ms | 200 ms (inchangée) |

La vitesse ne bouge pas : c'est la durée qui s'allonge. Conserver 720 px/s garde la densité du sillage telle quelle (un segment tous les 21,6 px, très largement recouvrants à 70 px de rayon) et évite d'avoir à resserrer la cadence.

Coût en entités : ~22 segments déposés par ruée, 27 vivants au pic (`wakeLifeMs / wakeIntervalMs`). Chacun porte un `Lifetime` et disparaît par `lifetimeSystem`, comme avant.

**La carte « Plume large » passe de +30 % à +15 %.** Elle est cumulable : sur l'ancienne base de 40, deux exemplaires donnaient un rayon de 68 ; sur 70, ils donneraient 118, soit un couloir de 236 px — un sixième de l'arène balayé d'un coup. À +15 %, deux cartes donnent 92 (184 px), une progression relative comparable à celle d'avant.

---

## 4. Le sillage devient une flèche

### 4.1 Le segment porte sa direction

Chaque segment de sillage reçoit le composant **`Facing`**, déjà présent dans le jeu et qui ne contient qu'un angle — exactement ce qu'il faut. L'angle est celui de la ruée, `atan2(Dashing.vy, Dashing.vx)`, lu au moment du dépôt.

**Pas de champ détourné.** Ranger l'angle dans un champ de `Hazard` « qui a l'air libre » est précisément l'erreur commise la veille avec `growthRate`, que `hazardSystem` lisait en fait sur toutes les zones.

`stage.ts` transmet cet angle au rendu comme il transmettait celui des piques : `Facing.angle` s'il est présent, 0 sinon.

### 4.2 Le chevron, inscrit dans le disque de vérité

Chaque segment se dessine en deux temps, exactement comme les piques :

1. **Le disque mortel réel**, à `radius`, en encre légère — c'est la zone testée par la collision.
2. **Un chevron inscrit dedans**, à l'encre pleine, pointé dans le sens de la ruée.

Le chevron seul mentirait dans les deux sens : trop étroit sur les flancs (bande mortelle invisible) et, si on l'allongeait, trop pointu en avant (danger annoncé là où il n'y en a pas). Le disque dit la vérité, le chevron donne la lecture.

Géométrie, toute exprimée en fraction de `radius` pour rester inscrite par construction :

| Sommet | Position |
|---|---|
| Pointe | `1,00 · radius` sur l'axe |
| Ailes | `0,45 · radius` en arrière, `0,62 · radius` sur le côté |
| Creux arrière | `0,10 · radius` en arrière |

Les ailes sont à `√(0,45² + 0,62²) = 0,766 · radius` du centre : bien à l'intérieur du disque.

Le plancher de visibilité déjà en place sur le sillage (`0,25 + 0,75 · lifeRatio`) s'applique aux deux tracés : un segment reste lisible tant qu'il tue.

---

## 5. Tests

L'environnement Vitest est `node`, sans DOM ni WebGL : les tests portent sur la simulation.

| Fichier | Couverture |
|---|---|
| `sim/systems/dash-wake.test.ts` | le segment porte `Facing`, et son angle vaut celui de la ruée |
| `sim/powerups/activate.test.ts` | le cas `trail` disparaît |
| `sim/systems/spikes.test.ts` | supprimé avec le système |
| `sim/upgrades/draw.test.ts` | le tirage tient avec 14 cartes |
| `i18n/parity.test.ts` | passe après retrait des 4 clés |

Le rendu du chevron se vérifie à l'écran, pas en test unitaire.

---

## 6. Vérification manuelle

1. Le Trait d'encre n'apparaît plus au sol et ses deux cartes ne sortent plus.
2. La ruée traverse près d'un tiers de l'arène en balayant un large couloir.
3. Le sillage se lit comme une suite de flèches pointées dans le sens de la course, et tout ce qui est dessiné tue.
4. Deux « Plume large » élargissent nettement le couloir sans le rendre absurde.
