"""
Spoken data-entry → a structured, validated ingestion command.

This is the *write* counterpart to backend/voice/parser.py. That module turns
speech into a question; this one turns speech into a proposed change to the
case record. The split matters: a query that misreads a word returns the wrong
rows and the officer sees it, but a write that misreads a word corrupts the
evidence base silently. So nothing here guesses.

Parsing is deterministic regex over the vocabulary Indian investigators
actually use — no LLM, no external service, consistent with the rest of the
offline voice stack. The command it produces is a Pydantic model that is
validated before it is allowed anywhere near the source data, and anything the
parser could not account for is reported in `ignored` rather than dropped,
exactly as the query path does.
"""
import re
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

# ── name shapes ───────────────────────────────────────────────────────────
# Whisper capitalises proper nouns, so a cased run of words is the primary
# signal. Devanagari has no case, hence the second alternative.
_LATIN = r"[A-Z][A-Za-z.\-]+(?:\s+[A-Z][A-Za-z.\-]+){0,2}"
_DEVA = r"[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,2}"
# A canonical ID spoken in place of a name — "connect him with UP00303". This
# dataset holds three different men called Ravindra Chaudhary, so the ID is the
# officer's way of saying which one, and it has to be capturable in the same
# slot the name would occupy.
_ENTITY_ID = r"[A-Z]{1,4}-?\d{1,6}"
NAME = rf"(?:{_ENTITY_ID}|{_LATIN}|{_DEVA})"

# ── operation cues ────────────────────────────────────────────────────────
# Checked in this order. CREATE wins over RELATIONSHIP on purpose: "add a new
# person named X ... associated with Y" is one create that also carries a link,
# not two competing commands.
_CREATE_VERB = r"(?:add|create|register|record|enter|insert)"
# Two ways officers open a create. The first names the noun ("add a new person
# named X"); the second goes straight to the name ("Create Vibhanshu Sharma
# with phone …"). The second only fires on a capitalised run, so "create a
# relationship between …" is not mistaken for a person.
# The noun branch is case-insensitive via a scoped flag; the name branch must
# stay case-sensitive, because NAME uses capitalisation to find its boundaries.
CREATE_RE = re.compile(
    rf"(?i:\b{_CREATE_VERB}\b[^.]{{0,40}}?\b(?:person|suspect|individual|accused|entity|name))"
    rf"|\b(?:[Aa]dd|[Cc]reate|[Rr]egister|[Rr]ecord|[Ee]nter|[Ii]nsert)\s+"
    rf"(?:a\s+)?(?:new\s+)?{NAME}\b",
)
# The bare form's name, for _find_subject_name.
BARE_CREATE_NAME_RE = re.compile(
    rf"\b(?:[Aa]dd|[Cc]reate|[Rr]egister|[Rr]ecord|[Ee]nter|[Ii]nsert)\s+"
    rf"(?:a\s+)?(?:new\s+)?({NAME})")
# The verb alternatives spell out both cases by hand instead of using
# re.IGNORECASE: the name groups rely on capitalisation to find their own
# boundaries, so a case-insensitive flag over the whole pattern would break them.
UPDATE_RE = re.compile(
    rf"\b(?:[Uu]pdate|[Cc]hange|[Ss]et|[Cc]orrect|[Mm]odify|[Aa]mend)\s+(?:the\s+)?"
    rf"({NAME})(?:'s|’s|s')?\s+(.{{2,40}}?)\s+to\s+(.+)",
)
RELATION_RE = re.compile(
    rf"({NAME})\s+(?:is|was|has been|are)?\s*"
    r"(?:connected|linked|associated|related|connect|link)\s+(?:to|with)\s+"
    rf"({NAME})",
)
LINK_VERB_RE = re.compile(rf"\b[Ll]ink\s+({NAME})\s+to\s+({NAME})")

