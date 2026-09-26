"""
Entity Extraction — structured (regex+phonenumbers) + unstructured (spaCy fallback)

Per project-plan.md: NER structured = Regex + phonenumbers, unstructured = spaCy
Extracts: Person, Phone, Vehicle (MH-DEMO-*), Location, Account, Organization (gang_affiliation)
Each extracted entity returns provenance: {source_id, source_type, day, confidence, raw_text}

Design: structured columns (caller_name, sender_name) are canonical anchors (confidence 0.95+).
Unstructured FIR narratives / social post_text / surveillance notes get lower confidence
and require resolution. This keeps extraction honest — no invented data.
"""
import re
import hashlib
from typing import List, Dict, Tuple
from pathlib import Path
import json

# Optional deps — graceful fallback if not installed
try:
    import phonenumbers
    HAS_PHONENUMBERS = True
except ImportError:
    HAS_PHONENUMBERS = False

try:
    import spacy
    HAS_SPACY = True
except ImportError:
    HAS_SPACY = False

from backend.config import DATA_DIR
from backend.extraction.devanagari import (
    has_devanagari, normalize_digits, infer_hindi_relation,
    extract_person_mentions as extract_hindi_persons,
)

# ---------------------------------------------------------------------------
# Regex patterns — support BOTH synthetic demo data AND real authorized data
# ---------------------------------------------------------------------------

# Real Indian mobile numbers: +91-9876543210, 09876543210, 9876543210
# Also matches synthetic demo numbers (70000xxxxx) for backward compatibility
PHONE_RE = re.compile(
    r'(?:(?:\+|00)91[\s\-]?)?[6-9]\d{9}\b'   # real Indian mobiles
    r'|\b70000\d{5}\b'                          # synthetic fallback
)

# Real Indian bank accounts: IFSC-prefixed (HDFC0001234567890),
# pure numeric (SBI 11-17 digit), or synthetic AC0009xxxxxx
ACCOUNT_RE = re.compile(
    r'\b[A-Z]{4}0\d{6,15}\b'   # IFSC-style (real)
    r'|\b\d{11,17}\b'           # pure numeric account (real)
    r'|AC0009\d{6}'             # synthetic fallback
)

# Real Indian vehicle registration: MH-12-AB-1234, DL-01-CAB-0001
# Also matches synthetic MH-DEMO-xxxx
VEHICLE_RE = re.compile(
    r'\b[A-Z]{2}[\s\-]?\d{1,2}[\s\-]?[A-Z]{1,3}[\s\-]?\d{4}\b'
)

# Indian-style phone generic fallback (if phonenumbers unavailable)
GENERIC_PHONE_RE = re.compile(
    r'(?:(?:\+|00)91[\s\-]?)?[6-9]\d{9}\b|\b70000\d{5}\b'
)

# Synthetic-data location list kept for backward compatibility with demo data.
# For real authorized data, location extraction uses spaCy GPE entities (below).
KNOWN_LOCATIONS = ["Dockside Ward", "Old Market Circle", "Riverside Colony",
                   "Industrial Estate Road", "Central Junction", "Eastgate",
                   "Hilltop Society", "Station Road", "New Colony",
                   "Warehouse District", "North Bypass", "Lakeview Chowk"]

LOCATION_RE = re.compile("|".join(re.escape(l) for l in KNOWN_LOCATIONS))


def extract_locations_from_text(text: str) -> list:
    """
    Extract locations from free text using two-pass strategy:
    1. Regex match against KNOWN_LOCATIONS (synthetic demo data)
    2. spaCy GPE/LOC/FAC NER (real authorized data — any location name)
    Returns deduplicated list of location strings.
    """
    found = set()
    # Pass 1: synthetic known locations
    for m in LOCATION_RE.finditer(text):
        found.add(m.group(0))
    # Pass 2: spaCy NER for real location names
    nlp = get_nlp()
    if nlp and text:
        try:
            doc = nlp(text[:5000])  # cap to avoid timeout on long documents
            for ent in doc.ents:
                if ent.label_ in ("GPE", "LOC", "FAC"):
                    found.add(ent.text.strip())
        except Exception:
            pass
    return list(found)

