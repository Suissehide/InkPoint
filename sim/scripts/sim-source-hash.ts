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
 *
 * Ce choix conservateur ne suffit pourtant pas seul : `sim/` ne hache que ses
 * propres fichiers, alors que l'allocation des `eid`, le seuil de recyclage et
 * l'ordre d'itération des requêtes vivent dans `bitecs`, dépendance déclarée en
 * gamme (`^0.3.40`, package.json). Un `npm update` vers 0.3.41 change donc la
 * simulation sans toucher un octet de `sim/` : l'empreinte des sources resterait
 * identique, `SIM_VERSION` ne bougerait pas, et un replay enregistré avant la
 * mise à jour se rejouerait sous un `bitecs` différent en se croyant compatible.
 * D'où la version RÉSOLUE de `bitecs` dans le hachage, lue depuis le
 * `package-lock.json` racine plutôt que depuis `node_modules/bitecs/package.json` :
 * le lockfile est commité, donc reproductible depuis git seul par quiconque
 * régénère `SIM_VERSION`, alors que `node_modules` ne l'est pas et peut être
 * absent, désynchronisé ou reconstitué autrement (hoisting du workspace) sans
 * qu'aucune trace n'en reste dans l'historique.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const SIM_DIR = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Version résolue de `bitecs` telle que fixée par `package-lock.json` — pas la
 * gamme `^0.3.40` de `package.json`, qui ne bouge pas quand `npm update`
 * installe un correctif dans cette gamme. La version se lit dans le format
 * `packages` (lockfileVersion 3), où une installation hoistée à la racine du
 * workspace apparaît sous `node_modules/bitecs`. On énumère les entrées au
 * lieu d'en lire une seule, et on exige qu'il y en ait exactement une : voir
 * le commentaire du corps.
 */
function resolvedBitecsVersion(): string {
  const lockfile = JSON.parse(readFileSync(join(REPO_ROOT, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, { version?: string }>
  }
  // On énumère au lieu de lire une clé fixe : le jour où `front` et `back`
  // déclareraient deux gammes différentes, npm garderait l'une à la racine et
  // nicherait l'autre dans `front/node_modules/bitecs`. La lecture directe
  // réussirait alors — en hachant la version que l'un des deux paquets
  // n'exécute pas, silencieusement. C'est exactement la panne muette que cette
  // empreinte existe pour empêcher, donc l'ambiguïté doit être aussi bruyante
  // que l'absence.
  const entries = Object.entries(lockfile.packages ?? {}).filter(([path]) =>
    /(?:^|\/)node_modules\/bitecs$/.test(path),
  )
  if (entries.length === 0) {
    throw new Error(
      "package-lock.json ne référence aucune entrée 'node_modules/bitecs' — " +
        'lockfile désynchronisé ou dépendance renommée',
    )
  }
  if (entries.length > 1) {
    throw new Error(
      `package-lock.json référence ${entries.length} installations de bitecs ` +
        `(${entries.map(([path]) => path).join(', ')}) — ` +
        "l'empreinte ne peut pas désigner laquelle la simulation exécute : " +
        'aligner les gammes déclarées par les paquets du workspace',
    )
  }
  const version = entries[0]?.[1].version
  if (version === undefined) {
    throw new Error(`l'entrée '${entries[0]?.[0]}' de package-lock.json ne porte pas de version`)
  }
  return version
}

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
  // En tête, avant les fichiers : une dépendance dont la version résolue
  // change la simulation (allocation des `eid`, seuil de recyclage, ordre
  // d'itération des requêtes — voir la docstring en tête de ce fichier) fait
  // partie de ce que cette empreinte doit couvrir, au même titre qu'un fichier
  // de `sim/`.
  hash.update('bitecs')
  hash.update('\0')
  hash.update(resolvedBitecsVersion())
  hash.update('\0')
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
