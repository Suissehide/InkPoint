# Ink Point

Dodge the ink. A keyboard-only roguelike survival game where you play a cursor,
enemies materialise out of the page, and your only weapons are the power-ups you
pick up along the way.

**Play:** https://inkpoint.qwetle.fr

## Controls

| Action | Keys |
|---|---|
| Move | `WASD` / `ZQSD` / Arrow keys |
| Power-ups | None — they fire the instant you touch them |
| Pause | `Esc` |

Fully playable with the keyboard alone. Available in English and French.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # unit tests
npm run lint       # biome check
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
```

Husky + commitlint enforce Conventional Commits on every commit.

## Architecture

Three layers with hard boundaries:

- **`src/sim/`** — pure ECS simulation (bitECS). No Pixi, no DOM, no `Math.random()`, no
  real clock. Advances in fixed 16.67 ms steps. This purity is enforced by a Biome lint
  rule, and it is what makes the simulation deterministic — the prerequisite for the
  planned netcode.
- **`src/render/`** — PixiJS v8 (WebGL). Reads the simulation, never writes to it.
  Custom GLSL filters produce the "boil" (the ink line trembling at 8 fps), film
  grain, and vignette.
- **`src/ui/`** — DOM screens styled with Tailwind, layered over the canvas.

Game content — enemies, power-ups, upgrade cards, formations, difficulty curve —
lives in `src/sim/data/` as typed definitions. Adding content does not touch a
single system.

## Deployment

Static site behind nginx, routed by Traefik.

```bash
cp deploy/.env.example deploy/.env
docker compose -f deploy/compose.yaml up -d --build
```

## Known limitations

- The Ink Trail power-up currently moves a single zone with the player rather than
  leaving a proper ageing wake. Pending a playtest pass.
- Balance values in `src/sim/data/` are first-pass estimates; see
  `docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md` §11 for the open
  playtest questions.
- The UI font is Kalam rather than the 2021 prototype's `Ink Pen`, which turned out to
  have empty glyphs for digits, punctuation and every accented vowel — it could not
  render French at all. `Fh Ink` survives for the title only. Kalam has no tabular
  figure feature, so HUD numerals are wrapped in fixed-width boxes to stop the score
  jittering as it climbs.

## Roadmap

- **v2** — online leaderboard, persistent meta-progression (backend)
- **v3** — multiplayer netcode
