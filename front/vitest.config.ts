import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['front/src/**/*.test.ts', 'sim/**/*.test.ts'],
    // `*.browser.test.ts` (voir `vitest.browser.config.ts`) reste ramassé par le premier
    // glob : jusqu'à la tâche 6 du lot 2, les deux fichiers qui portaient ce suffixe
    // (`leaderboard-client.browser.test.ts`, `replay-roundtrip.browser.test.ts`) n'appelaient
    // que des API que Node implémente aussi (`CompressionStream`, `atob`), donc tournaient ici
    // par coïncidence, en plus des trois moteurs réels. `leaderboard.browser.test.ts` construit
    // du vrai DOM (`document.createElement`, `scrollIntoView`) — que Node ne fournit pas — et
    // ferait sortir `npm test` en échec sans cette exclusion. Un glob, pas le nom du fichier
    // seul : la coïncidence qui faisait marcher les deux premiers ne tiendra pas pour le
    // prochain fichier `*.browser.test.ts` qui touchera au DOM, et une liste nommée l'oublierait
    // en silence — le suffixe dit déjà « ce fichier vit dans `vitest.browser.config.ts` », node
    // ne devrait jamais avoir eu à le deviner au cas par cas.
    exclude: ['**/node_modules/**', 'front/src/**/*.browser.test.ts'],
  },
})