_nlp = None
def get_nlp():
    global _nlp
    if _nlp is not None:
        return _nlp
    if not HAS_SPACY:
        return None
    try:
        _nlp = spacy.load("en_core_web_sm")
    except OSError:
        # model not downloaded — use blank + regex only
        _nlp = None
    return _nlp

def _hash_evidence(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]

def extract_structured_entities(datasets: Dict) -> List[Dict]:
    """
    From CDRs / transactions / criminal_history — high confidence (0.95-1.0)
    Returns list of {entity_type, value, canonical_id, source_id, source_type, day, confidence, evidence_snippet, evidence_hash, extractor}
    Evidence provenance per Task2: every entity retains source record ID + supporting text + confidence + hash
    """
    entities = []
    # From people_directory — canonical truth (ground truth, not extracted — confidence 1.0)
    pd = datasets.get("people_directory", {})
    for p in pd.get("network_people", []) + pd.get("noise_people", []):
        # Task2: add evidence provenance even for canonical
        entities.append({"entity_type": "Person", "value": p["name"], "canonical_id": p["id"], "source_id": "people_directory", "source_type": "people_directory", "day": None, "confidence": 1.0, "phone": p.get("phone"), "account": p.get("account"), "cell": p.get("cell"), "evidence_snippet": f"people_directory:{p['id']} {p['name']}", "evidence_hash": _hash_evidence(p["name"]), "extractor": "canonical"})
        entities.append({"entity_type": "Phone", "value": p["phone"], "canonical_id": p["phone"], "source_id": "people_directory", "source_type": "people_directory", "day": None, "confidence": 1.0, "evidence_snippet": p["phone"], "evidence_hash": _hash_evidence(p["phone"]), "extractor": "canonical"})
        entities.append({"entity_type": "Account", "value": p["account"], "canonical_id": p["account"], "source_id": "people_directory", "source_type": "people_directory", "day": None, "confidence": 1.0, "evidence_snippet": p["account"], "evidence_hash": _hash_evidence(p["account"]), "extractor": "canonical"})
        # Task2: Organization from gang_affiliation is not in people_directory — will be extracted from criminal_history below

    for row in datasets.get("cdrs", []):
        for role, pid, name, phone in [("caller", row.get("caller_id"), row.get("caller_name"), row.get("caller_phone")),
                                      ("callee", row.get("callee_id"), row.get("callee_name"), row.get("callee_phone"))]:
            if pid and name:
                snippet = f"{row.get('call_id')}:{name} {phone} day{row.get('day')}"
                entities.append({"entity_type": "Person", "value": name, "canonical_id": pid, "source_id": row.get("call_id"), "source_type": "cdr", "day": row.get("day"), "confidence": 0.98, "phone": phone, "evidence_snippet": snippet, "evidence_hash": _hash_evidence(snippet), "extractor": "cdr_canonical"})
            if phone:
                conf = 0.98
                if HAS_PHONENUMBERS:
                    try:
                        pn = phonenumbers.parse(phone, "IN")
                        conf = 0.98 if phonenumbers.is_possible_number(pn) else 0.7
                    except:
                        pass
                entities.append({"entity_type": "Phone", "value": phone, "canonical_id": phone, "source_id": row.get("call_id"), "source_type": "cdr", "day": row.get("day"), "confidence": conf, "evidence_snippet": phone, "evidence_hash": _hash_evidence(phone), "extractor": "phonenumbers" if HAS_PHONENUMBERS else "regex_phone"})

    for row in datasets.get("transactions", []):
        for role, pid, name, acct in [("sender", row.get("sender_id"), row.get("sender_name"), row.get("sender_account")),
                                     ("receiver", row.get("receiver_id"), row.get("receiver_name"), row.get("receiver_account"))]:
            if pid and name:
                snippet = f"{row.get('txn_id')}:{name} {acct} INR{row.get('amount_inr')}"
                entities.append({"entity_type": "Person", "value": name, "canonical_id": pid, "source_id": row.get("txn_id"), "source_type": "transaction", "day": row.get("day"), "confidence": 0.98, "account": acct, "evidence_snippet": snippet, "evidence_hash": _hash_evidence(snippet), "extractor": "txn_canonical"})
            if acct:
                entities.append({"entity_type": "Account", "value": acct, "canonical_id": acct, "source_id": row.get("txn_id"), "source_type": "transaction", "day": row.get("day"), "confidence": 0.98, "evidence_snippet": acct, "evidence_hash": _hash_evidence(acct), "extractor": "regex_account"})
        # vehicles not in transactions — but check

    for row in datasets.get("criminal_history", []):
        pid = row.get("person_id")
        name = row.get("name")
        alias = row.get("alias")
        gang = row.get("gang_affiliation")
        if pid and name:
            entities.append({"entity_type": "Person", "value": name, "canonical_id": pid, "source_id": row.get("record_id"), "source_type": "criminal_history", "day": None, "confidence": 0.97, "evidence_snippet": f"{name} alias:{alias or ''} gang:{gang}", "evidence_hash": _hash_evidence(name+gang), "extractor": "criminal_history"})
        if alias:
            entities.append({"entity_type": "Person_alias", "value": alias, "canonical_id": pid, "source_id": row.get("record_id"), "source_type": "criminal_history", "day": None, "confidence": 0.6, "evidence_snippet": alias, "evidence_hash": _hash_evidence(alias), "extractor": "alias"})
        loc = row.get("known_address")
        if loc:
            entities.append({"entity_type": "Location", "value": loc, "canonical_id": loc, "source_id": row.get("record_id"), "source_type": "criminal_history", "day": None, "confidence": 0.7, "evidence_snippet": loc, "evidence_hash": _hash_evidence(loc), "extractor": "address"})
        if gang and gang.strip() and gang != "Unaffiliated":
            entities.append({"entity_type": "Organization", "value": gang, "canonical_id": gang, "source_id": row.get("record_id"), "source_type": "criminal_history", "day": None, "confidence": 0.75, "evidence_snippet": gang, "evidence_hash": _hash_evidence(gang), "extractor": "gang_affiliation"})

    # Locations from CDR towers, surveillance, FIR station
    for row in datasets.get("cdrs", []):
        loc = row.get("cell_tower_location")
        if loc:
            entities.append({"entity_type": "Location", "value": loc, "canonical_id": loc, "source_id": row.get("call_id"), "source_type": "cdr", "day": row.get("day"), "confidence": 0.9, "evidence_snippet": loc, "evidence_hash": _hash_evidence(loc), "extractor": "tower"})
    for row in datasets.get("firs", []):
        loc = row.get("location")
        if loc:
            entities.append({"entity_type": "Location", "value": loc, "canonical_id": loc, "source_id": row.get("fir_id"), "source_type": "fir", "day": row.get("day"), "confidence": 0.9, "evidence_snippet": loc, "evidence_hash": _hash_evidence(loc), "extractor": "fir_location"})
        station = row.get("station")
        if station:
            entities.append({"entity_type": "Location", "value": station, "canonical_id": station, "source_id": row.get("fir_id"), "source_type": "fir", "day": row.get("day"), "confidence": 0.8, "evidence_snippet": station, "evidence_hash": _hash_evidence(station), "extractor": "fir_station"})

    return entities

