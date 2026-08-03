import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Rejoue la simulation dans trois moteurs JavaScript distincts.
 *
 * `math.test.ts` vérifie que l'arithmétique est juste, à une tolérance près.
 * Cette suite-ci vérifie qu'elle est *identique partout*, au bit près : c'est
 * la condition pour qu'un serveur Node puisse rejouer la partie d'un joueur
 * et recalculer son score sans rejeter un innocent.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
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
    include: ['sim/**/*.test.ts'],
    // `purity.test.ts` seul est exclu : il parcourt le disque avec `node:fs`,
    // qui n'existe pas dans un navigateur. C'est de l'outillage sur les sources,
    // pas du comportement de simulation — rien à prouver côté portabilité.
    exclude: ['**/node_modules/**', 'sim/purity.test.ts'],
    // `name` et non `instances` : le champ `instances` n'existe qu'à partir de
    // Vitest 3, et le dépôt est en 2.1.9. Monter le lanceur de tests d'une
    // version majeure au travers de 719 tests pour gagner du sucre de
    // configuration ne se justifie pas — un moteur par invocation, surchargé en
    // ligne de commande, fait le même travail sans rien risquer.
    browser: { enabled: true, provider: 'playwright', headless: true, name: 'chromium' },
  },
})
