import { type Container, Graphics } from 'pixi.js'

interface Spike {
  angle: number
  length: number
  growMs: number
}

interface Star {
  gfx: Graphics
  color: number
  spikes: Spike[]
  halfWidth: number
  life: number
  maxLife: number
}

export interface FrostStarOptions {
  color: number
  /** Portée réelle du gel : le pic garanti (indice 0) l'atteint exactement. */
  radius: number
}

export interface FrostStars {
  emit(x: number, y: number, opts: FrostStarOptions): void
  update(dtMs: number): void
  destroy(): void
}

/** Impair : aucune symétrie accidentelle d'un pic à son opposé. */
export const SPIKE_COUNT = 13
/**
 * Longueur plancher, en fraction du rayon : l'écart de longueur doit se voir,
 * mais l'étoile doit d'abord se lire comme une masse de givre.
 *
 * À 0,45, les pics courts n'allaient pas à la moitié de la portée : l'étoile
 * était une poignée d'aiguilles autour d'un noyau, et l'œil lisait sa taille
 * sur les courts plutôt que sur les longs — donc plus petite que la zone qui
 * fige vraiment. 0,78 réglait ça mais égalisait les pics : l'étoile devenait
 * un disque hérissé, sans le désordre qui fait le givre.
 *
 * 0,55 rend ce désordre **sans rendre la taille** : le plancher vaut ici
 * 0,55 × 220 = 121 px, au-dessus du plancher absolu du réglage 0,65 × 160
 * d'avant les élargissements. Le rayon plus grand paie l'écart ; l'œil lit une
 * longueur minimale plus grande qu'avant, avec presque deux fois plus de
 * battement entre le plus court et le plus long.
 */
export const SPIKE_MIN_RATIO = 0.55
/**
 * Demi-largeur de la base d'un pic, en fraction du rayon : ≈ 37 px à 220, donc
 * 75 px de base. Des pics massifs, larges comme une main d'encre — à 0,055 ils
 * s'affinaient en éclisses que le fondu effaçait à mi-vie, et 0,09 puis 0,13
 * restaient des doigts sur une étoile qui a la largeur d'une chambre.
 *
 * **C'est ici que se trouve le plafond de l'étoile.** Un pic vaut `half` de
 * large à mi-longueur, et deux axes voisins y sont écartés d'une tranche
 * d'arc — soit `2π / SPIKE_COUNT / 2 ≈ 0,242` fois le rayon. Passé ce ratio,
 * les pics se rejoignent avant leurs pointes et l'étoile redevient un disque
 * hérissé. 0,17 en garde un tiers de marge ; `frost-star.test.ts` tient la
 * borne, donc un élargissement de trop casse un test plutôt qu'une silhouette.
 *
 * Aucun effet sur l'écart angulaire tenu par `ANGLE_JITTER` : les pics partent
 * tous du même point et se recouvrent de toute façon près du centre, ce qu'un
 * `fill` unique absorbe sans empiler l'opacité.
 */
export const SPIKE_HALF_WIDTH_RATIO = 0.17
/**
 * Fraction de la demi-tranche dont un angle peut s'écarter. Des angles
 * uniformément aléatoires produiraient des paquets et de grands arcs vides —
 * ça se lit comme un bug, pas comme du givre. Borné à 0,75, l'écart entre
 * deux voisins ne descend jamais sous 25 % de la tranche nominale, donc aucun
 * pic n'en croise un autre (`frost-star.test.ts` le tient).
 */
export const ANGLE_JITTER = 0.75
/**
 * 600 ms plutôt que 450 : l'étoile a grandi, et une silhouette plus large
 * demande plus de temps pour être lue en entier. Reste très en deçà des
 * 4000 ms du gel lui-même — l'étoile annonce le coup, elle ne le double pas.
 */
