import type { EnemyType } from '@sim/data/enemies'
import { Container, Graphics } from 'pixi.js'

import { INK, mixColor } from '../ink'

export interface EnemyView {
  container: Container
  update(opts: {
    x: number
    y: number
    radius: number
    type: EnemyType
    /** Angle de visée : sens du déplacement en charge, direction du joueur sinon. */
    aim: number
    materializeProgress: number
    frozen: boolean
    /** 0 = couleur normale, 1 = papier (temps d'arrêt de la mort). */
    whiten: number
    /** État `Dasher` : 0 approche, 1 télégraphe, 2 charge. 0 pour les non-Éclats. */
    dashState: number
    /** Avancement du télégraphe sur [0, 1]. Vaut 0 hors de l'état 1. */
    telegraphProgress: number
    /** Distance au joueur : longueur du trait de visée. */
    aimLength: number
  }): void
}

/**
 * Couleur d'encre par espèce. Table côté rendu, comme `COLORS` par kind de zone
 * dans `views/hazard.ts` : la simulation n'a pas à connaître les couleurs.
 * Le Point et le Blot se distinguent déjà par leur rayon (7 contre 14) ;
 * l'Éclat, à 6, était indiscernable d'un Point.
 */
const ENEMY_COLOR: Record<EnemyType, number> = {
  point: INK.danger,
  shard: INK.shard,
  blot: INK.danger,
}

/**
 * Le gel l'emporte sur l'espèce : quand un ennemi est immobilisé, c'est
 * l'information utile à cet instant. Une deuxième couleur mortelle ne crée
 * aucune ambiguïté — `frost` en est déjà une, et la grammaire du jeu est
 * « plein = mortel », pas « rouge = mortel ».
 */
export function enemyBodyColor(type: EnemyType, frozen: boolean, whiten: number): number {
  return mixColor(frozen ? INK.frost : ENEMY_COLOR[type], INK.paper, whiten)
}

/**
 * Seuils de l'alerte de dégel, en millisecondes restantes sur `Frozen.remaining`.
 *
 * 700 ms laissent le temps de rompre une approche ; 220 ms, soit treize images,
 * sont l'avertissement de dernier recours. Les gels les plus courts que produise
 * la contagion — 300 ms, le plancher de `RULE_TUNING.freezeSpreadFloorMs` —
 * naissent donc directement au palier intermédiaire, et c'est exact : ce gel-là
 * ne vaut rien, le montrer bleu vif serait une promesse fausse.
 */
export const THAW_LOOSE_MS = 700
export const THAW_GONE_MS = 220

/**
 * Part de givre qu'il reste à afficher, par paliers. Trois valeurs et pas un
 * dégradé, pour deux raisons qui vont dans le même sens : l'œil attrape les
 * transitions et pas les gradients — une teinte qui glisse sur 700 ms au milieu
 * d'une mêlée, à 6 px de rayon, ne se remarque pas — et trois valeurs ne font
 * que trois clés de cache du corps, donc deux redessins par dégel au lieu d'un
 * par image et par ennemi gelé.
 *
 * Appelée pour un ennemi effectivement gelé ; un ennemi libre vaut 0 sans
 * passer par ici.
 */
export function thawFrostAmount(remainingMs: number): number {
  if (remainingMs > THAW_LOOSE_MS) {
    return 1
  }
  if (remainingMs > THAW_GONE_MS) {
    return 0.5
  }
  return 0.12
}

/**
 * Sommets du triangle inscrit qui marque l'Éclat, premier sommet sur `angle`.
 * Trois côtés et pas plus : un polygone à `n` côtés s'écarte du cercle de
 * `r · (1 - cos(π/n))` en milieu d'arête, soit 0,8 px pour un hexagone à r = 6
 * — invisible — contre 3 px pour un triangle, la moitié du rayon.
 */
export function facetPoints(radius: number, angle: number): number[] {
  const pts: number[] = []
  for (let i = 0; i < 3; i++) {
    const a = angle + (i * 2 * Math.PI) / 3
    pts.push(Math.cos(a) * radius, Math.sin(a) * radius)
  }
  return pts
}

