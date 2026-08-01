# Moteur audio, cartes à jouer, spawn visible — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner un son au jeu, faire apparaître les ennemis dans l'écran, refondre les cartes en format carte à jouer, et appliquer cinq réglages issus d'une session de jeu.

**Architecture:** Sept changements ciblés dans `src/sim/`, `src/render/` et `src/ui/`, plus un calque neuf `src/audio/` au même rang que `src/render/` : il lit `world.events` et n'écrit jamais dans la simulation. Les tâches 1 à 6 sont indépendantes les unes des autres ; les tâches 7 et 8 construisent l'audio et peuvent être décalées sans bloquer le reste.

**Tech Stack:** TypeScript strict, PixiJS v8, bitECS, WebAudio, Tailwind, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-08-01-audio-cartes-spawn-design.md`

## Global Constraints

- **Langue.** Commentaires, noms de tests et messages de commit en **français**.
- **Commits.** Conventional Commits, imposés par husky + commitlint. Portées : `sim`, `render`, `ui`, `audio`, `data`, `i18n`.
- **Ne jamais `git add -A`.** Une autre session peut travailler dans le même dépôt. Chaque commit liste ses fichiers explicitement.
- **Ne jamais pousser** vers `origin`.
- **`src/sim/` est pur et déterministe** : ni `Math.random()`, ni `Date.now()`, ni Pixi, ni DOM. L'aléa passe exclusivement par `world.rng`. Un test textuel (`src/sim/purity.test.ts`) le garde.
- **Le nombre de tirages `world.rng` ne doit dépendre ni de la taille de l'arène ni de la position du joueur.** `src/sim/systems/waves.test.ts` le garde explicitement — prérequis du netcode v3.
- **`src/render/` et `src/audio/` n'ont pas droit à `!`** (assertion non-nulle), réservé à `src/sim/`.
- **`noUncheckedIndexedAccess` est actif.**
- **Palette :** uniquement `INK` (`src/render/ink.ts`) côté rendu ; les classes Tailwind du thème côté UI. Aucune couleur en dur.
- **Vérification après chaque tâche :** `npm test && npm run lint && npm run typecheck`.
- **Base au démarrage :** 406 tests verts.

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `src/sim/systems/player-movement.ts` | Fin de la ruée au contact d'un mur | 1 |
| `src/sim/systems/waves.ts` | Origine des spawns, ramenée dans l'arène | 2 |
| `src/sim/data/formations.ts` | `FORMATION_EDGE_MARGIN` devient une marge intérieure | 2 |
| `src/sim/data/upgrades.ts` | Retrait d'« Encre généreuse » | 3 |
| `src/sim/upgrades/stats.ts`, `src/sim/systems/pickup.ts` | Retrait de `pickupIntervalMultiplier` | 3 |
| `src/i18n/locales/{fr,en}.json` | Clés de la carte retirée | 3 |
| `src/sim/data/powerups.ts` | Poids de la Ronce | 4 |
| `src/render/views/enemy.ts` | Liseré intérieur | 5 |
| `src/ui/components/card.ts` | Format carte à jouer, cadre à la plume | 6 |
| `src/audio/engine.ts` | **Créé.** Contexte WebAudio, déverrouillage, volume, synthèse d'une voix | 7 |
| `src/audio/curves.ts` | **Créé.** Fonctions pures : volume, hauteur de kill, budget de voix | 7 |
| `src/audio/sounds.ts` | **Créé.** La palette : un `VoiceSpec` par événement | 8 |
| `src/audio/apply.ts` | **Créé.** Lit `world.events`, déclenche les voix | 8 |
| `src/app/game.ts` | Câblage de l'audio, déverrouillage au premier geste | 8 |
| `src/ui/screens/settings.ts` | Le volume pilote enfin quelque chose | 8 |

---

### Task 1: La ruée s'arrête au contact d'un mur

Aujourd'hui `dashFullyBlocked` ne termine la ruée que si **toutes** ses composantes sont bloquées : une ruée oblique glisse le long de la paroi pendant toute sa durée. On inverse cet arbitrage — tout contact réel la termine.

**Files:**
- Modify: `src/sim/systems/player-movement.ts`
- Test: `src/sim/systems/player-movement.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `dashFullyBlocked` est renommée `dashHitsWall`, même signature `(world: SimWorld, eid: number): boolean`. Fonction locale, non exportée.

- [ ] **Step 1: Inverser le test qui encode l'ancien arbitrage**

Dans `src/sim/systems/player-movement.test.ts`, le test `laisse filer une ruée qui rase le mur au lieu de le percuter` affirme le comportement qu'on supprime. Remplace-le par son inverse, en gardant la même mise en place (position, vélocité de ruée obliques contre un mur) :

```ts
  it('termine la ruée dès qu’un mur bloque une seule de ses composantes', () => {
    // Même situation que l'ancien test « laisse filer une ruée qui rase le
    // mur » : oblique, collée à la paroi gauche. Elle avançait encore le long
    // du mur ; elle doit désormais s'arrêter au contact.
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const p = spawnPlayer(w)
    Position.x[p] = Collider.radius[p]!
    Position.y[p] = 300
    addComponent(w, Dashing, p)
    Dashing.remaining[p] = 400
    Dashing.vx[p] = -600
    Dashing.vy[p] = -600

    playerMovementSystem(w)

    expect(hasComponent(w, Dashing, p)).toBe(false)
  })
```

Ajoute ensuite le test qui garde le piège du Step 3 — sans lui, une régression rendrait toute ruée axiale instantanément nulle :

```ts
  it('ne coupe pas une ruée parfaitement horizontale loin de tout mur', () => {
    // `vy === 0` ne doit PAS compter comme « bloqué par un mur » : c'est une
    // composante qui n'avance pas, pas une composante arrêtée par une paroi.
    const w = createWorld({ seed: 1, width: 800, height: 600 })
    const p = spawnPlayer(w)
    Position.x[p] = 400
    Position.y[p] = 300
    addComponent(w, Dashing, p)
    Dashing.remaining[p] = 400
    Dashing.vx[p] = 600
    Dashing.vy[p] = 0

    playerMovementSystem(w)

    expect(hasComponent(w, Dashing, p)).toBe(true)
  })
```

