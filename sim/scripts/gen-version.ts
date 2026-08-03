/** Écrit `sim/version.generated.ts`. Depuis `front/` : `npm run version:sim`. */
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { simSourceHash } from './sim-source-hash'

const generated = `/**
 * Généré par sim/scripts/gen-version.ts — ne pas éditer à la main.
 * Régénérer avec \`npm run version:sim\` depuis front/, après toute modification
 * volontaire de sim/. La CI vérifie que ce fichier n'a pas dérivé.
 */
export const SIM_VERSION = '${simSourceHash()}'
`

const out = fileURLToPath(new URL('../version.generated.ts', import.meta.url))
writeFileSync(out, generated)
console.log(`écrit : ${out}`)
