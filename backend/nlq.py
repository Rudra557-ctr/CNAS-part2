"""
Natural-language query over the case graph — bounded, deterministic, offline.

The contract this module exists to enforce: **never silently answer a different
question than the one asked.** The previous template matcher took
"associates of A1 who transacted over 5 lakh in North Delhi during July" and
returned every transaction over 5 lakh in the network, dropping the subject, the
place and the date without a word. For an investigative tool that is the worst
possible failure — the officer cannot tell a narrow answer from a wrong one.

So every parse records two things alongside the filters: what it understood, and
what it ignored and why. Anything the parser cannot consume is reported back,
never discarded. A query is allowed to be partially understood; it is not allowed
to pretend.

No model, no network call, no Neo4j dependency — results are computed on the same
in-memory graph the rest of the API serves, and the equivalent Cypher is rendered
separately for the day Neo4j is attached.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.resolution.resolver import name_similarity

# Relation vocabulary → graph edge kind. Ordered by specificity: "transferred"
# must win over a bare "call" mentioned elsewhere in the sentence.
RELATION_KEYWORDS = [
    ("TRANSACTED", ["transaction", "transacted", "transfer", "transferred", "paid",
                    "payment", "money", "hawala", "remitted", "sent money", "funds"]),
    ("CALLED",     ["call", "called", "calling", "phone", "phoned", "contacted",
                    "contact", "spoke", "rang"]),
    ("MET",        ["met", "meeting", "meet", "seen with", "rendezvous"]),
    ("LOCATED_AT", ["tower", "located", "location", "area", "spotted", "present at"]),
]

AMOUNT_MULTIPLIER = {
    "lakh": 100_000, "lac": 100_000, "lakhs": 100_000,
    "crore": 10_000_000, "crores": 10_000_000,
    "k": 1_000, "thousand": 1_000,
}

MONTHS = ["january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december"]

# Words that carry no filter meaning — leftover noise, not an ignored constraint.
STOPWORDS = {
    "show", "me", "all", "the", "a", "an", "of", "who", "whom", "which", "that",
    "and", "or", "in", "on", "at", "to", "from", "for", "with", "by", "is", "are",
    "was", "were", "did", "do", "does", "made", "make", "list", "find", "get",
    "give", "display", "any", "some", "please", "suspect", "person", "people",
    "associate", "associates", "between", "during", "over", "under", "above",
    "below", "more", "less", "than", "rs", "inr", "rupees", "rupee", "than",
    "their", "his", "her", "them", "he", "she", "they", "it", "what", "how",
    "many", "much", "records", "record", "entries", "within", "near", "around",
}

MAX_RESULTS = 200


@dataclass
class Intent:
    subjects: List[str] = field(default_factory=list)
    relation: Optional[str] = None
    amount_op: Optional[str] = None
    amount_value: Optional[float] = None
    location: Optional[str] = None
    day_from: Optional[int] = None
    day_to: Optional[int] = None
    hops: int = 0          # 0 = records the subject is directly on
    limit: int = 50
    understood: List[str] = field(default_factory=list)
    ignored: List[Dict[str, str]] = field(default_factory=list)

    def note(self, text: str) -> None:
        self.understood.append(text)

    def drop(self, phrase: str, reason: str) -> None:
        self.ignored.append({"phrase": phrase, "reason": reason})

    @property
    def has_filter(self) -> bool:
        """Did anything in the query actually constrain the search?"""
        return bool(self.subjects or self.relation or self.amount_value is not None
                    or self.day_from is not None or self.location)


def _as_float(v: Any) -> Optional[float]:
    """Edge amounts and days are serialised as strings ('19031') — coerce before comparing."""
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def _as_int(v: Any) -> Optional[int]:
    f = _as_float(v)
    return int(f) if f is not None else None


class _Consumer:
    """Tracks which character spans of the query a parser dimension has claimed."""

    def __init__(self, text: str):
        self.text = text
        self.taken = [False] * len(text)

    def take(self, start: int, end: int) -> None:
        for i in range(max(0, start), min(len(self.taken), end)):
            self.taken[i] = True

    def take_phrase(self, phrase: str) -> bool:
        idx = self.text.lower().find(phrase.lower())
        if idx == -1:
            return False
        self.take(idx, idx + len(phrase))
        return True

    def leftover_words(self) -> List[str]:
        out, cur, start = [], [], 0
        for i, ch in enumerate(self.text):
            if self.taken[i] or not (ch.isalnum() or ch in "@'-"):
                if cur:
                    out.append(("".join(cur), start))
                    cur = []
            else:
                if not cur:
                    start = i
                cur.append(ch)
        if cur:
            out.append(("".join(cur), start))
        return [w for w, _ in out]


def _person_nodes(graph_serial: Dict) -> List[Dict]:
    return [n for n in graph_serial.get("nodes", []) if n.get("kind") == "Person"]


def _location_labels(graph_serial: Dict) -> List[str]:
    labels = {str(n.get("label") or n.get("id"))
              for n in graph_serial.get("nodes", []) if n.get("kind") == "Location"}
    for e in graph_serial.get("edges", []):
        tower = (e.get("meta") or {}).get("tower")
        if tower:
            labels.add(str(tower))
    return sorted(labels)


def _parse_subjects(q: str, c: _Consumer, intent: Intent, graph_serial: Dict) -> None:
    people = _person_nodes(graph_serial)
    by_id = {str(n["id"]).upper(): n for n in people}

    for m in re.finditer(r"\b([A-Z]\d{1,2}|X\d)\b", q):
        node = by_id.get(m.group(1).upper())
        if node:
            intent.subjects.append(node["id"])
            c.take(m.start(), m.end())
            intent.note(f"{node['id']} · {node.get('label', '')}".strip(" ·"))

    if intent.subjects:
        return

    # No ID given — try a name. name_similarity handles Devanagari, so a Hindi
    # name in the query resolves through the same path as English.
    best, best_score, best_span = None, 0.0, None
    tokens = [(m.group(0), m.start(), m.end())
              for m in re.finditer(r"[^\s,.;?]+", q) if len(m.group(0)) > 2]
    for size in (2, 1):
        for i in range(len(tokens) - size + 1):
            phrase = " ".join(t[0] for t in tokens[i:i + size])
            if phrase.lower() in STOPWORDS:
                continue
            for n in people:
                score = name_similarity(phrase, str(n.get("label") or ""))
                if score > best_score:
                    best, best_score = n, score
                    best_span = (tokens[i][1], tokens[i + size - 1][2])
        if best_score >= 85:
            break

    if best and best_score >= 85 and best_span:
        intent.subjects.append(best["id"])
        c.take(*best_span)
        intent.note(f"{best['id']} · {best.get('label', '')}".strip(" ·"))


SCOPE_PHRASES = ["associates of", "associates", "network of", "connected to", "linked to",
                 "contacts of"]


def _parse_scope(q: str, c: _Consumer, intent: Intent) -> None:
    """Only widen to the subject's neighbourhood when the query actually asks for it."""
    low = q.lower()
    for phrase in SCOPE_PHRASES:
        if re.search(rf"\b{re.escape(phrase)}\b", low):
            intent.hops = 1
            c.take_phrase(phrase)
            intent.note("one hop out from the named person")
            return