Adapte les imports du fichier de test si `Collider`, `Dashing`, `addComponent` ou `hasComponent` n'y sont pas déjà — reprends la forme des tests voisins plutôt que d'inventer une mise en place.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/sim/systems/player-movement.test.ts`
Expected: FAIL sur le premier des deux (la ruée oblique survit encore). Le second passe déjà — c'est normal, il garde le comportement actuel contre la régression que le Step 3 pourrait introduire.

- [ ] **Step 3: Passer du « et » au « ou »**

Dans `src/sim/systems/player-movement.ts`, remplace la fonction et son commentaire :

```ts
/**
 * Vrai quand un mur bloque la ruée. Sans cette coupure, le clamp
 * d'`integrationSystem` arrête la position sans arrêter la ruée : le joueur
 * reste garé contre le mur, invulnérable et tuant dans son rayon, pour tout
 * le reste de sa durée.
 *
 * « Une composante bloquée suffit », et non « toutes » : une ruée oblique qui
 * touchait un mur glissait le long de la paroi jusqu'au bout de sa durée, ce
 * qui se lisait mal — percuter un mur doit arrêter.
 *
 * Une composante nulle ne compte PAS comme bloquée. Le test précédent, bâti
 * sur un « et », traitait `vx === 0` comme bloqué : correct pour un « et »
 * (elle ne progresse pas), désastreux dans un « ou » — une ruée parfaitement
 * horizontale a `vy === 0` et s'annulerait au premier pas, à l'autre bout de
 * l'arène.
 */
function dashHitsWall(world: SimWorld, eid: number): boolean {
  const r = Collider.radius[eid]!
  const x = Position.x[eid]!
  const y = Position.y[eid]!
  const vx = Dashing.vx[eid]!
  const vy = Dashing.vy[eid]!

  const blockedX = (vx < 0 && x <= r) || (vx > 0 && x >= world.arena.width - r)
  const blockedY = (vy < 0 && y <= r) || (vy > 0 && y >= world.arena.height - r)
  return blockedX || blockedY
}
```

Le garde-fou `if (vx === 0 && vy === 0) return false` disparaît : sous cette forme les deux booléens valent déjà `false`, il est devenu du code mort.

Mets à jour l'unique site d'appel (`remaining <= 0 || dashFullyBlocked(world, eid)` → `dashHitsWall`).

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/sim/systems/player-movement.test.ts`
Expected: PASS, y compris le test existant `termine la ruée quand le mur bloque toute sa vitesse`, qui reste valable.

- [ ] **Step 5: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/sim/systems/player-movement.ts src/sim/systems/player-movement.test.ts
git commit -m "feat(sim): arrêter la ruée dès qu'elle percute un mur"
```

---

### Task 2: Les ennemis apparaissent dans l'écran

`edgeOrigin` fait naître les ennemis **40 px hors de l'arène**, où le masque de découpe du rendu les rend invisibles. Leur phase `Materializing` — le contour pointillé qui signale « pas encore mortel » — n'est donc jamais vue. Ils entrent déjà pleins et mortels.

**La contrainte qui gouverne cette tâche :** `edgeOrigin` consomme **exactement deux tirages** `world.rng`, et `src/sim/systems/waves.test.ts` garde explicitement que le nombre de tirages ne dépend ni de la taille de l'arène ni de la position du joueur (prérequis du netcode v3). Ton correctif doit décaler le point d'apparition **par calcul pur**, sur le modèle de l'astuce du miroir déjà employée par `ambushPoints`.

**Files:**
- Modify: `src/sim/data/formations.ts`
- Modify: `src/sim/systems/waves.ts`
- Test: `src/sim/systems/waves.test.ts`

**Interfaces:**
- Consumes: `AMBUSH_MIN_DISTANCE` et `MAX_ENEMY_RADIUS`, exportés par `src/sim/data/enemies.ts`.
- Produces: `edgeOrigin` renvoie désormais un point **dans** l'arène. Sa signature ne change pas.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajoute à `src/sim/systems/waves.test.ts` :

```ts
describe('les ennemis apparaissent dans l’arène', () => {
  it('ne fait jamais naître un ennemi hors des bornes', () => {
    // Dérivé d'ARENA, jamais recopié : un futur changement de taille d'arène
    // doit continuer d'être couvert.
    const w = createWorld({ seed: 3, width: ARENA.width, height: ARENA.height })
    spawnPlayer(w)
    for (let step = 0; step < 3000; step++) {
      waveSystem(w, FIXED_DT)
    }
    for (const eid of enemyQuery(w)) {
      const r = Collider.radius[eid]!
      expect(Position.x[eid]!).toBeGreaterThanOrEqual(-0.001)
      expect(Position.x[eid]!).toBeLessThanOrEqual(ARENA.width + 0.001)
      expect(Position.y[eid]!).toBeGreaterThanOrEqual(-0.001)
      expect(Position.y[eid]!).toBeLessThanOrEqual(ARENA.height + 0.001)
      expect(r).toBeGreaterThan(0)
    }
  })

  it('ne fait jamais naître un ennemi trop près du joueur', () => {
    const w = createWorld({ seed: 5, width: ARENA.width, height: ARENA.height })
    const p = spawnPlayer(w)
    for (let step = 0; step < 3000; step++) {
      waveSystem(w, FIXED_DT)
      const px = Position.x[p]!
      const py = Position.y[p]!
      for (const eid of enemyQuery(w)) {
        if (!hasComponent(w, Materializing, eid)) {
          continue
        }
        // Seuls les ennemis encore en apparition sont contrôlés : une fois
        // matérialisés ils se déplacent vers le joueur, et se retrouver près
        // de lui est alors le jeu normal.
        expect(Math.hypot(Position.x[eid]! - px, Position.y[eid]! - py)).toBeGreaterThanOrEqual(
          AMBUSH_MIN_DISTANCE - 0.001,
        )
      }
    }
  })
})
```

Reprends la forme des helpers du fichier (`enemyQuery`, imports) plutôt que d'en créer. Ajoute les imports manquants : `ARENA` et `FIXED_DT` depuis `@/sim/world`, `AMBUSH_MIN_DISTANCE` depuis `../data/enemies`, `Materializing` et `Collider` depuis `../components`.

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/sim/systems/waves.test.ts`
Expected: FAIL — les ennemis de bord naissent aujourd'hui à `-40` ou `width + 40`.

- [ ] **Step 3: Faire de la marge une marge intérieure**

Dans `src/sim/data/formations.ts`, remplace la constante et son commentaire :

```ts
/**
 * Retrait du bord, vers l'INTÉRIEUR de l'arène. Les ennemis naissaient
 * auparavant à cette distance à l'extérieur, où le masque de découpe du rendu
 * les cachait : leur contour pointillé — le seul signal disant « pas encore
 * mortel » — n'était jamais visible, et ils entraient dans le champ déjà
 * pleins. La valeur vaut `MAX_ENEMY_RADIUS` pour que le plus large d'entre eux
 * soit entièrement visible dès sa première image.
 */
export const FORMATION_EDGE_MARGIN = MAX_ENEMY_RADIUS
```

Importe `MAX_ENEMY_RADIUS` depuis `./enemies`. Si cet import crée un cycle avec `enemies.ts`, préfère recopier la valeur en la dérivant explicitement dans `waves.ts` plutôt que dans `formations.ts`, et dis-le dans ton rapport.

