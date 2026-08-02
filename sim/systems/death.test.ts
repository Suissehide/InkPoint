import { addComponent, addEntity, defineQuery, hasComponent } from 'bitecs'
import { describe, expect, it } from 'vitest'

import { Collider, Doomed, Enemy, Hazard, Lifetime, Position } from '../components'
import { HAZARD_BLAST, HAZARD_INK_TRAIL, RULE_TUNING } from '../data/powerups'
import { UPGRADES } from '../data/upgrades'
import { spawnEnemy, spawnPlayer } from '../spawn'
import { createRunStats, type RunStats } from '../upgrades/stats'
import { createWorld, type SimWorld } from '../world'
import { deathSystem } from './death'
import { hazardSystem } from './hazards'
import { spawnPickup } from './pickup'

/**
 * « Le papier boit » : chaque ennemi tué laisse une tache d'encre mortelle.
 *
 * Tous les tests montent leurs `RunStats` en appelant `apply()` sur la **vraie
 * carte**, jamais en écrivant `rules.add('thirstyPaper')` à la main : la règle
 * vit dans un `Set<string>` non typé, et une faute de frappe d'un côté ou de
 * l'autre rendrait la mythique silencieusement inerte sans qu'aucun
 * compilateur ni lint ne bronche. En passant par la carte, un seul de ces
 * tests suffit à mordre sur la faute, où qu'elle soit.
 */

const hazardQuery = defineQuery([Hazard, Position])

/** Les `RunStats` d'une run où la mythique a été prise, montées par la carte elle-même. */
function statsAvecCarte(): RunStats {
  const card = UPGRADES.find((u) => u.id === 'thirsty-paper')
  if (!card) {
    throw new Error('carte introuvable : thirsty-paper')
  }
  const stats = createRunStats()
  card.apply(stats)
  return stats
}

function setup(): SimWorld {
  const w = createWorld({ seed: 1, width: 800, height: 600 })
  spawnPlayer(w)
  Position.x[w.playerEid] = 50
  Position.y[w.playerEid] = 50
  return w
}

const taches = (w: SimWorld): number[] =>
  [...hazardQuery(w)].filter((eid) => Hazard.kind[eid] === HAZARD_INK_TRAIL)