# The trailing link on a CREATE. Officers phrase this several ways —
# "…, associated with Ramesh Yadav", "…and connect him with Ravindra
# Chaudhary", "…and link them to X" — so the pronoun and the verb form are
# both optional rather than a fixed template.
# The flag is scoped to the verb deliberately. A case-insensitive NAME group
# matches lowercase words too, which swallowed the word after the name:
# "connected with Anil Tandel through a phone call" captured "Anil Tandel
# through" and then tried to create a person by that name.
CREATE_LINK_RE = re.compile(
    r"(?i:(?:associated|connected|linked|related|connect|link|associate|relate)\s+"
    r"(?:him|her|them|it|this person|the person)?\s*(?:to|with)\s+)"
    rf"({NAME})")

NAMED_RE = re.compile(rf"\b(?:named|called|name is)\s+({NAME})")
# "Add a person, Sanjay Singh" — officers pause after the noun, and Whisper
# writes that pause as a comma. The separator is optional, so "add a person
# Sanjay Singh", "add a suspect: Sanjay Singh" and "add a person — Sanjay
# Singh" all reach the same slot.
NOUN_NAME_RE = re.compile(
    rf"\b(?:person|suspect|individual|accused|entity)\s*[,:;\u2013\u2014-]?\s*"
    rf"(?:named\s+|called\s+|by\s+the\s+name\s+)?({NAME})")
# ASR sometimes drops capitals entirely; only trusted right after "named".
LOOSE_NAMED_RE = re.compile(
    r"\b(?:named|called)\s+([a-z]+(?:\s+[a-z]+){0,2})\b", re.IGNORECASE)

# ── attributes ────────────────────────────────────────────────────────────
# Longest synonym first so "phone number" is not shadowed by "number".
FIELD_SYNONYMS: List[tuple] = [
    ("phone", ["phone number", "mobile number", "contact number", "cell number",
               "phone", "mobile", "contact", "number"]),
    ("account", ["bank account number", "bank account", "account number", "account"]),
    ("role", ["role", "designation", "position", "rank"]),
    ("cell", ["cell", "gang", "module", "group", "network"]),
    ("name", ["full name", "name", "spelling"]),
]
WRITABLE_FIELDS = tuple(f for f, _ in FIELD_SYNONYMS)

# Whisper writes a dictated number as "9876543210", "98765 43210" or
# "987-654-3210" depending on cadence; all three are the same ten digits.
PHONE_RE = re.compile(
    r"\b(?:phone|mobile|contact|cell)?\s*(?:number|no\.?)?\s*(?:is\s*)?"
    r"((?:\d[\s\-]?){9}\d)\b", re.IGNORECASE)
ACCOUNT_RE = re.compile(
    r"\baccount\s*(?:number|no\.?)?\s*(?:is\s*)?([A-Za-z]{0,3}\s?\d{4,16})\b",
    re.IGNORECASE)
ROLE_RE = re.compile(
    r"\b(?:role|designation|position)\s+(?:of\s+|is\s+|as\s+)?"
    r"([A-Za-z][A-Za-z ]{2,24}?)"
    # A role runs until the next clause: punctuation, a conjunction, or the
    # start of another attribute ("role Courier in cell B" is two attributes).
    r"(?=[,.]|$|\s+(?:and|with|in|at|of|cell|gang|module|phone|mobile|account)\b)",
    re.IGNORECASE)
CELL_RE = re.compile(r"\b(?:cell|gang|module)\s+([A-Za-z0-9]{1,12})\b", re.IGNORECASE)

# ── who was contacted ─────────────────────────────────────────────────────
# "who called 9167000003" names a second person by their number, not the new
# person's own phone. Read as an attribute it produced the worst possible
# answer: a refusal saying the number already belongs to someone else — which
# was precisely the officer's point. The contact clause is therefore captured
# first and removed before attributes are read, so "with mobile X who called Y"
# still gives X as the phone and Y as the link.
CONTACT_VERBS = (r"called|calls|calling|rang|phoned|contacted|contacts|"
                 r"spoke\s+to|speaks\s+to|in\s+contact\s+with|in\s+touch\s+with|"
                 r"paid|transferred\s+(?:money|funds)\s+to|sent\s+money\s+to|met")