- [ ] **Step 4: Ramener l'origine dans l'arène et l'écarter du joueur, sans tirage**

Dans `src/sim/systems/waves.ts`, remplace `edgeOrigin` :

```ts
/**
 * Origine d'un ennemi ou d'une formation de bord, DANS l'arène, avec la
 * direction qui l'amène vers l'intérieur. Deux tirages (bord, position sur ce
 * bord) : `dirX/dirY` se déduit du bord tiré, sans tirage supplémentaire.
 *
 * L'écartement du joueur (plus bas) est un calcul pur, jamais un nouveau
 * tirage — même exigence que `ambushPoints` : le nombre de tirages ne doit
 * dépendre ni de la position du joueur ni de la taille de l'arène.
 */
function edgeOrigin(world: SimWorld): { x: number; y: number; dirX: number; dirY: number } {
  const { width, height } = world.arena
  const m = FORMATION_EDGE_MARGIN
  switch (world.rng.int(4)) {
    case 0:
      return { x: m, y: pushFromPlayer(world, world.rng.range(0, height), 'y'), dirX: 1, dirY: 0 }
    case 1:
      return {
        x: width - m,
        y: pushFromPlayer(world, world.rng.range(0, height), 'y'),
        dirX: -1,
        dirY: 0,
      }
    case 2:
      return { x: pushFromPlayer(world, world.rng.range(0, width), 'x'), y: m, dirX: 0, dirY: 1 }
    default:
      return {
        x: pushFromPlayer(world, world.rng.range(0, width), 'x'),
        y: height - m,
        dirX: 0,
        dirY: -1,
      }
  }
}
```

et ajoute au-dessus le décalage pur :

```ts
/**
 * Glisse une coordonnée le long du bord jusqu'à dégager `AMBUSH_MIN_DISTANCE`
 * du joueur. Purement calculatoire : aucun tirage, et le résultat ne dépend
 * que de la valeur déjà tirée et de la position du joueur.
 *
 * Le décalage se fait du côté qui reste dans l'arène, et le résultat est
 * borné aux bornes de l'arène : dans une arène de 1280×720 la diagonale
 * dépasse largement 180 px, donc un point dégagé existe toujours.
 */
function pushFromPlayer(world: SimWorld, coord: number, axis: 'x' | 'y'): number {
  const p = world.playerEid
  if (p < 0) {
    return coord
  }
  const along = axis === 'x' ? Position.x[p]! : Position.y[p]!
  const span = axis === 'x' ? world.arena.width : world.arena.height
  const gap = AMBUSH_MIN_DISTANCE
  const delta = coord - along
  if (Math.abs(delta) >= gap) {
    return coord
  }
  // Pousse du côté où il reste de la place ; à égalité, vers le haut/gauche.
  const up = along + gap
  const down = along - gap
  const pick = up <= span ? up : down
  return Math.min(span, Math.max(0, pick))
}
```

Importe `AMBUSH_MIN_DISTANCE` depuis `../data/enemies` s'il ne l'est pas déjà.

**Pourquoi décaler le long du bord suffit.** On pourrait craindre que ce décalage ne garantisse que l'écart *le long du bord*, pas la distance réelle. Il n'en est rien : la distance euclidienne est toujours supérieure ou égale à chacune de ses composantes. Si l'écart le long du bord atteint `AMBUSH_MIN_DISTANCE`, la distance réelle l'atteint donc aussi, quelle que soit la position du joueur sur l'autre axe. Le calcul sur un seul axe est suffisant — inutile de compliquer `pushFromPlayer`.

- [ ] **Step 5: Lancer les tests pour les voir passer**

Run: `npx vitest run src/sim/systems/waves.test.ts`
Expected: PASS, **y compris** le test préexistant « consomme un nombre de tirages PRNG indépendant de la taille de l'arène » (ligne ~179). S'il échoue, ton décalage consomme un tirage ou en dépend : c'est un vrai défaut, pas un test à ajuster.

- [ ] **Step 6: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/sim/data/formations.ts src/sim/systems/waves.ts src/sim/systems/waves.test.ts
git commit -m "feat(sim): faire apparaître les ennemis dans l'écran, phase pointillée comprise"
```

---

### Task 3: Retirer « Encre généreuse »

La carte `generous-ink` (rare, « Les power-ups apparaissent deux fois plus souvent ») disparaît, et avec elle le champ de statistiques qu'elle était seule à écrire.

**Files:**
- Modify: `src/sim/data/upgrades.ts`
- Modify: `src/sim/upgrades/stats.ts`
- Modify: `src/sim/systems/pickup.ts`
- Modify: `src/sim/data/difficulty.ts`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: rien.
- Produces: `RunStats` perd le champ `pickupIntervalMultiplier`.

- [ ] **Step 1: Supprimer la carte et ses traductions**

Retire l'entrée `{ id: 'generous-ink', ... }` de `UPGRADES` dans `src/sim/data/upgrades.ts`, puis les clés `upgrade.generous-ink.name` et `upgrade.generous-ink.desc` dans **les deux** fichiers de locale. Le dépôt a un test de parité des locales (`src/i18n/parity.test.ts`) : en oublier une le fera échouer.

- [ ] **Step 2: Supprimer le champ devenu sans écrivain**

- `src/sim/upgrades/stats.ts` : retire `pickupIntervalMultiplier: number` de l'interface et `pickupIntervalMultiplier: 1` de `createRunStats`.
- `src/sim/systems/pickup.ts` (ligne ~70) : `pickupInterval(world.time / 1000) * stats.pickupIntervalMultiplier` devient `pickupInterval(world.time / 1000)`.
- `src/sim/data/difficulty.ts` : le JSDoc de `pickupInterval` dit « Multiplié par `RunStats.pickupIntervalMultiplier` (« Encre généreuse ») ». Retire cette phrase — la laisser ferait d'elle la quatrième affirmation périmée de ce dépôt.

- [ ] **Step 3: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. `npm run typecheck` signale tout usage résiduel du champ. Si un test référençait `generous-ink` ou le multiplicateur, supprime-le : il couvrait du code qui n'existe plus.

- [ ] **Step 4: Commit**

```bash
git add src/sim/data/upgrades.ts src/sim/upgrades/stats.ts src/sim/systems/pickup.ts src/sim/data/difficulty.ts src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(data): retirer la carte Encre généreuse et son multiplicateur"
```

---

### Task 4: La Ronce devient le power-up le plus rare

**Files:**
- Modify: `src/sim/data/powerups.ts`
- Test: `src/sim/systems/pickup.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `POWERUP_WEIGHT.bramble = 1`.

- [ ] **Step 1: Réécrire le test de hiérarchie**

