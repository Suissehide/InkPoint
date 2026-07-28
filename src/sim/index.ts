// Point d'entrée de la simulation ECS pure.
//
// Ce module est volontairement vide : `src/sim/rng.ts`, `src/sim/world.ts` et le
// reste de la logique de simulation arrivent dans une tâche ultérieure (Phase 1 —
// Simulation). Ce fichier existe pour que `purity.test.ts` ait au moins un fichier
// source réel à analyser — sans lui, son propre test de garde
// (« trouve bien des fichiers à analyser ») échouerait, puisque `src/sim/`
// ne contiendrait sinon que le test lui-même, qu'il exclut de son propre balayage.
export {}
