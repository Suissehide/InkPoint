import { encodeReplay, type Replay } from '@sim/replay/format'

/**
 * Le pont entre le jeu et le service de classement : encode un `Replay`,
 * le gzippe avec l'API du navigateur, le poste, et lit la réponse.
 *
 * Aucun chemin ne lève. Le jeu reste jouable hors ligne (spec §8) : une
 * publication qui échoue doit dégrader vers une valeur que l'UI peut rendre,
 * jamais remonter en exception jusqu'à la boucle de jeu à pas fixe. C'est ce
 * qui rend `submitRun`/`fetchLeaderboard` sûrs à appeler depuis n'importe où
 * dans l'écran de fin ou le menu, sans `try/catch` côté appelant.
 *
 * Ce module ne connaît pas le DOM — c'est ce qui le rend testable sans page
 * de navigateur, et ce qui sépare sa responsabilité de celle du panneau
 * (tâche 6), qui lui ne connaît pas `fetch`.
 */

/** Base de l'API. En développement, le sous-domaine n'existe pas. */
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Une ligne du classement, telle que rendue par `GET /leaderboard`. */
export interface LeaderboardEntry {
  rank: number
  nickname: string
  score: number
  wave: number
  arenaId: number
  createdAt: string
}

export type SubmitOutcome =
  | { ok: true; score: number; rank: number; total: number; improved: boolean }
  | { ok: false; reason: string; message: string }

/** Le corps d'erreur uniforme que renvoie le serveur (voir `back/src/server.ts`). */
interface ErrorBody {
  reason: string
  message: string
}

/**
 * `Replay` → gzip → base64, avec l'API du navigateur.
 *
 * Exportée uniquement pour `leaderboard-client.browser.test.ts` : c'est le
 * seul chemin de ce module qui touche une API que Node ne peut pas garantir
 * identique à un vrai navigateur, donc le seul qui mérite d'être rejoué dans
 * les trois moteurs plutôt que testé une fois sous Node avec `fetch` mocké.
 */
export async function toBase64(replay: Replay): Promise<string> {
  const bytes = encodeReplay(replay)
  // `CompressionStream` est l'équivalent navigateur de `node:zlib` : le flux
  // gzip diffère, mais le `.bin` décompressé est identique — et c'est lui que
  // le serveur hache et rejoue.
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  const gz = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (const byte of gz) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/**
 * Publie une partie. Ne lève jamais : un refus métier (`stale_build`,
 * `too_long`…), une erreur réseau, ou une réponse qui ne se parse pas en
 * JSON deviennent tous un `{ ok: false, reason, message }` — au même titre
 * qu'un vrai refus du serveur, pour que l'écran de fin n'ait qu'une seule
 * forme à afficher.
 */
export async function submitRun(nickname: string, replay: Replay): Promise<SubmitOutcome> {
  try {
    const body = JSON.stringify({ nickname, replay: await toBase64(replay) })
    const response = await fetch(`${API}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    if (response.status === 201) {
      const data = (await response.json()) as {
        score: number
        rank: number
        total: number
        improved: boolean
      }
      return { ok: true, ...data }
    }
    const error = (await response.json()) as ErrorBody
    return { ok: false, reason: error.reason, message: error.message }
  } catch {
    // `fetch` qui rejette (réseau coupé, DNS, CORS…), ou une réponse dont le
    // JSON ne se parse pas : même issue, parce que le joueur ne peut rien
    // distinguer de l'un ou de l'autre depuis l'écran de fin.
    return { ok: false, reason: 'offline', message: 'service de classement injoignable' }
  }
}

/**
 * Charge le classement. Rend `null` sur tout échec réseau — et n'a pas
 * d'autre chemin d'erreur : un classement qu'on n'a pas pu charger n'est pas
 * une faute du joueur, donc il n'y a pas de `reason` à lui montrer.
 */
export async function fetchLeaderboard(
  nickname: string | null,
): Promise<{ top: LeaderboardEntry[]; you?: LeaderboardEntry } | null> {
  try {
    const query = nickname === null ? '' : `?nickname=${encodeURIComponent(nickname)}`
    const response = await fetch(`${API}/leaderboard${query}`)
    if (!response.ok) {
      return null
    }
    return (await response.json()) as { top: LeaderboardEntry[]; you?: LeaderboardEntry }
  } catch {
    return null
  }
}
