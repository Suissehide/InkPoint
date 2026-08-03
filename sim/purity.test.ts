import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SIM_DIR = new URL('.', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      // `scripts/` n'est pas embarqué dans la simulation : c'est de
      // l'outillage de développement.
      return entry.name === 'scripts' ? [] : sourceFiles(path)
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      return []
    }
    // Seule exemption : le module qui existe précisément pour que personne
    // d'autre n'ait à approcher les transcendants.
    if (entry.name === 'math.ts') {
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
      // `audio` au même rang que les trois autres : c'est un quatrième calque
      // de sortie, il lit la simulation et ne doit jamais en être lu.
      pattern: /['"][^'"]*\/(render|ui|app|audio)\//,
      name: 'import de render/ui/app/audio',
      use: 'rien — la simulation ne connaît personne',
    },
    {
      pattern:
        /Math\s*(\.\s*|\[\s*['"])(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh|expm1|log1p|fround)\b/,
      name: 'transcendant de Math',
      use: 'sim/math.ts',
    },
    {
      // Le motif ci-dessus ne voit que `Math.` et `Math[` : la déstructuration
      // (`const { sin } = Math`) n'a ni l'un ni l'autre et lui échappait —
      // découvert en testant la forme, pas en la supposant correcte.
      pattern:
        /\{[^}]*\b(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh|expm1|log1p|fround)\b[^}]*\}\s*=\s*Math/,
      name: 'déstructuration de transcendant de Math',
      use: 'sim/math.ts',
    },
    {
      // Espaces obligatoires des deux côtés : l'opérateur formaté par Biome
      // s'écrit toujours `a ** b`, jamais collé. Ça exclut à la fois l'ouverture
      // JSDoc `/**` (jamais précédée d'un espace) et le gras Markdown des
      // commentaires (`**mot**`, jamais espacé à l'intérieur des astérisques) —
      // les deux fourmillent dans ce dossier et un `/\*\*/` nu les attrape tous.
      pattern: /(?<=\s)\*\*(?=\s)/,
      name: "l'opérateur d'exponentiation",
      use: 'une multiplication, ou sim/math.ts — `**` est défini comme `Math.pow`, donc approximé par le moteur',
    },
  ]

  it('trouve bien des fichiers à analyser', () => {
    expect(sourceFiles(SIM_DIR).length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('aucun $name dans sim/', ({ pattern, name, use }) => {
    const offenders = sourceFiles(SIM_DIR).filter((file) =>
      pattern.test(readFileSync(file, 'utf8')),
    )
    expect(offenders, `${name} interdit dans sim/ — utiliser ${use} à la place`).toEqual([])
  })
})
