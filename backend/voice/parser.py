"""
Spoken command → structured investigative filters.

The slot extraction here is deliberately thin. `backend/nlq.py` already parses
person, relationship, amount, day window and location out of free text, matches
names fuzzily across scripts, and — importantly — records what it could NOT
apply. Re-implementing that with a second regex stack would give the voice path
different behaviour from the typed path and let the two drift apart.

So this module delegates to nlq.parse() and adds only what voice needs on top:

  * intent   — what kind of investigation the officer is asking for
  * case_id  — FIR / case numbers, which nlq has no concept of

Everything else is read back off the nlq Intent, which means the honesty
contract carries over: a spoken constraint the system cannot apply is reported,
never silently dropped.
"""
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from backend import nlq

log = logging.getLogger(__name__)

# Intent vocabulary. Ordered: the first intent whose cues appear wins, so the
# more specific patterns are listed before the general ones.
INTENT_RULES: List[tuple] = [
    ("transaction_search", [
        r"\btransaction", r"\bpayment", r"\btransfer", r"\bmoney\b", r"\bhawala\b",
        r"\bfunds?\b", r"\bpaid\b", r"\bamount\b", r"\baccount\b", r"\bbank\b",
    ]),
    ("case_search", [
        r"\bfir\b", r"\bcase\b", r"\bcomplaint\b", r"\bchargesheet\b", r"\bcrime number\b",
    ]),
    ("network_search", [
        r"\bconnection", r"\bconnected\b", r"\bnetwork\b", r"\bassociat", r"\blinked\b",
        r"\blinks?\b", r"\bcontacts? of\b", r"\bcircle\b", r"\brelated to\b",
    ]),
    ("relationship_search", [
        r"\brelationship", r"\brelation\b", r"\bhow .* related\b",
        r"\blink between\b", r"\bconnect(?:s|ion)? between\b",
        # deliberately no bare "between": it is a day-range word far more often
        # than a relationship cue ("between day 55 and 62")
    ]),
    ("location_search", [
        r"\blocation\b", r"\bwhere\b", r"\btower\b", r"\barea\b", r"\bspotted\b",
        r"\bseen (?:at|near|in)\b", r"\bmovement", r"\bplace\b",
    ]),
    ("communication_search", [
        r"\bcalls?\b", r"\bcalled\b", r"\bphone\b", r"\bcontacted\b", r"\bspoke\b",
        r"\bcdr\b", r"\bmessages?\b",
    ]),
    ("person_search", [
        r"\bwho is\b", r"\bprofile\b", r"\bdetails? (?:of|about)\b", r"\bshow me\b",
        r"\bfind\b", r"\blook up\b", r"\bsearch for\b",
    ]),
]

# FIR/case identifiers as Indian forces actually write them:
#   FIR 123/2025 · FIR No. 0231/2024 · case number 45/2023 · crime no 12/24
CASE_ID_RE = re.compile(
    r"\b(?:f\.?i\.?r\.?|case|crime|complaint)\s*"
    r"(?:no\.?|number|#)?\s*[:\-]?\s*"
    r"(\d{1,6}\s*/\s*\d{2,4})",
    re.IGNORECASE,
)
# A bare "123/2025" still reads as a case number in this domain.
BARE_CASE_RE = re.compile(r"\b(\d{1,6}\s*/\s*(?:19|20)\d{2})\b")

DEFAULT_INTENT = "person_search"


class VoiceCommand(BaseModel):
    """
    Voice-facing view of a parsed command.

    Mirrors the nlq Intent rather than replacing it: `entity_ids`, `relation`,
    `amount`, `location` and the day window all come from nlq so the voice and
    typed paths stay identical, while `intent` and `case_id` are voice/domain
    additions.
    """
    intent: Optional[str] = None
    person_name: Optional[str] = None
    entity_ids: List[str] = Field(default_factory=list)
    case_id: Optional[str] = None
    amount: Optional[float] = None
    amount_op: Optional[str] = None
    location: Optional[str] = None
    relation: Optional[str] = None
    day_from: Optional[int] = None
    day_to: Optional[int] = None
    understood: List[str] = Field(default_factory=list)
    ignored: List[Dict[str, str]] = Field(default_factory=list)
    transcript: Optional[str] = None

    def to_filters(self) -> Dict[str, Any]:
        """Non-null slots only — the filter set actually applied to the graph."""
        out = {
            "person_name": self.person_name,
            "entity_ids": self.entity_ids or None,
            "case_id": self.case_id,
            "amount": self.amount,
            "amount_op": self.amount_op,
            "location": self.location,
            "relation": self.relation,
            "day_from": self.day_from,
            "day_to": self.day_to,
        }
        return {k: v for k, v in out.items() if v is not None}


