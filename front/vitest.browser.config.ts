import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Rejoue la simulation dans trois moteurs JavaScript distincts.
 *
 * `math.test.ts` vérifie que l'arithmétique est juste, à une tolérance près.
 * Ces deux fichiers-ci vérifient qu'elle est *identique partout*, au bit près :
 * c'est la condition pour qu'un serveur Node puisse rejouer la partie d'un
 * joueur et recalculer son score sans rejeter un innocent.
 *
 * Volontairement limité à deux fichiers : la suite complète n'a rien à faire
 * dans trois navigateurs, et ce job doit rester court.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['sim/math.golden.test.ts', 'sim/determinism.test.ts'],
    // `name` et non `instances` : le champ `instances` n'existe qu'à partir de
    // Vitest 3, et le dépôt est en 2.1.9. Monter le lanceur de tests d'une
    // version majeure au travers de 719 tests pour gagner du sucre de
    // configuration ne se justifie pas — un moteur par invocation, surchargé en
    // ligne de commande, fait le même travail sans rien risquer.
    browser: { enabled: true, provider: 'playwright', headless: true, name: 'chromium' },
  },
})
