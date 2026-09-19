"""
Investigator voice assistant — parser, slot mapping and the API contract.

Whisper tests are separated from parser tests on purpose: transcription needs a
~460MB model and several seconds per clip, while the parser is the part that
changes often and must stay fast to test. Anything needing the model skips
cleanly when it is absent so the suite still runs on a fresh checkout.
"""
import json

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.config import PROJECT_ROOT
from backend import nlq
from backend.voice import recorder, transcriber
from backend.voice.parser import (
    VoiceCommand, detect_intent, extract_case_id, parse_voice_command, to_nlq_intent,
)
from conftest import auth_headers

client = TestClient(app)
H = auth_headers("investigator")
FIXTURES = PROJECT_ROOT / "tests" / "fixtures"


@pytest.fixture(scope="module")
def graph():
    path = PROJECT_ROOT / "output" / "graph.json"
    if not path.exists():
        pytest.skip("graph not built")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ── intent ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("Show me all connections of Rahul Sharma", "network_search"),
    ("Find everyone connected to Rahul Sharma", "network_search"),
    ("Find transactions above 50000 in Delhi", "transaction_search"),
    ("show payments made by C12", "transaction_search"),
    ("Show me people connected to case FIR 123/2025", "case_search"),
    ("who did Anwar Sheikh call between day 55 and 62", "communication_search"),
    ("where was Rajan Naik spotted", "location_search"),
])
def test_intent_detection(text, expected):
    assert detect_intent(text) == expected


def test_paraphrases_share_an_intent():
    # The spec's requirement: different phrasings of the same ask must not
    # produce different intents.
    assert detect_intent("Show me connections of Rahul") == \
           detect_intent("Find everyone connected to Rahul")


# ── case id ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text,expected", [
    ("people connected to case FIR 123/2025", "123/2025"),
    ("FIR No. 0231/2024 details", "0231/2024"),
    ("crime number 45/2023", "45/2023"),
    ("open case 12/24 please", "12/24"),
    ("transactions over 2 lakh", None),
])
def test_case_id_extraction(text, expected):
    assert extract_case_id(text) == expected


# ── slots, delegated to nlq ───────────────────────────────────────────────

def test_person_slot_resolves_to_a_canonical_entity(graph):
    cmd = parse_voice_command("Show me all connections of Ramesh Yadav", graph)
    assert cmd.intent == "network_search"
    assert cmd.entity_ids == ["A7"]
    assert cmd.person_name == "Ramesh Yadav"
    assert cmd.to_filters()["person_name"] == "Ramesh Yadav"


def test_amount_and_location_slots(graph):
    cmd = parse_voice_command("Find transactions above 50000 in Dockside Ward", graph)
    assert cmd.intent == "transaction_search"
    assert (cmd.amount_op, cmd.amount) == (">", 50_000)
    assert cmd.location == "Dockside Ward"
    assert cmd.relation == "TRANSACTED"


def test_hindi_name_resolves_through_the_shared_resolver(graph):
    # Voice reuses nlq, which transliterates Devanagari — so a Hindi name spoken
    # or typed lands on the same canonical record with no extra voice code.
    cmd = parse_voice_command("रमेश यादव के कॉल रिकॉर्ड", graph)
    assert cmd.entity_ids == ["A7"]


def test_intent_words_are_not_reported_as_unrecognised(graph):
    # nlq has no intent vocabulary, so it flags "connections" as leftover. The
    # voice layer understood it, and the "not applied" panel is only credible if
    # every entry in it is real.
    cmd = parse_voice_command("Show me all connections of Ramesh Yadav", graph)
    assert not [i for i in cmd.ignored if i["phrase"].lower().startswith("connection")]

    cmd = parse_voice_command("people connected to case FIR 123/2025", graph)
    assert cmd.case_id == "123/2025"
    assert cmd.ignored == []


def test_unapplied_constraints_still_reported(graph):
    # The honesty contract must survive the voice path.
    cmd = parse_voice_command("transactions over 5 lakh in North Delhi during July", graph)
    phrases = [i["phrase"].lower() for i in cmd.ignored]
    assert "north delhi" in phrases and "july" in phrases
    assert cmd.location is None


def test_misheard_place_name_recovers_but_absent_one_does_not(graph):
    # Speech recognition mangles proper nouns; "Dockside warp" is what Whisper
    # actually returned for "Dockside Ward" in testing.
    assert parse_voice_command("transactions in Dockside warp", graph).location == "Dockside Ward"
    assert parse_voice_command("transactions in North Delhi", graph).location is None