Dans `src/sim/systems/pickup.test.ts`, le test « le Halo est nettement plus rare que les autres » affirme que le Halo a le poids le plus faible. Ce sera **faux** dès l'étape suivante. Remplace-le par un test qui exprime la hiérarchie réelle, dérivé des constantes :

```ts
  it('hiérarchise les poids : quatre courants, puis le Halo, puis la Ronce', () => {
    const courants: PowerUpKind[] = ['blast', 'freeze', 'blotter', 'dash']
    for (const kind of courants) {
      expect(POWERUP_WEIGHT[kind]).toBeGreaterThan(POWERUP_WEIGHT.halo)
    }
    // La Ronce passe sous le Halo : c'est le power-up le plus rare du jeu.
    expect(POWERUP_WEIGHT.halo).toBeGreaterThan(POWERUP_WEIGHT.bramble)
    // Aucun poids nul : un genre à 0 ne sortirait jamais et rendrait
    // inatteignables les cartes qui en dépendent.
    for (const kind of POWERUP_KINDS) {
      expect(POWERUP_WEIGHT[kind]).toBeGreaterThan(0)
    }
  })
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/sim/systems/pickup.test.ts`
Expected: FAIL sur `POWERUP_WEIGHT.halo > POWERUP_WEIGHT.bramble` — le Halo vaut 1,5 et la Ronce 2.

- [ ] **Step 3: Baisser le poids**

Dans `src/sim/data/powerups.ts`, `bramble: 2` devient `bramble: 1`, avec un commentaire disant ce qui a changé de nature :

```ts
  // Le power-up le plus rare du jeu, sous le Halo : la Ronce sortait trop
  // souvent au goût du joueur, et son statut passe de courante à
  // exceptionnelle. Conséquence assumée : `draw.ts` conditionne les cartes à
  // `seenPowerups`, donc « Longue ronce » et « Ronce vivace » entrent bien
  // plus tard dans le tirage.
  bramble: 1,
```

- [ ] **Step 4: Lancer le test pour le voir passer, puis vérification complète**

Run: `npx vitest run src/sim/systems/pickup.test.ts` puis `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/data/powerups.ts src/sim/systems/pickup.test.ts
git commit -m "feat(data): faire de la Ronce le power-up le plus rare"
```

---

### Task 5: Un liseré autour des ennemis

Les ennemis sont des disques pleins. Un liseré fin en `INK.paper` les détache du fond, dont la réglure a été densifiée de 60 % — la dernière revue signalait le risque qu'un Éclat (rayon 6) devienne difficile à repérer.

**Files:**
- Modify: `src/render/views/enemy.ts`

**Interfaces:**
- Consumes: rien.
- Produces: rien de nouveau à l'extérieur.

- [ ] **Step 1: Tracer le liseré à l'intérieur du rayon**

Dans `src/render/views/enemy.ts`, dans la branche « ennemi matérialisé » (`materializeProgress >= 1`), ajoute après le remplissage du disque :

```ts
      // Liseré tracé À L'INTÉRIEUR du rayon de collision : le disque affiché
      // doit rester exactement le disque qui tue. Un contour centré sur
      // `radius` déborderait de la moitié de son épaisseur et annoncerait une
      // zone mortelle plus large que la vraie.
      const edge = 1
      body
        .circle(0, 0, radius - edge / 2)
        .stroke({ color: INK.paper, width: edge, alpha: 0.55 })
```

Le liseré ne s'applique **pas** pendant `Materializing` : le contour pointillé est déjà la signature de cet état, et lui superposer un trait plein brouillerait la règle « pointillé = inoffensif, plein = mortel ».

Le `lastKey` du cache n'a pas besoin d'un nouveau terme : le liseré ne dépend que de `radius`, déjà dans la clé.

