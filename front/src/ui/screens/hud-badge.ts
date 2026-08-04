import type { AchievementDef } from '@/app/achievements/catalog'
import { t } from '@/i18n'
import { nibPath } from '@/render/views/nibs'

/**
 * Durée d'affichage d'un succès, en ms d'horloge réelle.
 *
 * 4000 et non 2500 : le bandeau tombe presque toujours dans un moment chargé —
 * une fin de vague, un écran de cartes qui s'ouvre, une arène qu'on surveille
 * encore. Il ne suffit pas qu'il soit lisible, il faut qu'il attende que le
 * joueur ait fini de faire autre chose et le remarque. Le retour de jeu était
 * sans appel : à 2,5 s il partait avant d'avoir été lu.
 *
 * Le coût se paie sur les rafales : deux succès du même pas défilent l'un après
 * l'autre, donc 8 s de bandeau. C'est assumé — ils sont rares, et deux succès
 * d'un coup méritent qu'on s'y arrête.
 */
export const BADGE_MS = 4000

export interface BadgeQueue {
  /** Le succès à montrer maintenant, `null` quand rien n'est affiché. */
  readonly current: AchievementDef | null
  /** Met un succès en file. Deux succès du même pas défilent l'un après l'autre. */
  push(def: AchievementDef): void
  /** `dtMs` en temps réel : le bandeau ne doit pas geler avec un hitstop. */
  update(dtMs: number): void
  clear(): void
}

/**
 * La logique du bandeau, sans DOM — d'où testable sous `environment: 'node'`
 * (`vitest.config.ts`, jsdom absent des dépendances). `createBadgeView`
 * l'enrobe pour refléter `current` dans l'élément ; c'est cette file qui
 * décide quoi montrer et pendant combien de temps.
 */
export function createBadgeQueue(): BadgeQueue {
  const queue: AchievementDef[] = []
  let current: AchievementDef | null = null
  let remaining = 0

  return {
    get current(): AchievementDef | null {
      return current
    },

    push(def: AchievementDef): void {
      queue.push(def)
    },

    update(dtMs: number): void {
      if (current) {
        remaining -= dtMs
        if (remaining > 0) {
          return
        }
      }
      const next = queue.shift() ?? null
      current = next
      remaining = next ? BADGE_MS : 0
    },

    clear(): void {
      queue.length = 0
      current = null
      remaining = 0
    },
  }
}

export interface BadgeView {
  readonly element: HTMLElement
  /** Met un succès en file. Deux succès du même pas défilent l'un après l'autre. */
  push(def: AchievementDef): void
  /** `dtMs` en temps réel : le bandeau ne doit pas geler avec un hitstop. */
  update(dtMs: number): void
  clear(): void
}

/** Durée de l'ouverture, en ms. */
const OPEN_MS = 460
/**
 * Courbe de l'ouverture.
 *
 * `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out quint) traînait ici et se lisait
 * comme un claquement : il couvre plus de 80 % de la largeur dans son premier
 * tiers, si bien qu'allonger la durée n'aurait pas ralenti le mouvement — il
 * aurait gardé son coup sec et gagné une longue traîne immobile. C'est la
 * courbe qu'il fallait changer, pas seulement le chiffre.
 *
 * Ease-out cubique répartit le mouvement : le cartouche s'ouvre encore
 * franchement, mais on voit l'encre s'étaler au lieu d'apparaître d'un coup.
 */
const OPEN_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)'
const OPEN_TRANSITION = `width ${OPEN_MS}ms ${OPEN_EASE}, padding ${OPEN_MS}ms ${OPEN_EASE}, opacity ${OPEN_MS}ms ease-out`

