import { createKeyboard } from '@/app/keyboard'
import { createFixedLoop } from '@/app/loop'
import { createStage } from '@/render/stage'
import { spawnPlayer } from '@/sim/spawn'
import { stepWorld } from '@/sim/step'
import { createRunStats } from '@/sim/upgrades/stats'
import { createWorld } from '@/sim/world'

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

const loop = createFixedLoop({
  onStep: () => {
    keyboard.writeInto(world.input)
    stepWorld(world, stats)
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
