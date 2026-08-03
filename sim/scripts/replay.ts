/**
 * Rejoue un fichier de replay et affiche le score recalculé.
 * Depuis `front/` : `npm run replay ../partie-123.bin`
 *
 * C'est le pendant en ligne de commande de ce que le worker de vérification
 * fera à l'étape 3 : `replayRun` est le même code, appelé au même endroit du
 * raisonnement — le score envoyé par un client n'est jamais cru.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

import { decodeReplay } from '../replay/format'
import { replayRun } from '../replay/run'

const path = process.argv[2]
if (path === undefined) {
  console.error('usage : npm run replay <fichier.bin>')
  process.exit(1)
}

/**
 * Plafond de la sortie décompressée. Ce fichier est le pendant CLI du worker
 * de vérification de l'étape 3 (voir sa docstring) — une limite qu'on
 * n'ajoute pas ici se retrouverait embarquée telle quelle côté serveur.
 * Sans elle, `gunzipSync` décompresse en confiance : 509 Ko de zéros
 * compressent déjà à un ratio qui, extrapolé, rend 500 Mo pour une entrée de
 * quelques centaines de kilo-octets. 16 Mo est large par rapport au format —
 * un run entier au format `sim/replay/format.ts` (`HEADER_BYTES` fixe, deux
 * octets par champ d'`InputState` et par pas) tiendrait dans quelques
 * centaines de kilo-octets même pour une partie de plusieurs dizaines de
 * minutes — et reste assez bas pour ne jamais laisser un fichier fabriqué
 * épuiser la mémoire du process qui le rejoue.
 */
const MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024

// Toute erreur d'ici (fichier absent, magie manquante, version de simulation
// périmée...) porte déjà un message clair depuis decodeReplay/replayRun ; sans
// ce filet, Node la fait remonter telle quelle avec cinq lignes de pile
// interne (ModuleJob.run et consorts) qui noient ce message pour qui lance la
// commande sans lire de source TypeScript — l'opérateur humain de l'étape 3,
// et demain le worker de vérification qui grandira de ce même fichier.
try {
  const raw = readFileSync(path)
  // Le navigateur gzippe avant d'écrire ; un fichier non compressé reste accepté,
  // pour qu'un replay fabriqué à la main soit rejouable sans cérémonie.
  const bytes =
    raw[0] === 0x1f && raw[1] === 0x8b
      ? gunzipSync(raw, { maxOutputLength: MAX_DECOMPRESSED_BYTES })
      : raw

  const replay = decodeReplay(new Uint8Array(bytes))
  // La CLI est un outil de développement, pas une porte ouverte sur le réseau :
  // le plafond y sert à ne pas faire tourner une machine indéfiniment sur un
  // fichier corrompu, pas à se défendre. Le service, lui, impose le sien.
  const result = replayRun(replay, { maxSteps: 72_000 })

  console.log(`graine        ${replay.seed}`)
  console.log(`version sim   ${replay.simVersion}`)
  console.log(`pas           ${result.steps}`)
  console.log(`cartes        ${replay.choices.length}`)
  console.log(`vague         ${result.wave}`)
  console.log(`vivant        ${result.alive ? 'oui' : 'non'}`)
  console.log(`score         ${result.score}`)
  // `result.score` est le flottant brut ; l'écran de fin affiche
  // Math.round(...). C'est cette seconde ligne qu'il faut comparer au nombre
  // lu à l'écran — comparer la première fait lire 30.583… contre 31 et croire
  // à une divergence qui n'existe pas.
  console.log(`score affiché ${Math.round(result.score)}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
