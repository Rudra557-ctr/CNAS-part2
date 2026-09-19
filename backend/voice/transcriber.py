"""
Offline speech-to-text with faster-whisper.

No transcription API is called. The model runs locally on CPU (int8) and is
cached after the first download, so a deployed instance needs no egress.

The model is loaded once per process and reused — loading "small" takes seconds
and several hundred MB, which is fine once and unacceptable per request.
"""
import logging
import os
import re
import threading
import wave
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

DEFAULT_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "small")
DEFAULT_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
DEFAULT_COMPUTE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

_model = None
_model_key: Optional[tuple] = None
_lock = threading.Lock()

# Whisper emits these when it hears noise or silence; they are not commands.
_ARTEFACTS = re.compile(
    r"\[(?:BLANK_AUDIO|INAUDIBLE|MUSIC|SILENCE|NOISE|APPLAUSE)\]"
    r"|\((?:music|silence|inaudible|laughs?|coughs?)\)",
    re.IGNORECASE,
)


# Whisper's initial_prompt is capped near 224 tokens, and Indian names run
# ~3 tokens each, so only a slice of a large case can be primed. Highest-degree
# people first: the most connected are the ones an officer is most likely to
# name out loud.
MAX_VOCABULARY_TERMS = 55


def names_from_graph(serial: dict, limit: int = MAX_VOCABULARY_TERMS) -> list:
    """Person labels from a graph serial, most-connected first."""
    people = [n for n in (serial or {}).get("nodes", []) if n.get("kind") == "Person"]
    people.sort(key=lambda n: -(n.get("degree") or 0))
    out, seen = [], set()
    for n in people:
        label = (n.get("label") or "").strip()
        if label and label.lower() not in seen:
            seen.add(label.lower())
            out.append(label)
        if len(out) >= limit:
            break
    return out


def build_vocabulary_prompt(names) -> Optional[str]:
    """
    Turn known entity names into a Whisper priming prompt.

    Whisper mishears proper nouns it has no reason to expect — "Ravindra
    Chaudhary" decodes as "Revenger Chartery", "Ramesh Yadav" as "Reimesh
    Yadav". Seeding the decoder with the names actually on file corrects both,
    and costs nothing at run time. This is applied to every caller of
    transcribe_audio, so the query and data-entry paths hear the same words.
    """
    terms = [str(n).strip() for n in (names or []) if str(n).strip()]
    if not terms:
        return None
    return ("Indian police investigation. Names on file: "
            + ", ".join(terms[:MAX_VOCABULARY_TERMS]) + ".")


class TranscriptionError(RuntimeError):
    """Audio could not be transcribed. Message is safe to show a caller."""


def is_available() -> bool:
    """True when faster-whisper is importable. Never raises."""
    try:
        import faster_whisper  # noqa: F401
    except Exception:
        return False
    return True


def get_model(model_size: str = DEFAULT_MODEL_SIZE,
              device: str = DEFAULT_DEVICE,
              compute_type: str = DEFAULT_COMPUTE):
    """Process-wide singleton. First call downloads the model if not cached."""
    global _model, _model_key
    key = (model_size, device, compute_type)
    if _model is not None and _model_key == key:
        return _model
    with _lock:
        if _model is not None and _model_key == key:
            return _model
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise TranscriptionError(
                "faster-whisper is not installed. Install with: "
                "pip install faster-whisper"
            ) from exc
        log.info("Loading Whisper %s (%s/%s) — first run downloads the model",
                 model_size, device, compute_type)
        try:
            _model = WhisperModel(model_size, device=device, compute_type=compute_type)
        except Exception as exc:
            raise TranscriptionError(f"Could not load Whisper model: {exc}") from exc
        _model_key = key
        return _model


def clean_transcript(text: str) -> str:
    """Strip Whisper artefacts and collapse whitespace."""
    if not text:
        return ""
    text = _ARTEFACTS.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # A lone period or ellipsis is what silence usually decodes to.
    if text in {".", "...", "-", "—"}:
        return ""
    return text


def _validate_wav(path: Path) -> None:
    """Fail loudly on an empty or non-audio upload before loading the model."""
    if not path.exists():
        raise TranscriptionError(f"Audio file not found: {path}")
    if path.stat().st_size == 0:
        raise TranscriptionError("Audio file is empty")
    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path), "rb") as wf:
                if wf.getnframes() == 0:
                    raise TranscriptionError("Audio file contains no samples")
        except wave.Error as exc:
            raise TranscriptionError(f"Not a readable WAV file: {exc}") from exc


def transcribe_audio(audio_path: str = "input_audio.wav",
                     language: str = "en",
                     model_size: str = DEFAULT_MODEL_SIZE,
                     vocabulary=None) -> str:
    """
    Transcribe a local audio file to text. Returns "" when nothing was said.

    `language="en"` covers Indian English and the English side of Hinglish;
    Devanagari place and person names that come through in Roman script still
    resolve downstream, because the parser fuzzy-matches names across scripts.

    `vocabulary` is an optional list of names already on file for this case;
    see build_vocabulary_prompt. Everything else about the decode is fixed, so
    every caller gets identical behaviour on identical audio.
    """
    path = Path(audio_path)
    _validate_wav(path)
    model = get_model(model_size)

    try:
        segments, info = model.transcribe(
            str(path),
            language=language,
            beam_size=5,
            vad_filter=True,               # drop leading/trailing silence
            condition_on_previous_text=False,  # stops it inventing continuations
            initial_prompt=build_vocabulary_prompt(vocabulary),
        )
        text = " ".join(seg.text for seg in segments)
    except Exception as exc:
        log.exception("Whisper failed on %s", path)
        raise TranscriptionError(f"Transcription failed: {exc}") from exc

    cleaned = clean_transcript(text)
    log.info("Transcribed %s (%.1fs audio) → %r", path.name,
             getattr(info, "duration", 0.0), cleaned)
    return cleaned