- [ ] **Step 2: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. Aucun test ne couvre le tracé (Pixi n'est pas instancié en test) — c'est la frontière assumée du dépôt.

- [ ] **Step 3: Vérifier à l'œil**

Run: `npm run dev`. Un Éclat (le plus petit ennemi) doit se détacher nettement de la réglure ; le liseré ne doit pas donner l'impression d'un ennemi plus gros qu'il n'est.

Si tu ne peux pas piloter le jeu depuis un outil navigateur, dis-le franchement dans ton rapport plutôt que de le prétendre.

- [ ] **Step 4: Commit**

```bash
git add src/render/views/enemy.ts
git commit -m "feat(render): détacher les ennemis du fond par un liseré intérieur"
```

---

### Task 6: Les cartes en format carte à jouer

Les cartes passent d'un bloc arrondi de 208 px à une **carte à jouer 5:7**, au cadre tracé à la plume. La rareté se lit au **nombre de traits**. L'animation de la mythique disparaît au passage.

**Files:**
- Modify: `src/ui/components/card.ts`
- Test: `src/ui/components/card.test.ts` (créé)

**Interfaces:**
- Consumes: `icon(kind, size)` depuis `../icons`, `t()` depuis `@/i18n`.
- Produces: `renderCard(card: UpgradeDef, selected: boolean): string` conserve sa signature. Nouvelle fonction pure exportée : `frameJitter(id: string, index: number): number`.

- [ ] **Step 1: Écrire le test du tracé déterministe**

Le cadre est irrégulier, mais son irrégularité doit être **stable pour une carte donnée** : `render()` est rappelé à chaque déplacement dans le menu, et un cadre retiré au hasard scintillerait à chaque changement de sélection.

Crée `src/ui/components/card.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { frameJitter } from './card'

describe('frameJitter', () => {
  it('rend toujours la même déviation pour une carte et un sommet donnés', () => {
    expect(frameJitter('shockwave', 2)).toBe(frameJitter('shockwave', 2))
  })

  it('dévie différemment deux sommets de la même carte', () => {
    const sommets = [0, 1, 2, 3].map((i) => frameJitter('shockwave', i))
    expect(new Set(sommets).size).toBeGreaterThan(1)
  })

  it('dévie différemment deux cartes au même sommet', () => {
    expect(frameJitter('shockwave', 0)).not.toBe(frameJitter('light-step', 0))
  })

  it('reste dans une déviation discrète, jamais un cadre difforme', () => {
    for (const id of ['shockwave', 'light-step', 'second-ink', 'afterburn']) {
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(frameJitter(id, i))).toBeLessThanOrEqual(2.5)
      }
    }
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/ui/components/card.test.ts`
Expected: FAIL — `frameJitter` n'existe pas.

- [ ] **Step 3: Réécrire `card.ts`**

```ts
import { t } from '@/i18n'
import type { UpgradeDef } from '@/sim/data/upgrades'
import { icon } from '../icons'

/** Déviation maximale d'un sommet du cadre, en pixels. */
const JITTER_PX = 2.5

/**
 * Déviation d'un sommet du cadre, dérivée de l'identifiant de la carte et
 * jamais d'un tirage : `render()` est rappelé à chaque déplacement dans le
 * menu, et un cadre retiré au hasard scintillerait à chaque changement de
 * sélection.
 */
export function frameJitter(id: string, index: number): number {
  let h = index * 2654435761
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0
  }
  return ((h % 1000) / 999) * 2 * JITTER_PX - JITTER_PX
}

/** Quadrilatère légèrement irrégulier : un trait de plume, pas un filet. */
function inkFrame(id: string, inset: number, seedOffset: number): string {
  const j = (n: number): number => frameJitter(id, n + seedOffset)
  const w = 100
  const h = 140
  const pts = [
    [inset + j(0), inset + j(1)],
    [w - inset + j(2), inset + j(3)],
    [w - inset + j(4), h - inset + j(5)],
    [inset + j(6), h - inset + j(7)],
  ]
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z'
}

/**
 * La rareté se lit au nombre de traits : un cadre pour la commune, deux pour
 * la rare, un cartouche plein (inversion papier/encre) pour la mythique.
 * Aucune couleur nouvelle — la rare abandonne sa lueur ambrée diffuse, qui se
 * lisait mal, au profit d'un second trait franc de la même couleur.
 */
const RARITY: Record<UpgradeDef['rarity'], { stroke: string; traits: number; body: string }> = {
  common: { stroke: 'stroke-paper/55', traits: 1, body: 'text-paper' },
  rare: { stroke: 'stroke-blast', traits: 2, body: 'text-paper' },
  mythic: { stroke: 'stroke-ink', traits: 2, body: 'bg-paper text-ink' },
}

export function renderCard(card: UpgradeDef, selected: boolean): string {
  const iconKind = card.requires ?? 'blast'
  const r = RARITY[card.rarity]
  const glyph = icon(iconKind, 15)
  const frames = [inkFrame(card.id, 4, 0)]
  if (r.traits > 1) {
    frames.push(inkFrame(card.id, 9, 11))
  }
  return `
    <div class="relative aspect-[5/7] w-40 overflow-hidden rounded ${r.body} transition-transform ${selected ? 'scale-105' : 'scale-95 opacity-70'}">
      <svg viewBox="0 0 100 140" preserveAspectRatio="none" class="pointer-events-none absolute inset-0 h-full w-full">
        ${frames.map((d, i) => `<path d="${d}" fill="none" class="${r.stroke}" stroke-width="${i === 0 ? 1.2 : 0.8}" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`).join('')}
      </svg>
      <div class="absolute left-2 top-2 opacity-80">${glyph}</div>
      <div class="absolute bottom-2 right-2 rotate-180 opacity-80">${glyph}</div>
      <div class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <span>${icon(iconKind, 32)}</span>
        <h3 class="text-sm leading-tight">${t(`upgrade.${card.id}.name`)}</h3>
        <p class="text-[11px] leading-snug opacity-75">${t(`upgrade.${card.id}.desc`)}</p>
        <span class="mt-1 text-[9px] tracking-[0.2em] opacity-60">${t(`rarity.${card.rarity}`)}</span>
      </div>
    </div>
  `
}
```

**L'animation `animate-[boil_0.16s_steps(1,end)_infinite]` disparaît** : l'inversion en négatif suffit à distinguer la mythique. La règle CSS `reduced-motion` de `main.css` **reste** — elle est générale et couvre toute l'interface.

Si les classes `stroke-paper`, `stroke-blast` ou `stroke-ink` n'existent pas dans le thème Tailwind du projet, remplace-les par l'attribut SVG `stroke="…"` avec les couleurs du thème et dis-le dans ton rapport.

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/ui/components/card.test.ts` puis `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Vérifier à l'œil**

Run: `npm run dev`, finir une vague pour atteindre l'écran de choix.
Expected : trois cartes en proportion carte à jouer, cadre au trait irrégulier, index du power-up dans deux coins opposés dont un retourné. La rare porte deux traits ambre francs, sans halo flou. La mythique est en négatif et **ne frémit plus**. Le cadre ne doit **pas** scintiller quand tu déplaces la sélection.

Ce dernier point est le plus important : c'est ce que `frameJitter` garantit, et le seul moyen de le vérifier est de bouger dans le menu.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/card.ts src/ui/components/card.test.ts
git commit -m "feat(ui): passer les cartes en format carte à jouer tracée à la plume"
```

---

### Task 7: Le noyau audio

Nouveau calque `src/audio/`, au même rang que `src/render/` : il lit `world.events` et n'écrit jamais dans la simulation. Cette tâche construit le moteur et ses courbes ; la tâche 8 y branche la palette et le jeu.

**Files:**
- Create: `src/audio/curves.ts`
- Create: `src/audio/curves.test.ts`
- Create: `src/audio/engine.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  ```ts
  // curves.ts
  export function volumeFor(sfxVolume: number): number
  export function killPitch(multiplier: number): number
  export function allowedVoices(requested: number, alreadyPlayed: number, cap: number): number
  export const VOICE_CAP_PER_FRAME = 4

  // engine.ts
  export interface VoiceSpec {
    source: 'tone' | 'noise'
    /** Hz au début de l'enveloppe. */
    freq: number
    /** Hz à la fin ; égal à `freq` pour une note tenue. */
    freqEnd?: number
    durationMs: number
    /** 0–1, avant application du volume maître. */
    gain: number
    /** Coupe-bas du bruit filtré, en Hz. Ignoré pour `source: 'tone'`. */
    filterHz?: number
    /** Retard avant déclenchement, en ms. Sert aux sons à deux temps. */
    delayMs?: number
  }
  export interface AudioEngine {
    /** Reprend le contexte suspendu. Idempotent. */
    unlock(): void
    /** `sfxVolume` tel que persisté : 0 à 100. */
    setVolume(sfxVolume: number): void
    play(spec: VoiceSpec): void
    destroy(): void
  }
  export function createAudioEngine(): AudioEngine
  ```

- [ ] **Step 1: Écrire les tests des courbes**

Crée `src/audio/curves.test.ts` :

```ts
import { describe, expect, it } from 'vitest'

import { allowedVoices, killPitch, VOICE_CAP_PER_FRAME, volumeFor } from './curves'

describe('volumeFor', () => {
  it('rend un gain nul à zéro', () => {
    expect(volumeFor(0)).toBe(0)
  })

  it('rend le gain plein à cent', () => {
    expect(volumeFor(100)).toBeCloseTo(1, 10)
  })

  it('est monotone croissante', () => {
    for (let v = 0; v < 100; v += 5) {
      expect(volumeFor(v + 5)).toBeGreaterThan(volumeFor(v))
    }
  })

  it('borne les valeurs hors de [0, 100]', () => {
    expect(volumeFor(-30)).toBe(0)
    expect(volumeFor(400)).toBeCloseTo(1, 10)
  })
})

describe('killPitch', () => {
  it('monte avec le multiplicateur de combo', () => {
    expect(killPitch(6)).toBeGreaterThan(killPitch(1))
  })

  it('reste bornée aux deux extrémités', () => {
    const bas = killPitch(1)
    const haut = killPitch(10)
    expect(killPitch(-5)).toBe(bas)
    expect(killPitch(9999)).toBe(haut)
  })

  it('reste dans une plage audible', () => {
    for (let m = 1; m <= 10; m++) {
      expect(killPitch(m)).toBeGreaterThan(80)
      expect(killPitch(m)).toBeLessThan(4000)
    }
  })
})

describe('allowedVoices', () => {
  it('laisse passer un événement isolé', () => {
    expect(allowedVoices(1, 0, VOICE_CAP_PER_FRAME)).toBe(1)
  })

  it('plafonne une salve', () => {
    expect(allowedVoices(20, 0, VOICE_CAP_PER_FRAME)).toBe(VOICE_CAP_PER_FRAME)
  })

  it('tient compte de ce qui a déjà été joué dans l’image', () => {
    expect(allowedVoices(5, VOICE_CAP_PER_FRAME - 1, VOICE_CAP_PER_FRAME)).toBe(1)
  })

  it('ne rend jamais un nombre négatif', () => {
    expect(allowedVoices(5, 99, VOICE_CAP_PER_FRAME)).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer les tests pour les voir échouer**

Run: `npx vitest run src/audio/curves.test.ts`
Expected: FAIL — le module `./curves` n'existe pas.

- [ ] **Step 3: Écrire `src/audio/curves.ts`**

```ts
/**
 * Nombre maximal de voix déclenchées par image. Vingt kills dans le même pas
 * ne doivent pas produire vingt sons superposés : au-delà, le mixage sature et
 * l'oreille ne distingue plus rien de toute façon.
 */
export const VOICE_CAP_PER_FRAME = 4

const KILL_PITCH_MIN = 220
const KILL_PITCH_MAX = 880
/** Multiplicateur de combo au-delà duquel la hauteur ne monte plus. */
const KILL_PITCH_TOP = 10

/**
 * Gain maître à partir du réglage persisté (0–100). Courbe carrée plutôt que
 * linéaire : l'oreille perçoit le volume à peu près logarithmiquement, une
 * rampe linéaire donne l'impression que tout se joue dans le dernier quart.
 */
export function volumeFor(sfxVolume: number): number {
  const v = Math.min(100, Math.max(0, sfxVolume)) / 100
  return v * v
}

/**
 * Hauteur d'un son de kill, en Hz. Monte avec le combo : le multiplicateur
 * s'entend avant de se lire, et redescend quand il retombe.
 */
export function killPitch(multiplier: number): number {
  const k = Math.min(1, Math.max(0, (multiplier - 1) / (KILL_PITCH_TOP - 1)))
  return KILL_PITCH_MIN + (KILL_PITCH_MAX - KILL_PITCH_MIN) * k
}

/** Combien de voix on peut encore déclencher dans l'image courante. */
export function allowedVoices(requested: number, alreadyPlayed: number, cap: number): number {
  return Math.max(0, Math.min(requested, cap - alreadyPlayed))
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

Run: `npx vitest run src/audio/curves.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Écrire `src/audio/engine.ts`**

```ts
import { volumeFor } from './curves'

export interface VoiceSpec {
  source: 'tone' | 'noise'
  /** Hz au début de l'enveloppe. */
  freq: number
  /** Hz à la fin ; égal à `freq` pour une note tenue. */
  freqEnd?: number
  durationMs: number
  /** 0–1, avant application du volume maître. */
  gain: number
  /** Coupe-bas du bruit filtré, en Hz. Ignoré pour `source: 'tone'`. */
  filterHz?: number
  /** Retard avant déclenchement, en ms. Sert aux sons à deux temps. */
  delayMs?: number
}

export interface AudioEngine {
  /** Reprend le contexte suspendu. Idempotent. */
  unlock(): void
  /** `sfxVolume` tel que persisté : 0 à 100. */
  setVolume(sfxVolume: number): void
  play(spec: VoiceSpec): void
  destroy(): void
}

/** Durée du bruit blanc réutilisé pour toutes les voix `noise`. */
const NOISE_SECONDS = 1

/**
 * Moteur de sons synthétisés. Aucun échantillon : tout est généré par
 * WebAudio, donc rien à produire, à licencier ni à télécharger, et chaque son
 * se règle par un chiffre — comme le reste de l'équilibrage du jeu.
 *
 * Ce module est un calque de sortie au même rang que `src/render/` : il ne
 * connaît que des `VoiceSpec` et n'accède jamais au monde de simulation.
 */
export function createAudioEngine(): AudioEngine {
  // `webkitAudioContext` pour Safari : le typage DOM ne le connaît pas.
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    // Navigateur sans WebAudio : moteur inerte plutôt qu'une exception qui
    // empêcherait le jeu de démarrer.
    return {
      unlock: () => {},
      setVolume: () => {},
      play: () => {},
      destroy: () => {},
    }
  }

  const ctx = new Ctor()
  const master = ctx.createGain()
  master.connect(ctx.destination)

  // Un seul tampon de bruit, réutilisé : en allouer un par voix ferait
  // travailler le ramasse-miettes pendant les gros combos.
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate)
  const channel = noiseBuffer.getChannelData(0)
  for (let i = 0; i < channel.length; i++) {
    channel[i] = Math.random() * 2 - 1
  }

  return {
    unlock(): void {
      if (ctx.state === 'suspended') {
        void ctx.resume()
      }
    },

    setVolume(sfxVolume): void {
      master.gain.value = volumeFor(sfxVolume)
    },

    play(spec): void {
      if (ctx.state !== 'running' || master.gain.value === 0) {
        return
      }
      const start = ctx.currentTime + (spec.delayMs ?? 0) / 1000
      const end = start + spec.durationMs / 1000

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, start)
      // Attaque très courte plutôt qu'instantanée : un saut de gain produit
      // un clic audible.
      gain.gain.linearRampToValueAtTime(spec.gain, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      gain.connect(master)

      if (spec.source === 'noise') {
        const src = ctx.createBufferSource()
        src.buffer = noiseBuffer
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(spec.filterHz ?? spec.freq, start)
        src.connect(filter)
        filter.connect(gain)
        src.start(start)
        src.stop(end)
      } else {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(spec.freq, start)
        if (spec.freqEnd !== undefined && spec.freqEnd !== spec.freq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), end)
        }
        osc.connect(gain)
        osc.start(start)
        osc.stop(end)
      }
    },

    destroy(): void {
      void ctx.close()
    },
  }
}
```

`Math.random()` est employé ici : c'est légitime, `src/audio/` n'est pas `src/sim/` et le bruit n'entre dans aucun calcul de jeu. Vérifie que `src/sim/purity.test.ts` ne balaye bien que `src/sim/` — si son scan couvrait tout `src/`, remonte-le-moi plutôt que d'affaiblir le test.

- [ ] **Step 6: Vérification complète et commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. `engine.ts` n'est encore appelé par personne — c'est voulu, la tâche 8 le branche.

```bash
git add src/audio/curves.ts src/audio/curves.test.ts src/audio/engine.ts
git commit -m "feat(audio): construire le moteur de sons synthétisés"
```

---

### Task 8: La palette sonore et son branchement

Le moteur existe mais ne joue rien. Cette tâche écrit la palette, la branche sur les événements de simulation, et rend enfin actif le réglage de volume qui attend depuis le début du projet.

**Files:**
- Create: `src/audio/sounds.ts`
- Create: `src/audio/apply.ts`
- Create: `src/audio/apply.test.ts`
- Modify: `src/app/game.ts`
- Modify: `src/ui/screens/settings.ts`

**Interfaces:**
- Consumes: `createAudioEngine`, `AudioEngine`, `VoiceSpec` (tâche 7) ; `volumeFor`, `killPitch`, `allowedVoices`, `VOICE_CAP_PER_FRAME` (tâche 7).
- Produces:
  ```ts
  // sounds.ts
  export function killVoice(comboMultiplier: number): VoiceSpec
  export function powerupVoices(kind: PowerUpKind): VoiceSpec[]
  export const PICKUP_VOICE: VoiceSpec
  export const HALO_BROKEN_VOICE: VoiceSpec
  export const DEATH_VOICE: VoiceSpec
  export const WAVE_VOICE: VoiceSpec

  // apply.ts
  export function applyAudio(world: SimWorld, engine: Pick<AudioEngine, 'play'>): void
  ```

- [ ] **Step 1: Écrire le test de routage**

Crée `src/audio/apply.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest'