CONTACT_RE = re.compile(
    rf"\b(?:who|whom|and|then)?\s*(?:{CONTACT_VERBS})\s+"
    rf"(?:the\s+)?(?:phone|mobile|contact|cell)?\s*(?:number|no\.?)?\s*"
    rf"(?:is\s*)?((?:\d[\s\-]?){{9}}\d|{_ENTITY_ID}|{_LATIN}|{_DEVA})",
    re.IGNORECASE)

# ── place of activity ─────────────────────────────────────────────────────
# "seen at Vashi", "active near Wagle Estate", "operating in Zaveri Bazaar".
# A sighting is not an attribute of the person — it is an observation with a
# place, so it is written as an intelligence report and the existing extractor
# turns it into the Location node and LOCATED_AT edge, exactly as it does for a
# surveillance log. The place itself is never invented: the writer resolves it
# against the locations already on record for the case.
LOCATION_CUES = (r"seen|spotted|observed|sighted|active|operating|present|"
                 r"located|moving|hanging around|loitering|arrested|picked up")
LOCATION_RE = re.compile(
    rf"\b(?:{LOCATION_CUES})\s+(?:at|in|near|around|outside)\s+"
    rf"(?:the\s+)?({_LATIN}|{_DEVA})")

# ── relationship vocabulary ───────────────────────────────────────────────
# Each spoken cue maps to a relationship kind the extractor already emits AND
# to the narrative wording that makes it emit that kind. We do not invent a new
# relationship type, and we do not bypass the extractor: we write a sentence it
# already knows how to read. `backend/extraction/entity_extractor.py`
# (_infer_relation_kind) is the authority for both columns.
RELATION_VOCAB: List[tuple] = [
    (["financial transaction", "transaction", "money", "payment", "transfer",
      "funds", "paid", "hawala"], "TRANSFERRED_TO", "{a} transferred funds to {b}"),
    (["phone call", "call", "calls", "spoke", "phone", "contact"],
     "CALLS", "{a} is in frequent contact with {b}"),
    (["meeting", "met", "seen with", "meet"], "MET", "{a} was seen meeting {b}"),
    (["works for", "employed", "employee", "reports to"],
     "WORKS_FOR", "{a} works for {b}"),
]
DEFAULT_RELATION = ("ASSOCIATED_WITH", "{a} is associated with {b}")

# Words that carry no slot of their own — never reported as "not understood".
_FILLER = {
    "a", "an", "and", "the", "to", "with", "of", "is", "was", "are", "new",
    "please", "add", "create", "register", "record", "enter", "insert",
    "person", "suspect", "individual", "accused", "entity", "named", "called",
    "name", "update", "change", "set", "correct", "modify", "amend", "his",
    "her", "their", "through", "via", "by", "as", "for", "in", "on", "that",
    "this", "it", "number", "no", "connected", "linked", "associated",
    "related", "link", "connect", "has", "been", "he", "she", "they",
    # the possessive in "Kumar's phone" splits to a bare "s"
    "s",
    # relative pronouns and objects joining the clauses of one command:
    # "named X whose phone is Y and connect him with Z"
    "whose", "who", "whom", "having", "him", "them", "its", "also", "then",
    # sighting phrasing — the place is captured, the verb around it is not
    "seen", "spotted", "observed", "sighted", "active", "operating", "present",
    "located", "moving", "around", "near", "outside", "at", "activity",
    "suspicious", "fishy", "activities",
}