describe('« Le papier boit » — la tache laissée par une mort', () => {
  it('naît sur le cadavre, mortelle et de la bonne taille', () => {
    const w = setup()
    const stats = statsAvecCarte()
    const enemy = spawnEnemy(w, { type: 'point', x: 300, y: 200, materializeMs: 0 })
    addComponent(w, Doomed, enemy)

    deathSystem(w, stats)

    const tache = taches(w)[0]
    expect(tache, 'une mort doit laisser une tache').toBeDefined()
    // Au point exact de la mort, pas approximativement : c'est là que le joueur
    // a vu l'ennemi tomber.
    expect(Position.x[tache!]).toBe(300)
    expect(Position.y[tache!]).toBe(200)
    // Le rayon affiché est le rayon qui tue : le rendu lit `Hazard.radius`.
    expect(Hazard.radius[tache!]).toBe(RULE_TUNING.thirstyPaper.radius)
    expect(Hazard.maxRadius[tache!]).toBe(RULE_TUNING.thirstyPaper.radius)
    // Zéro, sinon `hazardSystem` ferait grossir la tache indéfiniment.
    expect(Hazard.growthRate[tache!]).toBe(0)
    expect(Lifetime.remaining[tache!]).toBe(RULE_TUNING.thirstyPaper.lifeMs)
  })

  it('sans la carte, aucune tache', () => {
    const w = setup()
    const stats = createRunStats()
    const enemy = spawnEnemy(w, { type: 'point', x: 300, y: 200, materializeMs: 0 })
    addComponent(w, Doomed, enemy)

    deathSystem(w, stats)

    expect(taches(w)).toHaveLength(0)
  })

  /**
   * `deathSystem` a la règle parce que c'est le seul endroit qui connaisse
   * TOUTES les morts. Ce test tue par une zone (le chemin le plus courant) et
   * non en posant `Doomed` à la main : une implémentation qui aurait mis la
   * tache dans le code d'un power-up particulier passerait le premier test et
   * tomberait ici — ou l'inverse.
   */
  it('naît quelle que soit la cause de la mort', () => {
    const w = setup()
    const stats = statsAvecCarte()
    const enemy = spawnEnemy(w, { type: 'point', x: 300, y: 200, materializeMs: 0 })

    // Tué par une Bombe et non par un `Doomed` posé à la main : c'est le chemin
    // le plus courant du jeu. Une implémentation qui aurait mis la tache dans
    // le code d'un power-up particulier passerait le premier test et tomberait
    // ici — la règle appartient à `deathSystem`, seul à connaître toutes les
    // morts (zone, sillage de Ruée, noyau de Buvard, ou une autre tache).
    const bombe = addEntity(w)
    addComponent(w, Position, bombe)
    addComponent(w, Hazard, bombe)
    Position.x[bombe] = 300
    Position.y[bombe] = 200
    Hazard.kind[bombe] = HAZARD_BLAST
    Hazard.radius[bombe] = 60
    Hazard.maxRadius[bombe] = 60
    Hazard.growthRate[bombe] = 0

    hazardSystem(w)
    expect(hasComponent(w, Doomed, enemy), "la Bombe doit avoir tué l'ennemi").toBe(true)

    deathSystem(w, stats)
    expect(taches(w), 'une mort par zone laisse sa tache elle aussi').toHaveLength(1)
    expect(Position.x[taches(w)[0]!]).toBe(300)
  })

  it("tue ce qu'elle touche", () => {
    const w = setup()
    const stats = statsAvecCarte()
    const mort = spawnEnemy(w, { type: 'point', x: 300, y: 200, materializeMs: 0 })
    // 25 px du cadavre : sous les 22 + 7 que barre la tache à un Point.
    const voisin = spawnEnemy(w, { type: 'point', x: 325, y: 200, materializeMs: 0 })
    addComponent(w, Doomed, mort)
    deathSystem(w, stats)

    hazardSystem(w)
    expect(hasComponent(w, Doomed, voisin)).toBe(true)
  })

  it("laisse intact ce qu'elle ne touche pas", () => {
    const w = setup()
    const stats = statsAvecCarte()
    const mort = spawnEnemy(w, { type: 'point', x: 300, y: 200, materializeMs: 0 })
    // Contre-épreuve du test précédent : à 60 px, bien au-delà des 29 barrés.
    // Sans elle, « tout meurt » passerait aussi bien.
    const loin = spawnEnemy(w, { type: 'point', x: 360, y: 200, materializeMs: 0 })
    addComponent(w, Doomed, mort)
    deathSystem(w, stats)

    hazardSystem(w)
    expect(hasComponent(w, Doomed, loin)).toBe(false)
  })

  /**
   * La cascade est le comportement voulu, pas un effet de bord toléré : une
   * tache tue un voisin, qui laisse la sienne, qui en tue un autre. C'est ce
   * qui transforme une grappe en réaction en chaîne, et c'est la raison d'être
   * de la carte.
   *
   * Une file de quatre ennemis espacés de 25 px doit tomber en entier depuis un
   * seul mort, un maillon par pas — `hazardSystem` tourne avant `deathSystem`,
   * la chaîne se déroule donc image par image et jamais d'un coup.
   */
  it('se propage en chaîne le long d’une grappe, un maillon par pas', () => {
    const w = setup()
    const stats = statsAvecCarte()
    const file = [0, 1, 2, 3].map((i) =>
      spawnEnemy(w, { type: 'point', x: 300 + i * 25, y: 200, materializeMs: 0 }),
    )

    addComponent(w, Doomed, file[0]!)
    deathSystem(w, stats)

    const vivants = defineQuery([Enemy, Position, Collider])
    for (let i = 0; i < 10; i++) {
      hazardSystem(w)
      deathSystem(w, stats)
    }

    expect([...vivants(w)], 'toute la grappe tombe du premier mort').toHaveLength(0)
    expect(taches(w).length, 'chaque maillon a laissé la sienne').toBe(file.length)
  })

  /**
   * La cascade est bornée par le nombre d'ennemis vivants : chaque maillon en
   * consomme un et rien n'en fait naître. Sans ennemi à tuer, elle s'arrête —
   * les taches expirent et plus rien ne se sème. C'est ce qui autorise à ne
   * poser ni plafond ni compteur de génération.
   */
  it('s’éteint faute d’ennemis : le nombre de taches ne dépasse jamais celui des morts', () => {
    const w = setup()
    const stats = statsAvecCarte()
    const enemies = [0, 1, 2].map((i) =>
      spawnEnemy(w, { type: 'point', x: 300 + i * 25, y: 200, materializeMs: 0 }),
    )

    addComponent(w, Doomed, enemies[0]!)
    for (let i = 0; i < 60; i++) {
      hazardSystem(w)
      deathSystem(w, stats)
    }

    expect(taches(w).length).toBeLessThanOrEqual(enemies.length)
  })

  /**
   * Toute entité disparaît par le même chemin (`Doomed`) : les pastilles
   * périmées, les zones expirées, les plumes à l'impact. Seul un ennemi doit
   * laisser une tache — semer sur chaque pastille périmée couvrirait l'arène de
   * pièges que rien n'annonce.
   */
  it('ne naît que d’une mort d’ennemi, jamais de la disparition d’autre chose', () => {
    const w = setup()
    const stats = statsAvecCarte()

    const pastille = spawnPickup(w)
    Position.x[pastille] = 700
    Position.y[pastille] = 500
    addComponent(w, Doomed, pastille)

    deathSystem(w, stats)
    expect(taches(w)).toHaveLength(0)
  })
})
