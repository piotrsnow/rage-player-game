# Frontend Patterns — RPGon / Nikczemny Krzemuch

Project-specific patterns distilled from the actual codebase. Overrides generic React advice where our decisions differ.

## Stack

- React 18, Vite 6, plain JavaScript (no TypeScript)
- Tailwind CSS (dark theme, glassmorphism)
- React Three Fiber (3D scenes)
- i18next (single PL namespace, lazy load not needed)
- Zod 4 (AI response validation at system boundaries)
- Vitest + Playwright
- No React Query (campaign is owned doc, not request/response)
- No react-hook-form (minimal forms)

---

## Architecture — Dependency Direction

```
Components (pure UI)
  → Hooks (business logic, state wiring)
    → Services (async ops, AI calls, engines)
      → Data (rpgSystem, rpgMagic, rpgFactions)
```

Never reverse. Components never call services directly — always through hooks.

---

## State Management

### Hierarchy

1. **Local state** (`useState`) — default for UI-only state
2. **Derived state** — compute from existing state, don't store
3. **Game state** — `useReducer` in `GameContext` with Zustand facade (`stores/gameStore.js`)
4. **Settings** — `SettingsContext` (persisted to localStorage)

### Zustand Facade Pattern

`useGame()` returns `{ state, dispatch, autoSave }` — backward-compat facade over Zustand. New code should use granular selectors:

```js
// Preferred — subscribes only to what's needed
const combat = useGameSlice(s => s.combat);
const dispatch = useGameDispatch();

// Legacy — subscribes to everything (re-renders on any change)
const { state, dispatch } = useGame();
```

For one-shot full-state reads in handlers (not subscriptions): `getGameState()` from `stores/gameStore.js`.

### Immer Reducer Pattern

`stores/gameReducer.js` (59L) is a thin dispatcher. Domain handlers in `stores/handlers/*.js` export action→fn maps. Handlers mutate Immer draft directly OR return new state for full transitions (START_CAMPAIGN, LOAD_CAMPAIGN, RESET). Never both.

```js
// stores/handlers/combatHandler.js
export const combatHandlers = {
  START_COMBAT: (draft, payload) => { draft.combat = { active: true, ...payload }; },
  END_COMBAT: (draft) => { draft.combat = { active: false }; },
};
```

---

## Hook Patterns

### useEvent — Stable Callback Polyfill

`src/hooks/useEvent.js` — always invokes the latest function without causing dep-list churn. Use for effect bodies and timer callbacks where you need fresh closure but stable reference:

```js
import { useEvent } from '../hooks/useEvent';

const handleTick = useEvent(() => {
  // always reads latest state/props — no stale closure
  doSomething(currentValue);
});

useEffect(() => {
  const id = setInterval(handleTick, 1000);
  return () => clearInterval(id);
}, [handleTick]); // stable, never changes
```

Replaces the manual ref-sync pattern (`const ref = useRef(fn); ref.current = fn;`). All combat hooks use this.

### Hook Extraction Criteria

Extract a hook when it has **own state/refs + own effect lifecycle**. If it's just a processing function called in sequence, keep it as a plain function — not every logical stage needs to be a hook.

Example from `sceneGeneration/`:
- `useSceneBackendStream` — **hook** (owns 5 refs + 3 state variables for streaming)
- `processSceneDialogue` — **plain function** (pure pipeline, no state)
- `applySceneStateChanges` — **plain function** (dispatches but no own state)

### No eslint-disable for exhaustive-deps

If you need to omit deps, you have a stale-closure bug waiting. Use `useEvent` for callbacks, `getGameState()` for one-shot reads.

---

## Service Module Patterns

### Barrel Re-exports

When a service grows past ~500L, split into focused files in a directory with `index.js` barrel:

```
src/services/ai/
  index.js       — re-exports public API
  models.js      — AI_MODELS, selectModel
  providers.js   — callAI, provider fallback
  service.js     — aiService object (8 methods)
  suggestedActions.js — post-processing
```

Consumer imports from the barrel: `import { aiService } from '../services/ai';`

### Engine Services

`*Engine.js` files contain deterministic game mechanics (no AI, no network). Pure functions with game state in, game state out. Examples: `combatEngine.js`, `magicEngine.js`, `weatherEngine.js`.

