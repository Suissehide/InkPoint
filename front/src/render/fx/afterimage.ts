import { type Container, Graphics } from 'pixi.js'

interface Ghost {
  gfx: Graphics
  age: number
}

export interface Afterimages {
  emit(x: number, y: number, angle: number): void
  update(dtMs: number): void
  destroy(): void
}

const LIFE_MS = 250

/** Opacité d'un fantôme à `age` ms. Nulle passé sa fin de vie, jamais négative. */
export function afterimageAlpha(age: number, lifeMs: number): number {
  return Math.max(0, 1 - age / lifeMs)
}

/**
 * Battement d'émission : un accumulateur de temps réel, et le souvenir d'un pas
 * de simulation depuis la dernière émission.
 */
export interface AfterimageBeat {
  /** Temps réel accumulé depuis la dernière émission, en ms. */
  elapsedMs: number
  /** Un pas de simulation a-t-il eu lieu depuis la dernière émission ? */
  sawSimStep: boolean
}

/** Le battement après une image, et s'il faut émettre sur celle-ci. */
export interface AfterimageBeatResult extends AfterimageBeat {
  emit: boolean
}

/**
 * Fait avancer le battement d'une image. Le temps compté est le temps réel :
 * la traînée dit la vitesse, elle doit garder sa densité quel que soit le
 * rafraîchissement de l'écran.
 *
 * `simAdvanced` sert à ne rien émettre sur un monde figé — un ennemi dont l'état
 * de simulation dit « en charge » reste dans cet état pendant une séquence de
 * mort, un décompte ou une pause, et empilerait des fantômes sur des
 * coordonnées identiques au pixel près.
 *
 * Ce drapeau est **mémorisé jusqu'à l'émission**, pas échantillonné sur l'image
 * qui franchit le seuil. La boucle à pas fixe ne joue un pas que sur une image
 * sur `refresh/60` : à 144 Hz, cinq images sur douze seulement. Tester
 * `simAdvanced` au franchissement jetterait donc les trois cinquièmes des
 * battements et éclaircirait la traînée d'autant — exactement ce que cumuler le
 * seul temps « avec pas » aurait fait. Mémorisé, le drapeau est vrai à chaque
 * franchissement dès que le monde tourne, l'intervalle vaut 40 ms partout.
 */
export function advanceAfterimageBeat(opts: {
  beat: AfterimageBeat
  dtMs: number
  intervalMs: number
  simAdvanced: boolean
}): AfterimageBeatResult {
  const { beat, dtMs, intervalMs, simAdvanced } = opts
  // Écart conservé en soustrayant l'intervalle plutôt qu'en le remettant à
  // zéro, pour ne pas dériver sous un framerate irrégulier. Une seule
  // soustraction par image : jamais de rafale après un long gel.
  const elapsedMs = beat.elapsedMs + dtMs
  const sawSimStep = beat.sawSimStep || simAdvanced
  if (elapsedMs < intervalMs) {
    return { elapsedMs, sawSimStep, emit: false }
  }
  return { elapsedMs: elapsedMs - intervalMs, sawSimStep: false, emit: sawSimStep }
}

export interface AfterimageOptions {
  /** Dessine la silhouette du fantôme à l'origine, orientée vers +x. */
  draw(gfx: Graphics): void
  /** Borne dure : une charge longue ne doit pas laisser une file sans fin de fantômes. */
  limit: number
}

/**
 * Copies fantômes derrière ce qui va vite : c'est ce qui fait *sentir* la
 * vitesse, là où les zones montrent la portée. La silhouette est un paramètre —
 * un fantôme qui ne ressemble pas à ce qu'il suit ne se lit pas comme sa trace,
 * et une pointe de plume derrière un Éclat ne voudrait rien dire.
 * Purement cosmétique — `src/render/` n'écrit jamais dans la simulation.
 */
export function createAfterimages(container: Container, opts: AfterimageOptions): Afterimages {
  const ghosts: Ghost[] = []

  return {
    emit(x, y, angle): void {
      if (ghosts.length >= opts.limit) {
        const oldest = ghosts.shift()
        oldest?.gfx.destroy()
      }
      const gfx = new Graphics()
      opts.draw(gfx)
      gfx.x = x
      gfx.y = y
      gfx.rotation = angle
      gfx.alpha = 0.45
      container.addChild(gfx)
      ghosts.push({ gfx, age: 0 })
    },

    update(dtMs): void {
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const g = ghosts[i]
        if (!g) {
          continue
        }
        g.age += dtMs
        const alpha = afterimageAlpha(g.age, LIFE_MS)
        if (alpha <= 0) {
          g.gfx.destroy()
          ghosts.splice(i, 1)
          continue
        }
        g.gfx.alpha = alpha * 0.45
      }
    },

    destroy(): void {
      for (const g of ghosts) {
        g.gfx.destroy()
      }
      ghosts.length = 0
    },
  }
}