const STAR_DURATION_MS = 600
/**
 * Bornes de la durée de pousse d'un pic. Chaque pic tire la sienne, donc les
 * treize n'arrivent pas ensemble : c'est du givre qui prend, pas une forme
 * qu'on plaque.
 *
 * Le plafond est le chiffre sensible. Le Gel a cessé d'être une zone
 * précisément pour ne plus raconter une onde qui met du temps à arriver, et
 * une pousse assez lente redirait ce mensonge. À 220 ms, le dernier pic est
 * planté avant que l'étoile ait vécu 40 % de sa vie et pendant que le gel en a
 * encore 3 800 devant lui : l'œil lit une éclosion sur place, pas une
 * propagation. Ne pas monter au-delà de 250 (`frost-star.test.ts` le tient).
 */
export const SPIKE_GROW_MIN_MS = 60
export const SPIKE_GROW_MAX_MS = 220
/**
 * Montée de l'opacité, commune aux treize pics : ils partagent un seul `fill`,
 * donc la douceur d'apparition se joue là, et le désordre se joue dans la
 * géométrie. 90 ms — assez pour que rien ne claque, assez peu pour que l'étoile
 * soit franche avant même que le dernier pic ait fini de pousser.
 */
export const FADE_IN_MS = 90
/** Opacité du remplissage une fois la montée finie. */
const FILL_ALPHA = 0.85
/** Borne dure, plus basse que les 24 anneaux de `shockwave.ts` : une étoile coûte 13 triangles. */
const STAR_LIMIT = 8

/** Angle du pic `index` : répartition régulière plus un écart borné ; `jitter01` dans [0, 1]. */
export function spikeAngle(index: number, count: number, jitter01: number): number {
  const tranche = (Math.PI * 2) / count
  return index * tranche + (jitter01 * 2 - 1) * (tranche / 2) * ANGLE_JITTER
}

/**
 * Longueur du pic `index`. L'indice 0 vaut `radius` exactement quel que soit
 * le tirage : sans ce pic garanti, une étoile pourrait être entièrement plus
 * courte que la portée réelle. Même exigence que le disque de vérité tracé
 * partout ailleurs — le dessin ne promet jamais moins ni plus que ce qui agit.
 */
export function spikeLength(index: number, radius: number, rand01: number): number {
  if (index === 0) {
    return radius
  }
  return radius * (SPIKE_MIN_RATIO + rand01 * (1 - SPIKE_MIN_RATIO))
}

/**
 * Durée de pousse du pic `index`. L'indice 0 prend la plus courte quel que soit
 * le tirage : c'est lui qui porte la portée exacte (voir `spikeLength`), donc
 * c'est lui qui doit l'annoncer en premier. Un pic garanti qui pousserait
 * lentement laisserait l'étoile promettre moins que ce que le Gel vient de
 * figer, pendant les images où le joueur regarde justement le résultat.
 */
export function spikeGrowMs(index: number, rand01: number): number {
  if (index === 0) {
    return SPIKE_GROW_MIN_MS
  }
  return SPIKE_GROW_MIN_MS + rand01 * (SPIKE_GROW_MAX_MS - SPIKE_GROW_MIN_MS)
}

/**
 * Avancement de la pousse d'un pic, de 0 à 1, en décélérant (cubique sortante).
 * Le pic file vers sa longueur puis s'y pose, au lieu d'arriver à vitesse
 * constante et de s'arrêter net.
 */
export function spikeGrow01(elapsedMs: number, growMs: number): number {
  const t = Math.min(1, Math.max(0, elapsedMs / growMs))
  return 1 - (1 - t) ** 3
}

/**
 * Montée d'opacité de l'étoile entière, de 0 à 1 sur `FADE_IN_MS`. Linéaire :
 * la douceur vient de la durée, et une courbe de plus ici se battrait avec la
 * décélération des pics sans que l'œil sépare les deux.
 */
export function starFadeIn(elapsedMs: number): number {
  return Math.min(1, Math.max(0, elapsedMs / FADE_IN_MS))
}

/**
 * Fondu et affinement, de 1 à 0. Borné : `update()` ne passe jamais que des
 * `progress` dans [0, 1) (sortie précoce sur `life <= 0`), mais la fonction
 * est exportée et un appelant direct pourrait lui donner n'importe quoi.
 */