/**
 * Angle de la facette, et du trait de visée : le vecteur `Velocity` en charge,
 * la direction du joueur sinon. `dx`/`dy` vont de l'Éclat vers le joueur.
 *
 * En charge (état 2) la trajectoire est figée et ne suit plus le joueur : viser
 * le joueur mentirait précisément au moment où ça compte. Pendant le télégraphe
 * (état 1) la vitesse est nulle par construction, elle ne donne aucune
 * direction — d'où les deux règles plutôt qu'une.
 *
 * Le repli sur le joueur quand la vitesse est nulle en état 2 n'est pas
 * théorique : `freezeSystem` annule `Velocity` sans sortir l'Éclat de l'état 2,
 * et `Math.atan2(0, 0)` vaut 0 — la facette d'un Éclat gelé pointerait plein est
 * pendant toute la durée du gel.
 */
export function shardAim(
  dashState: number,
  vx: number,
  vy: number,
  dx: number,
  dy: number,
): number {
  if (dashState === 2 && (vx !== 0 || vy !== 0)) {
    return Math.atan2(vy, vx)
  }
  return Math.atan2(dy, dx)
}

/** Rayon de départ de l'anneau de télégraphe, en multiples du rayon du corps. */
export const TELEGRAPH_RING_START = 4

/**
 * Rayon de l'anneau à l'avancement `progress` ∈ [0, 1] du télégraphe. Il atteint
 * **exactement** le rayon du corps à 1 : c'est le contact avec le disque qui
 * annonce le tir, pas une opacité à interpréter.
 */
export function telegraphRingRadius(radius: number, progress: number): number {
  const k = Math.min(1, Math.max(0, progress))
  return radius * (TELEGRAPH_RING_START - (TELEGRAPH_RING_START - 1) * k)
}

/** Interpolation d'opacité du télégraphe, bornée à ses extrémités. */
export function telegraphFade(progress: number, from: number, to: number): number {
  const k = Math.min(1, Math.max(0, progress))
  return from + (to - from) * k
}

/**
 * Trace le chemin d'un cercle en tirets — `segments` arcs d'un demi-pas chacun.
 * Ne peint pas : l'appelant enchaîne son propre `stroke`. Partagé par le contour
 * d'apparition et l'anneau de télégraphe, qui disent la même chose par la même
 * forme : « ceci ne tue pas ».
 */
export function dashedCircle(gfx: Graphics, radius: number, segments: number): void {
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2
    gfx.moveTo(Math.cos(a0) * radius, Math.sin(a0) * radius)
    gfx.arc(0, 0, radius, a0, a0 + Math.PI / segments)
  }
}

