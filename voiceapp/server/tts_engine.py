"""
Singleton XTTS v2 model wrapper.
Loads the model once at startup (or lazily on first request) and reuses it.

All heavy deps (torch, TTS) are imported lazily so the server can start
and serve voice CRUD even when only fastapi/uvicorn are installed.
"""

import io
import re
import sys
import tempfile
import threading
import wave
from dataclasses import dataclass
from pathlib import Path

MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

PRESETS = {
    "stable": {
        "description": "More stable, less random, fewer artifacts",
        "params": {
            "temperature": 0.55,
            "top_p": 0.80,
            "top_k": 40,
            "repetition_penalty": 10.0,
            "length_penalty": 1.0,
            "speed": 1.0,
        },
    },
    "balanced": {
        "description": "Balance of naturalness and stability",
        "params": {
            "temperature": 0.65,
            "top_p": 0.85,
            "top_k": 50,
            "repetition_penalty": 10.0,
            "length_penalty": 1.0,
            "speed": 1.0,
        },
    },
    "expressive": {
        "description": "More expressive, potentially less stable",
        "params": {
            "temperature": 0.75,
            "top_p": 0.90,
            "top_k": 50,
            "repetition_penalty": 8.0,
            "length_penalty": 1.0,
            "speed": 1.0,
        },
    },
}

_model = None
_cpu_model = None
_model_lock = threading.Lock()
_device: str | None = None
_torch_available: bool | None = None
_model_generation = 0
_synth_semaphore = threading.Semaphore(1)

XTTS_SAMPLE_RATE = 24000
XTTS_CHANNELS = 1
XTTS_SAMPWIDTH = 2  # 16-bit


@dataclass
class SynthResult:
    wav_bytes: bytes
    total_chunks: int
    skipped_chunks: int
    cpu_fallbacks: int


def _check_torch() -> bool:
    global _torch_available
    if _torch_available is None:
        try:
            import torch  # noqa: F401
            _torch_available = True
        except ImportError:
            _torch_available = False
            print("[tts_engine] torch not installed — TTS synthesis unavailable, voice CRUD still works")
    return _torch_available


def get_device() -> str:
    if not _check_torch():
        return "cpu"
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


def is_model_loaded() -> bool:
    return _model is not None


def is_available() -> bool:
    return _check_torch()


def load_model() -> None:
    global _model, _device
    if not _check_torch():
        print("[tts_engine] Skipping model load — torch not installed")
        return
    with _model_lock:
        if _model is not None:
            return
        from TTS.api import TTS
        import torch
        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[tts_engine] Loading {MODEL_NAME} on {_device}...")
        _model = TTS(model_name=MODEL_NAME).to(_device)
        print("[tts_engine] Model loaded.")


def _reload_model(observed_generation: int) -> int:
    """Full reload after a CUDA `device-side assert`.

    Once asserted, the CUDA context is poisoned and `empty_cache + synchronize`
    is not enough — the model must be reconstructed. Returns the current
    generation; another thread may have already reloaded, in which case we
    skip and just return the new generation.
    """
    global _model, _model_generation
    with _model_lock:
        if _model_generation != observed_generation:
            return _model_generation
        print("[tts_engine] Reloading model after CUDA error...", file=sys.stderr)
        try:
            del _model
        except Exception:
            pass
        _model = None
        try:
            import torch
            import gc
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
        except Exception:
            pass
        from TTS.api import TTS
        _model = TTS(model_name=MODEL_NAME).to(_device)
        _model_generation += 1
        print(
            f"[tts_engine] Model reloaded (generation {_model_generation}).",
            file=sys.stderr,
        )
        return _model_generation


def _load_cpu_model():
    """Lazy singleton of a second model on CPU for per-chunk fallback.

    Costs ~2 GB RAM after first use, but needed because once a CUDA assert
    has fired, calling `.to('cpu')` on the GPU model may itself fail.
    """
    global _cpu_model
    with _model_lock:
        if _cpu_model is not None:
            return _cpu_model
        from TTS.api import TTS
        print("[tts_engine] Loading CPU fallback model...", file=sys.stderr)
        _cpu_model = TTS(model_name=MODEL_NAME).to("cpu")
        print("[tts_engine] CPU fallback model ready.", file=sys.stderr)
        return _cpu_model


MAX_CHUNK_CHARS = 200

_SENTENCE_RE = re.compile(r'(?<=[.!?…])\s+')

# Characters that can cause CUDA device-side asserts in XTTS v2 tokenizer
_STRIP_RE = re.compile(
    r'[\U00010000-\U0010FFFF]'   # supplementary-plane (emoji, symbols)
    r'|[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]'  # zero-width / bidi
    r'|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]',  # C0 controls except \t \n \r
)

