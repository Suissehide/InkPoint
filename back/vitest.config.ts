import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

// Les tests d'intégration ont besoin de `DATABASE_URL`, et personne ne devrait
// avoir à l'exporter à la main : on charge `back/.env` s'il existe. Chemin
// résolu depuis ce fichier et non depuis le cwd, pour que `npx vitest` lancé
// depuis la racine trouve quand même le fichier. Node ne remplace pas une
// variable déjà posée dans l'environnement — la CI, qui exporte `DATABASE_URL`
// sans créer de `.env`, garde la main.
const envFile = fileURLToPath(new URL('.env', import.meta.url))
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

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
