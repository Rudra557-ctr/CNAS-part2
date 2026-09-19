"""
Local microphone capture for the voice assistant.

This is for an operator running CNAS on their own machine (a CLI capture, a
kiosk terminal). The web UI does not use it — a browser records audio itself and
uploads the file to /api/voice-command, so the server never needs a microphone.

PyAudio needs a system audio library (PortAudio) that may not be installed. That
is a normal condition, not a failure of the product: this module reports it as a
typed error with the install command, and the API keeps serving.
"""
import logging
import wave
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# 16 kHz mono 16-bit is what Whisper wants; anything else gets resampled and
# loses quality for no benefit.
SAMPLE_RATE = 16_000
CHANNELS = 1
CHUNK = 1024
DEFAULT_DURATION = 7

INSTALL_HINT = (
    "Microphone capture needs PortAudio and PyAudio:\n"
    "  macOS:  brew install portaudio && pip install pyaudio\n"
    "  Ubuntu: sudo apt-get install portaudio19-dev && pip install pyaudio\n"
    "The API does not require them — browsers upload recorded audio to "
    "/api/voice-command instead."
)


class RecorderUnavailable(RuntimeError):
    """PyAudio or a usable input device is not present on this machine."""


def is_available() -> bool:
    """True when a recording could actually be attempted. Never raises."""
    try:
        import pyaudio  # noqa: F401
    except Exception:
        return False
    return True


def record_audio(
    output_path: str = "input_audio.wav",
    duration: int = DEFAULT_DURATION,
    sample_rate: int = SAMPLE_RATE,
    device_index: Optional[int] = None,
) -> str:
    """
    Capture `duration` seconds of mono audio and write a PCM WAV file.

    Raises RecorderUnavailable when the machine cannot record — callers should
    treat that as "use file upload instead", not as a crash.
    """
    if duration <= 0:
        raise ValueError("duration must be positive")
    if sample_rate <= 0:
        raise ValueError("sample_rate must be positive")

    try:
        import pyaudio
    except ImportError as exc:
        raise RecorderUnavailable(f"PyAudio is not installed.\n{INSTALL_HINT}") from exc

    audio = None
    stream = None
    try:
        audio = pyaudio.PyAudio()
        if audio.get_device_count() == 0:
            raise RecorderUnavailable(f"No audio devices detected.\n{INSTALL_HINT}")
        stream = audio.open(
            format=pyaudio.paInt16,
            channels=CHANNELS,
            rate=sample_rate,
            input=True,
            frames_per_buffer=CHUNK,
            input_device_index=device_index,
        )
        log.info("Recording %ss at %sHz → %s", duration, sample_rate, output_path)
        frames = []
        for _ in range(int(sample_rate / CHUNK * duration)):
            # Keep going on a dropped buffer; a short glitch beats losing the
            # whole utterance an officer just spoke.
            frames.append(stream.read(CHUNK, exception_on_overflow=False))

        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(out), "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(audio.get_sample_size(pyaudio.paInt16))
            wf.setframerate(sample_rate)
            wf.writeframes(b"".join(frames))
        log.info("Wrote %s (%d frames)", out, len(frames))
        return str(out)

    except RecorderUnavailable:
        raise
    except OSError as exc:
        # PyAudio surfaces device problems as OSError with a PortAudio code.
        raise RecorderUnavailable(
            f"Microphone unavailable ({exc}). Check OS input permissions.\n{INSTALL_HINT}"
        ) from exc
    except Exception as exc:
        raise RecorderUnavailable(f"Recording failed: {exc}") from exc
    finally:
        if stream is not None:
            try:
                stream.stop_stream(); stream.close()
            except Exception:
                pass
        if audio is not None:
            try:
                audio.terminate()
            except Exception:
                pass