def _sanitize_text(text: str) -> str:
    """Strip characters that crash the XTTS tokenizer / CUDA kernel."""
    import unicodedata
    text = unicodedata.normalize("NFC", text)
    text = _STRIP_RE.sub('', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def _split_text(text: str) -> list[str]:
    """Split text into chunks that stay under XTTS v2's token limit.

    Splits on sentence boundaries first, then on commas / semicolons,
    and finally hard-wraps at MAX_CHUNK_CHARS as a last resort.
    """
    sentences = _SENTENCE_RE.split(text.strip())
    chunks: list[str] = []

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= MAX_CHUNK_CHARS:
            chunks.append(sentence)
            continue
        # Try splitting on clause-level punctuation
        parts = re.split(r'(?<=[,;:–—])\s+', sentence)
        buf = ""
        for part in parts:
            candidate = f"{buf} {part}".strip() if buf else part
            if len(candidate) <= MAX_CHUNK_CHARS:
                buf = candidate
            else:
                if buf:
                    chunks.append(buf)
                # Hard-wrap if a single clause still exceeds the limit
                while len(part) > MAX_CHUNK_CHARS:
                    cut = part[:MAX_CHUNK_CHARS].rfind(" ")
                    if cut <= 0:
                        cut = MAX_CHUNK_CHARS
                    chunks.append(part[:cut].strip())
                    part = part[cut:].strip()
                buf = part
        if buf:
            chunks.append(buf)

    return chunks


def _concat_wav(buffers: list[bytes]) -> bytes:
    """Merge multiple WAV byte-strings into a single WAV file."""
    if len(buffers) == 1:
        return buffers[0]

    params_ref = None
    all_frames = b""

    for buf in buffers:
        with wave.open(io.BytesIO(buf), "rb") as wf:
            if params_ref is None:
                params_ref = wf.getparams()
            all_frames += wf.readframes(wf.getnframes())

    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setparams(params_ref)
        wf.writeframes(all_frames)
    return out.getvalue()


def _make_silence_wav(duration_seconds: float) -> bytes:
    """WAV of silence at XTTS v2 native format (24 kHz mono 16-bit PCM)."""
    n = int(XTTS_SAMPLE_RATE * max(0.05, duration_seconds))
    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setnchannels(XTTS_CHANNELS)
        wf.setsampwidth(XTTS_SAMPWIDTH)
        wf.setframerate(XTTS_SAMPLE_RATE)
        wf.writeframes(b"\x00\x00" * n)
    return out.getvalue()


def _reset_cuda():
    """Best-effort CUDA recovery after a device-side assert."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
    except Exception:
        pass


def _log(msg: str) -> None:
    print(f"[tts_engine] {msg}", file=sys.stderr)


def _synth_chunk_once(
    model,
    chunk: str,
    speaker_wav: Path,
    language: str,
    params: dict,
) -> bytes:
    """Single tts_to_file invocation. Caller decides retry policy."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        model.tts_to_file(
            text=chunk,
            file_path=str(tmp_path),
            speaker_wav=str(speaker_wav),
            language=language,
            **params,
        )
        return tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)


def synthesize(
    text: str,
    speaker_wav: Path,
    language: str = "pl",
    params: dict | str = "balanced",
) -> SynthResult:
    """Generate speech and return a SynthResult with WAV bytes + per-request stats.

    Long text is automatically split into sentence-sized chunks that
    stay under XTTS v2's token limit, synthesized separately, and
    concatenated back into a single WAV.

    Each chunk goes through a 5-level retry ladder:
      L1: GPU
      L2: GPU after empty_cache + synchronize
      L3: GPU after full model reload (recovers poisoned CUDA context)
      L4: CPU fallback model (lazy singleton, ~2 GB RAM)
      L5: skip → silent PCM proportional to text length

    Raises RuntimeError only if EVERY chunk fails.

    params can be a preset name (str) or a raw dict of TTS parameters.
    """
    if not _check_torch():
        raise RuntimeError("torch/TTS not installed — cannot synthesize")
    if _model is None:
        load_model()

    if isinstance(params, str):
        resolved = PRESETS.get(params, PRESETS["balanced"])["params"]
    else:
        resolved = params

    clean = _sanitize_text(text)
    chunks = _split_text(clean)
    if not chunks:
        raise ValueError("Empty text after cleanup")

    with _synth_semaphore:
        wav_parts: list[bytes] = []
        skipped = 0
        cpu_fallbacks = 0

        for i, chunk in enumerate(chunks):
            gen = _model_generation

            # L1
            try:
                wav_parts.append(
                    _synth_chunk_once(_model, chunk, speaker_wav, language, resolved)
                )
                continue
            except RuntimeError as e1:
                _log(f"L2 retry chunk #{i} ({len(chunk)} chars): {e1}")
                _reset_cuda()

            # L2
            try:
                wav_parts.append(
                    _synth_chunk_once(_model, chunk, speaker_wav, language, resolved)
                )
                continue
            except RuntimeError as e2:
                _log(f"L3 reloading model for chunk #{i}: {e2}")
                gen = _reload_model(gen)

            # L3
            try:
                wav_parts.append(
                    _synth_chunk_once(_model, chunk, speaker_wav, language, resolved)
                )
                continue
            except RuntimeError as e3:
                _log(f"L4 CPU fallback for chunk #{i}: {e3}")

            # L4
            try:
                cpu = _load_cpu_model()
                wav_parts.append(
                    _synth_chunk_once(cpu, chunk, speaker_wav, language, resolved)
                )
                cpu_fallbacks += 1
                continue
            except Exception as e4:
                dur = max(0.4, len(chunk) * 0.075)
                _log(
                    f"L5 SKIP chunk #{i} ({len(chunk)} chars), "
                    f"inserting {dur:.2f}s silence: {e4}"
                )
                wav_parts.append(_make_silence_wav(dur))
                skipped += 1

        if skipped == len(chunks):
            raise RuntimeError("All TTS chunks failed")

        _log(
            f"Synthesis complete: {len(chunks) - skipped}/{len(chunks)} chunks, "
            f"{skipped} skipped, {cpu_fallbacks} CPU fallbacks"
        )

        return SynthResult(
            wav_bytes=_concat_wav(wav_parts),
            total_chunks=len(chunks),
            skipped_chunks=skipped,
            cpu_fallbacks=cpu_fallbacks,
        )
