# Knowledge Base — Nikczemny Krzemuch / RPGon

Detailed knowledge files for the AI RPG game project. AGENTS.md has a routing index — read the relevant file before working on a subsystem.

## Concepts
- [[concepts/frontend-structure]] — Full frontend file inventory (contexts, stores, hooks, services, components)
- [[concepts/backend-structure]] — Full backend file inventory (routes, services, shared/) — **updated session 6** after the 4 monolith splits
- [[concepts/game-context]] — Zustand facade architecture, selectors API, getGameState() pattern
- [[concepts/context-migration-plan]] — Context -> Zustand migration plan (Modal/Music -> Zustand, Settings/Multiplayer stay)
- [[concepts/bestiary]] — 36 units, 11 races, encounter budget system, fast-path combat
- [[concepts/model-tiering]] — ai/ submodule structure (models.js, providers.js, service.js)
- [[concepts/frontend-refactor-2026-04]] — God-component decomposition: 6 components before/after, 10 PRs, 13 extracted hooks
- [[concepts/frontend-refactor-regressions]] — Manual test watchlist + open questions for future sessions

## Patterns
- [[patterns/reducer-context]] — Zustand facade + granular selectors pattern
- [[patterns/component-decomposition]] — 5-step pure-lift refactoring ladder for god-components (frontend)
- [[patterns/backend-monolith-split]] — Thin facade + submodule folder split (backend) — applied 4× in session 6
- [[patterns/backend-proxy]] — SSE endpoints, callBackendStream() pattern
- [[patterns/prerolled-dice-fallback]] — Pre-rolled d50 fallback: max 3 rolls/scene, thresholds

## Decisions
- [[decisions/embeddings-native-driver]] — Why native MongoDB driver required (BSON arrays for Atlas)
- [[decisions/currency-three-tier-pl]] — 3 denominations + exchange rates
- [[decisions/titles-from-achievements]] — 12 example achievement titles with rarity + conditions
