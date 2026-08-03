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

const raw = readFileSync(path)
// Le navigateur gzippe avant d'écrire ; un fichier non compressé reste accepté,
// pour qu'un replay fabriqué à la main soit rejouable sans cérémonie.
const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw

const replay = decodeReplay(new Uint8Array(bytes))
const result = replayRun(replay)

console.log(`graine        ${replay.seed}`)
console.log(`version sim   ${replay.simVersion}`)
console.log(`pas           ${result.steps}`)
console.log(`cartes        ${replay.choices.length}`)
console.log(`vague         ${result.wave}`)
console.log(`vivant        ${result.alive ? 'oui' : 'non'}`)
console.log(`score         ${result.score}`)
