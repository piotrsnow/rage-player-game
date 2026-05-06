# XTTS Voice Studio

Standalone voice sample manager + TTS synthesis server for RPGon.
Wraps [Coqui XTTS v2](https://github.com/coqui-ai/TTS) in a FastAPI backend
with a React UI for managing voice samples, assigning roles, and testing synthesis.

## Quick start (dev)

```bash
# Terminal 1 — Python backend (requires torch + TTS installed)
cd voiceapp/server
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 5050 --reload

# Terminal 2 — React frontend
cd voiceapp
npm install
npm run dev    # http://localhost:5175
```

The Vite dev server proxies `/api/*` to `http://localhost:5050`.

## Quick start (Docker)

```bash
COMPOSE_PROFILES=xtts docker compose up xtts
```

Requires NVIDIA GPU + nvidia-container-toolkit. The service builds a
multi-stage image (Node for frontend build, Python for runtime) and
serves everything on port **5050**.

## REST API Contract

Base URL: `http://localhost:5050/api`

All responses are JSON unless noted. Errors return `{ "detail": "..." }`.

### `GET /api/health`

Server and model status.

```json
{
  "status": "ok",
  "modelLoaded": true,
  "gpu": true,
  "presets": ["stable", "balanced", "expressive"]
}
```

### `GET /api/voices`

List all voice samples.

```json
[
  {
    "id": "fronczewski",
    "name": "Fronczewski",
    "gender": "male",
    "roles": ["narrator"],
    "filename": "fronczewski.wav",
    "durationS": 12.3,
    "addedAt": "2026-05-05T20:00:00+00:00"
  }
]
```

### `POST /api/voices`

Upload a new voice sample. Multipart form data.

| Field    | Type   | Required | Description                    |
|----------|--------|----------|--------------------------------|
| `file`   | File   | yes      | WAV file (1-60s, max 15 MB)   |
| `name`   | string | yes      | Display name for the voice     |
| `gender` | string | no       | `"male"` (default) or `"female"` |

Returns the created voice entry (201).

### `PATCH /api/voices/{voice_id}`

Update voice metadata. JSON body with any subset of:

```json
{
  "name": "New Name",
  "gender": "female",
  "roles": ["narrator", "npc_male"]
}
```

Valid roles: `"narrator"`, `"npc_male"`, `"npc_female"`.

### `DELETE /api/voices/{voice_id}`

Delete a voice sample and its WAV file. Returns `{ "ok": true }`.

### `POST /api/tts`

Synthesize speech. JSON body:

```json
{
  "voice_id": "fronczewski",
  "text": "Witaj, poszukiwaczu przygód!",
  "language": "pl",
  "preset": "balanced"
}
```

| Field      | Type   | Required | Default      | Description                          |
|------------|--------|----------|--------------|--------------------------------------|
| `voice_id` | string | yes      |              | Voice ID from manifest               |
| `text`     | string | yes      |              | Text to synthesize                   |
| `language` | string | no       | `"pl"`       | Language code (pl, en, de, fr, etc.) |
| `preset`   | string | no       | `"balanced"` | `stable` / `balanced` / `expressive` |

Returns: `audio/wav` binary response.

## RPGon Integration

When ready to connect the main RPGon app:

1. Set `XTTS_URL=http://localhost:5050` (or `http://xtts:5050` inside Docker)
2. Create `backend/src/routes/proxy/xtts.js` — proxy `POST /v1/proxy/xtts/tts`
   to `POST $XTTS_URL/api/tts`, cache result in `mediaStore`
3. Add `ttsProvider` setting to `SettingsContext.jsx` (`'elevenlabs'` | `'xtts'`)
4. Branch in `useNarrator.js` `fetchTts` based on provider

The voice role config uses the same `{ voiceId, voiceName }` shape as
ElevenLabs pools, so `characterVoiceResolver.js` works without changes.

## Voice sample tips

- **Duration:** 6-15 seconds works best for XTTS v2 cloning
- **Quality:** Clean recording, no background noise, single speaker
- **Format:** WAV, any sample rate (resampled internally)