def _parse_relation(q: str, c: _Consumer, intent: Intent) -> None:
    low = q.lower()
    for kind, words in RELATION_KEYWORDS:
        for w in sorted(words, key=len, reverse=True):
            # Officers write "transactions", "called", "calling" — match the stem
            # plus common inflections, not the bare word.
            m = re.search(rf"\b{re.escape(w)}(?:s|es|ed|ing)?\b", low)
            if m:
                intent.relation = kind
                c.take(m.start(), m.end())
                intent.note({
                    "TRANSACTED": "financial transactions",
                    "CALLED": "call records",
                    "MET": "recorded meetings",
                    "LOCATED_AT": "location sightings",
                }[kind])
                return


def _parse_amount(q: str, c: _Consumer, intent: Intent) -> None:
    pattern = re.compile(
        r"(over|above|more than|greater than|exceeding|under|below|less than|upto|up to)?"
        r"\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|thousand|k)?\b",
        re.IGNORECASE)
    # Scan every numeric candidate: an entity ID like "A1" matches first but is
    # not an amount, and bailing on it would lose the real "over 5 lakh" later.
    for m in pattern.finditer(q):
        if not m.group(2):
            continue
        lead = q[max(0, m.start() - 12):m.start()].lower()
        if re.search(r"\b(day|days|week|hop|hops)\b", lead):
            continue          # "day 61" is a time filter, not money
        if re.match(r"[A-Za-z]", q[max(0, m.start(2) - 1):m.start(2)]):
            continue          # the "1" inside "A1"
        unit = (m.group(3) or "").lower().rstrip("s")
        has_currency = bool(re.search(r"₹|rs\.?|inr", m.group(0), re.I))
        if not m.group(1) and not unit and not has_currency:
            continue          # a lone number with no comparator or unit is ambiguous

        value = float(m.group(2).replace(",", "")) * AMOUNT_MULTIPLIER.get(unit, 1)
        word = (m.group(1) or "over").lower()
        intent.amount_op = "<" if word in ("under", "below", "less than", "upto", "up to") else ">"
        intent.amount_value = value
        c.take(m.start(), m.end())
        intent.note(f"amount {intent.amount_op} ₹{value:,.0f}")
        return


