# Ink Point

A keyboard-only survival game: dodge the ink, trigger the right power-up at the right
moment, and last as long as you can against waves of pursuers.

> **Status: in active rebuild.** The 2021 prototype has been retired; the project is
> being rebuilt from scratch as a solo roguelike with an ECS simulation, PixiJS
> rendering, and GLSL shaders. See
> [`docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md`](docs/superpowers/specs/2026-07-28-inkpoint-rebuild-design.md)
> for the full design spec. Right now the repository holds the toolchain scaffolding
> only — no gameplay yet.

## Stack

- **TypeScript** (strict) + **Vite**
- **PixiJS v8** for rendering (WebGL/WebGPU), custom GLSL filters
- **bitECS** for the simulation, kept fully pure and browser-free (`src/sim/`)
- **Tailwind v4** for DOM-based menus and cards
- **Vitest** for tests, **ESLint** + **Prettier** for quality, **husky** + **commitlint**
  (Conventional Commits) for repo hygiene

## Getting started

```bash
npm install
npm run dev        # start the dev server
npm run typecheck   # tsc --noEmit
npm run lint         # eslint .
npm run test          # vitest run
npm run build          # typecheck + vite build
```

## Architecture in brief

`src/sim/` is a hard boundary: it contains no import of PixiJS, the DOM, or any
browser API, and is enforced by an ESLint rule (not just convention). It takes a
state, a fixed time step and player intents, and produces the next state — nothing
else. That purity is what makes the simulation deterministic and testable without a
browser, and what keeps the door open for netcode down the line.

See the design spec linked above for the full breakdown of gameplay, art direction,
and folder structure.