/**
 * Le bandeau des succès, en haut au centre de la **fenêtre**.
 *
 * Il est monté sur `#ui` et non dans le HUD (`game.ts`) : le HUD est calé sur
 * l'arène et mis à l'échelle par un `transform`, et un enfant de ce
 * conteneur-là ne peut pas se placer par rapport à la fenêtre. Vivant hors du
 * HUD, il suit la rampe `--ui` comme les écrans de menu — c'est le régime de
 * `#ui`, et le seul correct ici.
 *
 * Conséquence assumée : tout en haut au centre, il passe par-dessus le bloc
 * vague/temps du HUD pendant les 2,5 s de son affichage. Le masquage est
 * temporaire et le temps se relit tout de suite après.
 */
export function createBadgeView(): BadgeView {
  const element = document.createElement('div')
  // Cartouche à l'encre : fond papier, texte encre. C'est l'inversion que le
  // jeu réserve à ses cartes mythiques (`card.ts`), et pour la même raison —
  // dire qu'une chose rare vient d'arriver. Partout ailleurs le joueur lit de
  // l'encre claire sur une page sombre ; ici la page se retourne, et c'est ce
  // renversement qui fait l'événement, pas un cadre ni une couleur d'accent.
  //
  // Aucune bordure : l'aplat délimite déjà. Un liseré par-dessus un fond plein
  // serait l'accessoire en trop.
  //
  // `overflow-hidden` + `whitespace-nowrap` : pendant l'ouverture, le contenu
  // garde sa largeur naturelle et se fait révéler, au lieu de se comprimer puis
  // de se détendre.
  // Rembourrage asymétrique, et à dessein : à gauche le pictogramme apporte
  // son propre air — il est centré dans sa boîte et son tracé n'en touche pas
  // les bords — alors qu'à droite le texte va jusqu'au bout du sien. Un
  // rembourrage égal des deux côtés se lit donc comme serré à droite. Même
  // raison en haut, où les capitales espacées du surtitre montent haut dans
  // leur ligne.
  element.className =
    'pointer-events-none absolute left-1/2 top-[calc(var(--ui)*0.5)] hidden -translate-x-1/2 items-center gap-[calc(var(--ui)*0.55)] overflow-hidden whitespace-nowrap rounded-sm bg-paper pt-[calc(var(--ui)*0.45)] pr-[calc(var(--ui)*1.15)] pb-[calc(var(--ui)*0.3)] pl-[calc(var(--ui)*0.75)] text-ink'

  const queue = createBadgeQueue()
  // `null` tant que rien n'a jamais été affiché : évite un aller-retour au
  // DOM à chaque frame quand le bandeau est simplement vide en continu.
  let shown: AchievementDef | null = null

  const render = (def: AchievementDef): void => {
    // `1em` sur le SVG, la taille posée sur le `<span>` qui le porte : hors du
    // HUD, le bandeau suit la rampe `--ui` comme les écrans de menu, et le
    // pictogramme avec.
    // Un succès honorifique n'ouvre pas de tracé : il porte un simple point
    // d'encre. Rayon 5 et non 7 — les silhouettes sont longues et fines, un
    // disque aussi large qu'elles pèse deux fois plus à l'œil et déséquilibre
    // le cartouche selon le succès annoncé.
    const mark = def.skin
      ? `<path d="${nibPath(def.skin)}" fill="currentColor" />`
      : `<circle cx="0" cy="0" r="5" fill="currentColor" />`
    // Le pictogramme est la silhouette que le joueur va dessiner avec. Tracé à
    // l'encre pleine sur le papier du cartouche, il est exactement ce qu'il
    // verra en jeu — d'où sa taille, la plus grande du bandeau.
    const glyph = `<span class="text-[calc(var(--ui)*1.5)] leading-none"><svg viewBox="-16 -16 32 32" width="1em" height="1em" aria-hidden="true">${mark}</svg></span>`
    // Le surtitre dit ce qui vient d'arriver. Sans lui, le bandeau affiche un
    // nom seul — « Nature morte » en pleine partie ne se lit pas comme une
    // récompense, et le joueur n'a aucun moyen de deviner d'où il sort.
    const kind = `<span class="ui-2xs tracking-[0.3em] text-ink/50">${t('achievements.unlocked')}</span>`
    // Le tracé gagné, quand il y en a un : c'est la part concrète de la
    // récompense, et l'annoncer ici évite que le joueur ne la découvre qu'au
    // détour d'un menu. Le filet qui l'en sépare ne s'affiche qu'avec lui —
    // une cloison qui ne sépare rien est une décoration.
    const reward = def.skin
      ? `<span class="ui-2xs border-l border-ink/20 pl-[calc(var(--ui)*0.55)] text-ink/65">${t(`skin.${def.skin}.name`)}</span>`
      : ''
    element.innerHTML = `${glyph}<span class="flex flex-col leading-tight">${kind}<span class="ui-xs tracking-[0.12em]">${t(`achievement.${def.id}.name`)}</span></span>${reward}`
    // L'ouverture : le bandeau s'élargit du centre vers ses deux bords. Comme
    // il est centré par `-translate-x-1/2`, une largeur qui grandit s'étend
    // symétriquement — rien à animer sur la position.
    //
    // C'est la LARGEUR qui est animée, et non un `clip-path` ou un
    // `transform: scaleX`. Le second étirerait le texte pendant toute
    // l'animation, et `-translate-x-1/2` occupe déjà le `transform`. Quant au
    // premier, Chrome normalise `inset(0 0 0 0)` en `inset(0px)`, d'arité
    // différente de l'état fermé `inset(0 50% 0 50%)`, et l'interpolation
    // entre les deux n'est pas garantie.
    //
    // La largeur cible se MESURE à chaque annonce : elle dépend du titre, de la
    // présence d'un tracé et de la langue. On l'obtient en affichant le bandeau
    // à sa taille naturelle, transition coupée, avant de le refermer.
    element.style.transition = 'none'
    element.style.width = 'auto'
    element.style.paddingLeft = ''
    element.style.paddingRight = ''
    element.classList.remove('hidden')
    element.classList.add('flex')
    const target = element.offsetWidth

    // État fermé. Le rembourrage part de zéro lui aussi : en `border-box`, une
    // largeur nulle laisse sinon le bandeau à la largeur de ses marges
    // intérieures, et l'ouverture démarrerait d'un bloc déjà visible.
    element.style.width = '0px'
    element.style.paddingLeft = '0px'
    element.style.paddingRight = '0px'
    element.style.opacity = '0'
    // Force le recalcul de style (même idiome que le redémarrage d'animation de
    // `hud.ts`) : sans lui, le navigateur regrouperait les deux états et la
    // transition serait court-circuitée.
    void element.offsetWidth

    // État ouvert. Rendre la main aux classes pour le rembourrage (`''`) plutôt
    // que de recopier ici la valeur en `--ui`, qui divergerait au premier
    // réglage. Sous `.reduced-motion` (`main.css`), la durée tombe à 0,001 ms :
    // le bandeau apparaît sec, jamais à moitié ouvert.
    element.style.transition = OPEN_TRANSITION
    element.style.width = `${target}px`
    element.style.paddingLeft = ''
    element.style.paddingRight = ''
    element.style.opacity = ''
  }

  // Partagé par `update()` (file épuisée) et `clear()` (partie suivante) :
  // même séquence de retrait, un seul endroit à faire évoluer.
  const hide = (): void => {
    element.classList.add('hidden')
    element.classList.remove('flex')
    element.innerHTML = ''
    // Les styles en ligne posés par l'ouverture sont rendus : `render()` les
    // réécrit de toute façon, mais un bandeau caché qui garderait la largeur du
    // succès précédent est un piège pour qui inspecte le DOM.
    element.style.transition = ''
    element.style.width = ''
    element.style.paddingLeft = ''
    element.style.paddingRight = ''
    element.style.opacity = ''
  }

  return {
    element,

    push(def: AchievementDef): void {
      queue.push(def)
    },

    update(dtMs: number): void {
      queue.update(dtMs)
      if (queue.current === shown) {
        return
      }
      shown = queue.current
      if (shown) {
        render(shown)
      } else {
        hide()
      }
    },

    clear(): void {
      queue.clear()
      shown = null
      hide()
    },
  }
}