def _parse_days(q: str, c: _Consumer, intent: Intent) -> None:
    rng = re.search(r"days?\s*(\d{1,3})\s*(?:-|–|to|and|through)\s*(\d{1,3})", q, re.I)
    if rng:
        intent.day_from, intent.day_to = sorted((int(rng.group(1)), int(rng.group(2))))
        c.take(rng.start(), rng.end())
        intent.note(f"days {intent.day_from}–{intent.day_to}")
        return
    one = re.search(r"\bday\s*(\d{1,3})\b", q, re.I)
    if one:
        intent.day_from = intent.day_to = int(one.group(1))
        c.take(one.start(), one.end())
        intent.note(f"day {intent.day_from}")
        return
    wk = re.search(r"\bweek\s*(\d{1,2})\b", q, re.I)
    if wk:
        w = int(wk.group(1))
        intent.day_from, intent.day_to = (w - 1) * 7 + 1, w * 7
        c.take(wk.start(), wk.end())
        intent.note(f"week {w} (days {intent.day_from}–{intent.day_to})")


def _parse_calendar(q: str, c: _Consumer, intent: Intent) -> None:
    """Calendar dates are unanswerable: serialised edges carry day numbers, not timestamps."""
    for mon in MONTHS:
        m = re.search(rf"\b{mon}\b", q, re.IGNORECASE)
        if m:
            c.take(m.start(), m.end())
            intent.drop(m.group(0), "this case indexes evidence by day number (1–90), "
                                    "not calendar dates")
    for m in re.finditer(r"\b(19|20)\d{2}\b", q):
        c.take(m.start(), m.end())
        intent.drop(m.group(0), "no calendar year index on this case's evidence")


def _parse_location(q: str, c: _Consumer, intent: Intent, graph_serial: Dict) -> None:
    known = _location_labels(graph_serial)
    low = q.lower()
    for label in sorted(known, key=len, reverse=True):
        idx = low.find(label.lower())
        if idx != -1:
            intent.location = label
            c.take(idx, idx + len(label))
            intent.note(f"location {label}")
            return

    # A place was probably named but matches nothing here — say so rather than drop it.
    m = re.search(r"\b(?:in|at|near|around)\s+((?:[A-Z][\w-]+)(?:\s+[A-Z][\w-]+){0,2})", q)
    if m:
        phrase = m.group(1).strip()
        if phrase.lower() not in STOPWORDS and not re.fullmatch(r"[A-Z]\d{1,2}", phrase):
            c.take(m.start(1), m.end(1))
            intent.drop(phrase, "not a location on record in this case")


def parse(q: str, graph_serial: Dict) -> Intent:
    intent = Intent()
    c = _Consumer(q)

    _parse_calendar(q, c, intent)
    _parse_days(q, c, intent)
    _parse_amount(q, c, intent)
    _parse_location(q, c, intent, graph_serial)
    _parse_scope(q, c, intent)
    _parse_subjects(q, c, intent, graph_serial)
    _parse_relation(q, c, intent)

    if not intent.relation:
        intent.note("all relationship types")
    if not intent.subjects:
        intent.note("whole network (no specific person identified)")

    for w in c.leftover_words():
        if w.lower() in STOPWORDS or len(w) < 3 or w.isdigit():
            continue
        intent.drop(w, "not understood — no filter matches this term")
    return intent