/** Ce qui est affiché est ce qui tue : « pointillé = inoffensif, plein = mortel » pendant l'apparition. */
export function createEnemyView(): EnemyView {
  const container = new Container()
  const body = new Graphics()
  const ring = new Graphics()
  const telegraph = new Graphics()
  container.addChild(body, ring, telegraph)

  let lastKey = ''

  return {
    container,
    update({
      x,
      y,
      radius,
      type,
      aim,
      materializeProgress,
      frozen,
      whiten,
      dashState,
      telegraphProgress,
      aimLength,
    }) {
      container.x = x
      container.y = y

      // Redessiné à chaque image, donc AVANT le court-circuit de cache : l'anneau
      // et le trait bougent en continu. Les faire entrer dans la clé du corps
      // l'invaliderait soixante fois par seconde et le cache ne servirait plus.
      telegraph.clear()
      // Le télégraphe s'efface avec le corps pendant le temps d'arrêt de la
      // mort : un Éclat blanchi gardait sinon un anneau et un trait violets à
      // pleine force au-dessus d'un corps devenu papier.
      const encre = Math.max(0, 1 - whiten)
      if (dashState === 1 && encre > 0) {
        // Pointillé, parce que ça ne tue pas — même convention, et désormais le
        // même tracé, que le contour d'apparition.
        dashedCircle(telegraph, telegraphRingRadius(radius, telegraphProgress), 12)
        telegraph.stroke({
          color: INK.shard,
          width: 1.2,
          alpha: telegraphFade(telegraphProgress, 0.5, 0.9) * encre,
        })

        // Le trait de visée, du bord du corps jusqu'au joueur.
        const tiret = 6
        const trou = 5
        for (let d = radius + trou; d < aimLength; d += tiret + trou) {
          const fin = Math.min(d + tiret, aimLength)
          telegraph.moveTo(Math.cos(aim) * d, Math.sin(aim) * d)
          telegraph.lineTo(Math.cos(aim) * fin, Math.sin(aim) * fin)
        }
        // Joueur plus près que `radius + trou` : la boucle n'émet aucun tiret et
        // ce `stroke` ne reçoit qu'un `moveTo` — le point de reprise que Pixi
        // pose après le `stroke` précédent — que `ShapePath.endPoly` jette. Rien
        // n'est dessiné, rien ne lève, et surtout l'anneau n'est PAS repeint à
        // l'opacité du trait : inutile de garder la boucle.
        telegraph.stroke({
          color: INK.shard,
          width: 1.2,
          alpha: telegraphFade(telegraphProgress, 0, 0.7) * encre,
        })
      }

      // Le blanchiment fait partie de la clé : sans lui, le cache renverrait le
      // dessin précédent et l'animation de mort ne se verrait jamais.
      // L'orientation quantifiée au dixième de radian — à r = 6 cela vaut
      // 0,6 px, en deçà rien ne se verrait et le corps se redessinerait pour
      // rien — et neutralisée hors Éclat, où elle n'entre dans aucun tracé.
      const facet = type === 'shard' ? Math.round(aim * 10) : 0
      const key = `${radius.toFixed(1)}|${type}|${materializeProgress.toFixed(2)}|${frozen}|${whiten.toFixed(2)}|${facet}`
      if (key === lastKey) {
        return
      }
      lastKey = key

      body.clear()
      ring.clear()

      // Blanchiment pendant le temps d'arrêt de la séquence de mort : le monde
      // est suspendu, les ennemis cessent d'être menaçants.
      const color = enemyBodyColor(type, frozen, whiten)

      if (materializeProgress < 1) {
        // Contour pointillé qui respire + anneau de compte à rebours.
        dashedCircle(body, radius, 10)
        body.stroke({ color, width: 1.6, alpha: 0.25 + materializeProgress * 0.5 })
        body.circle(0, 0, radius).fill({ color, alpha: materializeProgress * 0.8 })

        const ringRadius = radius + (1 - materializeProgress) * radius * 1.4
        ring.circle(0, 0, ringRadius).stroke({ color, width: 1.2, alpha: 0.5 })
      } else {
        body.circle(0, 0, radius).fill({ color })
        // Liseré tracé À L'INTÉRIEUR du rayon de collision : le disque affiché
        // doit rester exactement le disque qui tue. Un contour centré sur
        // `radius` déborderait de la moitié de son épaisseur et annoncerait une
        // zone mortelle plus large que la vraie ; centré sur `radius - edge/2`,
        // son bord extérieur tombe pile sur `radius`.
        const edge = 1
        const inner = radius - edge / 2
        if (type === 'shard') {
          // La facette : le remplissage reste le disque, seul le liseré change,
          // donc la silhouette extérieure — la hitbox — ne bouge pas.
          body.poly(facetPoints(inner, aim))
        } else {
          body.circle(0, 0, inner)
        }
        // `join: 'round'` n'est pas cosmétique, c'est ce qui rend vrai le calcul
        // ci-dessus pour le triangle. Pixi joint par défaut en `miter` : à un
        // sommet de 60°, la pointe dépasse le sommet de `(edge/2)/sin(30°)`,
        // soit 1 px et non `edge/2` — mesuré, `body.context.bounds` montait à
        // 6,5 pour un Éclat de rayon 6, trois pointes couleur papier tournant
        // hors du disque mortel. Une jointure arrondie, elle, déborde de
        // `edge/2` quel que soit l'angle du sommet.
        body.stroke({ color: INK.paper, width: edge, alpha: 0.55, join: 'round' })
      }
    },
  }
}