def extract_unstructured_entities(datasets: Dict, known_people_names: List[str] = None) -> List[Dict]:
    """
    From FIR narratives, social post_text, surveillance activity_notes, intel narratives
    Uses regex + spacy NER. Returns entities with lower confidence, needing resolution.
    """
    entities = []
    nlp = get_nlp()

    # Build canonical name set for alias matching fallback
    if known_people_names is None:
        pd = datasets.get("people_directory", {})
        known_people_names = [p["name"] for p in pd.get("network_people", []) + pd.get("noise_people", [])]

    def extract_from_text(text: str, source_id: str, source_type: str, day):
        if not text:
            return
        # Devanagari numerals are a 1:1 char swap, so spans stay valid while the
        # phone/account/vehicle regexes below start matching Hindi-typed records.
        text = normalize_digits(text)
        # 1. Regex for phones/accounts/vehicles/locations — high precision, Task2 provenance: supporting snippet (30 chars window) + hash
        def snippet_for(match_str, text, span_start=None, span_end=None):
            if span_start is not None:
                s = max(0, span_start-30)
                e = min(len(text), span_end+30)
                return text[s:e].strip().replace("\n"," ")
            idx = text.find(match_str)
            if idx == -1:
                return match_str
            return text[max(0, idx-30): min(len(text), idx+len(match_str)+30)].strip().replace("\n"," ")
        for m in PHONE_RE.finditer(text):
            snip = snippet_for(m.group(), text, m.start(), m.end())
            entities.append({"entity_type": "Phone", "value": m.group(), "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.95, "raw_text": m.group(), "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip), "extractor": "regex_phone"})
        for m in ACCOUNT_RE.finditer(text):
            snip = snippet_for(m.group(), text, m.start(), m.end())
            entities.append({"entity_type": "Account", "value": m.group(), "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.95, "raw_text": m.group(), "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip), "extractor": "regex_account"})
        for m in VEHICLE_RE.finditer(text):
            snip = snippet_for(m.group(), text, m.start(), m.end())
            entities.append({"entity_type": "Vehicle", "value": m.group(), "canonical_id": m.group(), "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.95, "raw_text": m.group(), "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip), "extractor": "regex_vehicle"})
        # Real-location extraction: synthetic gazetteer + spaCy GPE/LOC/FAC
        # (handles real authorized data — any location name, not just demo wards)
        for loc in extract_locations_from_text(text):
            snip = snippet_for(loc, text)
            entities.append({"entity_type": "Location", "value": loc, "canonical_id": loc, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.85, "raw_text": loc, "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip), "extractor": "regex_location"})

        # 2. spaCy NER for PERSON / ORG / GPE if available — Task2: add evidence snippet + hash + extractor
        if nlp:
            doc = nlp(text)
            for ent in doc.ents:
                txt = ent.text.strip()
                if len(txt) < 3:
                    continue
                # The English model mislabels Devanagari spans (postpositions come
                # back as ORG); the Hindi pass below handles that script instead.
                if has_devanagari(txt):
                    continue
                snip = text[max(0, ent.start_char-30): min(len(text), ent.end_char+30)].strip().replace("\n"," ")
                h = _hash_evidence(snip or txt)
                if ent.label_ == "PERSON":
                    entities.append({"entity_type": "Person_mention", "value": txt, "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.7, "raw_text": txt, "evidence_snippet": snip, "evidence_hash": h, "extractor": "spacy_person", "spacy_label": ent.label_})
                elif ent.label_ in ("GPE","LOC"):
                    entities.append({"entity_type": "Location", "value": txt, "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.65, "raw_text": txt, "evidence_snippet": snip, "evidence_hash": h, "extractor": "spacy_loc", "spacy_label": ent.label_})
                elif ent.label_ == "ORG":
                    entities.append({"entity_type": "Organization", "value": txt, "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.6, "raw_text": txt, "evidence_snippet": snip, "evidence_hash": h, "extractor": "spacy_org", "spacy_label": ent.label_})
        else:
            # Fallback when spaCy unavailable: extract candidate names via regex then resolver will fuzzy-match to canonical
            # Split on sentence boundaries to avoid cross-sentence joins like "Sheikh. Sajnay"
            # Keep conservative stop-list to avoid boilerplate (IPC, Case, etc.)
            STOP_WORDS = {"Police","Station","Team","Unit","Complaint","Shopkeeper","Missing","Traffic","Package","Meeting","Collections","Hustle","Grind","Biryani","Sunset","Cricket","Electrician","Act","Section","IPC","FIR","Complaint","Informant","Source","Complainant","Surveillance"}
            KNOWN_FIRST = {n.split()[0].lower() for n in known_people_names}
            # Also include known single-word aliases like Farhan, Salim etc. — handled via KNOWN_FIRST check below
            sentences = re.split(r"[.!?]\s+", text)
            for sent in sentences:
                # 2-word names
                caps = re.findall(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b", sent)
                for c in caps:
                    if any(sw in c for sw in STOP_WORDS):
                        continue
                    if len(c) < 4 or len(c) > 35:
                        continue
                    if "." in c:
                        continue
                    snip = sent.strip()[:120].replace("\n"," ")
                    entities.append({"entity_type": "Person_mention", "value": c, "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.45, "raw_text": c, "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip), "extractor": "fallback_two_word", "spacy_label": "FALLBACK"})
                # single-word aliases (nickname) — only if matches known first name
                singles = re.findall(r"\b[A-Z][a-z]{2,}\b", sent)
                for w in singles:
                    if w in STOP_WORDS:
                        continue
                    if w.lower() in KNOWN_FIRST:
                        # Avoid duplicate if already added as part of multi-word
                        if not any(w in c for c in caps):
                            snip = sent.strip()[:120].replace("\n"," ")
                            entities.append({"entity_type": "Person_mention", "value": w, "canonical_id": None, "source_id": source_id, "source_type": source_type, "day": day, "confidence": 0.40, "raw_text": w, "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip), "extractor": "fallback_single", "spacy_label": "FALLBACK_SINGLE"})

        # 3. Hindi / code-mixed narratives. en_core_web_sm tags nothing in
        # Devanagari, so mentions are pulled by cue word + gazetteer here and
        # carry their romanised form for the resolver.
        for hit in extract_hindi_persons(text, known_people_names):
            snip = snippet_for(hit["value"], text)
            entities.append({"entity_type": "Person_mention", "value": hit["value"], "canonical_id": None,
                             "source_id": source_id, "source_type": source_type, "day": day,
                             "confidence": hit["confidence"], "raw_text": hit["value"], "roman": hit["roman"],
                             "evidence_snippet": snip, "evidence_hash": _hash_evidence(snip),
                             "extractor": hit["extractor"], "spacy_label": "DEVANAGARI"})

    for row in datasets.get("firs", []):
        extract_from_text(row.get("narrative",""), row.get("fir_id"), "fir", row.get("day"))
        # also IPC sections as organization-like (with full provenance like other entities)
        ipc = row.get("ipc_sections","")
        if ipc:
            entities.append({"entity_type": "Organization", "value": ipc, "canonical_id": ipc, "source_id": row.get("fir_id"), "source_type": "fir", "day": row.get("day"), "confidence": 0.8, "raw_text": ipc, "evidence_snippet": ipc, "evidence_hash": _hash_evidence(ipc), "extractor": "ipc_section"})

    for row in datasets.get("social_posts", []):
        extract_from_text(row.get("post_text",""), row.get("post_id"), "social_post", row.get("day"))

    for row in datasets.get("surveillance_reports", []):
        extract_from_text(row.get("activity_notes",""), row.get("report_id"), "surveillance", row.get("day"))
        # vehicles in surveillance notes already via regex above

    for row in datasets.get("intelligence_reports", []):
        extract_from_text(row.get("narrative",""), row.get("report_id"), "intel", row.get("day"))

    return entities

def _hash_rel(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:16]

def _infer_relation_kind(sentence: str) -> Tuple[str, float]:
    hindi = infer_hindi_relation(sentence)
    if hindi:
        return hindi
    low = sentence.lower()
    if any(k in low for k in ["frequent contact", "contact to", "phone with"]):
        return "CALLS", 0.75
    if any(k in low for k in ["was seen meeting", "meeting", "conferring", "observed conferring"]):
        return "MET", 0.70
    if any(k in low for k in ["transferred", "sent ", "paid ", "forwarded", "handed over"]):
        return "TRANSFERRED_TO", 0.65
    if any(k in low for k in ["works for", "employed by", "working for", "member of"]):
        return "WORKS_FOR", 0.65
    if any(k in low for k in ["owns", "owner of", "possession of", "registered to"]):
        return "OWNS", 0.60
    if any(k in low for k in ["possible link", "link to", "associated with", "flagged for"]):
        return "ASSOCIATED_WITH", 0.65
    if "was found in possession" in low:
        return "ASSOCIATED_WITH", 0.60
    if "package changed hands" in low:
        return "TRANSACTED", 0.60
    return "ASSOCIATED_WITH", 0.55

def extract_relationships(datasets: Dict) -> List[Dict]:
    """
    Relationship extraction per design edges:
      CALLED (CDR), TRANSACTED (transaction), MENTIONED_IN (FIR/social), ASSOCIATED_WITH/MET/CALLS (unstructured), LOCATED_AT, BRIDGES_VIA
    Task2: every relationship retains provenance: source_id, source_type, day, timestamp, supporting_text, confidence, evidence_hash, extractor
    """
    rels = []
    for row in datasets.get("cdrs", []):
        caller = row.get("caller_id") or row.get("caller_phone")
        callee = row.get("callee_id") or row.get("callee_phone")
        cname = row.get("caller_name") or caller or "?"
        dname = row.get("callee_name") or callee or "?"
        snippet = f"{cname} -> {dname} day{row.get('day')} tower {row.get('cell_tower_location')}"
        rels.append({
            "src": caller, "dst": callee,
            "kind": "CALLED", "source": row.get("call_id"), "source_type": "cdr",
            "day": row.get("day"), "timestamp": row.get("timestamp"),
            "confidence": 1.0 if row.get("caller_id") and row.get("callee_id") else 0.5,
            "supporting_text": snippet,
            "evidence_hash": _hash_rel(snippet),
            "extractor": "cdr_structured",
            "meta": {"duration_sec": row.get("duration_sec"), "tower": row.get("cell_tower_location"), "call_type": row.get("call_type")}
        })
    for row in datasets.get("transactions", []):
        # Real bank exports carry accounts, not person IDs (normalizer fills UNK ids).
        # Fall back to account-node endpoints so the money trail still graphs;
        # persons attach via OWNS_ACCOUNT edges from bootstrapping.
        sid = row.get("sender_id")
        rid = row.get("receiver_id")
        sacc = (row.get("sender_account") or "").strip()
        racc = (row.get("receiver_account") or "").strip()
        if (not sid or str(sid).startswith("UNK")) and sacc:
            sid = f"ACCT_{sacc}"
        if (not rid or str(rid).startswith("UNK")) and racc:
            rid = f"ACCT_{racc}"
        sname = row.get("sender_name") or (sid if sid and not str(sid).startswith("UNK") else sacc) or "?"
        rname = row.get("receiver_name") or (rid if rid and not str(rid).startswith("UNK") else racc) or "?"
        snippet = f"{sname} -> {rname} INR{row.get('amount_inr')} {row.get('txn_type')}"
        rels.append({
            "src": sid, "dst": rid,
            "kind": "TRANSACTED", "source": row.get("txn_id"), "source_type": "transaction",
            "day": row.get("day"), "timestamp": row.get("timestamp"),
            "confidence": 1.0 if row.get("sender_id") and row.get("receiver_id") else 0.7,
            "supporting_text": snippet,
            "evidence_hash": _hash_rel(snippet),
            "extractor": "txn_structured",
            "meta": {"amount": row.get("amount_inr"), "txn_type": row.get("txn_type")}
        })
    # CDR tower co-location: caller observed at tower (drives Location nodes + hotspots)
    for row in datasets.get("cdrs", []):
        tower = (row.get("cell_tower_location") or "").strip()
        if not tower or tower == "Unknown":
            continue
        who = row.get("caller_id") or row.get("caller_phone")
        if not who:
            continue
        snippet = f"{who} observed at {tower} day{row.get('day')} ({row.get('call_id')})"
        rels.append({
            "src": who, "dst": tower,
            "kind": "LOCATED_AT", "source": row.get("call_id"), "source_type": "cdr",
            "day": row.get("day"), "timestamp": row.get("timestamp"),
            "confidence": 0.9, "supporting_text": snippet, "evidence_hash": _hash_rel(snippet),
            "extractor": "cdr_tower",
            "meta": {"tower": tower}
        })
    # Structured LOCATED_AT
    for row in datasets.get("firs", []):
        snippet = f"FIR {row.get('fir_id')} at {row.get('location')} {row.get('ipc_sections')}"
        rels.append({
            "src": row.get("fir_id"), "dst": row.get("location"),
            "kind": "LOCATED_AT", "source": row.get("fir_id"), "source_type": "fir",
            "day": row.get("day"), "timestamp": row.get("date"),
            "confidence": 0.9, "supporting_text": snippet, "evidence_hash": _hash_rel(snippet), "extractor": "fir_located",
            "meta": {"ipc": row.get("ipc_sections")}
        })
    for row in datasets.get("surveillance_reports", []):
        snippet = row.get("activity_notes","")[:160].replace("\n"," ")
        rels.append({
            "src": row.get("report_id"), "dst": row.get("location"),
            "kind": "LOCATED_AT", "source": row.get("report_id"), "source_type": "surveillance",
            "day": row.get("day"), "timestamp": row.get("date"),
            "confidence": 0.7 if row.get("confidence")=="High" else 0.5,
            "supporting_text": snippet, "evidence_hash": _hash_rel(snippet), "extractor": "surveillance_located",
            "meta": {"team": row.get("team"), "notes": snippet}
        })

    # Sightings: one person, one place, in a sentence that says they were seen
    # there. The pair extractor below needs two people in a sentence, so an
    # observation like "Sanjay Singh was observed at Wagle Estate PS, Thane"
    # produced a Location node and a Person node with nothing joining them.
    # This is the narrow case that fills that gap — a single person, a location
    # already on record for the case, and an explicit sighting verb between
    # them. Confidence is 0.6: an officer's report of a sighting, not a tower
    # ping.
    _SIGHTING_RE = re.compile(
        r"\b(?:observed|seen|spotted|sighted|located|present|arrested|picked up)\b"
        r"[^.]{0,20}?\b(?:at|in|near|outside|around)\b", re.IGNORECASE)
    _people = datasets.get("people_directory", {})
    _known = {p["name"]: p["id"] for p in
              _people.get("network_people", []) + _people.get("noise_people", [])}
    _places = {str(n) for rowset, field in (
        (datasets.get("surveillance_reports", []), "location"),
        (datasets.get("firs", []), "location"),
    ) for n in (r.get(field) for r in rowset) if n}

    def sightings_from_text(text: str, source_id, source_type, day, timestamp):
        if not text or not _SIGHTING_RE.search(text):
            return
        for sent in re.split(r"(?:[.!?]\s+|।\s*)", text):
            if not _SIGHTING_RE.search(sent):
                continue
            named = [n for n in _known if n.lower() in sent.lower()]
            here = [p for p in _places if p.lower() in sent.lower()]
            if len(named) != 1 or not here:
                continue
            place = max(here, key=len)
            snippet = f"{named[0]} observed at {place} ({source_id})"
            rels.append({
                "src": _known[named[0]], "dst": place, "kind": "LOCATED_AT",
                "source": source_id, "source_type": source_type, "day": day,
                "timestamp": timestamp, "confidence": 0.6,
                "supporting_text": snippet, "evidence_hash": _hash_rel(snippet),
                "extractor": "text_sighting", "meta": {"place": place},
            })

    for _row in datasets.get("intelligence_reports", []):
        sightings_from_text(_row.get("narrative", ""), _row.get("report_id"),
                            "intel", _row.get("day"), _row.get("date"))
    for _row in datasets.get("surveillance_reports", []):
        sightings_from_text(_row.get("activity_notes", ""), _row.get("report_id"),
                            "surveillance", _row.get("day"), _row.get("date"))

    # --- Task2: Unstructured relationship extraction from FIR / surveillance / intel narratives ---
    # Build canonical name set for substring matching (modest alias handling deferred to resolution)
    pd = datasets.get("people_directory", {})
    known_names = [p["name"] for p in pd.get("network_people", []) + pd.get("noise_people", [])]
    # Also include first names for single-word alias
    known_first = {n.split()[0] for n in known_names}
    def extract_rels_from_text(text: str, source_id: str, source_type: str, day, timestamp):
        if not text:
            return
        # Hindi sentences end with a danda (।), not a full stop.
        sentences = re.split(r"(?:[.!?]\s+|।\s*)", text)
        for sent in sentences:
            if len(sent.strip()) < 10:
                continue
            # Find candidate names in sentence via substring (canonical) + fallback caps
            cands = []
            low = sent.lower()
            for kn in known_names:
                if kn.lower() in low:
                    cands.append(kn)
            # Also try caps fallback for typo alias inside sentence (same regex as entity extractor)
            caps = re.findall(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b", sent)
            for c in caps:
                if c not in cands and len(c) < 35 and "Police" not in c and "Station" not in c:
                    # Only add if not already and looks like person (avoid locations)
                    if any(loc in c for loc in KNOWN_LOCATIONS):
                        continue
                    cands.append(c)
            # Single-word first names
            singles = re.findall(r"\b[A-Z][a-z]{2,}\b", sent)
            for w in singles:
                if w in known_first and w not in [x.split()[0] for x in cands]:
                    cands.append(w)
            # Hindi mentions in the same sentence become relationship endpoints too;
            # the resolver maps them onto canonical IDs downstream.
            if has_devanagari(sent):
                for hit in extract_hindi_persons(sent, known_names):
                    if hit["value"] not in cands:
                        cands.append(hit["value"])
            # Deduplicate, need at least 2 persons to form relationship
            uniq = []
            seen_low = set()
            for c in cands:
                if c.lower() in seen_low:
                    continue
                # "यादव" next to "रमेश यादव" is the same person — pairing them
                # would emit a self-loop once both resolve to one canonical ID.
                if any(c.lower() in u.lower() or u.lower() in c.lower() for u in uniq):
                    continue
                seen_low.add(c.lower())
                uniq.append(c)
            if len(uniq) >= 2:
                kind, conf = _infer_relation_kind(sent)
                # Create pairwise relationships (first with second, first with others) — keep modest
                src = uniq[0]
                for dst in uniq[1:3]:  # max 2 per sentence to avoid explosion
                    snippet = sent.strip()[:200].replace("\n"," ")
                    rels.append({
                        "src": src, "dst": dst,
                        "kind": kind, "source": source_id, "source_type": source_type,
                        "day": day, "timestamp": timestamp,
                        "confidence": conf,
                        "supporting_text": snippet,
                        "evidence_hash": _hash_rel(snippet),
                        "extractor": "unstructured_nlp",
                        "meta": {"sentence": snippet}
                    })
            # Location association for surveillance: if sentence contains location + person
            for loc in KNOWN_LOCATIONS:
                if loc in sent and len([c for c in uniq if c]) >= 1:
                    for person in uniq[:1]:
                        snippet = sent.strip()[:200]
                        rels.append({
                            "src": person, "dst": loc,
                            "kind": "LOCATED_AT", "source": source_id, "source_type": source_type,
                            "day": day, "timestamp": timestamp,
                            "confidence": 0.60,
                            "supporting_text": snippet,
                            "evidence_hash": _hash_rel(snippet),
                            "extractor": "unstructured_loc",
                            "meta": {"sentence": snippet}
                        })

    for row in datasets.get("firs", []):
        extract_rels_from_text(row.get("narrative",""), row.get("fir_id"), "fir", row.get("day"), row.get("date"))
    for row in datasets.get("surveillance_reports", []):
        extract_rels_from_text(row.get("activity_notes",""), row.get("report_id"), "surveillance", row.get("day"), row.get("date"))
    for row in datasets.get("intelligence_reports", []):
        extract_rels_from_text(row.get("narrative",""), row.get("report_id"), "intel", row.get("day"), row.get("date"))
    for row in datasets.get("social_posts", []):
        extract_rels_from_text(row.get("post_text",""), row.get("post_id"), "social_post", row.get("day"), row.get("timestamp"))

    return rels

def extract_all(datasets: Dict) -> Tuple[List[Dict], List[Dict]]:
    struct = extract_structured_entities(datasets)
    unstruct = extract_unstructured_entities(datasets)
    rels = extract_relationships(datasets)
    return struct + unstruct, rels