Deterministic mechanics separated in `src/services/mechanics/` — `skillCheck.js`, `momentumTracker.js`, `restRecovery.js`, `combatIntent.js`.

### Backend Streaming (callBackendStream)

`src/services/aiStream.js` — shared async function for SSE consumption with partial JSON parsing. Not a hook — AI flows are never concurrent.

```js
const result = await callBackendStream('/ai/generate-campaign', body, {
  onChunk(text) { /* raw text */ },
  onPartialJson(partial) { /* progressively repaired JSON */ },
  schema: CampaignResponseSchema, // optional final validation
});
```

---

## Component Patterns

### Pure Components

Components should be pure render functions. No side effects in render. No data fetching. No service calls.

```jsx
// Good — pure
export default function SceneCard({ narrative, image, actions }) {
  return <div>...</div>;
}

// Bad — side effect in render
export default function SceneCard({ id }) {
  const data = fetchScene(id); // never do this
}
```

### No Static Method Leaks

Never attach instance callbacks to function-component statics:
```js
// Anti-pattern — breaks with HMR, multiple instances, co-host MP
CombatPanel.resolveRemoteManoeuvre = handleResolve;

// Correct — dedicated hook reads context internally
useCombatHostResolve({ combat, onHostResolve });
```

### Composition Over Prop Drilling

When a component needs 15+ props, extract a hook or use context. If data flows through 3+ layers unchanged, something is wrong.

Pattern for MP-aware components:
```js
const isMultiplayer = useMultiplayer().state.phase === 'playing';
const combat = isMultiplayer ? mp.state.gameState?.combat : useGameSlice(s => s.combat);
```

---

## Dedup Rules

### Extract When 2+ Copies

- Utility functions → `src/utils/` (`shortId`, `getGenderLabel`, etc.)
- Game rule helpers → `src/data/rpgSystem.js` (`getSkillLevel`)
- Text processing → `src/services/dialogueSegments.js` or `textSanitizer.js`
- Dialogue speaker logic → `src/services/dialogueSegments.js` (`hasNamedSpeaker`, `getDialogueSpeakerLabel`, `filterDuplicateDialogueSegments`)

### Game System Constants

Single source of truth in `src/data/rpgSystem.js`: `D50_MAX`, `ATTRIBUTE_KEYS`, `STATE_CHANGE_LIMITS`, `SKILL_CAPS`. Never hardcode d50/d100 values or attribute ranges in components.

---

## AI Response Validation

All AI JSON responses are validated with Zod before dispatch. Schemas in `src/services/aiResponse/schemas.js`. Parse + fallback logic in `parse.js`. Dialogue repair in `dialogueRepair.js`.

Pattern: validate → fallback → dispatch. Never trust raw AI output.

```js
const validated = safeParseAIResponse(result, SceneResponseSchema);
if (validated.ok) return validated.data;
// Degraded mode — extract what we can, fill fallbacks
return buildFallbackScene(validated.data);
```

---

## Performance

- Route-level code splitting (`React.lazy` for all 6 routes)
- `React.memo` only when profiler shows it helps — not by default
- `useCallback` for callbacks passed to memoized children
- `useMemo` for expensive computations (dialogue repair, scene building)
- Granular Zustand selectors over `useGame()` facade
- `getGameState()` for handler one-shots (no subscription overhead)

---

## Styling

- Tailwind utility classes exclusively
- Dark theme with glassmorphism (`backdrop-blur`, `bg-opacity`, `glass-panel` custom class)
- No CSS modules, no styled-components
- Responsive: mobile-first, `sm:` / `md:` / `lg:` breakpoints

---

## Testing

- **Unit** (Vitest): services, hooks, stores, validators. Tests co-located: `foo.test.js` next to `foo.js`
- **E2E** (Playwright): user flows. Not run via Vitest
- Build verification after every extraction: `npx vite build && npm test -- --run`
- 10 Playwright files "fail" in Vitest — expected, pre-existing

---

## File Conventions

- React components: `PascalCase.jsx`
- Services/hooks/data: `camelCase.js`
- Tests: `*.test.js` next to source
- Max ~200-300L per component, ~500L per service before splitting
- ES Modules everywhere (`"type": "module"`)
- No TypeScript — plain JS with Zod at boundaries
- Polish in UI (i18next), English in code/comments
