import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Rejoue toute la suite `sim/` dans trois moteurs JavaScript distincts.
 *
 * `math.test.ts` vérifie que l'arithmétique est juste, à une tolérance près.
 * Parmi ce que cette config rejoue, un seul fichier prouve qu'elle est
 * *identique partout*, au bit près — `math.golden.test.ts`, à tolérance
 * zéro sur chaque valeur que produit `sim/math.ts` — et c'est ce qui
 * conditionne qu'un serveur Node puisse rejouer la partie d'un joueur et
 * recalculer son score sans rejeter un innocent. `determinism.test.ts`, rejoué
 * ici aussi, est un test de caractérisation et un bon test de fumée de bout en
 * bout sur trois moteurs, mais pas une preuve sur `sim/math.ts` : son
 * empreinte n'observe que des `Types.f32` (Position des ennemis et du joueur)
 * plus `world.score`/`world.time`, aucun en aval d'un transcendant d'assez
 * près pour qu'un écart d'un ulp y survive — voir sa docstring dans
 * `sim/determinism.test.ts`.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Ajouté pour la tâche 6 (`leaderboard.browser.test.ts`) : le panneau de classement
      // importe `@/i18n` et `@/app/leaderboard-client` comme tout le reste de `ui/screens/`
      // (voir `vitest.config.ts`, même alias) — jusqu'ici aucun fichier `*.browser.test.ts`
      // n'en avait besoin, `@sim` seul suffisait.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    // Un glob, et non une liste de fichiers écrite à la main. Deux raisons.
    //
    // La première est un défaut de conception rattrapé en revue : avec une liste
    // nommée, un simple renommage de fichier le fait disparaître du rejeu **sans
    // rien signaler** — vérifié, `vitest run` sort en code 0 en annonçant
    // « 1 passed » là où on en attendait deux. La moitié de la preuve
    // s'évaporerait, CI verte. Un glob ne se laisse pas rétrécir en silence :
    // il faudrait ajouter un `exclude`, qui se voit en relecture.
    //
    // La seconde est que la portée choisie au départ était trop timide. Toute la
    // suite de `sim/` tourne dans un navigateur — 33 fichiers, 369 tests, 3 s —
    // donc autant tout rejouer : c'est le comportement entier de la simulation
    // qui devient prouvé portable, pas seulement les deux fichiers que j'avais
    // désignés. Et un test ajouté demain à `sim/` est couvert d'office.
    // `front/src/**/*.browser.test.ts` est le second glob : une convention de
    // nommage plutôt qu'une liste de fichiers, pour tout ce qui hors `sim/`
    // dépend d'une API que seul un vrai moteur de navigateur fournit
    // (`CompressionStream`, `atob`…). Une liste nommée devrait être tenue à
    // jour par chaque tâche future qui ajoute un tel test, et l'oubli serait
    // silencieux — le raisonnement du paragraphe ci-dessus sur le glob de
    // `sim/`, ici transposé : le fichier ne tournerait simplement jamais,
    // suite verte quand même, pour une raison qui n'a rien à voir avec son
    // contenu. Le suffixe rend l'intention visible dans le nom et suffit à
    // faire ramasser le fichier ici sans qu'aucune liste n'ait à s'en
    // souvenir.
    include: ['sim/**/*.test.ts', 'front/src/**/*.browser.test.ts'],
    // `purity.test.ts` et `version.test.ts` sont exclus : tous deux parcourent
    // le disque avec `node:fs` (et `version.test.ts` hache aussi avec
    // `node:crypto`), qui n'existent pas dans un navigateur. C'est de
    // l'outillage sur les sources, pas du comportement de simulation — rien à
    // prouver côté portabilité.
    //
    // `run.mocked.test.ts` est exclu pour deux raisons distinctes — l'une
    // choisie, l'autre subie (voir sa propre docstring pour le détail) :
    // ce qu'il éprouve (l'ordre `absorbEvents`/`waveEnded` dans `replayRun`)
    // est un défaut STRUCTUREL, qui se comporte à l'identique quel que soit le
    // moteur — contrairement à `math.golden.test.ts` plus haut, cette suite à
    // trois moteurs n'a rien à y gagner, Node seul suffit à l'attraper. Et de
    // toute façon `vi.mock` (sur `../step`, `../upgrades/offer`) n'y est pas
    // intercepté sous ce lanceur — mesuré et confirmé indépendamment, ses six
    // assertions échouent silencieusement en Chromium. Aucune perte de
    // portabilité prouvée : `run.test.ts` et `run.reset.test.ts`, qui n'ont
    // besoin d'aucun mock, couvrent ce qui, dans le même fichier, EST
    // numérique (la coïncidence existe réellement, la remise à zéro d'un
    // compteur bitECS), et tournent donc dans les trois moteurs.
    exclude: [
      '**/node_modules/**',
      'sim/purity.test.ts',
      'sim/version.test.ts',
      'sim/replay/run.mocked.test.ts',
    ],
    // `name` et non `instances` : le champ `instances` n'existe qu'à partir de
    // Vitest 3, et le dépôt est en 2.1.9. Monter le lanceur de tests d'une
    // version majeure au travers de 719 tests pour gagner du sucre de
    // configuration ne se justifie pas — un moteur par invocation, surchargé en
    // ligne de commande, fait le même travail sans rien risquer.
    browser: { enabled: true, provider: 'playwright', headless: true, name: 'chromium' },
  },
})
