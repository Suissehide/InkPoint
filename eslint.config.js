import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    // La frontière dure de l'architecture : sim/ ne connaît personne.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', '@/render/*', '@/ui/*', '@/app/*'],
              message: 'src/sim/ doit rester pur : aucun import de rendu, UI ou app.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/sim/ ne touche pas au navigateur.' },
        { name: 'document', message: 'src/sim/ ne touche pas au navigateur.' },
        { name: 'performance', message: 'src/sim/ ne lit pas le temps réel.' },
        { name: 'localStorage', message: 'src/sim/ ne persiste rien.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Utiliser world.rng — le déterminisme est un prérequis du netcode v3.',
        },
        {
          object: 'Date',
          property: 'now',
          message: "La simulation avance par pas fixes, elle ne lit pas l'horloge.",
        },
      ],
    },
  },
)