class IngestCommand(BaseModel):
    """
    A proposed change to the case record, in the only form the writer accepts.

    Nothing reaches the source data except through this model — free text is
    never interpolated into a write. `operation` being None means the sentence
    was not an ingestion command at all, which is a refusal, not a default.
    """
    operation: Optional[str] = None            # CREATE | UPDATE | RELATIONSHIP
    entity_type: str = "Person"
    subject_name: Optional[str] = None
    object_name: Optional[str] = None
    attributes: Dict[str, str] = Field(default_factory=dict)
    location: Optional[str] = None            # place of activity, if one was given
    relation: Optional[str] = None             # canonical kind, e.g. TRANSFERRED_TO
    relation_phrase: Optional[str] = None      # what the officer actually said
    transcript: str = ""
    understood: List[str] = Field(default_factory=list)
    ignored: List[str] = Field(default_factory=list)

    @field_validator("operation")
    @classmethod
    def _known_operation(cls, v):
        if v is not None and v not in ("CREATE", "UPDATE", "RELATIONSHIP"):
            raise ValueError(f"unsupported operation {v!r}")
        return v

    @field_validator("attributes")
    @classmethod
    def _writable_attributes(cls, v):
        for field, value in v.items():
            if field not in WRITABLE_FIELDS:
                raise ValueError(
                    f"field {field!r} is not writable — allowed: {list(WRITABLE_FIELDS)}")
            if not str(value).strip():
                raise ValueError(f"field {field!r} has no value")
        if "phone" in v and not re.fullmatch(r"\d{10}", v["phone"]):
            raise ValueError("phone must be exactly 10 digits")
        return v

    def describe(self) -> str:
        """One line an investigator can check before committing."""
        if self.operation == "CREATE":
            bits = ", ".join(f"{k} {v}" for k, v in self.attributes.items())
            tail = f", linked to {self.object_name}" if self.object_name else ""
            where = f", seen at {self.location}" if self.location else ""
            return f"Add {self.entity_type.lower()} {self.subject_name}" \
                   + (f" ({bits})" if bits else "") + tail + where
        if self.operation == "UPDATE":
            bits = ", ".join(f"{k} → {v}" for k, v in self.attributes.items())
            return f"Update {self.subject_name}: {bits}"
        if self.operation == "RELATIONSHIP":
            return f"Link {self.subject_name} → {self.object_name} ({self.relation})"
        return "No ingestion operation recognised"


# Words that end a name rather than belong to it. Whisper capitalises the word
# after a proper noun often enough ("Vibhanshu Sharma Whose phone number…")
# that a cased-run regex swallows the connector, and "Vibhanshu Sharma Whose"
# then resolves to nobody — so the trailing connector is trimmed by vocabulary,
# not by case.
_NAME_STOP = {
    "whose", "who", "whom", "with", "and", "having", "has", "have", "is", "was",
    "phone", "mobile", "contact", "number", "no", "account", "role", "cell",
    "gang", "module", "alias", "designation", "position", "district", "station",
    "to", "at", "in", "of", "on", "from", "for", "by", "the", "a", "an",
    "connect", "connected", "connects", "link", "linked", "links", "associate",
    "associated", "related", "relate", "him", "her", "them", "his", "their",
    "its", "this", "that", "person", "suspect", "also", "then", "please",
    # a relationship cue that follows the name: "… with Anil Tandel through a call"
    "through", "via", "over", "using", "seen", "spotted", "observed", "active",
}