import { POWERUP_ID, POWERUP_KINDS } from '@/sim/data/powerups'
import { createWorld } from '@/sim/world'
import { applyAudio } from './apply'
import { VOICE_CAP_PER_FRAME } from './curves'

function fakeEngine() {
  return { play: vi.fn() }
}

describe('applyAudio', () => {
  it('déclenche un son pour chaque genre de power-up', () => {
    // Boucle sur POWERUP_KINDS, jamais sur une liste recopiée : l'ajout d'un
    // septième power-up doit faire échouer ce test s'il reste muet.
    for (const kind of POWERUP_KINDS) {
      const world = createWorld({ seed: 1, width: 800, height: 600 })
      world.events.push({ type: 'powerupUsed', kind: POWERUP_ID[kind], x: 10, y: 10 })
      const engine = fakeEngine()
      applyAudio(world, engine)
      expect(engine.play, `aucun son pour ${kind}`).toHaveBeenCalled()
    }
  })

  it('monte la hauteur du kill avec le combo', () => {
    const bas = createWorld({ seed: 1, width: 800, height: 600 })
    bas.combo = 0
    bas.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    const e1 = fakeEngine()
    applyAudio(bas, e1)

    const haut = createWorld({ seed: 1, width: 800, height: 600 })
    haut.combo = 40
    haut.events.push({ type: 'enemyKilled', eid: 1, x: 0, y: 0 })
    const e2 = fakeEngine()
    applyAudio(haut, e2)

    expect(e2.play.mock.calls[0]?.[0].freq).toBeGreaterThan(e1.play.mock.calls[0]?.[0].freq)
  })

  it('plafonne les voix d’une salve de kills', () => {
    const world = createWorld({ seed: 1, width: 800, height: 600 })
    for (let i = 0; i < 30; i++) {
      world.events.push({ type: 'enemyKilled', eid: i, x: 0, y: 0 })
    }
    const engine = fakeEngine()
    applyAudio(world, engine)
    // Exactement le plafond, pas « au plus 8 » : une borne lâche laisserait
    // passer un plafonnement à moitié cassé.
    expect(engine.play.mock.calls.length).toBe(VOICE_CAP_PER_FRAME)
  })
})
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