def detect_intent(text: str) -> str:
    """First matching rule wins. Deterministic and cheap to extend."""
    return _detect_intent_with_spans(text)[0]


def _detect_intent_with_spans(text: str):
    """(intent, words the intent rule consumed) — the words are needed so the
    honesty panel does not report them as unrecognised."""
    low = (text or "").lower()
    for intent, patterns in INTENT_RULES:
        hits = [m.group(0) for p in patterns for m in re.finditer(p, low)]
        if hits:
            return intent, {w for hit in hits for w in re.findall(r"[a-z]+", hit)}
    return DEFAULT_INTENT, set()


def extract_case_id(text: str) -> Optional[str]:
    """FIR / case number, normalised to `123/2025`."""
    for rx in (CASE_ID_RE, BARE_CASE_RE):
        m = rx.search(text or "")
        if m:
            return re.sub(r"\s*", "", m.group(1))
    return None


def parse_voice_command(text: str, graph_serial: Dict) -> VoiceCommand:
    """
    Transcript → VoiceCommand, delegating slot extraction to nlq.

    `graph_serial` is the same structure the /ask route passes to nlq, so voice
    and text resolve names against identical data.
    """
    text = (text or "").strip()
    if not text:
        return VoiceCommand(intent=None, transcript="",
                            ignored=[{"phrase": "", "reason": "no speech detected"}])

    intent_obj = nlq.parse(text, graph_serial)
    intent_name, intent_words = _detect_intent_with_spans(text)

    # nlq resolves a spoken name to a canonical entity ID; report the label back
    # so the officer sees which person it decided on, not just an opaque code.
    labels = {n["id"]: (n.get("label") or n["id"])
              for n in graph_serial.get("nodes", [])}
    person_name = labels.get(intent_obj.subjects[0]) if intent_obj.subjects else None

    case_id = extract_case_id(text)

    # nlq never saw the intent vocabulary or the case number, so it lists those
    # tokens as unrecognised. They were recognised — here. Reporting them as
    # dropped would make the "not applied" panel cry wolf, and that panel is
    # only worth anything if every entry is real.
    consumed = set(intent_words)
    if case_id:
        consumed |= {w.lower() for w in re.findall(r"[A-Za-z0-9/]+", case_id)}
        consumed |= {"fir", "case", "crime", "complaint", "no", "number"}
        consumed |= set(re.findall(r"\d+", case_id))
    def _voice_handled(phrase: str) -> bool:
        w = phrase.lower()
        # stem compare: the cue "connection" must also cover "connections"
        return any(w == c or w.startswith(c) or c.startswith(w) for c in consumed)

    ignored = [i for i in intent_obj.ignored
               if not _voice_handled(i.get("phrase", ""))]

    cmd = VoiceCommand(
        intent=intent_name,
        person_name=person_name,
        entity_ids=list(intent_obj.subjects),
        case_id=case_id,
        amount=intent_obj.amount_value,
        amount_op=intent_obj.amount_op,
        location=intent_obj.location,
        relation=intent_obj.relation,
        day_from=intent_obj.day_from,
        day_to=intent_obj.day_to,
        understood=list(intent_obj.understood),
        ignored=ignored,
        transcript=text,
    )
    if case_id:
        cmd.understood.append(f"case {case_id}")
    log.info("Voice command parsed: intent=%s slots=%s", cmd.intent, cmd.to_filters())
    return cmd


def to_nlq_intent(cmd: VoiceCommand) -> nlq.Intent:
    """
    Rebuild the nlq Intent so execution runs through the existing query layer.

    The voice path must not carry its own graph traversal — this hands control
    straight back to nlq.execute(), the same function /ask uses.
    """
    return nlq.Intent(
        subjects=list(cmd.entity_ids),
        relation=cmd.relation,
        amount_op=cmd.amount_op,
        amount_value=cmd.amount,
        location=cmd.location,
        day_from=cmd.day_from,
        day_to=cmd.day_to,
        understood=list(cmd.understood),
        ignored=list(cmd.ignored),
    )
