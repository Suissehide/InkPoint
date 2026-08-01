/**
 * Nombre maximal de voix déclenchées par image. Vingt kills dans le même pas
 * ne doivent pas produire vingt sons superposés : au-delà, le mixage sature et
 * l'oreille ne distingue plus rien de toute façon.
 *
 * Bien par IMAGE, et non par pas de simulation : la boucle à pas fixe
 * (`app/loop.ts`) exécute jusqu'à `MAX_CATCHUP_MS / FIXED_DT` = 15 pas dans
 * une seule image au retour d'un onglet ou après un pic de latence, et
 * `ctx.currentTime` n'avance pas entre eux — quinze plafonds indépendants,
 * c'étaient 60 voix programmées au même instant. Le compteur vit donc hors
 * d'`applyAudio` (`createVoiceBudget`, apply.ts) et c'est `onRender`, une
 * fois par image, qui le remet à zéro.
 */
export const VOICE_CAP_PER_FRAME = 4

const KILL_PITCH_MIN = 220
const KILL_PITCH_MAX = 880
/** Multiplicateur de combo au-delà duquel la hauteur ne monte plus. */
const KILL_PITCH_TOP = 10

/**
 * Gain maître à partir du réglage persisté (0–100). Courbe carrée plutôt que
 * linéaire : l'oreille perçoit le volume à peu près logarithmiquement, une
 * rampe linéaire donne l'impression que tout se joue dans le dernier quart.
 */
export function volumeFor(sfxVolume: number): number {
  const v = Math.min(100, Math.max(0, sfxVolume)) / 100
  return v * v
}

/**
 * Hauteur d'un son de kill, en Hz. Monte avec le combo : le multiplicateur
 * s'entend avant de se lire, et redescend quand il retombe.
 */
export function killPitch(multiplier: number): number {
  const k = Math.min(1, Math.max(0, (multiplier - 1) / (KILL_PITCH_TOP - 1)))
  return KILL_PITCH_MIN + (KILL_PITCH_MAX - KILL_PITCH_MIN) * k
}

/** Combien de voix on peut encore déclencher dans l'image courante. */
export function allowedVoices(requested: number, alreadyPlayed: number, cap: number): number {
  return Math.max(0, Math.min(requested, cap - alreadyPlayed))
}
