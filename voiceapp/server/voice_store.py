"""
Manages the voice sample manifest (JSON) and WAV files on disk.
Thread-safe via a simple lock around manifest writes.
"""

import json
import re
import threading
import unicodedata
import wave
from datetime import datetime, timezone
from pathlib import Path

VOICES_DIR = Path(__file__).resolve().parent / "voices"
MANIFEST_PATH = VOICES_DIR / "manifest.json"
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB
MIN_DURATION_S = 1.0
MAX_DURATION_S = 60.0

_lock = threading.Lock()


def _slugify(text: str, max_len: int = 40) -> str:
    text = text.strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return (text[:max_len].strip("_") or "voice")


def _read_manifest() -> list[dict]:
    if not MANIFEST_PATH.exists():
        return []
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _write_manifest(entries: list[dict]) -> None:
    MANIFEST_PATH.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _unique_id(base: str, existing_ids: set[str]) -> str:
    if base not in existing_ids:
        return base
    for i in range(2, 1000):
        candidate = f"{base}_{i}"
        if candidate not in existing_ids:
            return candidate
    raise ValueError("Too many voices with the same name")


def validate_wav(data: bytes) -> float:
    """Validate WAV bytes. Returns duration in seconds or raises ValueError."""
    if len(data) > MAX_FILE_SIZE:
        raise ValueError(f"File too large ({len(data) / 1024 / 1024:.1f} MB, max {MAX_FILE_SIZE // 1024 // 1024} MB)")

    import io
    try:
        with wave.open(io.BytesIO(data), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate == 0:
                raise ValueError("Invalid sample rate")
            duration = frames / rate
    except wave.Error as e:
        raise ValueError(f"Invalid WAV file: {e}")

    if duration < MIN_DURATION_S:
        raise ValueError(f"Sample too short ({duration:.1f}s, min {MIN_DURATION_S}s)")
    if duration > MAX_DURATION_S:
        raise ValueError(f"Sample too long ({duration:.1f}s, max {MAX_DURATION_S}s)")

    return duration


def list_voices() -> list[dict]:
    with _lock:
        return _read_manifest()


def get_voice(voice_id: str) -> dict | None:
    for v in list_voices():
        if v["id"] == voice_id:
            return v
    return None


def get_voice_path(voice_id: str) -> Path | None:
    voice = get_voice(voice_id)
    if not voice:
        return None
    p = VOICES_DIR / voice["filename"]
    return p if p.exists() else None


def add_voice(name: str, gender: str, wav_data: bytes) -> dict:
    duration = validate_wav(wav_data)

    with _lock:
        entries = _read_manifest()
        existing_ids = {e["id"] for e in entries}
        voice_id = _unique_id(_slugify(name), existing_ids)
        filename = f"{voice_id}.wav"

        VOICES_DIR.mkdir(parents=True, exist_ok=True)
        (VOICES_DIR / filename).write_bytes(wav_data)

        entry = {
            "id": voice_id,
            "name": name,
            "gender": gender,
            "roles": [],
            "filename": filename,
            "durationS": round(duration, 1),
            "addedAt": datetime.now(timezone.utc).isoformat(),
        }
        entries.append(entry)
        _write_manifest(entries)

    return entry


def update_voice(voice_id: str, patch: dict) -> dict | None:
    allowed = {"name", "gender", "roles"}
    with _lock:
        entries = _read_manifest()
        for entry in entries:
            if entry["id"] == voice_id:
                for k, v in patch.items():
                    if k in allowed:
                        entry[k] = v
                _write_manifest(entries)
                return entry
    return None


def delete_voice(voice_id: str) -> bool:
    with _lock:
        entries = _read_manifest()
        new_entries = [e for e in entries if e["id"] != voice_id]
        if len(new_entries) == len(entries):
            return False

        removed = next(e for e in entries if e["id"] == voice_id)
        wav_path = VOICES_DIR / removed["filename"]
        if wav_path.exists():
            wav_path.unlink()

        _write_manifest(new_entries)
    return True
