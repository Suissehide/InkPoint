import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SIM_DIR = new URL('.', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return sourceFiles(path)
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      return []
    }
    return [path]
  })
}

/**
 * Filet textuel derrière Biome. Il existe parce que les règles de lint travaillent
 * sur l'AST et ont des angles morts documentés :
 *   - Biome n'a aucun équivalent de `no-restricted-properties` → `Math.random()`
 *     et `Date.now()` ne sont interdits par rien d'autre que ce test ;
 *   - `noRestrictedImports` n'écoute pas les imports dynamiques `import(...)` ;
 *   - la déstructuration (`const { random } = Math`) et l'accès par crochets
 *     (`Math['random']`) n'ont pas de nœud `Math.random` à intercepter.
 * Un scan textuel ignore la forme syntaxique, donc il attrape tout cela.
 */
describe('pureté de la simulation', () => {
  const FORBIDDEN = [
    { pattern: /Math\s*\.\s*random\s*\(/, name: 'Math.random()', use: 'world.rng' },
    {
      pattern: /\{[^}]*\brandom\b[^}]*\}\s*=\s*Math/,
      name: 'déstructuration de Math.random',
      use: 'world.rng',
    },
    { pattern: /Math\s*\[\s*['"]random['"]\s*\]/, name: "Math['random']", use: 'world.rng' },
    { pattern: /\bDate\s*\.\s*now\s*\(/, name: 'Date.now()', use: 'world.time' },
    { pattern: /new\s+Date\s*\(/, name: 'new Date()', use: 'world.time' },
    {
      pattern: /\bglobalThis\s*\.\s*(window|document|performance|localStorage)\b/,
      name: 'globalThis.<api navigateur>',
      use: 'rien — la simulation ignore le navigateur',
    },
    {
      pattern: /['"]pixi\.js['"]/,
      name: 'référence à pixi.js',
      use: 'rien — le rendu vit dans src/render/',
    },
    {
      pattern: /['"][^'"]*\/(render|ui|app)\//,
      name: 'import de render/ui/app',
      use: 'rien — la simulation ne connaît personne',
    },
  ]

  it('trouve bien des fichiers à analyser', () => {
    expect(sourceFiles(SIM_DIR).length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('aucun $name dans src/sim/', ({ pattern, name, use }) => {
    const offenders = sourceFiles(SIM_DIR).filter((file) =>
      pattern.test(readFileSync(file, 'utf8')),
    )
    expect(offenders, `${name} interdit dans src/sim/ — utiliser ${use} à la place`).toEqual([])
  })
})
