# Pattern — Backend Proxy for AI Calls

Frontend never talks to OpenAI / Anthropic / Gemini / ElevenLabs / Stability / Meshy directly. It goes through backend proxy routes.

## Proxy routes
`backend/src/routes/proxy/` — `openai.js`, `anthropic.js`, `gemini.js`, `elevenlabs.js`, `stability.js`, `meshy.js`.

## Why
- API keys stay server-side (encrypted in `User.apiKeys` via `apiKeyService.js`)
- Centralized retry / fallback / cost tracking (`costTracker.js`)
- CORS-free
- Allows model routing per [[../concepts/model-tiering]]

## Frontend modes

### Backend endpoints (preferred)
- `POST /ai/campaigns/:id/generate-scene-stream` — SSE scene generation (two-stage pipeline)
- `POST /ai/generate-campaign` — SSE campaign creation with progressive JSON streaming
- `POST /ai/generate-story-prompt` — Non-streaming story premise generation

Frontend uses `callBackendStream()` (`src/services/aiStream.js`) for SSE endpoints with partial JSON parsing.

### Proxy mode (legacy/fallback)
Frontend builds its own prompt (`src/services/prompts.js`) and calls `/proxy/openai` or `/proxy/anthropic`. Used for: recap, compression, combat commentary, objective verification.

Decision: [[../decisions/backend-mode-over-proxy]].

## Related
- [[../concepts/two-stage-pipeline]]
- [[tool-use-fallback]]
