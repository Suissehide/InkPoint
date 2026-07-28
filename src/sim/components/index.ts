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