# ── handing back to the existing query layer ──────────────────────────────

def test_to_nlq_intent_round_trips_and_executes(graph):
    cmd = parse_voice_command("who did Anwar Sheikh call between day 55 and 62", graph)
    intent = to_nlq_intent(cmd)
    assert isinstance(intent, nlq.Intent)
    assert intent.subjects == ["A1"] and intent.relation == "CALLED"
    assert (intent.day_from, intent.day_to) == (55, 62)

    rows = nlq.execute(intent, graph)
    assert rows, "voice path must return the same rows the typed path does"
    assert all("A1" in (r["src"], r["dst"]) for r in rows)
    # identical to what /ask would produce for the same sentence
    assert len(rows) == len(nlq.execute(nlq.parse(cmd.transcript, graph), graph))


def test_empty_transcript_is_handled(graph):
    cmd = parse_voice_command("", graph)
    assert cmd.intent is None and cmd.ignored


def test_voice_command_filters_omit_empty_slots():
    assert VoiceCommand(intent="person_search").to_filters() == {}


# ── API contract ──────────────────────────────────────────────────────────

def test_voice_health_reports_capability():
    r = client.get("/api/voice-command/health", headers=H)
    assert r.status_code == 200
    body = r.json()
    assert body["offline"] is True
    assert isinstance(body["transcription_available"], bool)
    # A machine with no microphone must still describe how to get one.
    if not body["microphone_available"]:
        assert body["microphone_hint"]


def test_voice_endpoint_requires_auth():
    assert client.post("/api/voice-command",
                       files={"file": ("a.wav", b"RIFF", "audio/wav")}).status_code == 401


@pytest.mark.parametrize("filename,payload,status", [
    ("empty.wav", b"", 400),                  # nothing uploaded
    ("notes.txt", b"hello", 400),             # wrong format
    ("broken.wav", b"not audio at all", 422), # unreadable audio
])
def test_voice_endpoint_rejects_bad_audio(filename, payload, status):
    r = client.post("/api/voice-command", headers=H,
                    files={"file": (filename, payload, "application/octet-stream")})
    assert r.status_code == status
    detail = str(r.json().get("detail", ""))
    assert "Traceback" not in detail, "internal stack traces must not reach the client"


def test_voice_endpoint_requires_a_file():
    assert client.post("/api/voice-command", headers=H).status_code == 422


# ── transcription (needs the Whisper model) ───────────────────────────────

requires_whisper = pytest.mark.skipif(
    not transcriber.is_available(), reason="faster-whisper not installed")


def test_transcript_cleaning_strips_artefacts():
    assert transcriber.clean_transcript("[BLANK_AUDIO] hello  world ") == "hello world"
    assert transcriber.clean_transcript("...") == ""
    assert transcriber.clean_transcript("") == ""


@requires_whisper
def test_silence_transcribes_to_nothing():
    wav = FIXTURES / "voice_sample_silence.wav"
    if not wav.exists():
        pytest.skip("silence fixture missing")
    assert transcriber.transcribe_audio(str(wav)) == ""


@requires_whisper
def test_spoken_command_reaches_results_end_to_end():
    wav = FIXTURES / "voice_sample_connections.wav"
    if not wav.exists():
        pytest.skip("speech fixture missing")
    with open(wav, "rb") as fh:
        r = client.post("/api/voice-command", headers=H,
                        files={"file": ("cmd.wav", fh, "audio/wav")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert "ramesh" in body["transcription"].lower()
    assert body["parsed_command"]["intent"] == "network_search"
    assert body["parsed_command"]["entity_ids"] == ["A7"]
    assert body["result_count"] > 0
    assert body["cypher"], "the equivalent Cypher should still be rendered"


# ── recorder degrades, never crashes ──────────────────────────────────────

def test_recorder_reports_capability_without_raising():
    assert isinstance(recorder.is_available(), bool)


def test_recorder_validates_arguments():
    with pytest.raises(ValueError):
        recorder.record_audio(duration=0)


@pytest.mark.skipif(recorder.is_available(), reason="PyAudio present on this machine")
def test_recorder_missing_pyaudio_is_a_typed_error_with_a_fix():
    with pytest.raises(recorder.RecorderUnavailable) as exc:
        recorder.record_audio(duration=1)
    assert "pyaudio" in str(exc.value).lower()