def execute(intent: Intent, graph_serial: Dict) -> List[Dict]:
    """Filter the in-memory graph. Rows match /why's `sources` shape for UI reuse."""
    # Nothing in the query constrained anything. Returning the first N edges here
    # would look like an answer; an empty result with the ignored list is honest.
    if not intent.has_filter:
        return []
    labels = {n["id"]: (n.get("label") or n["id"]) for n in graph_serial.get("nodes", [])}
    labels_hi = {n["id"]: n.get("label_hi")
                 for n in graph_serial.get("nodes", []) if n.get("label_hi")}

    # "Meena Joshi's call records" means edges she is ON. Expanding to her
    # neighbourhood first (hops=1) returned calls between her contacts that she
    # was never party to — an answer to a question nobody asked. One hop out is
    # only correct when the query says "associates of", which _parse_scope sets.
    scope = set(intent.subjects)
    for _ in range(intent.hops):
        nxt = set(scope)
        for e in graph_serial.get("edges", []):
            if e.get("src") in scope:
                nxt.add(e.get("dst"))
            elif e.get("dst") in scope:
                nxt.add(e.get("src"))
        scope = nxt

    rows = []
    for e in graph_serial.get("edges", []):
        if intent.relation and e.get("kind") != intent.relation:
            continue
        if scope and e.get("src") not in scope and e.get("dst") not in scope:
            continue
        meta = e.get("meta") or {}
        amount = _as_float(meta.get("amount"))
        if intent.amount_value is not None:
            if amount is None:
                continue
            if intent.amount_op == ">" and not amount > intent.amount_value:
                continue
            if intent.amount_op == "<" and not amount < intent.amount_value:
                continue
        day = _as_int(e.get("day"))
        if intent.day_from is not None:
            if day is None or not (intent.day_from <= day <= (intent.day_to or intent.day_from)):
                continue
        if intent.location:
            here = str(meta.get("tower") or "")
            if intent.location.lower() not in here.lower() \
               and intent.location.lower() not in str(e.get("dst") or "").lower():
                continue
        rows.append({
            "src": e.get("src"), "src_label": labels.get(e.get("src"), e.get("src")),
            "src_label_hi": labels_hi.get(e.get("src")),
            "dst": e.get("dst"), "dst_label": labels.get(e.get("dst"), e.get("dst")),
            "dst_label_hi": labels_hi.get(e.get("dst")),
            "kind": e.get("kind"), "day": day, "amount": amount,
            "source": e.get("source"), "source_type": e.get("source_type"),
            "confidence": e.get("confidence"),
            "supporting_text": (e.get("supporting_text") or "")[:200],
            "evidence_hash": e.get("evidence_hash", ""),
        })

    rows.sort(key=lambda r: (r["amount"] is None, -(r["amount"] or 0), r["day"] or 0))
    return rows[:min(intent.limit, MAX_RESULTS)]


def summarise(intent: Intent, rows: List[Dict], graph_serial: Dict) -> str:
    """
    One plain sentence stating the finding. A row count alone makes the officer do
    the reading; this states what the rows amount to — volume, span, counterparties,
    and for money the total and the largest single movement.
    """
    if not rows:
        if not intent.has_filter:
            return "Nothing in that question mapped to a filter, so no records were searched."
        return "No records match the constraints that were applied."

    labels = {n["id"]: (n.get("label") or n["id"]) for n in graph_serial.get("nodes", [])}
    subject = intent.subjects[0] if intent.subjects else None
    subject_txt = f"{labels.get(subject, subject)} ({subject})" if subject else "the network"

    kind = {"CALLED": "call records", "TRANSACTED": "transactions",
            "MET": "recorded meetings", "LOCATED_AT": "location sightings"}.get(
        intent.relation, "records")

    days = [r["day"] for r in rows if r["day"] is not None]
    span = f", days {min(days)}–{max(days)}" if days and min(days) != max(days) else (
        f", day {days[0]}" if days else "")

    others = {r["dst"] if r["src"] == subject else r["src"] for r in rows} - {subject} \
        if subject else {r["src"] for r in rows} | {r["dst"] for r in rows}
    counterparties = f", across {len(others)} counterpart{'y' if len(others) == 1 else 'ies'}"

    if not subject:
        lead = "across the network"
    else:
        lead = f"one hop out from {subject_txt}" if intent.hops else f"involving {subject_txt}"
    sentence = f"{len(rows)} {kind} {lead}{span}{counterparties}."

    amounts = [r["amount"] for r in rows if r["amount"] is not None]
    if amounts:
        top = max(rows, key=lambda r: r["amount"] or 0)
        when = f", day {top['day']}" if top["day"] else ""
        sentence += (f" Total ₹{sum(amounts):,.0f}; largest ₹{top['amount']:,.0f} "
                     f"({top['src_label']} → {top['dst_label']}{when}).")
    if len(rows) >= intent.limit:
        sentence += f" Showing the first {intent.limit} — narrow the question for a fuller picture."
    return sentence


def to_cypher(intent: Intent) -> Dict[str, Any]:
    """The equivalent Cypher for this intent. Rendered for display, not executed here."""
    rel = f":{intent.relation}" if intent.relation else ""
    params: Dict[str, Any] = {}
    where = []
    if intent.subjects:
        params["ids"] = intent.subjects
        where.append("a.id IN $ids")
    if intent.amount_value is not None:
        params["amt"] = intent.amount_value
        where.append(f"toFloat(r.amount) {intent.amount_op} $amt")
    if intent.day_from is not None:
        params["day_from"] = intent.day_from
        params["day_to"] = intent.day_to or intent.day_from
        where.append("r.day >= $day_from AND r.day <= $day_to")
    if intent.location:
        params["loc"] = intent.location
        where.append("r.tower = $loc")
    clause = ("\nWHERE " + "\n  AND ".join(where)) if where else ""
    return {
        "cypher": f"MATCH (a:Person)-[r{rel}]-(b){clause}\nRETURN a, r, b\nLIMIT {intent.limit}",
        "params": params,
    }
