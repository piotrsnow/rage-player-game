"""
FastAPI server for XTTS voice management and TTS synthesis.

Run: uvicorn voiceapp.server.app:app --host 0.0.0.0 --port 5050
"""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import tts_engine, voice_store

DIST_DIR = Path(__file__).resolve().parent.parent / "dist"


@asynccontextmanager
async def lifespan(application: FastAPI):
    asyncio.get_event_loop().run_in_executor(None, tts_engine.load_model)
    yield


app = FastAPI(title="XTTS Voice Studio", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Tts-Total-Chunks",
        "X-Tts-Skipped-Chunks",
        "X-Tts-Cpu-Fallbacks",
    ],
)


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "modelLoaded": tts_engine.is_model_loaded(),
        "ttsAvailable": tts_engine.is_available(),
        "gpu": tts_engine.get_device() == "cuda",
        "presets": list(tts_engine.PRESETS.keys()),
    }


# ── Voices CRUD ─────────────────────────────────────────────────────────────

@app.get("/api/voices")
async def list_voices():
    return voice_store.list_voices()


@app.post("/api/voices", status_code=201)
async def upload_voice(
    file: UploadFile = File(...),
    name: str = Form(...),
    gender: str = Form("male"),
):
    if gender not in ("male", "female"):
        raise HTTPException(400, "gender must be 'male' or 'female'")

    data = await file.read()
    try:
        entry = voice_store.add_voice(name, gender, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return entry


class VoicePatch(BaseModel):
    name: str | None = None
    gender: str | None = None
    roles: list[str] | None = None


@app.patch("/api/voices/{voice_id}")
async def patch_voice(voice_id: str, body: VoicePatch):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(400, "No fields to update")
    if "gender" in patch and patch["gender"] not in ("male", "female"):
        raise HTTPException(400, "gender must be 'male' or 'female'")
    if "roles" in patch:
        valid_roles = {"narrator", "npc_male", "npc_female"}
        if not all(r in valid_roles for r in patch["roles"]):
            raise HTTPException(400, f"roles must be subset of {valid_roles}")

    result = voice_store.update_voice(voice_id, patch)
    if not result:
        raise HTTPException(404, "Voice not found")
    return result


@app.delete("/api/voices/{voice_id}")
async def delete_voice(voice_id: str):
    if not voice_store.delete_voice(voice_id):
        raise HTTPException(404, "Voice not found")
    return {"ok": True}


# ── TTS synthesis ───────────────────────────────────────────────────────────

class TtsParams(BaseModel):
    temperature: float = 0.65
    top_p: float = 0.85
    top_k: int = 50
    repetition_penalty: float = 10.0
    length_penalty: float = 1.0
    speed: float = 1.0


class TtsRequest(BaseModel):
    voice_id: str
    text: str
    language: str = "pl"
    preset: str | None = None
    params: TtsParams | None = None


@app.post("/api/tts")
async def synthesize(body: TtsRequest):
    if not tts_engine.is_available():
        raise HTTPException(503, "TTS unavailable — torch/TTS not installed")

    speaker_path = voice_store.get_voice_path(body.voice_id)
    if not speaker_path:
        raise HTTPException(404, f"Voice not found: {body.voice_id}")

    if body.params:
        raw_params = body.params.model_dump()
    elif body.preset and body.preset in tts_engine.PRESETS:
        raw_params = tts_engine.PRESETS[body.preset]["params"]
    else:
        raw_params = tts_engine.PRESETS["balanced"]["params"]

    loop = asyncio.get_event_loop()
    try:
        result: tts_engine.SynthResult = await loop.run_in_executor(
            None,
            tts_engine.synthesize,
            body.text,
            speaker_path,
            body.language,
            raw_params,
        )
    except Exception as e:
        raise HTTPException(500, f"TTS synthesis failed: {e}")

    return Response(
        content=result.wav_bytes,
        media_type="audio/wav",
        headers={
            "X-Tts-Total-Chunks": str(result.total_chunks),
            "X-Tts-Skipped-Chunks": str(result.skipped_chunks),
            "X-Tts-Cpu-Fallbacks": str(result.cpu_fallbacks),
        },
    )


# ── Serve built frontend (prod) ────────────────────────────────────────────

if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")
