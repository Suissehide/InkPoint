import { Container, Graphics } from 'pixi.js'

import {
  HAZARD_BLAST,
  HAZARD_BLOTTER,
  HAZARD_BRAMBLE,
  HAZARD_FREEZE,
  HAZARD_INK_TRAIL,
  HAZARD_QUILL,
  HAZARD_SPLATTER,
  HAZARD_TRAIL,
  POWERUP_BASE,
} from '@/sim/data/powerups'
import { INK } from '../ink'

export interface HazardView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    kind: number
    lifeRatio: number
    /** Temps de simulation, en ms — anime la rotation du tourbillon. */
    time: number
    /** Temps de vie restant en ms, brut — pilote l'avertissement de fin des épines. */
    remainingMs: number
    /**
     * `null` pour les zones sans direction propre (Bombe, Gel, Buvard) —
     * jamais 0 : un défaut à 0 ferait pointer un chevron vers +x avec
     * l'aplomb d'une information vraie.
     */
    angle: number | null
  }): void
}

const COLORS: Record<number, number> = {
  [HAZARD_BLAST]: INK.blast,
  [HAZARD_FREEZE]: INK.frost,
  [HAZARD_TRAIL]: INK.paper,
  [HAZARD_BLOTTER]: INK.paper,
  [HAZARD_BRAMBLE]: INK.paper,
  [HAZARD_QUILL]: INK.paper,
  [HAZARD_SPLATTER]: INK.paper,
  [HAZARD_INK_TRAIL]: INK.paper,
}

/**
 * Trois bras en spirale logarithmique, tournant avec le temps de simulation
 * (pas une horloge murale, pour rester figé pendant un hitstop) — le Buvard
 * doit se lire comme un trou noir qui tourbillonne, pas un disque plat.
 */
function drawVortex(
  gfx: Graphics,
  radius: number,
  color: number,
  lifeRatio: number,
  time: number,
): void {
  gfx.circle(0, 0, radius).fill({ color, alpha: 0.05 * lifeRatio })

  const arms = 3
  const turns = 1.15
  const steps = 20
  const rotation = time * 0.0016 // ~1,6 rad/s : sens purement visuel, indépendant du taux de rotation réel du tourbillon (hazards.ts)

  for (let arm = 0; arm < arms; arm++) {
    const armOffset = (arm / arms) * Math.PI * 2
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Le rayon ne descend jamais à zéro : un bras qui converge en un point
      // exact serait un artefact visuel, pas un tourbillon.
      const r = radius * (0.18 + (1 - t) * 0.82)
      const a = armOffset + rotation + t * turns * Math.PI * 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) {
        gfx.moveTo(x, y)
      } else {
        gfx.lineTo(x, y)
      }
    }
  }
  gfx.stroke({ color, width: 1.6, alpha: 0.65 * lifeRatio })
}

// En fraction de `radius` (le disque mortel réel) pour que l'épine reste par construction inscrite dedans.
const BRAMBLE_TIP_RATIO = 1 // pointe : touche le bord du disque, jamais au-delà
const BRAMBLE_HALF_WIDTH_RATIO = 0.8 // demi-largeur de la base, perpendiculaire à l'axe
const BRAMBLE_BACK_RATIO = 0.55 // base, en retrait du centre
// Plage du rétrécissement de fin de vie : 70 % à 100 % de la taille normale,
// interpolée linéairement sur la fenêtre `warnMs`.
const BRAMBLE_SHRINK_MIN = 0.7
const BRAMBLE_SHRINK_RANGE = 0.3

/**
 * Seule zone du jeu dont le dessin est **plus petit** que la collision, et le
 * seul endroit où ce sens-là est le bon. Ailleurs le disque de vérité est
 * tracé en propre parce que la zone tue *à la place du joueur* : y dessiner
 * moins que ce qui tue tromperait sa lecture du danger. La couronne, elle, ne
 * touche jamais le joueur (`hazardSystem` ne cible que `Enemy`) et elle est
 * étanche depuis `powerups.ts` : le seul écart possible est qu'un ennemi
 * meure un poil avant d'avoir touché la pointe visible. Cette erreur-là ne
 * peut jamais coûter une vie — celle du disque dessiné, si : une bulle qui
 * paraît barrer plus large que l'épine réelle, oui.
 *
 * D'où l'épine seule, sans le disque autour : un triangle inscrit dans le
 * cercle de collision (coins de base à
 * `√(0,55² + 0,8²) ≈ 0,97 · radius` du centre, donc jamais débordants). Sur
 * les dernières `warnMs`, elle pulse et se rétracte pour avertir ; la zone
 * mortelle, elle, reste à `radius` constant.
 */
