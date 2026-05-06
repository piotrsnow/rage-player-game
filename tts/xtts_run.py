import argparse
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import torch
from TTS.api import TTS


MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

PRESETS = {
    "stable": {
        "description": "stabilniej, mniej losowo, zwykle mniej artefaktów",
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
        "description": "środek: naturalność + stabilność",
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
        "description": "bardziej ekspresyjnie, ale może być mniej stabilnie",
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


def slugify_text(text: str, max_len: int = 70) -> str:
    """Tworzy krótką, bezpieczną nazwę pliku z tekstu."""
    text = text.strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    if not text:
        text = "tts_output"
    return text[:max_len].strip("_") or "tts_output"


def next_run_id(output_dir: Path, base_slug: str) -> int:
    """Znajduje kolejny numer runu dla danego tekstu."""
    pattern = re.compile(rf"^{re.escape(base_slug)}_(\d{{3}})_")
    max_id = 0
    for file in output_dir.glob(f"{base_slug}_*.wav"):
        match = pattern.match(file.name)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return max_id + 1


def list_voices(voice_dir: Path) -> list[Path]:
    """Zwraca listę dostępnych sampli głosu (.wav)."""
    return sorted(voice_dir.glob("voc_*.wav"))


def build_output_path(output_dir: Path, text: str, preset_name: str) -> Path:
    slug = slugify_text(text)
    run_id = next_run_id(output_dir, slug)
    filename = f"{slug}_{run_id:03d}_{preset_name}.wav"
    return output_dir / filename


def generate(
    text: str,
    speaker_wav: Path,
    language: str,
    preset_name: str,
    output_path: Path,
) -> Path:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Urządzenie: {device}")
    print(f"[INFO] Ładowanie modelu: {MODEL_NAME} ...")

    tts = TTS(model_name=MODEL_NAME).to(device)

    preset = PRESETS[preset_name]
    params = preset["params"]

    print(f"[INFO] Preset: {preset_name} — {preset['description']}")
    print(f"[INFO] Głos referencyjny: {speaker_wav}")
    print(f"[INFO] Tekst: {text[:120]}{'...' if len(text) > 120 else ''}")
    print(f"[INFO] Język: {language}")

    tts.tts_to_file(
        text=text,
        file_path=str(output_path),
        speaker_wav=str(speaker_wav),
        language=language,
        temperature=params["temperature"],
        top_p=params["top_p"],
        top_k=params["top_k"],
        repetition_penalty=params["repetition_penalty"],
        length_penalty=params["length_penalty"],
        speed=params["speed"],
    )

    print(f"[OK] Zapisano: {output_path}")
    return output_path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="XTTS v2 — generowanie mowy z klonowaniem głosu",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Przykłady użycia:
  python xtts_run.py "Witaj w świecie RPG!" --voice voc_1_sample.wav
  python xtts_run.py "Hello adventurer!" --voice voc_2_sample.wav --lang en --preset expressive
  python xtts_run.py --list-voices
""",
    )

    parser.add_argument(
        "text",
        nargs="?",
        help="Tekst do syntezy mowy",
    )
    parser.add_argument(
        "--voice", "-v",
        type=str,
        help="Plik .wav z próbką głosu (nazwa pliku z katalogu tts/ lub pełna ścieżka)",
    )
    parser.add_argument(
        "--lang", "-l",
        type=str,
        default="pl",
        help="Kod języka: pl, en, de, fr, es, ... (domyślnie: pl)",
    )
    parser.add_argument(
        "--preset", "-p",
        type=str,
        default="balanced",
        choices=list(PRESETS.keys()),
        help="Preset generowania (domyślnie: balanced)",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Ścieżka pliku wyjściowego .wav (opcjonalna, auto-generowana jeśli pominięta)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Katalog wyjściowy (domyślnie: tts/output/)",
    )
    parser.add_argument(
        "--list-voices",
        action="store_true",
        help="Wyświetl dostępne sample głosu i zakończ",
    )

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    script_dir = Path(__file__).resolve().parent

    if args.list_voices:
        voices = list_voices(script_dir)
        if not voices:
            print("[WARN] Brak sampli głosu (voc_*.wav) w katalogu tts/")
            return 1
        print("Dostępne sample głosu:")
        for v in voices:
            print(f"  • {v.name}")
        return 0

    if not args.text:
        print("[ERROR] Podaj tekst do syntezy jako pierwszy argument.")
        print("        Użyj --help aby zobaczyć pomoc.")
        return 1

    if not args.voice:
        print("[ERROR] Podaj plik głosu referencyjnego: --voice <plik.wav>")
        return 1

    voice_path = Path(args.voice)
    if not voice_path.is_absolute():
        voice_path = script_dir / voice_path
    if not voice_path.exists():
        print(f"[ERROR] Plik głosu nie istnieje: {voice_path}")
        return 1

    output_dir = Path(args.output_dir) if args.output_dir else script_dir / "output"
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = build_output_path(output_dir, args.text, args.preset)

    generate(
        text=args.text,
        speaker_wav=voice_path,
        language=args.lang,
        preset_name=args.preset,
        output_path=output_path,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
