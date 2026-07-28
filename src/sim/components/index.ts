import { defineComponent, Types } from 'bitecs'

export const Position = defineComponent({ x: Types.f32, y: Types.f32 })
/** Position au pas précédent — sert à l'interpolation du rendu. */
export const PrevPosition = defineComponent({ x: Types.f32, y: Types.f32 })
export const Velocity = defineComponent({ x: Types.f32, y: Types.f32 })
export const Movement = defineComponent({
  maxSpeed: Types.f32,
  accel: Types.f32,
  friction: Types.f32,
})
export const Collider = defineComponent({ radius: Types.f32 })
export const Facing = defineComponent({ angle: Types.f32 })
export const Player = defineComponent()
export const Enemy = defineComponent({ type: Types.ui8 })
export const Materializing = defineComponent({ remaining: Types.f32, total: Types.f32 })
export const Homing = defineComponent({ delayMs: Types.f32 })
/** 0 = approche, 1 = télégraphe (immobile), 2 = charge (trajectoire figée) */
export const Dasher = defineComponent({ state: Types.ui8, timer: Types.f32 })
/** Grâce temporaire (début de vague, Halo…) : ignore le contact mortel tant que remaining > 0. */
export const Invulnerable = defineComponent({ remaining: Types.f32 })
/** Marqué pour suppression : la mort est appliquée en une passe, à la fin du pas. */
export const Doomed = defineComponent()
export const Lifetime = defineComponent({ remaining: Types.f32 })
export const Halo = defineComponent()