Run: `npx vitest run src/audio/apply.test.ts`
Expected: FAIL — les modules `./apply` et `./sounds` n'existent pas.

- [ ] **Step 3: Écrire `src/audio/sounds.ts`**

```ts
import type { PowerUpKind } from '@/sim/data/powerups'
import { killPitch } from './curves'
import type { VoiceSpec } from './engine'

/**
 * La palette. Chaque power-up reçoit une signature sonore construite sur les
 * mêmes axes que sa signature visuelle : le sens du mouvement, le rythme, la
 * texture — jamais la seule hauteur.
 */
export function killVoice(comboMultiplier: number): VoiceSpec {
  return { source: 'tone', freq: killPitch(comboMultiplier), durationMs: 70, gain: 0.18 }
}

export const PICKUP_VOICE: VoiceSpec = {
  source: 'tone',
  freq: 520,
  freqEnd: 780,
  durationMs: 120,
  gain: 0.22,
}

export const HALO_BROKEN_VOICE: VoiceSpec = {
  source: 'noise',
  freq: 300,
  filterHz: 300,
  durationMs: 320,
  gain: 0.3,
}

export const DEATH_VOICE: VoiceSpec = {
  source: 'tone',
  freq: 320,
  freqEnd: 60,
  durationMs: 900,
  gain: 0.32,
}

export const WAVE_VOICE: VoiceSpec = {
  source: 'tone',
  freq: 440,
  durationMs: 90,
  gain: 0.12,
}

export function powerupVoices(kind: PowerUpKind): VoiceSpec[] {
  switch (kind) {
    case 'blast':
      // Deux temps, comme sa double onde à l'écran.
      return [
        { source: 'noise', freq: 900, filterHz: 900, durationMs: 160, gain: 0.34 },
        { source: 'noise', freq: 500, filterHz: 500, durationMs: 260, gain: 0.22, delayMs: 90 },
      ]
    case 'freeze':
      // Cristallin, puis figé : la hauteur cesse de bouger en fin d'enveloppe.
      return [{ source: 'tone', freq: 1400, freqEnd: 1180, durationMs: 380, gain: 0.2 }]
    case 'blotter':
      // Glissando descendant : le seul son qui va vers l'intérieur.
      return [{ source: 'tone', freq: 700, freqEnd: 140, durationMs: 420, gain: 0.24 }]
    case 'dash':
      // Souffle bref et orienté, sans hauteur définie.
      return [{ source: 'noise', freq: 1600, filterHz: 1600, durationMs: 130, gain: 0.26 }]
    case 'halo':
      // Accord tenu : une protection ne détone pas.
      return [
        { source: 'tone', freq: 330, durationMs: 520, gain: 0.16 },
        { source: 'tone', freq: 495, durationMs: 520, gain: 0.12 },
      ]
    case 'bramble':
      // Rien de percussif : la Ronce se pose, elle n'explose pas.
      return [{ source: 'noise', freq: 420, filterHz: 420, durationMs: 240, gain: 0.14 }]
    default: {
      // Sans ce contrôle, l'ajout d'un septième power-up compilerait en
      // silence et son déclenchement serait muet — c'est exactement ce qui est
      // arrivé à la Ronce d'encre côté visuel.
      const exhaustif: never = kind
      void exhaustif
      return []
    }
  }
}
```

