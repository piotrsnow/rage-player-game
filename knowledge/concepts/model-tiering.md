# Model Tiering

Three tiers defined in `src/services/ai/models.js`. Each tier picks the cheapest model that can do the job.

| Tier     | Models                              | Used for |
|----------|-------------------------------------|----------|
| nano     | gpt-5.4-nano, gpt-4.1-nano          | [[intent-classification]], [[memory-compression]], skill check inference |
| standard | gpt-5.4-mini, claude-haiku-4.5      | compression, recaps, objective verification, story prompt gen, combat commentary |
| premium  | gpt-5.4, claude-sonnet-4            | scene generation, campaign creation |

## Providers
Multi-provider via `src/services/ai/providers.js`: OpenAI, Anthropic. Retry + fallback built in. Local models through `src/services/localAI.js` (Ollama / LM Studio).

## Module structure (`src/services/ai/`)
- `models.js` — AI_MODELS, MODEL_MAP, TASK_TIER_OVERRIDE, selectModel, resolveModel
- `providers.js` — callAI (OpenAI/Anthropic direct + via proxy), retry + provider fallback
- `suggestedActions.js` — postProcessSuggestedActions, fallback action generation (PL/EN)
- `service.js` — aiService object: generateCampaign, generateSceneViaBackendStream, generateRecap, compressScenes, generateStoryPrompt, generateCombatCommentary, verifyObjective, inferSkillCheck
- `index.js` — barrel re-export

## Rationale
See [[../decisions/nano-for-planning]] — planning/classification is bulk work and shouldn't touch premium.

## Related
- [[two-stage-pipeline]]
- [[../patterns/backend-proxy]]
