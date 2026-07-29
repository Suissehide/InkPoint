import { applyJuice, createJuiceState, timeScaleFor } from '@/app/juice'
import { createKeyboard } from '@/app/keyboard'
import { createFixedLoop } from '@/app/loop'
import { createStage } from '@/render/stage'
import { spawnPlayer } from '@/sim/spawn'
import { stepWorld } from '@/sim/step'
import { createRunStats } from '@/sim/upgrades/stats'
import { createWorld, FIXED_DT } from '@/sim/world'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) {
  throw new Error('#game canvas introuvable')
}

const world = createWorld({
  seed: Math.floor(Math.random() * 2 ** 31),
  width: window.innerWidth,
  height: window.innerHeight,
})
spawnPlayer(world)

const stats = createRunStats()
const stage = await createStage(canvas)
const keyboard = createKeyboard()
const juice = createJuiceState()
// Interrupteur unique pour filtres + secousse/particules : une future option
// « mouvement réduit » n'aura qu'à le mettre à `false` plutôt que de retoucher
// deux systèmes séparément.
const effectsEnabled = true

const loop = createFixedLoop({
  onStep: () => {
    keyboard.writeInto(world.input)
    // Le hitstop/ralenti de mort agit sur `world.timeScale`, jamais sur le
    // rendu : la simulation s'étire, l'image reste fluide (spec §3.8).
    world.timeScale = timeScaleFor(juice, FIXED_DT)
    stepWorld(world, stats)
    applyJuice(world, juice, {
      camera: stage.camera,
      particles: stage.particles,
      enabled: effectsEnabled,
    })
  },
  onRender: (alpha) => stage.sync(world, alpha),
})

let last = performance.now()
const frame = (now: number): void => {
  loop.advance(now - last)
  last = now
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

window.addEventListener('resize', () => {
  world.arena.width = window.innerWidth
  world.arena.height = window.innerHeight
  stage.resize(window.innerWidth, window.innerHeight)
})