- [ ] **Step 4: Écrire `src/audio/apply.ts`**

```ts
import { POWERUP_BY_ID } from '@/sim/data/powerups'
import { comboMultiplier } from '@/sim/systems/score'
import type { SimWorld } from '@/sim/world'
import { allowedVoices, VOICE_CAP_PER_FRAME } from './curves'
import type { AudioEngine } from './engine'
import {
  DEATH_VOICE,
  HALO_BROKEN_VOICE,
  killVoice,
  PICKUP_VOICE,
  powerupVoices,
  WAVE_VOICE,
} from './sounds'

/**
 * Traduit les événements d'un pas de simulation en sons. Symétrique
 * d'`applyJuice` (`src/app/juice.ts`), qui les traduit en image : même source,
 * même absence d'écriture dans le monde.
 *
 * Le plafond de voix ne s'applique qu'aux kills : ce sont les seuls qui
 * arrivent par vingtaines dans un même pas. Les autres événements sont uniques
 * par nature.
 */
export function applyAudio(world: SimWorld, engine: Pick<AudioEngine, 'play'>): void {
  let kills = 0
  const multiplier = comboMultiplier(world.combo)

  for (const event of world.events) {
    switch (event.type) {
      case 'enemyKilled':
        kills++
        break
      case 'powerupPicked':
        engine.play(PICKUP_VOICE)
        break
      case 'powerupUsed': {
        const kind = POWERUP_BY_ID[event.kind]
        if (kind) {
          for (const voice of powerupVoices(kind)) {
            engine.play(voice)
          }
        }
        break
      }
      case 'haloBroken':
        engine.play(HALO_BROKEN_VOICE)
        break
      case 'playerDied':
        engine.play(DEATH_VOICE)
        break
      case 'waveStarted':
        engine.play(WAVE_VOICE)
        break
      default:
        break
    }
  }

  const voices = allowedVoices(kills, 0, VOICE_CAP_PER_FRAME)
  for (let i = 0; i < voices; i++) {
    engine.play(killVoice(multiplier))
  }
}
```

- [ ] **Step 5: Lancer le test pour le voir passer**

Run: `npx vitest run src/audio/apply.test.ts`
Expected: PASS.

- [ ] **Step 6: Brancher le moteur dans `game.ts`**

Dans `src/app/game.ts` :

1. Importer `createAudioEngine` depuis `@/audio/engine` et `applyAudio` depuis `@/audio/apply`.
2. Créer le moteur à côté des autres ressources : `const audio = createAudioEngine()`, puis `audio.setVolume(storage.get('sfxVolume', 100))`.
3. **Déverrouiller au premier geste utilisateur**, exigence de la politique d'autoplay des navigateurs. Ajoute dans le gestionnaire `keydown` existant, tout en haut, avant tout autre traitement :

```ts
    // Les navigateurs refusent de démarrer un AudioContext sans geste
    // utilisateur. `unlock` est idempotent : l'appeler à chaque touche ne
    // coûte rien une fois le contexte repris.
    audio.unlock()
```

Fais de même sur le premier clic si un gestionnaire de souris existe déjà ; sinon la touche suffit, puisqu'on lance une partie depuis un menu.

4. Appeler `applyAudio(run.world, audio)` dans `onStep`, **juste après** `applyJuice(...)`, à l'intérieur de la même branche `if (machine.state === 'playing')`. Les deux lisent `world.events` avant que le pas suivant ne le vide.

- [ ] **Step 7: Rendre le réglage de volume effectif**

Dans `src/ui/screens/settings.ts` :

1. Ajouter à `SettingsDeps` un `onSfxVolumeChange(volume: number): void`, sur le modèle d'`onReducedMotionChange`.
2. L'appeler partout où `sfxVolume` est modifié et persisté.
3. Dans `game.ts`, brancher ce callback sur `audio.setVolume`.
4. **Réécrire le commentaire de tête** (`settings.ts`, ~ligne 31) qui annonce qu'« aucun moteur audio n'existe encore dans ce dépôt » et que le réglage « ne pilote rien de sonore pour l'instant ». C'est désormais faux, et ce serait la cinquième affirmation périmée du dépôt.

- [ ] **Step 8: Vérification complète**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Vérifier à l'oreille**

Run: `npm run dev`, lancer une partie.
Expected : on entend les kills (hauteur montant avec le combo), les ramassages, une signature distincte par power-up, la mort. Le curseur de volume des Réglages agit immédiatement, et à zéro le jeu est muet.

Ce contrôle-ci ne peut pas être délégué à un test : si tu ne peux pas écouter, dis-le franchement dans ton rapport.

- [ ] **Step 10: Commit**

```bash
git add src/audio/sounds.ts src/audio/apply.ts src/audio/apply.test.ts src/app/game.ts src/ui/screens/settings.ts
git commit -m "feat(audio): donner une voix au jeu et rendre le réglage de volume effectif"
```

---

## Couverture de la spec

| Section de la spec | Tâche |
| --- | --- |
| §2 La ruée s'arrête au mur (dont le piège du « ou » et les trois tests) | 1 |
| §3 Spawn intérieur, garde de 180 px, déterminisme des tirages | 2 |
| §4 Retrait d'« Encre généreuse » et de `pickupIntervalMultiplier` | 3 |
| §5 Cartes en format carte à jouer, cadre déterministe, rare sans halo | 6 |
| §6 Ronce à 1, test de hiérarchie réécrit | 4 |
| §7 Animation mythique retirée, règle CSS conservée | 6 (Step 3) |
| §8 Liseré intérieur des ennemis | 5 |
| §9.1–9.3 Calque `src/audio/`, sons synthétisés, actif par défaut, déverrouillage | 7, 8 (Steps 6-7) |
| §9.4 La palette sonore | 8 (Step 3) |
| §9.5 Plafond de voix, indépendance au mouvement réduit | 7 (curves), 8 (apply) |
| §9.6 Tests des fonctions pures et du routage | 7, 8 |
