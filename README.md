# Ink Point

Dodge the ink. A roguelike survival game where you play a cursor, enemies
materialise out of the page, and your only weapons are the power-ups you pick up
along the way.

**Play:** https://inkpoint.qwetle.fr

## Controls

| Action          | Input                                                          |
| --------------- | -------------------------------------------------------------- |
| Move (mouse)    | The ink point chases your cursor — the default on desktop      |
| Move (keyboard) | `WASD` / `ZQSD` / Arrow keys                                   |
| Move (touch)    | Virtual joystick, bottom left — the default on a phone         |
| Power-ups       | None — they fire the instant you touch them                    |
| Pause           | `Esc`, or the target at the bottom right of the arena on touch |

Pick your movement device in Settings. Still fully playable with the keyboard
alone. Available in English and French.

**On a phone.** The game forces landscape: held in portrait, the whole display
rotates a quarter turn, which works even when the system rotation lock is on —
turn the phone and it lines up. Touch devices get a smaller arena (896×504
instead of 1280×720), which is what makes everything render larger while keeping
the entire play area on screen. Power-up ranges are scaled to match, so the
Freeze and the Dash still cover the same *fraction* of the arena as on desktop.
The difficulty is not identical to desktop, and deliberately so.

## Development

```bash
npm install         # from the repo root: installs both workspaces at once
cd front
npm run dev        # dev server
npm test           # unit tests
npm run lint       # biome check
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run test:browser  # replays the simulation in Chromium, Firefox and WebKit
npm run replay <file>   # replays a recorded run and recomputes its score
```

Husky + commitlint enforce Conventional Commits on every commit.

## Architecture

Three layers with hard boundaries:

- **`sim/`** — pure ECS simulation (bitECS). No Pixi, no DOM, no `Math.random()`, no
  real clock. Advances in fixed 16.67 ms steps. This purity is enforced by a Biome lint
  rule, and it is what makes the simulation deterministic — the prerequisite for the
  planned netcode. It is a shared source directory between the front and the future
  back, with no `package.json` of its own — the root `package.json`, which declares
  the npm workspaces, serves as its npm resolution root.
  Determinism is now guaranteed *across engines*, not only on one machine — the
  actual guarantee a leaderboard server needs to recompute a player's score
  from their replayed inputs without rejecting an honest run. `sim/math.ts` is
  what makes this possible: every operation it performs is IEEE-754-exact, with
  no engine-dependent rounding, and `sim/purity.test.ts` bans transcendental
  `Math.*` calls anywhere else in `sim/`. `sim/math.golden.test.ts` is what
  *proves* it — it pins the bit pattern of every value `sim/math.ts` produces,
  at zero tolerance, and `npm run test:browser` replays that fixture in
  Chromium, Firefox and WebKit. `sim/determinism.test.ts`'s reference-run
  digest, replayed the same way, is a different kind of evidence: a genuine
  refactor-characterisation test and a valuable three-engine end-to-end smoke
  test, but not proof about `sim/math.ts` — its fingerprint only observes
  `Types.f32` component fields plus `world.score` and `world.time`, none of
  which is downstream of a transcendental closely enough for a one-ULP
  engine divergence to survive into a stored bit. That cuts both ways: it also
  means the `f32` storage those components already use is a real safety
  margin for the leaderboard, not just a limitation of this test — a one-ULP
  client/server divergence cannot change a stored `f32`, so it cannot change a
  score. A run records itself as `{ seed, inputs, cards }`, replays with no
  screen attached, and the leaderboard server will recompute its score instead
  of trusting the one the client sends — `sim/replay/run.ts` is the code the
  server will run.
- **`front/src/render/`** — PixiJS v8 (WebGL). Reads the simulation, never writes to it.
  Custom GLSL filters produce the "boil" (the ink line trembling at 8 fps), film
  grain, and vignette.
- **`front/src/ui/`** — DOM screens styled with Tailwind, layered over the canvas.

Game content — enemies, power-ups, upgrade cards, formations, difficulty curve —
lives in `sim/data/` as typed definitions. Adding content does not touch a
single system.

`shared/` is a second directory in the same shape as `sim/` — no `package.json` of
its own, resolved through the `@shared/*` alias in both `front/tsconfig.json` and
`back/tsconfig.json` — but for a different reason: it holds types that describe the
shape of the leaderboard HTTP API (`shared/api-errors.ts`, the `reason` values
`POST /runs` can return) so that `front` and `back`, which build and deploy as two
separate Docker images that never see each other's source, can still share one
canonical definition and let `tsc --noEmit` catch a refusal reason added on one side
without a matching message on the other, at compile time rather than as a silent
generic error message in production.

## Deployment

Static site behind nginx (`front`), a Fastify leaderboard API (`back`), and
Postgres, routed by Traefik.

```bash
cp deploy/.env.example deploy/.env
docker compose -f deploy/compose.yaml up -d --build --remove-orphans
```

`deploy/.env` (not versioned) must carry:

| Variable | Purpose |
| --- | --- |
| `TRAEFIK_FRONT_HOST` | Hostname routed to `front` — renamed from `TRAEFIK_HOST`. |
| `TRAEFIK_API_HOST` | Hostname routed to `back`. |
| `POSTGRES_USER` | Postgres role used by `back`. |
| `POSTGRES_PASSWORD` | Postgres password for that role. |
| `POSTGRES_DB` | Database name. |

**`TRAEFIK_HOST` must be renamed to `TRAEFIK_FRONT_HOST` on the server's
`deploy/.env`.** If it isn't, the variable resolves to empty, Traefik receives
`Host()`, rejects the router, and the site returns a 404 — silently, with
every container reporting healthy.

`VITE_API_URL` (consumed by `front/src/app/leaderboard-client.ts`) is not set
directly in `deploy/.env` — `deploy/compose.yaml` and
`deploy/dokploy/docker-compose.dokploy.yml` pass it to `deploy/Dockerfile` as
a build `ARG`, derived from `TRAEFIK_API_HOST` above, so there is only one
hostname to keep correct. This matters because Vite inlines `VITE_*`
variables into the bundle **at build time**, not at container start: if this
build arg is ever missing — a manual `docker build` outside compose, a CI
step that drops build args — the shipped bundle falls back silently to
`http://localhost:3000`. On the HTTPS site every leaderboard request is then
blocked as mixed content: `submitRun` degrades to `offline`, the player reads
"check your connection" for what is actually a deploy misconfiguration, and
the menu leaderboard panel never leaves its error state.

## Known limitations

- Balance values in `sim/data/` are first-pass estimates; see
  `docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md` §11 for the open
  playtest questions. Two offensive power-ups (Quill Volley, Splatter) were added
  on 2026-08-02 without touching the difficulty curve — see
  `docs/superpowers/specs/2026-08-02-correctifs-decompte-et-deux-power-ups-design.md` §10.
- The UI font is Kalam rather than the 2021 prototype's `Ink Pen`, which turned out to
  have empty glyphs for digits, punctuation and every accented vowel — it could not
  render French at all. `Fh Ink` survives for the title only. Kalam has no tabular
  figure feature, so HUD numerals are wrapped in fixed-width boxes to stop the score
  jittering as it climbs.

## Roadmap

- **v2** — online leaderboard, persistent meta-progression (backend)
- **v3** — multiplayer netcode
