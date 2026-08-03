import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// `.pathname` casse sur un chemin à caractères pourcent-encodés ; `fileURLToPath`
// est déjà l'usage du dépôt dans les deux configs Vitest.
const SIM_DIR = fileURLToPath(new URL('.', import.meta.url))

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
      //
      // Ancré sur `from`/`import` (y compris l'appel `import(...)` dynamique,
      // qui échappe à `noRestrictedImports`) et non sur un guillemet nu : une
      // apostrophe française (`l'historique`, `d'une`) est un guillemet droit
      // aux yeux d'un motif non ancré, et tout commentaire mentionnant un de
      // ces dossiers — dans un dépôt où chaque commentaire est en français —
      // finissait par se faire accuser à tort. `sim/` n'a lui-même aucun
      // sous-dossier `render`/`ui`/`app`/`audio`, donc rien ici ne peut
      // légitimement matcher.
      pattern: /(?:from|import)\s*\(?\s*['"][^'"]*\/(render|ui|app|audio)\//,
      name: 'import de render/ui/app/audio',
      use: 'rien — la simulation ne connaît personne',
    },
    {
      pattern:
        /Math\s*(\.\s*|\[\s*['"])(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh|asinh|acosh|atanh|expm1|log1p|fround)\b/,
      name: 'transcendant de Math',
      use: 'sim/math.ts',
    },
    {
      // Le motif ci-dessus ne voit que `Math.` et `Math[` : la déstructuration
      // (`const { sin } = Math`) n'a ni l'un ni l'autre et lui échappait —
      // découvert en testant la forme, pas en la supposant correcte.
      pattern:
        /\{[^}]*\b(sin|cos|tan|asin|acos|atan|atan2|exp|log|log2|log10|pow|hypot|cbrt|sinh|cosh|tanh|asinh|acosh|atanh|expm1|log1p|fround)\b[^}]*\}\s*=\s*Math/,
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

/**
 * `sim/math.ts` est exempté ci-dessus du filet textuel général : son en-tête
 * nomme légitimement `Math.sin` et consorts en prose française, ce que les
 * motifs FORBIDDEN — qui ne distinguent pas le commentaire du code —
 * confondraient avec un appel réel. Cette exemption ne doit pas dire « aucune
 * règle » : c'est le seul fichier qui a le droit de toucher `Math`, donc le
 * seul dont la liste blanche mérite d'être vérifiée explicitement.
 */
describe('contrat de sim/math.ts', () => {
  // `floor` n'est plus appelé nulle part dans le fichier (seuls PI, sqrt,
  // round, abs et LOG2E le sont) : la liste blanche doit dire la même chose
  // que la prose du module, pas une version périmée.
  const ALLOWED_MATH_MEMBERS = ['sqrt', 'abs', 'round', 'PI', 'LOG2E']
  const MATH_FILE = join(SIM_DIR, 'math.ts')

  // Retire les commentaires de bloc et de ligne avant de scanner : sans ça, la
  // prose du fichier (« remplace Math.sin, cos, atan2, exp et hypot ») se
  // ferait passer pour du code et ferait rougir le test à tort.
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  }

  // Comme pour `Math.random` dans le filet général ci-dessus : un scan qui ne
  // voit que l'accès par point (`Math.sin`) a un angle mort sur l'accès par
  // crochets (`Math['sin']`), l'enchaînement optionnel (`Math?.sin`) et la
  // déstructuration (`const { sin } = Math`), qui n'ont pas de nœud `Math.x`
  // à intercepter. Les trois formes sont donc collectées séparément.
  function membersUsed(code: string): string[] {
    const dotOrOptional = [...code.matchAll(/\bMath\s*(?:\?\s*)?\.\s*(\w+)/g)].map(
      (m) => m[1] as string,
    )
    const bracket = [...code.matchAll(/\bMath\s*\[\s*['"](\w+)['"]\s*\]/g)].map(
      (m) => m[1] as string,
    )
    const destructured = [
      ...code.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*Math\b/g),
    ].flatMap((m) =>
      (m[1] as string)
        .split(',')
        .map((part) => part.trim().split(/[:=]/)[0]?.trim())
        .filter((name): name is string => Boolean(name)),
    )
    return [...dotOrOptional, ...bracket, ...destructured]
  }

  it("n'utilise que les membres de Math listés dans son propre contrat", () => {
    const code = stripComments(readFileSync(MATH_FILE, 'utf8'))
    const used = membersUsed(code)
    const offenders = used.filter((member) => !ALLOWED_MATH_MEMBERS.includes(member))
    expect(
      offenders,
      `Math.${offenders[0]} n'est pas dans la liste blanche de sim/math.ts ` +
        `(${ALLOWED_MATH_MEMBERS.join(', ')})`,
    ).toEqual([])
  })
})
