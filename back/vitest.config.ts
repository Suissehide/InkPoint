import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Les tests d'intégration partagent une base : les faire tourner en
    // parallèle les ferait se marcher dessus sur la table `Run`.
    fileParallelism: false,
  },
})
