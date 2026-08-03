/**
 * Calcule l'empreinte des sources de `sim/` et l'écrit dans
 * `sim/version.generated.ts`. Depuis `front/` : `npm run version:sim`.
 *
 * Cette empreinte identifie la version de simulation qu'un replay suppose. Elle
 * est **gravée au build** parce qu'un navigateur ne peut pas lire les fichiers de
 * `sim/` alors que Node peut : la calculer à l'exécution ferait porter aux deux
 * côtés des valeurs différentes dès qu'un build est périmé.
 *
 * Choix conservateur assumé : *toute* modification de `sim/` change l'empreinte,
 * y compris un commentaire. Une invalidation inutile n'a jamais fait calculer un
 * score faux ; l'inverse, si.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const SIM_DIR = fileURLToPath(new URL('..', import.meta.url))

/**
 * Les fichiers dont le contenu décide du comportement d'un rejeu. Sont exclus :
 * les tests (ils n'entrent pas dans une run), `scripts/` (outillage), et
 * `version.generated.ts` lui-même — l'inclure rendrait l'empreinte impossible à
 * calculer, puisqu'elle dépendrait de sa propre valeur.
 */
function sourceFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) {
        return entry.name === 'scripts' ? [] : sourceFiles(join(dir, entry.name), rel)
      }
      if (!entry.name.endsWith('.ts')) {
        return []
      }
      if (entry.name.endsWith('.test.ts')) {
        return []
      }
      if (rel === 'version.generated.ts') {
        return []
      }
      return [rel]
    })
    .sort()
}

export function simSourceHash(): string {
  const hash = createHash('sha256')
  for (const rel of sourceFiles(SIM_DIR)) {
    // Le chemin entre dans le hachage : renommer un fichier sans toucher son
    // contenu change bel et bien la simulation qu'on rejoue.
    hash.update(rel)
    hash.update('\0')
    hash.update(readFileSync(join(SIM_DIR, rel)))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}