export function starTaper(progress: number): number {
  return Math.min(1, Math.max(0, 1 - progress))
}

/**
 * Étoiles de givre du Gel. Même couche que les anneaux d'onde de choc.
 *
 * `Math.random()` est autorisé ici (`src/render/`), mais il ne sert qu'à
 * l'émission : les fonctions de géométrie reçoivent leur tirage en paramètre
 * et restent pures, donc testables — même parti que `death-sequence.ts`.
 */
export function createFrostStars(container: Container): FrostStars {
  const stars: Star[] = []

  return {
    emit(x, y, opts): void {
      if (stars.length >= STAR_LIMIT) {
        // FIFO simple : contrairement aux anneaux, une étoile n'a pas de délai
        // d'entrée, donc aucune ne risque d'être évincée avant d'avoir été vue.
        const [evicted] = stars.splice(0, 1)
        evicted?.gfx.destroy()
      }
      const gfx = new Graphics()
      gfx.x = x
      gfx.y = y
      container.addChild(gfx)

      // Tirés une seule fois : angle, longueur finale et durée de pousse ne
      // bougent plus de la vie de l'étoile. Seul l'avancement le long de cette
      // pousse dépend du temps — la forme est décidée à l'émission, elle se
      // découvre ensuite. C'est ce qui sépare une éclosion, bornée à
      // `SPIKE_GROW_MAX_MS`, d'une onde qui voyage : le Gel a cessé d'être une
      // zone pour ne plus raconter la seconde.
      const spikes: Spike[] = []
      for (let i = 0; i < SPIKE_COUNT; i++) {
        spikes.push({
          angle: spikeAngle(i, SPIKE_COUNT, Math.random()),
          length: spikeLength(i, opts.radius, Math.random()),
          growMs: spikeGrowMs(i, Math.random()),
        })
      }

      stars.push({
        gfx,
        color: opts.color,
        spikes,
        halfWidth: opts.radius * SPIKE_HALF_WIDTH_RATIO,
        life: STAR_DURATION_MS,
        maxLife: STAR_DURATION_MS,
      })
    },

    update(dtMs): void {
      for (let i = stars.length - 1; i >= 0; i--) {
        const star = stars[i]
        if (!star) {
          continue
        }
        star.life -= dtMs
        if (star.life <= 0) {
          star.gfx.destroy()
          stars.splice(i, 1)
          continue
        }
        const elapsed = star.maxLife - star.life
        const taper = starTaper(1 - star.life / star.maxLife)

        star.gfx.clear()
        for (const spike of star.spikes) {
          const grow = spikeGrow01(elapsed, spike.growMs)
          const cos = Math.cos(spike.angle)
          const sin = Math.sin(spike.angle)
          const length = spike.length * grow
          // La base pousse avec la pointe, puis s'affine sous le fondu. Ce que
          // le `taper` ne touche pas, c'est la longueur une fois plantée : la
          // portée reste lisible jusqu'au bout, sans que l'étoile finisse en
          // tache nette plaquée sur l'image (le piège documenté dans
          // `shockwave.ts`).
          const half = star.halfWidth * grow * taper
          // Triangle isocèle : pointe sur l'axe du pic, deux coins de base
          // posés sur le point d'explosion lui-même, écartés perpendiculairement.
          star.gfx
            .moveTo(cos * length, sin * length)
            .lineTo(-sin * half, cos * half)
            .lineTo(sin * half, -cos * half)
            .closePath()
        }
        // Un seul `fill` pour les 13 triangles : ils se recouvrent tous au
        // centre, et treize remplissages successifs y empileraient l'opacité
        // en une tache opaque au lieu d'un noyau dense.
        star.gfx.fill({ color: star.color, alpha: FILL_ALPHA * starFadeIn(elapsed) * taper })
      }
    },

    destroy(): void {
      for (const star of stars) {
        star.gfx.destroy()
      }
      stars.length = 0
    },
  }
}
