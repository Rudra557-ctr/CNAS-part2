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
                     model_size: str = DEFAULT_MODEL_SIZE) -> str:
    """
    Transcribe a local audio file to text. Returns "" when nothing was said.

    `language="en"` covers Indian English and the English side of Hinglish;
    Devanagari place and person names that come through in Roman script still
    resolve downstream, because the parser fuzzy-matches names across scripts.
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
        )
        text = " ".join(seg.text for seg in segments)
    except Exception as exc:
        log.exception("Whisper failed on %s", path)
        raise TranscriptionError(f"Transcription failed: {exc}") from exc

    cleaned = clean_transcript(text)
    log.info("Transcribed %s (%.1fs audio) → %r", path.name,
             getattr(info, "duration", 0.0), cleaned)
    return cleaned
