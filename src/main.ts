import { startGame } from '@/app/game'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) {
  throw new Error('#game canvas introuvable')
}

const uiRoot = document.querySelector<HTMLElement>('#ui')
if (!uiRoot) {
  throw new Error('#ui introuvable')
}

// Surtout pas `await startGame(...)` au niveau module. Le top-level await
// bloquait l'évaluation de ce module tant que le démarrage n'était pas fini —
// or `startGame` attend `createStage`, qui attend `app.init()` de Pixi, qui
// charge dynamiquement son moteur de rendu (chunks `WebGLRenderer` /
// `WebGPURenderer`). En développement, chaque module est servi séparément et le
// graphe se résout ; dans le bundle de production, ce chunk ne pouvait plus
// s'évaluer pendant que l'entrée l'attendait, et la page restait figée pour
// toujours : canvas jamais initialisé, aucun écran créé, et surtout AUCUNE
// erreur en console — un échec parfaitement muet, reproduit puis levé en
// retirant ce seul `await`.
//
// Le `.catch` n'est pas décoratif : sans lui, toute erreur de démarrage
// redeviendrait invisible, ce qui est exactement ce qui a rendu ce bug si long
// à cerner.
startGame({ canvas, uiRoot }).catch((error: unknown) => {
  console.error('[InkPoint] le démarrage a échoué', error)
})
