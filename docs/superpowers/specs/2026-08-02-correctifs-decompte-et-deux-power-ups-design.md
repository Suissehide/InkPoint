# Correctifs, décompte de reprise et deux nouveaux power-ups

## 1. Intention

Six corrections issues d'une session de jeu. Trois retirent ou neutralisent ce qui ne
tient pas ses promesses, deux réparent une reprise et une lisibilité, la dernière ajoute
du contenu :

1. **« Onde de choc » n'a pas de sens.** Une explosion qui repousse les survivants les
   éparpille hors du rayon suivant : la carte travaille contre le power-up qu'elle est
   censée améliorer. Elle disparaît.
2. **La Ronce d'encre laisse encore mourir.** La couronne est étanche par construction
   (`powerups.test.ts` le vérifie sur les trois genres d'ennemis), mais l'étanchéité est
   un argument géométrique sur un anneau *statique* : un ennemi rapide peut la traverser
   en un seul pas de simulation. La Ronce rend désormais invincible.
3. **Le Buvard sort du tirage.** Sans être supprimé : son code, son identifiant et son
   poids restent en place.
4. **La reprise est brutale.** Sortir d'une pause ou d'un choix de carte relance la
   simulation à l'image suivante, sans laisser le temps de retrouver le point. Un
   décompte 3-2-1 s'intercale.
5. **Les textes sont trop petits sur grand écran.** Le HUD suit le zoom de l'arène ; les
   écrans DOM, non — ils sont figés en pixels et rétrécissent visuellement à mesure que
   l'écran grandit. Les cartes en souffrent le plus.
6. **Deux power-ups s'ajoutent** : la Volée de plumes et la Bavure.

**Hors périmètre.** Aucun power-up de contrôle ne remplace le Buvard dans cette
livraison ; l'invisibilité et le leurre restent des pistes ouvertes. Aucun réglage de
difficulté, aucune retouche du HUD.

## 2. Retrait de « Onde de choc »

Suppression franche, pas une désactivation : la carte n'a aucune raison de survivre en
sommeil.

| Fichier | Ce qui part |
| --- | --- |
| `src/sim/data/upgrades.ts` | l'entrée `shockwave` |
| `src/sim/data/powerups.ts` | `RULE_TUNING.shockwave` |
| `src/sim/systems/hazards.ts` | `shockwaveActive`, `isShockwaveBlast`, la branche de recul ; `searchRadius` redevient `hr` |
| `src/i18n/locales/fr.json` | `upgrade.shockwave.name` / `.desc` |
| `src/i18n/locales/en.json` | `upgrade.shockwave.name` / `.desc` |

Les deux clés i18n ne sont pas optionnelles : `src/i18n/upgrades.test.ts` échoue sur toute
clé `upgrade.<id>.*` qui survit à sa carte.

`src/ui/components/card.test.ts` utilise la chaîne `'shockwave'` comme simple graine de
hachage pour `frameJitter` — les tests passeraient tels quels, mais une graine qui nomme
une carte disparue induit en erreur le prochain lecteur. Elle est remplacée par un
identifiant vivant.

La disparition de la branche de recul emporte avec elle les gardes `Dasher` et `Frozen`
qui la protégeaient : elles n'existaient que pour elle.

**Conséquence sur le tirage.** Le pool rare tombe à deux cartes (« Givre rampant »,
« Ronce vivace »). Les deux rares introduites en §7 le ramènent à quatre.

## 3. La Ronce rend invincible

### 3.1 Ce qui change

Dans `src/sim/powerups/activate.ts`, branche `bramble`, après la création des épines :

```ts
const grace = stats.brambleDurationMs + FIXED_DT
// `hasComponent` et non une simple lecture : les tableaux SoA de bitECS ne
// sont jamais remis à zéro au retrait d'un composant, donc
// `Invulnerable.remaining[player]` peut encore porter la valeur d'une
// invulnérabilité révolue. La lire sans garde ferait durer la Ronce aussi
// longtemps que le plus long Halo brisé de la partie.
const current = hasComponent(world, Invulnerable, player) ? Invulnerable.remaining[player]! : 0
addComponent(world, Invulnerable, player)
Invulnerable.remaining[player] = Math.max(current, grace)
```

### 3.2 Pourquoi `Invulnerable` et pas un composant dédié

`collisionSystem` teste déjà `Invulnerable` en tête, avant toute recherche de contact, et
`playerView` dessine déjà un joueur invulnérable. Un composant neuf dupliquerait les deux
sans rien apporter.

### 3.3 Pourquoi le pas de marge

`collisionSystem` (qui décrémente et expire `Invulnerable`) tourne **avant**
`lifetimeSystem` (qui marque les épines expirées) dans `step.ts`. Sans `+ FIXED_DT`, il
existe exactement une image où les épines sont encore à l'écran et le joueur est redevenu
mortel.

C'est le piège que le code documente déjà pour la Ruée : *« deux minuteurs pour un même
état finissent par diverger d'un pas, ce qui a déjà tué le joueur sur la dernière image de
sa ruée »*. Ici les deux minuteurs sont inévitables — l'un vit sur le joueur, l'autre sur
chaque épine — donc la marge d'un pas est la réponse, et elle est délibérée.

### 3.4 Pourquoi le `Math.max`

Un Halo brisé pose `Invulnerable.remaining = 1000`. Ramasser une Ronce dans la seconde qui
suit ne doit pas raccourcir cette grâce. Le `Math.max` garde toujours la plus longue des
deux.

### 3.5 Ce que les cartes deviennent

« Longue ronce » (+900 ms) et « Ronce vivace » (×2) allongent `brambleDurationMs`, donc
l'invincibilité avec. Elles cessent d'être des cartes de zone pour devenir des cartes de
protection. C'est cohérent, et c'est assumé : la Ronce est le power-up le plus rare du jeu
(poids 1, sous le Halo), et « Ronce vivace » est une rare non cumulable. Le pire cas — 10 s
d'intouchable — demande le power-up le plus rare *et* une rare précise dans la même run.

## 4. Le Buvard hors du tirage

### 4.1 Le mécanisme

Dans `src/sim/data/powerups.ts` :

```ts
/**
 * Genres retirés du sac de tirage sans être supprimés : identifiant, poids et
 * code restent en place. Une ligne à retirer pour les remettre en jeu.
 */
export const POWERUP_DISABLED: ReadonlySet<PowerUpKind> = new Set(['blotter'])

export const POWERUP_DRAWABLE: readonly PowerUpKind[] = POWERUP_KINDS.filter(
  (kind) => !POWERUP_DISABLED.has(kind),
)
```

`src/sim/systems/pickup.ts` tire dans `POWERUP_DRAWABLE` et somme les poids sur cette même
liste (`POWERUP_WEIGHT_TOTAL`).

### 4.2 Pourquoi pas un poids à zéro

`powerups.test.ts` exige un poids **strictement positif** pour chaque genre, précisément
parce qu'un poids nul rendrait un genre indistinguable d'un genre absent. Un ensemble
nommé dit ce qu'il fait ; un zéro se lit comme un oubli.

### 4.3 Ce qui suit tout seul

La carte « Papier assoiffé » porte `requires: 'blotter'`, et `draw.ts` conditionne toute
carte à la présence de son power-up dans `seenPowerups`. Le Buvard ne sortant plus, la
carte ne peut plus être tirée. **Aucun code à toucher**, et elle reviendra d'elle-même le
jour où le Buvard reviendra.

## 5. Décompte de reprise

### 5.1 La machine à états

Un état neuf, `countdown`, et un événement neuf, `COUNTDOWN_DONE` :

```
menu      : START            → playing
playing   : WAVE_END         → wavePause
            DIED             → dying
            PAUSE            → paused
wavePause : UPGRADE_CHOSEN   → countdown   (au lieu de playing)
            PAUSE            → paused
countdown : COUNTDOWN_DONE   → playing
            PAUSE            → paused
dying     : DEATH_ANIM_DONE  → gameover
gameover  : RESTART          → playing
            QUIT             → menu
paused    : RESUME           → countdown   (au lieu de playing)
            QUIT             → menu
```

`START` et `RESTART` mènent toujours directement à `playing` : le début de partie a déjà sa
propre mise en scène (l'arrivée du curseur), les deux se superposeraient.

### 5.2 Le minuteur

Nouveau module `src/app/countdown.ts`, sur le modèle exact de `render/fx/death-sequence.ts` :
un objet pur piloté par l'horloge réelle, sans DOM ni Pixi, donc testable seul.

```ts
export const COUNTDOWN_STEP_MS = 600
export const COUNTDOWN_DIGITS = 3

export interface Countdown {
  /** 3, 2 ou 1 — la valeur affichée ; 0 une fois `done`. */
  readonly digit: number
  readonly done: boolean
  start(): void
  update(dtMs: number): void
}
```

1,8 s au total. Assez pour retrouver le point, assez court pour ne pas peser à chaque
vague.

L'horloge réelle et non le temps de simulation : la simulation ne fait aucun pas pendant
le décompte, son horloge est arrêtée.

`update` accumule et n'écrête pas : un `dt` de 5 s livré en une fois (onglet remis au
premier plan) doit terminer le décompte, pas le faire sauter dans un état incohérent.
`game.ts` plafonne déjà `dt` à `MAX_CATCHUP_MS` en amont, mais le module ne s'y fie pas.

### 5.3 L'écran

Nouveau `src/ui/screens/countdown.ts`, sur le modèle des autres écrans :

- `pointer-events-none` — il ne capte rien, `game.ts` route toujours les touches ;
- **pas de `backdrop-blur` ni de voile sombre**, contrairement à `pause.ts` et
  `upgrade.ts` : l'arène gelée doit rester parfaitement lisible pendant qu'on se
  rassemble. C'est tout l'intérêt du décompte ;
- un chiffre unique, centré, en `ui-huge` (§6) ;
- un pop CSS à chaque changement de chiffre, sur le modèle de `.combo-pop` — donc coupé
  par les deux gardes de mouvement réduit déjà en place dans `main.css`.

### 5.4 Le branchement dans `game.ts`

Le décompte est avancé dans `frame()`, à côté de `deathSequence`, avec le même `dt`
plafonné à `MAX_CATCHUP_MS`.

**Aucune garde n'est à ajouter sur la simulation** : `loop.onStep` ne fait un pas que si
`machine.state === 'playing'`. L'état `countdown` gèle donc le monde par construction, et
il le gèle exactement comme `paused` le fait déjà.

Trois ajustements :

- `syncCursorVisibility` : le curseur système est masqué dès `countdown`, pas seulement en
  `playing`. Conséquence voulue — `stage.setAimTarget` est conditionné à `cursorHidden`,
  donc **le réticule peut s'afficher pendant le décompte**. Pas tout de suite après un
  clic : `mouse.forgetTarget()` (appelé par `beginCountdown()`) rend `mouse.target()` nul
  jusqu'au prochain `pointermove` — délibéré, ça protège le premier pas de simulation. Le
  réticule reparaît dès que le joueur bouge la souris, avant que ça reparte.
- `syncArenaVisibility` : rien à faire, `machine.state !== 'menu'` couvre déjà `countdown`.
- Le routage clavier gagne une branche `countdown` : `Échap` repause (`PAUSE`), et
  `countdownScreen` n'intercepte aucune autre touche.

`mouse.forgetTarget()` reste appelé dans `onResume` et `onCardChosen`, comme aujourd'hui.

### 5.5 Le son

Un tick par chiffre, joué depuis `src/audio/ui.ts` (`playCountdownTick(digit)`), avec une
hauteur plus haute sur le dernier. La voix vit dans `src/audio/sounds.ts` comme toutes les
autres.

## 6. Échelle typographique des écrans

### 6.1 Le principe

Une variable CSS posée sur `#ui`, et des utilitaires opt-in qui la consultent. **Jamais un
`font-size` sur un ancêtre partagé** : le HUD est déjà mis à l'échelle par un `transform`
calé sur le zoom de l'arène (`hud.setViewport`) ; l'y soumettre en plus le ferait grandir
deux fois.

Dans `src/styles/main.css` :

```css
#ui {
  --ui: clamp(18px, 1.4vh + 8px, 30px);
}

@utility ui-2xs  { font-size: calc(var(--ui) * 0.58); }
@utility ui-xs   { font-size: calc(var(--ui) * 0.68); }
@utility ui-sm   { font-size: calc(var(--ui) * 0.82); }
@utility ui-base { font-size: calc(var(--ui) * 1); }
@utility ui-lg   { font-size: calc(var(--ui) * 1.15); }
@utility ui-2xl  { font-size: calc(var(--ui) * 1.5); }
@utility ui-huge { font-size: calc(var(--ui) * 4.5); }
```

Toutes les tailles sont calculées depuis `--ui`, jamais depuis le parent : imbriquer deux
utilitaires ne compose pas les facteurs. C'est ce qui distingue cette rampe d'un usage
direct de `em`.

`vh` et non `vw` : l'arène est en 16:9 et cadrée par sa dimension la plus contrainte ; sur
une fenêtre large et basse, c'est la hauteur qui dit la vraie taille perçue.

### 6.2 Ce que ça donne

**Le plancher du `clamp` est à 18 px, pas à la valeur d'aujourd'hui.** C'est le point qui
décide de tout : une rampe calée pour valoir l'existant à 720 p n'agrandirait *rien* sur la
résolution la plus courante, alors que la demande est d'agrandir partout et davantage sur
grand écran.

| | 1280×720 | 1920×1080 | 2560×1440 | 3840×2160 |
| --- | --- | --- | --- | --- |
| `--ui` | 18,0 px | 23,1 px | 28,2 px | 30,0 px (plafond) |
| desc. de carte — `ui-xs` | **12,2** *(11)* | **15,7** *(11)* | **19,2** *(11)* | **20,4** *(11)* |
| nom de carte — `ui-sm` | **14,8** *(14)* | **18,9** *(14)* | **23,1** *(14)* | **24,6** *(14)* |
| rareté — `ui-2xs` | **10,4** *(9)* | **13,4** *(9)* | **16,4** *(9)* | **17,4** *(9)* |
| entrée de menu — `ui-lg` | **20,7** *(18)* | **26,6** *(18)* | **32,4** *(18)* | **34,5** *(18)* |
| titre d'écran — `ui-2xl` | **27,0** *(24)* | **34,6** *(24)* | **42,3** *(24)* | **45,0** *(24)* |
| chiffre du décompte — `ui-huge` | **81** | **104** | **127** | **135** |
| largeur de carte — `9,5 × --ui` | **171** *(160)* | **219** *(160)* | **268** *(160)* | **285** *(160)* |

*(entre parenthèses : la valeur d'aujourd'hui, identique à toutes les résolutions)*

Le plafond à 30 px existe pour la 4 K, où `1.4vh` seul donnerait 38 px et ferait des cartes
de 360 px de large : passé une certaine taille, agrandir encore ne rend plus rien plus
lisible, ça donne juste l'impression d'un jeu conçu pour un autre écran.

Encombrement au pire cas (1440 p) : trois cartes de 268 px plus leurs écarts tiennent dans
900 px de large sur 2560 disponibles, pour 375 px de haut (ratio 5/7) sur 1440. Aucun
risque de débordement.

Le plancher de 18 px protège le mode inclinaison sur téléphone, où le zoom de l'arène
descend bien sous 1 : les écrans DOM, eux, ne rétrécissent jamais avec lui.

### 6.3 Fichiers touchés

Conversions de classes uniquement, aucune logique :

`src/ui/components/card.ts`, `src/ui/screens/upgrade.ts`, `pause.ts`, `menu.ts`,
`settings.ts`, `gameover.ts`, plus le nouveau `countdown.ts`.

Les dimensions (largeur de carte, écarts) passent en `calc(var(--ui) * n)` par valeur
arbitraire Tailwind, pour suivre la même échelle que le texte qu'elles encadrent.

`src/ui/screens/hud.ts` et `hud-combo.ts` **ne sont pas touchés** : ils n'utilisent aucun
utilitaire `ui-*`, donc rien ne change pour eux.

## 7. Deux nouveaux power-ups

### 7.1 Identifiants et poids

Les identifiants ne sont jamais réutilisés : 8 reste `null` dans `POWERUP_BY_ID`, les
nouveaux prennent 9 et 10.

| Genre | Id | Poids | Rôle |
| --- | --- | --- | --- |
| `volley` — Volée de plumes | 9 | 4 | offensif, téléguidé |
| `splatter` — Bavure | 10 | 3 | offensif, autonome |

Les deux restent au-dessus du Halo (1,5) : l'assertion « le Halo est plus rare que les
offensifs » de `powerups.test.ts` tient sans retouche.

Nouveaux types de zone : `HAZARD_QUILL = 8`, `HAZARD_SPLATTER = 9`.

### 7.2 Ce que le typage impose

Trois tables sont des `Record<PowerUpKind, …>` et une quatrième porte un contrôle
d'exhaustivité explicite. Aucun des deux genres ne peut arriver muet ou invisible :

| Fichier | Ce qui devient obligatoire |
| --- | --- |
| `src/ui/icons.ts` | un pictogramme SVG |
| `src/render/views/pickup.ts` | le même tracé en primitives Pixi |
| `src/sim/data/powerups.ts` | un poids, un identifiant, des constantes de base |
| `src/audio/sounds.ts` | une voix (garde `never` dans `powerupVoices`) |

`src/render/views/hazard.ts` gagne deux entrées dans `COLORS` et deux tracés. Il n'a pas de
garde d'exhaustivité — c'est une vérification à faire à l'œil (§9).

### 7.3 Aucun des deux ne porte de `Collider`

`integrationSystem` interroge `[Position, PrevPosition, Velocity, Collider, Not(Materializing)]`
et **bloque aux murs** ce qu'il déplace. Sans `Collider`, les deux projectiles en sont
exclus et gouvernent leur propre déplacement — exactement le patron que `brambleSystem`
applique déjà à ses épines.

C'est ce qui permet à la Bavure de rebondir au lieu d'être plaquée contre le mur, et ça
évite d'avoir à introduire une exception dans un système que tout le reste traverse.

Les deux portent `PrevPosition` : `stage.ts` interpole toute zone qui en porte, sans liste
de genres à tenir à jour.

### 7.4 Volée de plumes (`volley`)

Trois plumes partent du joueur vers les trois ennemis les plus proches, distincts quand
c'est possible. Virage progressif, pas de téléguidage parfait : une plume doit pouvoir
manquer sa cible et se rabattre.

**Trois cas à trancher explicitement, sans quoi l'implémentation choisira au hasard :**

- **Moins d'ennemis vivants que de plumes** — les plumes en surplus visent l'ennemi le plus
  proche déjà pris. Deux plumes sur une même cible valent mieux qu'une plume gâchée, et le
  surplus d'explosions ne se perd pas.
- **Aucun ennemi vivant à l'activation** — les plumes partent quand même, réparties en
  éventail devant le joueur, et réacquièrent une cible dès qu'un ennemi se matérialise.
- **Aucune cible jusqu'au bout** — la plume file tout droit et expire à `lifeMs`, sans
  explosion. Une explosion sans impact mentirait sur ce qui vient de tuer.

Les ennemis en cours de matérialisation ne sont jamais ciblés : le pointillé est
inoffensif *et* hors d'atteinte partout ailleurs dans le jeu.

**Elles ne tuent pas au passage.** À l'impact, chacune pose un `HAZARD_BLAST` réduit et
disparaît : c'est l'explosion qui tue. La règle du projet — *ce que le joueur voit est
exactement ce qui tue* (spec de fond §3.1) — reste vraie, et le joueur obtient bien les
« petites explosions à l'impact » demandées.

Nouveau composant :

```ts
export const Seeker = defineComponent({
  target: Types.eid,
  speed: Types.f32,
  turnRate: Types.f32,
  /** Relances restantes (« Plumes gigognes ») ; 0 sans la carte. */
  relaunches: Types.ui8,
})
```

Nouveau système `src/sim/systems/seeker.ts` : réacquiert une cible si la sienne a disparu,
infléchit le cap vers elle à `turnRate` rad/ms, avance, écrit `PrevPosition`, et teste le
contact. Au contact : pose l'explosion, marque `Doomed`, et décrémente `relaunches` en
relançant une plume si la carte rare est prise.

Constantes de base :

```ts
volley: {
  count: 3,
  speed: 340,
  turnRate: 0.006,      // rad/ms, comme angularRate de la Ronce
  lifeMs: 2600,
  quillRadius: 5,
  blastRadius: 60,
  blastGrowth: 320,     // même croissance que la Bombe : une explosion se lit pareil
  blastLingerMs: 120,
}
```

Le tirage de cible ne consomme pas `world.rng` : « le plus proche » est déterministe, et
l'ordre d'itération d'une requête bitECS l'est aussi. La déterminisme du monde est
préservé, ce que `src/sim/determinism.test.ts` vérifiera de lui-même.

### 7.5 Bavure (`splatter`)

Une goutte part de la position du joueur dans la direction de son regard (`Facing.angle`,
comme la Ruée — c'est un geste orienté, pas une zone posée), rebondit sur les quatre murs
et tue au contact pendant sa durée de vie. C'est le seul power-up qui continue à travailler
pendant que le joueur esquive ailleurs.

`HAZARD_SPLATTER` rejoint l'ensemble `LETHAL` de `hazardSystem` : la létalité est acquise
sans code neuf.

Nouveau composant :

```ts
export const Ricochet = defineComponent({
  /** Dédoublements restants au prochain rebond (« Éclaboussure ») ; 0 sans la carte. */
  splitsLeft: Types.ui8,
})
```

Nouveau système `src/sim/systems/ricochet.ts` : écrit `PrevPosition`, avance, réfléchit la
composante de vitesse qui franchit un bord (marge = `Hazard.radius`), et dédouble si
`splitsLeft > 0`.

Le dédoublement, précisément : au rebond, une seconde goutte est créée à la même position
avec le même `Lifetime` restant, et **les deux s'écartent symétriquement de `splitAngle / 2`
de part et d'autre du cap réfléchi**. La symétrie n'est pas cosmétique : garder la goutte
d'origine sur son cap et ne dévier que la nouvelle donnerait une paire dont une seule
branche a vraiment été dirigée, et le rebond se lirait comme un bug.

Les deux repartent avec `splitsLeft = 0` — sans quoi chaque rebond doublerait la population
et la carte deviendrait un déni de service sur elle-même.

Sur l'image d'un rebond, `PrevPosition` et `Position` encadrent le mur : l'interpolation de
`stage.ts` reste correcte, elle ne fait que couper le coin — aucun saut visible.

Constantes de base :

```ts
splatter: {
  speed: 300,
  radius: 11,
  lifeMs: 4200,
  /** Écart de cap TOTAL entre les deux gouttes d'« Éclaboussure », en radians (~29°) : chacune dévie de la moitié. */
  splitAngle: 0.5,
}
```

### 7.6 Ordre dans `step.ts`

```
… integrationSystem → dashWakeSystem → brambleSystem → seekerSystem → ricochetSystem → hazardSystem → …
```

Les deux nouveaux systèmes se placent avec `brambleSystem`, pour la même raison que lui :
ce sont des déplacements que `integrationSystem` ne fait pas. Et **avant `hazardSystem`**,
pour que l'explosion posée par une plume soit testée dès le pas où elle naît — même
exigence que le commentaire déjà en place au-dessus de `dashWakeSystem`.

### 7.7 Cartes

Une commune et une rare par power-up, conformément à la règle de la spec de fond (note 5 :
tout power-up sauf le Halo a au moins une commune qui fait varier un de ses chiffres).

| Id | Rareté | Requiert | Effet |
| --- | --- | --- | --- |
| `volley-count` — « Volée nourrie » | commune, cumulable | `volley` | +1 plume |
| `nested-quills` — « Plumes gigognes » | rare | `volley` | chaque impact relance une plume vers une nouvelle cible, une seule fois |
| `splatter-life` — « Bavure tenace » | commune, cumulable | `splatter` | +1500 ms de durée |
| `splatter-split` — « Éclaboussure » | rare | `splatter` | au premier rebond, la goutte se dédouble |

Les deux communes ajoutent des champs à `RunStats` (`volleyCount`, `splatterLifeMs`), lus
par les systèmes, jamais les constantes de base — c'est ce qui rend les cartes purement
additives.

Les deux rares posent une règle dans `stats.rules` (`nestedQuills`, `splitSplatter`), lue à
l'activation pour initialiser `relaunches` et `splitsLeft`. Le compteur vit sur l'entité,
pas dans les stats : deux volées lancées à la suite ne doivent pas partager leur budget de
relances.

Huit clés i18n par locale, sinon `upgrades.test.ts` échoue.

## 8. Tests

Nouveaux fichiers :

- `src/app/countdown.test.ts` — la séquence des chiffres (3, 2, 1), le passage à `done`
  après `COUNTDOWN_DIGITS × COUNTDOWN_STEP_MS`, l'insensibilité à un `dt` énorme livré en
  une fois.
- `src/sim/systems/seeker.test.ts` — la plume vire vers sa cible sans jamais dépasser
  `turnRate` sur un pas ; elle réacquiert une cible quand la sienne meurt ; elle ne cible
  jamais un ennemi en matérialisation ; l'impact pose une explosion et retire la plume ;
  sans cible vivante elle continue tout droit et expire **sans** explosion ; avec moins
  d'ennemis que de plumes, aucune plume n'est perdue.
- `src/sim/systems/ricochet.test.ts` — le rebond inverse la bonne composante et conserve la
  norme de la vitesse ; la goutte ne sort jamais de l'arène, y compris sur un rebond de
  coin où les deux composantes s'inversent au même pas ; le dédoublement n'a lieu qu'une
  fois, et les deux gouttes issues d'un dédoublement ne se redédoublent jamais.

Fichiers existants à étendre :

- `src/app/game-state.test.ts` — les deux nouvelles transitions vers `countdown`, et le
  fait que `START` et `RESTART` mènent toujours à `playing`.
- `src/sim/data/powerups.test.ts` — `POWERUP_DISABLED ⊆ POWERUP_KINDS` ; `POWERUP_DRAWABLE`
  n'est jamais vide ; aucun genre désactivé n'en fait partie.
- `src/sim/systems/collision.test.ts` (ou un test dédié à la Ronce) — après activation de
  la Ronce, un ennemi téléporté au contact du joueur ne le tue pas ; et il le tue à nouveau
  une fois la couronne expirée, épines comprises.

Les tests existants qui doivent rester verts sans être modifiés : `determinism.test.ts`,
`purity.test.ts`, `i18n/parity.test.ts`.

## 9. Vérification à l'œil

Ce que les tests ne peuvent pas attraper :

1. Les deux nouveaux pictogrammes de pastille sont distinguables des six autres au sol, à
   la taille réelle.
2. La plume est orientée dans son sens de vol (elle porte `Facing`) et son explosion se lit
   comme une petite Bombe, pas comme une Bombe ratée.
3. La Bavure ne clignote pas au rebond, et sa trajectoire reste lisible quand deux gouttes
   coexistent après un dédoublement.
4. Le décompte n'obstrue pas la zone où le joueur va reprendre : le chiffre est au centre,
   le point peut y être.
5. Le réticule apparaît bien pendant le décompte en mode souris.
6. Sur une fenêtre 2560×1440, les cartes sont confortablement lisibles ; sur un téléphone
   en paysage, elles ne débordent pas.
7. Le HUD est strictement inchangé à toutes les résolutions.

## 10. Hors périmètre

- Aucun power-up de contrôle ne remplace le Buvard. L'invisibilité (« Encre sympathique »)
  et le leurre (« Fac-similé ») restent des pistes documentées, non retenues ici.
- Aucun décompte au démarrage d'une partie : l'arrivée du curseur tient déjà ce rôle.
- Aucun réglage de la courbe de difficulté, alors même que deux power-ups offensifs
  s'ajoutent au sac. À observer en playtest avant de toucher quoi que ce soit.
