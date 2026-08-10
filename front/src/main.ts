import { startGame } from '@/app/game'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) {
  throw new Error('#game canvas introuvable')
}

const uiRoot = document.querySelector<HTMLElement>('#ui')
if (!uiRoot) {
  throw new Error('#ui introuvable')
}

const appRoot = document.querySelector<HTMLElement>('#app')
if (!appRoot) {
  throw new Error('#app introuvable')
}

// Jamais de top-level `await startGame(...)` : en production, ce module
// attendrait un chunk Pixi (WebGLRenderer/WebGPURenderer) qui ne peut
// s'évaluer tant qu'on l'attend — deadlock silencieux, aucune erreur console.
// Le `.catch` n'est pas décoratif : sans lui, une erreur de démarrage
// redevient invisible.
startGame({ canvas, uiRoot, appRoot })
  .then(() => {
    // L'écran d'attente d'`index.html` couvre le canvas : il doit disparaître
    // dès que le jeu est monté, sinon le menu reste caché derrière. Le retirer
    // du DOM plutôt que le masquer garde la promesse faite à l'indexation :
    // ce texte est celui que le joueur a vraiment vu, pas un bloc laissé là
    // pour les seuls robots.
    document.querySelector('#intro')?.remove()
  })
  .catch((error: unknown) => {
    // Pas de `.remove()` ici, volontairement : sur un démarrage raté, l'écran
    // d'attente reste la seule chose à l'écran, et il vaut mieux que le vide.
    console.error('[InkPoint] le démarrage a échoué', error)
  })
