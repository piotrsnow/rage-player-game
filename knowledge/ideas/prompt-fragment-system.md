# Idea — prompt fragment system (markdown + LRU cache)

## What it is

Prompts live as `.md` files under `prompts/{base,scene,campaign,fragments}/`, loaded with an in-memory LRU cache. A startup call registers `${key}` → value substitutions, and `composePrompt([fragments], substitutions)` concats fragments and fills placeholders.

Benefits over the current monolithic JS template literals:

- **Prompts as content, not code.** `.md` files are editable by non-devs and diff as prose.
- **Fragment composition.** Base prompt + role-specific overlay + feature fragments = final system prompt. Swap one fragment file to A/B test a section.
- **Static prefix discipline for prompt caching.** Base fragments don't change per-request → stable prompt-cache hit. Dynamic content goes at the end.
- **LRU-cached loads.** Prompt text is loaded once, reused across requests.
- **Review clarity.** Prompt diffs in PRs are markdown prose, not `const PROMPT = \`…\`` string literal diffs.

## Why it's not adopted now

[backend/src/services/sceneGenerator/systemPrompt.js](../../backend/src/services/sceneGenerator/systemPrompt.js) is a monolithic JS file with inlined template literals and `if`-driven section assembly. Works fine for the current 2-3 variants. The user (Patryk) is the only person tuning prompts, so content-designer ergonomics aren't a driver.

No systematic A/B testing yet. Anthropic prompt caching is a nice-to-have, not a load-bearing cost.

## When it becomes relevant

Adopt when **two of these** are true:

1. **Content designer is actively tuning prompts** (someone other than Patryk is editing them and wants markdown).
2. **Systematic A/B testing has started** — e.g. measuring quality of `narrator_poetic` vs `narrator_terse` across playtest sessions.
3. **Prompt caching has become load-bearing** — if cache miss cost is the tail of our bills, structural cache discipline becomes worth the refactor.
4. **Prompt bugs are recurring** — if we're shipping fixes to `systemPrompt.js` weekly, moving content out of JS reduces risk.

## Cost estimate

~6h:

- 1h — audit current templates, list fragments
- 2h — create `backend/src/prompts/` directory structure, extract templates to `.md` files
- 1h — write `loadPrompt(name, substitutions)` with in-memory cache
- 1h — migrate `buildLeanSystemPrompt` call sites to new loader
- 1h — tests (verify all `${key}` placeholders are filled, no stale references)

## Sketch

```
backend/src/prompts/
  base/
    core_rules.md       ← invariant RPG rules
    response_schema.md  ← JSON schema description
  scene/
    lean_header.md
    dynamic_context.md  ← with ${gameStateSummary}, ${character}, etc.
    narrator_${profile}.md  ← one per style preset
  campaign/
    generator_base.md
  fragments/
    combat_mechanics.md
    dice_rules.md
```

```js
// backend/src/services/promptLoader.js
const cache = new Map();

export function loadPrompt(relativePath, substitutions = {}) {
  if (!cache.has(relativePath)) {
    const absolutePath = path.join(PROMPTS_ROOT, relativePath);
    cache.set(relativePath, fs.readFileSync(absolutePath, 'utf8'));
  }
  let text = cache.get(relativePath);
  for (const [key, value] of Object.entries(substitutions)) {
    text = text.replaceAll(`\${${key}}`, String(value));
  }
  return text;
}

export function composePrompt(fragments, substitutions = {}) {
  return fragments.map((f) => loadPrompt(f, substitutions)).join('\n\n');
}
```

## Source

`pipecat-ai/gradient-bang` — `prompt_loader.py` with `@lru_cache` and fragment concat.
