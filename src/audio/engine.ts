import { volumeFor } from './curves'

export interface VoiceSpec {
  source: 'tone' | 'noise'
  /** Hz au début de l'enveloppe. */
  freq: number
  /** Hz à la fin ; égal à `freq` pour une note tenue. */
  freqEnd?: number
  durationMs: number
  /** 0–1, avant application du volume maître. */
  gain: number
  /** Coupe-bas du bruit filtré, en Hz. Ignoré pour `source: 'tone'`. */
  filterHz?: number
  /** Retard avant déclenchement, en ms. Sert aux sons à deux temps. */
  delayMs?: number
}

export interface AudioEngine {
  /** Reprend le contexte suspendu. Idempotent. */
  unlock(): void
  /** `sfxVolume` tel que persisté : 0 à 100. */
  setVolume(sfxVolume: number): void
  play(spec: VoiceSpec): void
  destroy(): void
}

/** Durée du bruit blanc réutilisé pour toutes les voix `noise`. */
const NOISE_SECONDS = 1

/**
 * Moteur de sons synthétisés. Aucun échantillon : tout est généré par
 * WebAudio, donc rien à produire, à licencier ni à télécharger, et chaque son
 * se règle par un chiffre — comme le reste de l'équilibrage du jeu.
 *
 * Ce module est un calque de sortie au même rang que `src/render/` : il ne
 * connaît que des `VoiceSpec` et n'accède jamais au monde de simulation.
 */
export function createAudioEngine(): AudioEngine {
  // `webkitAudioContext` pour Safari : le typage DOM ne le connaît pas.
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    // Navigateur sans WebAudio : moteur inerte plutôt qu'une exception qui
    // empêcherait le jeu de démarrer.
    return {
      unlock: () => {
        // Pas de contexte : rien à reprendre.
      },
      setVolume: () => {
        // Pas de contexte : rien à régler.
      },
      play: () => {
        // Pas de contexte : rien à jouer.
      },
      destroy: () => {
        // Pas de contexte : rien à fermer.
      },
    }
  }

  const ctx = new Ctor()
  const master = ctx.createGain()
  master.connect(ctx.destination)

  // Un seul tampon de bruit, réutilisé : en allouer un par voix ferait
  // travailler le ramasse-miettes pendant les gros combos.
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate)
  const channel = noiseBuffer.getChannelData(0)
  for (let i = 0; i < channel.length; i++) {
    channel[i] = Math.random() * 2 - 1
  }

  return {
    unlock(): void {
      if (ctx.state === 'suspended') {
        void ctx.resume()
      }
    },

    setVolume(sfxVolume): void {
      master.gain.value = volumeFor(sfxVolume)
    },

    play(spec): void {
      if (ctx.state !== 'running' || master.gain.value === 0) {
        return
      }
      const start = ctx.currentTime + (spec.delayMs ?? 0) / 1000
      const end = start + spec.durationMs / 1000

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, start)
      // Attaque très courte plutôt qu'instantanée : un saut de gain produit
      // un clic audible.
      gain.gain.linearRampToValueAtTime(spec.gain, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      gain.connect(master)

      if (spec.source === 'noise') {
        const src = ctx.createBufferSource()
        src.buffer = noiseBuffer
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.setValueAtTime(spec.filterHz ?? spec.freq, start)
        src.connect(filter)
        filter.connect(gain)
        src.start(start)
        src.stop(end)
      } else {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(spec.freq, start)
        if (spec.freqEnd !== undefined && spec.freqEnd !== spec.freq) {
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), end)
        }
        osc.connect(gain)
        osc.start(start)
        osc.stop(end)
      }
    },

    destroy(): void {
      void ctx.close()
    },
  }
}