function drawBramble(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number,
  remainingMs: number,
  time: number,
): void {
  const warn = POWERUP_BASE.bramble.warnMs
  const ending = remainingMs < warn
  const wave = Math.sin((time / 1000) * Math.PI * 2 * 5)
  // Bornée loin de zéro : l'épine ne fait que 16 px de long pour 20 px entre
  // deux lignes de réglure (render/page.ts), tracées dans la même encre — au
  // creux d'un battement elle se composite par-dessus des traits de sa propre
  // couleur. Une épine optiquement absente pendant qu'elle tue encore serait
  // le seul vrai piège de ce dessin.
  const pulse = ending ? 0.7 + 0.3 * wave : 1
  const shrink = ending ? BRAMBLE_SHRINK_MIN + BRAMBLE_SHRINK_RANGE * (remainingMs / warn) : 1

  const len = radius * BRAMBLE_TIP_RATIO * shrink
  const half = radius * BRAMBLE_HALF_WIDTH_RATIO * shrink
  const back = radius * BRAMBLE_BACK_RATIO * shrink
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  // Coordonnées nommées plutôt que tuples indexés : `src/render/` n'a pas
  // droit à `!`, qu'indexer un tableau littéral exigerait sous `noUncheckedIndexedAccess`.
  const tipX = cos * len
  const tipY = sin * len
  const backX = -cos * back
  const backY = -sin * back
  const sideX = -sin * half
  const sideY = cos * half

  // Triangle à trois sommets : la pointe, et deux coins de base alignés sur
  // l'arrière. Le losange d'avant plaçait ses flancs au milieu de l'axe, d'où
  // une silhouette de bulle plutôt que d'épine.
  gfx
    .moveTo(tipX, tipY)
    .lineTo(backX + sideX, backY + sideY)
    .lineTo(backX - sideX, backY - sideY)
    .closePath()
    .fill({ color, alpha: 0.9 * pulse })
}

/**
 * La plume en vol : un fer de lance orienté par son `Facing`, avec une barbe
 * traînante. Volontairement plus étroite que son rayon de contact — c'est la
 * seule zone du jeu qui ne tue pas par elle-même (son explosion s'en charge),
 * donc la règle « le dessin contient ce qui tue » ne s'y applique pas.
 */
function drawQuill(gfx: Graphics, radius: number, color: number, angle: number): void {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * 2.2
  const back = radius * 1.4
  const half = radius * 0.7

  gfx
    .moveTo(cos * tip, sin * tip)
    .lineTo(-sin * half - cos * back, cos * half - sin * back)
    .lineTo(sin * half - cos * back, -cos * half - sin * back)
    .fill({ color })

  // Barbe traînante : sans elle, la plume se lit comme un simple triangle et
  // son sens de vol devient ambigu à petite taille.
  gfx
    .moveTo(-cos * back, -sin * back)
    .lineTo(-cos * back * 2.4, -sin * back * 2.4)
    .stroke({ color, width: 1, alpha: 0.4 })
}

/**
 * La goutte de Bavure. Contrairement à la plume, elle tue par elle-même : le
 * disque plein DOIT couvrir tout `radius`, sans quoi une bande mortelle
 * resterait invisible (la règle « le dessin contient ce qui tue », spec §3.1).
 * Les bavures autour ne font que déborder, jamais rétrécir.
 */
/**
 * Contour d'une tache d'encre : un cercle dont le rayon ne fait que **gonfler**
 * par endroits, jamais rentrer.
 *
 * C'est la contrainte qui gouverne tout le dessin. `radius` est le rayon
 * mortel ; une lobe qui mordrait vers l'intérieur laisserait une bande
 * meurtrière hors du dessin, et le jeu ne promet rien d'autre que « ce que tu
 * vois est ce qui tue ». Les deux harmoniques sont donc remises dans [0, 1]
 * avant d'être ajoutées — leur somme est positive ou nulle, jamais négative.
 *
 * Deux fréquences premières entre elles (3 et 5) : leur battement ne se répète
 * pas sur un tour, la tache n'a donc pas d'axe de symétrie visible et cesse de
 * se lire comme une figure géométrique.
 */
function inkBlobPath(gfx: Graphics, radius: number, phase: number, steps = 28): void {
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const lobe =
      0.16 * (1 + Math.sin(t * 3 + phase)) * 0.5 + 0.11 * (1 + Math.sin(t * 5 - phase * 1.7)) * 0.5
    const r = radius * (1 + lobe)
    const px = Math.cos(t) * r
    const py = Math.sin(t) * r
    if (i === 0) {
      gfx.moveTo(px, py)
    } else {
      gfx.lineTo(px, py)
    }
  }
  gfx.closePath()
}

/**
 * La goutte de Bavure.
 *
 * Le dessin précédent — un disque net flanqué de trois satellites en orbite —
 * se lisait comme une molécule de manuel de chimie, pas comme de l'encre. Il
 * est remplacé par une tache aux bords irréguliers qui se déforme lentement,
 * comme une goutte encore humide qui cherche sa forme.
 *
 * La déformation suit `time`, le temps de SIMULATION : elle gèle donc pendant
 * un hitstop, avec le reste du monde, au lieu de continuer à vivre toute seule.
 */
function drawSplatterDrop(gfx: Graphics, radius: number, color: number, time: number): void {
  // Le disque mortel d'abord, plein : quoi qu'il arrive au contour, cette
  // surface-là est couverte.
  gfx.circle(0, 0, radius).fill({ color })
  // Puis les lobes par-dessus, qui ne font que déborder.
  inkBlobPath(gfx, radius, time * 0.0009)
  gfx.fill({ color })
}

