import { Position } from '@sim/components'
import { POWERUP_BY_ID, type PowerUpKind } from '@sim/data/powerups'
import type { SimWorld } from '@sim/world'

/** Fenêtre de « Rafale » : au-delà, un kill ne compte plus dans la série. */
export const BURST_WINDOW_MS = 2000
// Les trois seuils ci-dessous ne sortent pas du module : ils ne sont lus que
// par `advanceTrace`, et les tests passent par elle plutôt que par eux.
// `BURST_WINDOW_MS` reste exporté parce que `trace.test.ts` en a besoin pour
// construire ses horodatages — la fenêtre est un paramètre du cas, pas un
// détail interne.
/** Rayon dans lequel le joueur est considéré immobile (« Nature morte »). */
const STILL_RADIUS_PX = 40
/** Distance à un bord en deçà de laquelle on le considère touché. */
const EDGE_MARGIN_PX = 40
/** En deçà, un ennemi a approché et la vague n'est plus immaculée. */
const CLEAN_DISTANCE_PX = 60

/**
 * Ce qu'une partie a produit, agrégé pas à pas. Les 24 prédicats de
 * `catalog.ts` sont des fonctions pures de cet objet : un test de succès est
 * donc un littéral et une assertion, jamais une séquence d'événements à
 * rejouer.
 *
 * Elle porte exactement ce que les prédicats demandent. Tout champ ajouté ici
 * sans prédicat pour le lire est du poids mort maintenu à 60 Hz.
 */
export interface RunTrace {
  /** `world.time` — gèle en hitstop, comme le HUD. */
  timeMs: number
  score: number
  wave: number
  kills: number
  maxCombo: number
  died: boolean

  powerupsPicked: Set<PowerUpKind>
  powerupCount: number

  /** Horodatages des kills, élagués à `BURST_WINDOW_MS`. */
  killTimestamps: number[]

  waveKills: number
  waveClean: boolean
  /**
   * Vagues immaculées d'affilée. **Ne veut dire quelque chose que tant que la
   * proximité est mesurée** : `tracker.ts` coupe la mesure dès que
   * `clean-wave` et `clean-three` sont acquis, `nearestEnemyPx` reste alors à
   * `Infinity`, `waveClean` ne retombe plus jamais et ce compteur monte à
   * chaque vague. Sans conséquence aujourd'hui — ses seuls lecteurs sont
   * exactement les deux succès qui gouvernent la mesure — mais un troisième
   * lecteur lirait un chiffre faux.
   */
  cleanWaveStreak: number
  /** Vrai dès qu'une vague entière a été traversée sans un seul kill. */
  hadPacifistWave: boolean
  /** Vrai dès qu'une vague entière a tenu dans un quart d'arène. */
  hadHomebodyWave: boolean
  waveMinX: number
  waveMaxX: number
  waveMinY: number
  waveMaxY: number

  stillX: number
  stillY: number
  stillMs: number

  /** Dernier contact avec chaque bord — gauche, droite, haut, bas. */
  edgeTouchedAt: [number, number, number, number]

  spawnX: number
  spawnY: number
  x: number
  y: number

  /** Pas écoulés — cadence l'échantillonnage de proximité (`tracker.ts`). */
  steps: number
}