def _clean_name(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    n = re.sub(r"\s+", " ", raw).strip(" .,'’")
    n = re.sub(r"(?:'s|’s)$", "", n).strip()
    # Drop trailing connectors ("… Sharma Whose" → "… Sharma"), one at a time so
    # "Kumar And Sons" loses only the tail it should.
    parts = n.split()
    while parts and parts[-1].lower() in _NAME_STOP:
        parts.pop()
    n = " ".join(parts)
    return n or None


def _match_field(phrase: str) -> Optional[str]:
    low = phrase.lower().strip()
    for field, synonyms in FIELD_SYNONYMS:
        for syn in synonyms:
            if syn in low:
                return field
    return None


def _normalise_value(field: str, raw: str) -> str:
    v = raw.strip().strip(" .,")
    if field == "phone":
        return re.sub(r"\D", "", v)
    if field == "account":
        return re.sub(r"\s+", "", v).upper()
    if field == "cell":
        return v.strip().title() if len(v) > 1 else v.upper()
    return re.sub(r"\s+", " ", v)


# "a person called Ramesh" is a name; "who called Ramesh" is a phone call. The
# word is the same, so the one that follows a noun like person/suspect/name is
# read as naming and skipped.
_NAMING_LEAD = re.compile(
    r"(?:person|suspect|individual|accused|entity|name|named)\s*[,:;-]?\s*$",
    re.IGNORECASE)


def _find_contact(text: str):
    """First contact clause that is not the naming sense of 'called'."""
    for m in CONTACT_RE.finditer(text):
        target = m.group(1).strip()
        # A ten-digit number is never somebody's name, whatever precedes it.
        if len(re.sub(r"\D", "", target)) == 10:
            return m
        # "a person called Ramesh" names him; "a person WHO called Ramesh"
        # rang him. The naming sense only applies when the verb follows the
        # noun directly, so a relative pronoun in between settles it.
        leads_with_pronoun = re.match(r"\s*(?:who|whom|and|then)\b", m.group(0), re.IGNORECASE)
        if not leads_with_pronoun and _NAMING_LEAD.search(text[:m.start()]):
            continue
        return m
    return None


def _extract_attributes(text: str) -> Dict[str, str]:
    """Attributes stated alongside a CREATE. Each is optional."""
    out: Dict[str, str] = {}
    m = PHONE_RE.search(text)
    if m:
        digits = re.sub(r"\D", "", m.group(1))
        if len(digits) == 10:
            out["phone"] = digits
    m = ACCOUNT_RE.search(text)
    if m:
        out["account"] = _normalise_value("account", m.group(1))
    m = ROLE_RE.search(text)
    if m:
        out["role"] = _normalise_value("role", m.group(1)).title()
    m = CELL_RE.search(text)
    if m:
        out["cell"] = _normalise_value("cell", m.group(1))
    return out


def _classify_with_cue(text: str) -> tuple:
    """(kind, template, matched cue or None)."""
    low = (text or "").lower()
    for cues, kind, template in RELATION_VOCAB:
        for cue in cues:
            if cue in low:
                return kind, template, cue
    return (*DEFAULT_RELATION, None)


def classify_relation(text: str) -> tuple:
    """
    Spoken relationship wording → (kind, narrative template).

    Callers must pass only the clause describing the link, never the whole
    sentence: "phone number 9876543210" sits in the same breath as "associated
    with Ramesh Yadav", and scanning both would turn an association into a
    phone contact on the strength of an unrelated attribute.
    """
    kind, template, _ = _classify_with_cue(text)
    return kind, template


def _leftovers(text: str, consumed: List[str]) -> List[str]:
    """
    Words the parser did not account for.

    The query path publishes what it could not apply; a write path has more
    reason to, not less — an attribute the officer dictated and the system
    quietly skipped is a false record of what was said.
    """
    taken = set()
    for phrase in consumed:
        taken |= {w.lower() for w in re.findall(r"[\wऀ-ॿ]+", str(phrase))}
    seen, out = set(), []
    for word in re.findall(r"[\wऀ-ॿ]+", text or ""):
        low = word.lower()
        if low in taken or low in _FILLER or low.isdigit() or low in seen:
            continue
        seen.add(low)
        out.append(word)
    return out


def _find_subject_name(text: str) -> Optional[str]:
    for rx in (NAMED_RE, NOUN_NAME_RE, BARE_CREATE_NAME_RE):
        m = rx.search(text)
        if m:
            name = _clean_name(m.group(1))
            if name:
                return name
    m = LOOSE_NAMED_RE.search(text)
    if m:
        return _clean_name(m.group(1).title())
    return None


def parse_ingest_command(text: str) -> IngestCommand:
    """
    Transcript → IngestCommand.

    Returns an IngestCommand with `operation=None` when the sentence is not a
    data-entry instruction. That is the honest answer for "show me Ramesh
    Yadav's calls" arriving on this endpoint, and it keeps the ingestion path
    from acting on a query.
    """
    text = (text or "").strip()
    if not text:
        return IngestCommand(transcript="", ignored=["no speech detected"])

    # ── CREATE ────────────────────────────────────────────────────────────
    if CREATE_RE.search(text):
        # The contact clause is read first and cut out of the text, so its
        # number is never mistaken for the new person's own phone — and so that
        # "who CALLED Anil Tandel" is not read as "a person CALLED Anil
        # Tandel", the other sense of the same word.
        contact_m = _find_contact(text)
        contact, rest = None, text
        if contact_m:
            raw = contact_m.group(1).strip()
            digits = re.sub(r"\D", "", raw)
            contact = digits if len(digits) == 10 else _clean_name(raw)
            rest = text[:contact_m.start()] + " " + text[contact_m.end():]

        subject = _find_subject_name(rest)

        link = CREATE_LINK_RE.search(text)
        object_name = _clean_name(link.group(1)) if link else None
        if not object_name and contact:
            object_name = contact
        # A name captured as the link target must not also be the subject.
        if object_name and subject and object_name.lower() == subject.lower():
            object_name = None

        # Classify on the clause that named the other person — see
        # classify_relation(). "who called …" is a call; "linked to … through a
        # transaction" is a transfer.
        kind, cue = (None, None)
        if object_name:
            start = link.start() if link else (contact_m.start() if contact_m else 0)
            kind, _, cue = _classify_with_cue(text[start:])

        attributes = _extract_attributes(rest)

        loc_m = LOCATION_RE.search(text)
        location = _clean_name(loc_m.group(1)) if loc_m else None
        if location and subject and location.lower() == subject.lower():
            location = None

        understood = ["create person"]
        understood += [subject] if subject else []
        understood += [f"{k} {v}" for k, v in attributes.items()]
        if object_name:
            understood.append(f"link to {object_name} ({kind})")
            understood += [cue] if cue else []
        if location:
            understood.append(f"seen at {location}")

        cmd = IngestCommand(
            operation="CREATE", subject_name=subject, object_name=object_name,
            attributes=attributes, relation=kind, relation_phrase=text if object_name else None,
            location=location,
            transcript=text, understood=understood,
            ignored=_leftovers(text, understood + list(attributes.values())
                               + [subject or "", object_name or "", location or ""]),
        )
        if not subject:
            cmd.ignored.insert(0, "no name heard — say 'add a new person named …'")
        return cmd

    # ── UPDATE ────────────────────────────────────────────────────────────
    m = UPDATE_RE.search(text)
    if m:
        subject = _clean_name(m.group(1))
        field = _match_field(m.group(2))
        raw_value = m.group(3)
        attributes: Dict[str, str] = {}
        ignored: List[str] = []
        if field:
            value = _normalise_value(field, raw_value)
            if field == "phone":
                digits = re.sub(r"\D", "", raw_value)
                value = digits
                if len(digits) != 10:
                    field = None
                    ignored.append(f"'{raw_value.strip()}' is not a 10-digit phone number")
            if field:
                attributes[field] = value
        else:
            ignored.append(f"'{m.group(2).strip()}' is not a field this system stores")

        understood = ["update person", subject or ""] + \
                     [f"{k} to {v}" for k, v in attributes.items()]
        cmd = IngestCommand(
            operation="UPDATE", subject_name=subject, attributes=attributes,
            transcript=text, understood=[u for u in understood if u],
            ignored=ignored + _leftovers(text, understood + [raw_value]),
        )
        return cmd

    # ── RELATIONSHIP ──────────────────────────────────────────────────────
    m = RELATION_RE.search(text) or LINK_VERB_RE.search(text)
    if m:
        subject, object_name = _clean_name(m.group(1)), _clean_name(m.group(2))
        # "…through a financial transaction" — the qualifier trails the pair, so
        # only the tail decides the kind (see classify_relation).
        tail = text[m.end():]
        kind, _, cue = _classify_with_cue(tail if tail.strip() else text)
        understood = ["link", subject or "", object_name or "", kind]
        understood += [cue] if cue else []
        cmd = IngestCommand(
            operation="RELATIONSHIP", subject_name=subject, object_name=object_name,
            relation=kind, relation_phrase=text, transcript=text,
            understood=[u for u in understood if u],
            ignored=_leftovers(text, understood),
        )
        return cmd

    return IngestCommand(
        transcript=text,
        ignored=["not a data-entry instruction — say 'add a new person named …', "
                 "'update … to …', or 'X is connected to Y'"],
    )