/**
 * Une tache de la trace d'encre. **Elle tue**, donc le disque plein couvre
 * exactement son rayon mortel, et les lobes ne font que déborder — même règle
 * que la goutte, pour la même raison.
 *
 * La phase dérive de la position et non du temps : deux taches voisines ne
 * doivent pas se déformer à l'unisson, sinon le ruban ondule comme un serpent
 * au lieu de se lire comme de la peinture posée. Figée par tache, elle ne
 * scintille pas d'une image à l'autre.
 */
function drawInkTrail(
  gfx: Graphics,
  radius: number,
  color: number,
  lifeRatio: number,
  x: number,
  y: number,
): void {
  const alpha = 0.55 + 0.45 * lifeRatio
  gfx.circle(0, 0, radius).fill({ color, alpha })
  inkBlobPath(gfx, radius, (x * 0.11 + y * 0.07) % (Math.PI * 2), 18)
  gfx.fill({ color, alpha })
}

// En fraction de `radius` (le disque mortel réel), pour que le chevron reste par construction inscrit dedans.
const CHEVRON_TIP_RATIO = 1
const CHEVRON_WING_BACK_RATIO = 0.45
const CHEVRON_WING_HALF_RATIO = 0.62
const CHEVRON_NOTCH_RATIO = 0.1

/**
 * Le disque à `radius` est le cercle de collision réel ; le chevron n'est
 * qu'une lecture du sens de la ruée inscrite dedans — un chevron seul
 * laisserait les flancs du disque mortels mais invisibles.
 *
 * `visible` relève le plancher d'opacité : la fenêtre de fondu (400 ms) est
 * plus courte que la vie du segment (800 ms), qui reste mortel après.
 *
 * `angle` à `null` : disque seul, jamais de flèche inventée.
 */
function drawWake(
  gfx: Graphics,
  radius: number,
  color: number,
  angle: number | null,
  lifeRatio: number,
): void {
  const visible = 0.25 + 0.75 * lifeRatio

  gfx.circle(0, 0, radius).fill({ color, alpha: 0.22 * visible })
  gfx.circle(0, 0, radius).stroke({ color, width: 1.5, alpha: 0.5 * visible })

  if (angle === null) {
    return
  }

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const tip = radius * CHEVRON_TIP_RATIO
  const back = radius * CHEVRON_WING_BACK_RATIO
  const half = radius * CHEVRON_WING_HALF_RATIO
  const notch = radius * CHEVRON_NOTCH_RATIO

  const tipX = cos * tip
  const tipY = sin * tip
  const wingX = -cos * back
  const wingY = -sin * back
  const sideX = -sin * half
  const sideY = cos * half
  const notchX = -cos * notch
  const notchY = -sin * notch

  gfx
    .moveTo(tipX, tipY)
    .lineTo(wingX + sideX, wingY + sideY)
    .lineTo(notchX, notchY)
    .lineTo(wingX - sideX, wingY - sideY)
    .closePath()
    .fill({ color, alpha: 0.75 * visible })
}

export function createHazardView(): HazardView {
  const container = new Container()
  const gfx = new Graphics()
  container.addChild(gfx)
  return {
    container,
    update({ x, y, radius, kind, lifeRatio, time, remainingMs, angle }) {
      container.x = x
      container.y = y
      gfx.clear()

      const color = COLORS[kind] ?? INK.paper

      if (kind === HAZARD_BRAMBLE) {
        // `angle ?? 0` : les épines portent toujours `Facing`, ce repli ne devrait jamais s'activer.
        drawBramble(gfx, radius, color, angle ?? 0, remainingMs, time)
        return
      }

      if (kind === HAZARD_QUILL) {
        // `angle !== null` plutôt qu'un repli à 0 : sans `Facing`, la vue doit
        // s'abstenir de dessiner une plume plutôt que d'en pointer une au
        // hasard — c'est la règle que le type `angle: number | null` impose
        // déjà en tête de ce fichier.
        if (angle !== null) {
          drawQuill(gfx, radius, color, angle)
        }
        return
      }

      if (kind === HAZARD_SPLATTER) {
        drawSplatterDrop(gfx, radius, color, time)
        return
      }

      if (kind === HAZARD_INK_TRAIL) {
        drawInkTrail(gfx, radius, color, lifeRatio, x, y)
        return
      }

      if (kind === HAZARD_BLOTTER) {
        drawVortex(gfx, radius, color, lifeRatio, time)
      } else if (kind === HAZARD_FREEZE) {
        gfx.circle(0, 0, radius).fill({ color, alpha: 0.1 * lifeRatio })
        gfx.circle(0, 0, radius).stroke({ color, width: 1.6, alpha: 0.7 * lifeRatio })
      } else if (kind === HAZARD_TRAIL) {
        drawWake(gfx, radius, color, angle, lifeRatio)
      } else {
        gfx.circle(0, 0, radius).stroke({ color, width: 3, alpha: lifeRatio })
      }
    },
  }
}