export function createTrace(spawnX: number, spawnY: number): RunTrace {
  return {
    timeMs: 0,
    score: 0,
    wave: 1,
    kills: 0,
    maxCombo: 0,
    died: false,
    powerupsPicked: new Set<PowerUpKind>(),
    powerupCount: 0,
    killTimestamps: [],
    waveKills: 0,
    waveClean: true,
    cleanWaveStreak: 0,
    hadPacifistWave: false,
    hadHomebodyWave: false,
    // La vague 1 n'a pas de `waveStarted` : les accumulateurs démarrent ici
    // comme le ferait un début de vague.
    waveMinX: spawnX,
    waveMaxX: spawnX,
    waveMinY: spawnY,
    waveMaxY: spawnY,
    stillX: spawnX,
    stillY: spawnY,
    stillMs: 0,
    // `-Infinity` et non 0 : à zéro, les quatre bords passeraient pour touchés
    // au premier pas et « Tour du propriétaire » serait offert.
    edgeTouchedAt: [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
    spawnX,
    spawnY,
    x: spawnX,
    y: spawnY,
    steps: 0,
  }
}

/** Remet à zéro ce qui ne vaut que pour une vague. */
function beginWave(trace: RunTrace, x: number, y: number): void {
  trace.waveKills = 0
  trace.waveClean = true
  trace.waveMinX = x
  trace.waveMaxX = x
  trace.waveMinY = y
  trace.waveMaxY = y
}

/**
 * `nearestEnemyPx` vaut `Infinity` quand la mesure n'a pas été faite à ce pas
 * — elle est échantillonnée, et inutile dès que les deux succès immaculés sont
 * acquis (voir `tracker.ts`). Passer la distance plutôt que de la calculer ici
 * garde ce module libre de toute requête bitECS, donc testable sur un monde nu.
 */
export function advanceTrace(trace: RunTrace, world: SimWorld, nearestEnemyPx: number): void {
  const eid = world.playerEid
  const x = Position.x[eid] ?? 0
  const y = Position.y[eid] ?? 0
  const dtMs = world.time - trace.timeMs

  trace.steps += 1
  trace.timeMs = world.time
  trace.score = world.score
  trace.wave = world.wave
  trace.x = x
  trace.y = y
  if (world.combo > trace.maxCombo) {
    trace.maxCombo = world.combo
  }

  for (const event of world.events) {
    if (event.type === 'enemyKilled') {
      trace.kills += 1
      trace.waveKills += 1
      trace.killTimestamps.push(world.time)
    } else if (event.type === 'powerupPicked') {
      const kind = POWERUP_BY_ID[event.kind]
      if (kind) {
        trace.powerupsPicked.add(kind)
        trace.powerupCount += 1
      }
    } else if (event.type === 'playerDied') {
      trace.died = true
    }
  }

  // Élagage en une passe : les horodatages sont croissants, il suffit de
  // couper la tête.
  const cutoff = world.time - BURST_WINDOW_MS
  let drop = 0
  while (drop < trace.killTimestamps.length && (trace.killTimestamps[drop] ?? 0) < cutoff) {
    drop += 1
  }
  if (drop > 0) {
    trace.killTimestamps.splice(0, drop)
  }

  if (nearestEnemyPx < CLEAN_DISTANCE_PX) {
    trace.waveClean = false
  }

  trace.waveMinX = Math.min(trace.waveMinX, x)
  trace.waveMaxX = Math.max(trace.waveMaxX, x)
  trace.waveMinY = Math.min(trace.waveMinY, y)
  trace.waveMaxY = Math.max(trace.waveMaxY, y)

  if (Math.hypot(x - trace.stillX, y - trace.stillY) <= STILL_RADIUS_PX) {
    trace.stillMs += dtMs
  } else {
    trace.stillX = x
    trace.stillY = y
    trace.stillMs = 0
  }

  const { width, height } = world.arena
  if (x <= EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[0] = world.time
  }
  if (x >= width - EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[1] = world.time
  }
  if (y <= EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[2] = world.time
  }
  if (y >= height - EDGE_MARGIN_PX) {
    trace.edgeTouchedAt[3] = world.time
  }

  // Les bilans de vague se lisent sur `waveEnded`, avant que `waveStarted` ne
  // remette les accumulateurs à zéro — les deux événements arrivent dans le
  // même pas (`waveSystem`).
  for (const event of world.events) {
    if (event.type === 'waveEnded') {
      if (trace.waveKills === 0) {
        trace.hadPacifistWave = true
      }
      if (
        trace.waveMaxX - trace.waveMinX <= width / 2 &&
        trace.waveMaxY - trace.waveMinY <= height / 2
      ) {
        trace.hadHomebodyWave = true
      }
      trace.cleanWaveStreak = trace.waveClean ? trace.cleanWaveStreak + 1 : 0
    } else if (event.type === 'waveStarted') {
      beginWave(trace, x, y)
    }
  }
}
