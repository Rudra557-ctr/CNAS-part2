"""
Turning a validated ingestion command into an actual change to the case record.

The graph in this system is *derived*: the pipeline rebuilds it from the files
under data/ every time. Writing a node straight into output/graph.json would
therefore be a lie with a short shelf life — the next rebuild would erase it,
and nothing downstream (resolution.csv, provenance, /why, the analytics) would
ever have seen it. So voice ingestion writes where the rest of the evidence
lives and then runs the same pipeline an uploaded file runs:

    people_directory.json / intelligence_reports.csv  →  pipeline  →  graph

Three things worth stating plainly.

*Scope.* Entities live per case. The shared demo dataset and each investigation
have their own people directory, their own uploads and their own graph, so a
name that exists in one is genuinely absent from another. Resolution reads the
person nodes of whichever graph the officer is looking at — the same universe
/people/search reads — and the write goes back to that same case's source
files. Resolving against one case and writing into another is how duplicates
get made.

*Relationships as intelligence.* A new relationship is recorded as an
intelligence report, because that is what an investigator's spoken assertion
actually is — a statement from a source, with a reliability grade attached —
and it means the existing extractor derives the edge from the narrative exactly
as it does for every other intel record.

*Rollback.* Every write is snapshotted first: if the pipeline refuses the new
data, the source files go back to how they were, because a half-applied
ingestion is worse than a rejected one.
"""
import csv
import datetime as _dt
import io
import json
import re
import threading
from contextlib import redirect_stdout
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from backend.config import DATA_DIR, PROJECT_ROOT
from backend.resolution.resolver import name_similarity
from backend.voice.ingest_parser import IngestCommand

INV_ROOT = DATA_DIR / "investigations"
GLOBAL_GRAPH = PROJECT_ROOT / "output" / "graph.json"

# Matching thresholds. The 85 mirrors RESOLUTION_FUZZY_THRESHOLD so voice entry
# and file ingestion agree on what counts as the same person. The margin is the
# ambiguity rule: two candidates within 5 points of each other are not a
# decision this system is entitled to make on its own.
MATCH_THRESHOLD = 85.0
AMBIGUITY_MARGIN = 5.0

# Voice-entered people get their own ID prefix so a reviewer can tell at a
# glance which records came from the field rather than from a seized dataset.
NEW_ID_PREFIX = "V"
DEFAULT_CELL = "Unassigned"
DEFAULT_ROLE = "Unverified (voice-entered)"
# An officer dictating from the field is a named source, not a confirmed fact.
VOICE_RELIABILITY = "C3 (Fairly reliable / Possibly true)"
# Day 1 of this dataset's timeline; every record carries both day and date.
_EPOCH = _dt.date(2026, 1, 1)

# Shapes a canonical ID can take here: A1, B11, X4, UP00303, AUTO-001, V2.
# A token is only *used* as an ID when it matches a record in the universe, so a
# loose pattern costs nothing.
_ID_TOKEN_RE = re.compile(r"\b([A-Za-z]{1,4}-?\d{1,6})\b")

_WRITE_LOCK = threading.Lock()


class IngestError(RuntimeError):
    """Raised when a write was attempted and could not be completed."""


# ── scope: which case's records are we talking about ──────────────────────

@dataclass(frozen=True)
class Scope:
    """Where one case keeps its people, its intel and its derived graph."""
    iid: Optional[str]
    people_path: Path
    intel_path: Path
    graph_path: Path

    @property
    def label(self) -> str:
        return self.iid or "shared graph"


def scope_for(iid: Optional[str] = None) -> Scope:
    if iid:
        base = INV_ROOT / iid
        if not base.exists():
            raise IngestError(f"Unknown investigation {iid}")
        return Scope(iid=iid,
                     people_path=base / "files" / "people_directory.json",
                     intel_path=base / "files" / "intelligence_reports.csv",
                     graph_path=base / "output" / "graph.json")
    return Scope(iid=None,
                 people_path=DATA_DIR / "people_directory.json",
                 intel_path=DATA_DIR / "intelligence_reports.csv",
                 graph_path=GLOBAL_GRAPH)


# Kept as module-level names because the tests and the API import them.
PEOPLE_PATH = DATA_DIR / "people_directory.json"
INTEL_PATH = DATA_DIR / "intelligence_reports.csv"


# ── reading source data ───────────────────────────────────────────────────

def load_people(scope: Optional[Scope] = None) -> Dict:
    scope = scope or scope_for(None)
    if not scope.people_path.exists():
        return {"network_people": [], "noise_people": []}
    with open(scope.people_path, encoding="utf-8") as f:
        return json.load(f)


def _all_people(directory: Dict) -> List[Dict]:
    return list(directory.get("network_people", [])) + list(directory.get("noise_people", []))


def load_universe(scope: Optional[Scope] = None) -> List[Dict]:
    """
    Every person the application currently knows about, for this case.

    Read from the derived graph rather than the people file, because that is the
    universe the rest of the app resolves against: /people/search, the graph
    view and /ask all read these nodes. It also includes people the pipeline
    bootstrapped from CDRs and transactions who were never in an uploaded
    directory — exactly the records that used to come back "no match" here while
    the officer could plainly see them in search.
    """
    scope = scope or scope_for(None)
    if scope.graph_path.exists():
        try:
            with open(scope.graph_path, encoding="utf-8") as f:
                serial = json.load(f)
            people = [
                {"id": n["id"], "name": n.get("label") or n["id"],
                 "name_hi": n.get("label_hi"), "role": n.get("role"),
                 "cell": n.get("cell"), "phone": str(n.get("phone") or ""),
                 "account": str(n.get("account") or "")}
                for n in serial.get("nodes", []) if n.get("kind") == "Person"
            ]
            if people:
                return people
        except (json.JSONDecodeError, OSError, KeyError):
            pass
    # No graph built yet — the people file is the only universe there is.
    return [{"id": p.get("id"), "name": p.get("name"), "name_hi": p.get("name_hi"),
             "role": p.get("role"), "cell": p.get("cell"),
             "phone": str(p.get("phone") or ""), "account": str(p.get("account") or "")}
            for p in _all_people(load_people(scope)) if p.get("id")]


def _next_person_id(universe: List[Dict], directory: Dict, pending: int = 0) -> str:
    taken = {p.get("id") for p in universe} | {p.get("id") for p in _all_people(directory)}
    n = 1 + pending
    while f"{NEW_ID_PREFIX}{n}" in taken:
        n += 1
    return f"{NEW_ID_PREFIX}{n}"


def _next_report_id(rows: List[Dict]) -> str:
    highest = 0
    for r in rows:
        m = re.search(r"(\d+)$", str(r.get("report_id") or ""))
        if m:
            highest = max(highest, int(m.group(1)))
    return f"INTEL{highest + 1:04d}"


def _latest_day(rows: List[Dict]) -> int:
    days = [int(r["day"]) for r in rows if str(r.get("day") or "").strip().isdigit()]
    return max(days) if days else 1


# ── entity resolution ─────────────────────────────────────────────────────

def match_people(name: str, people: List[Dict]) -> List[Tuple[Dict, float]]:
    """
    Every candidate, best first.

    Both scripts are compared because the register stores both: `name_similarity`
    romanises Devanagari, so a spoken Hindi name lands on the same record as its
    Latin spelling instead of creating a second one.
    """
    if not name:
        return []
    scored = []
    for p in people:
        score = name_similarity(name, p.get("name") or "")
        if p.get("name_hi"):
            score = max(score, name_similarity(name, p["name_hi"]))
        scored.append((p, round(score, 1)))
    scored.sort(key=lambda t: -t[1])
    return scored


def _id_in(spoken: str, people: List[Dict]) -> Optional[Dict]:
    """
    A canonical ID spoken in place of a name settles the question outright.

    Matched against the name slot alone, never the whole sentence: an ID given
    for the link target must not also claim the subject of the same command.
    """
    if not spoken:
        return None
    by_id = {str(p.get("id", "")).upper(): p for p in people}
    for token in _ID_TOKEN_RE.findall(spoken):
        hit = by_id.get(token.upper().replace(" ", ""))
        if hit:
            return hit
    return None


def resolve_person(name: str, people: List[Dict], _unused: str = "",
                   phone_hint: str = "") -> Dict:
    """
    → {"status": "resolved"|"ambiguous"|"absent", "person": …, "candidates": […]}

    "ambiguous" is a first-class answer, not a failure mode. This dataset holds
    three different men called Ravindra Chaudhary, in three districts, with
    three phone numbers; picking the highest of three identical scores would
    attach evidence to one of them on the strength of a coin flip. The officer
    can break the tie by saying the canonical ID or the phone number, both of
    which are checked before fuzzy matching runs.
    """
    exact = _id_in(name, people)
    if exact:
        return {"status": "resolved", "person": exact, "score": 100.0,
                "matched_on": "canonical id", "candidates": [_candidate(exact, 100.0)]}

    scored = match_people(name, people)
    above = [(p, s) for p, s in scored if s >= MATCH_THRESHOLD]

    if len(above) > 1 and phone_hint:
        narrowed = [(p, s) for p, s in above if str(p.get("phone") or "") == phone_hint]
        if len(narrowed) == 1:
            return {"status": "resolved", "person": narrowed[0][0], "score": narrowed[0][1],
                    "matched_on": "name + phone",
                    "candidates": [_candidate(p, s) for p, s in above[:5]]}

    if not above:
        return {"status": "absent", "person": None, "matched_on": None,
                "candidates": [_candidate(p, s) for p, s in scored[:3]]}
    if len(above) > 1 and (above[0][1] - above[1][1]) < AMBIGUITY_MARGIN:
        return {"status": "ambiguous", "person": None, "matched_on": None,
                "candidates": [_candidate(p, s) for p, s in above[:5]]}
    return {"status": "resolved", "person": above[0][0], "score": above[0][1],
            "matched_on": "name", "candidates": [_candidate(p, s) for p, s in above[:3]]}


def _candidate(p: Dict, score: float) -> Dict:
    return {"id": p.get("id"), "name": p.get("name"), "name_hi": p.get("name_hi"),
            "role": p.get("role"), "cell": p.get("cell"), "phone": p.get("phone"),
            "score": score}


def _disambiguation_hint(res: Dict, spoken: str) -> str:
    bits = []
    for c in res.get("candidates", [])[:4]:
        detail = " · ".join(x for x in (c.get("role"), c.get("cell"), c.get("phone")) if x)
        bits.append(f"{c['id']} ({detail})" if detail else str(c["id"]))
    return (f"Multiple records match “{spoken}”: {', '.join(bits)}. "
            "Say the ID or the phone number to pick one — nothing was changed.")


# ── planning: what would happen, decided before anything is written ───────

def plan_ingest(cmd: IngestCommand, iid: Optional[str] = None) -> Dict:
    """
    Dry run. Resolves every entity the command names and reports exactly one
    status. Only `ready` may be committed; everything else is a refusal with a
    reason the officer can act on.

    A name that does not resolve is not automatically a failure. For CREATE the
    subject is *expected* to be absent — that is the whole operation — and a
    relationship endpoint the command introduces is created alongside it. Only
    UPDATE insists the target already exists, because updating a person who is
    not on file would silently invent one.
    """
    scope = scope_for(iid)
    universe = load_universe(scope)
    transcript = cmd.transcript or ""
    phone = cmd.attributes.get("phone", "")

    base = {
        "operation": cmd.operation,
        "command": cmd.model_dump(),
        "summary": cmd.describe(),
        "scope": scope.label,
        "iid": iid,
        "universe_size": len(universe),
        "subject": None,
        "object": None,
        "changes": [],
        "creates": [],
        "requires_confirmation": True,
    }

    if not cmd.operation:
        return {**base, "status": "unrecognised", "requires_confirmation": False,
                "message": "That did not sound like a data-entry instruction. "
                           "Try “add a new person named …”, “update … to …”, "
                           "or “X is connected to Y”."}

    if not cmd.subject_name:
        return {**base, "status": "invalid", "requires_confirmation": False,
                "message": "No person name was heard in the command."}

    subject = resolve_person(cmd.subject_name, universe, transcript, phone)
    base["subject"] = {"spoken": cmd.subject_name, **subject}

    # ── CREATE ────────────────────────────────────────────────────────────
    if cmd.operation == "CREATE":
        if subject["status"] == "ambiguous":
            return {**base, "status": "ambiguous", "requires_confirmation": False,
                    "message": _disambiguation_hint(subject, cmd.subject_name)}
        if subject["status"] == "resolved":
            p = subject["person"]
            return {**base, "status": "duplicate", "requires_confirmation": False,
                    "message": f"{p['name']} ({p['id']}) already exists at "
                               f"{subject['score']}% match. No duplicate was created."}
        # A phone already on file belongs to someone; two owners is a conflict.
        if phone:
            owner = next((p for p in universe if str(p.get("phone")) == phone), None)
            if owner:
                return {**base, "status": "duplicate", "requires_confirmation": False,
                        "message": f"Phone {phone} is already registered to "
                                   f"{owner['name']} ({owner['id']}). Nothing was changed."}

        changes = [f"create Person “{cmd.subject_name}”"]
        changes += [f"set {k} = {v}" for k, v in cmd.attributes.items()]
        creates = [cmd.subject_name]

        if cmd.object_name:
            obj = resolve_person(cmd.object_name, universe, transcript)
            base["object"] = {"spoken": cmd.object_name, **obj}
            if obj["status"] == "ambiguous":
                return {**base, "status": "ambiguous", "requires_confirmation": False,
                        "message": _disambiguation_hint(obj, cmd.object_name)}
            if obj["status"] == "absent":
                # The command introduces this person as the other end of a new
                # link; refusing here would make "add A and connect them to B"
                # impossible whenever B is also new.
                creates.append(cmd.object_name)
                changes.append(f"create Person “{cmd.object_name}” (new link target)")
                changes.append(f"link to {cmd.object_name} as {cmd.relation}")
            else:
                changes.append(f"link to {obj['person']['name']} ({obj['person']['id']}) "
                               f"as {cmd.relation}")
        return {**base, "status": "ready", "changes": changes, "creates": creates,
                "message": f"Ready to add {cmd.subject_name}. Confirm to write it to the "
                           "case record and rebuild the graph."}

    # ── UPDATE ────────────────────────────────────────────────────────────
    if cmd.operation == "UPDATE":
        if subject["status"] == "ambiguous":
            return {**base, "status": "ambiguous", "requires_confirmation": False,
                    "message": _disambiguation_hint(subject, cmd.subject_name)}
        if subject["status"] == "absent":
            return {**base, "status": "not_found", "requires_confirmation": False,
                    "message": f"No record matches “{cmd.subject_name}” in {scope.label}. "
                               "Nothing was changed — use “add a new person named …” "
                               "to create them."}
        if not cmd.attributes:
            return {**base, "status": "invalid", "requires_confirmation": False,
                    "message": "No field and value were heard — say “update <name>'s "
                               "phone number to <10 digits>”."}
        p = subject["person"]
        changes = [f"{k}: {p.get(k) or '—'} → {v}" for k, v in cmd.attributes.items()]
        return {**base, "status": "ready", "changes": changes,
                "message": f"Ready to update {p['name']} ({p['id']})."}

    # ── RELATIONSHIP ──────────────────────────────────────────────────────
    if not cmd.object_name:
        return {**base, "status": "invalid", "requires_confirmation": False,
                "message": "Only one person was heard — a link needs two."}
    obj = resolve_person(cmd.object_name, universe, transcript)
    base["object"] = {"spoken": cmd.object_name, **obj}

    creates, changes = [], []
    for res, spoken in ((subject, cmd.subject_name), (obj, cmd.object_name)):
        if res["status"] == "ambiguous":
            return {**base, "status": "ambiguous", "requires_confirmation": False,
                    "message": _disambiguation_hint(res, spoken)}
        if res["status"] == "absent":
            creates.append(spoken)
            changes.append(f"create Person “{spoken}”")
    if (subject["status"] == "resolved" and obj["status"] == "resolved"
            and subject["person"]["id"] == obj["person"]["id"]):
        return {**base, "status": "invalid", "requires_confirmation": False,
                "message": "Both names resolved to the same person; a self-link was "
                           "not recorded."}
    if (subject["status"] == "absent" and obj["status"] == "absent"
            and cmd.subject_name.lower() == cmd.object_name.lower()):
        return {**base, "status": "invalid", "requires_confirmation": False,
                "message": "Both names are the same; a self-link was not recorded."}

    def _side(res, spoken):
        return f"{res['person']['name']} ({res['person']['id']})" \
            if res["status"] == "resolved" else f"{spoken} (new)"

    changes.append(f"{_side(subject, cmd.subject_name)} —{cmd.relation}→ "
                   f"{_side(obj, cmd.object_name)} as an intelligence report")
    return {**base, "status": "ready", "changes": changes, "creates": creates,
            "message": f"Ready to link {cmd.subject_name} to {cmd.object_name}."}


# ── writing source data ───────────────────────────────────────────────────

def _read_intel(scope: Scope) -> Tuple[List[str], List[Dict]]:
    if not scope.intel_path.exists():
        return (["report_id", "date", "day", "source_reliability", "narrative",
                 "mentioned_entity_ids", "ground_truth_flag"], [])
    with open(scope.intel_path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), list(reader)


def _append_intel_row(scope: Scope, src: Dict, dst: Dict, template: str,
                      transcript: str, operator: str) -> Dict:
    """
    Record the officer's assertion as an intelligence report.

    The narrative is composed from the template bound to the relationship kind
    so the existing unstructured extractor infers that same relationship when it
    reads the row back — the edge is derived by the pipeline, not injected
    around it.
    """
    fieldnames, rows = _read_intel(scope)
    day = _latest_day(rows)
    row = {
        "report_id": _next_report_id(rows),
        "date": (_EPOCH + _dt.timedelta(days=day - 1)).isoformat(),
        "day": str(day),
        "source_reliability": VOICE_RELIABILITY,
        "narrative": template.format(a=src["name"], b=dst["name"])
                     + f". Recorded by {operator} via voice data entry; "
                       f"dictated as: \"{transcript.strip()}\"",
        "mentioned_entity_ids": f"{src['id']}, {dst['id']}",
        "ground_truth_flag": "",
    }
    write_header = not scope.intel_path.exists()
    with open(scope.intel_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerow({k: row.get(k, "") for k in fieldnames})
    return row


def _ensure_people_registered(scope: Scope) -> Optional[str]:
    """
    Make sure the case's pipeline actually reads its people directory.

    An investigation only processes the files listed in its meta.json. A case
    can therefore have a people_directory.json sitting in files/ that nothing
    ever opens — its person records come from bootstrapping the CDRs instead,
    which is why they carry "Unknown (auto-bootstrapped)" roles. Writing a new
    suspect into an unregistered file would look like it worked and then vanish
    on the next rebuild, so the file is registered first, through the same
    detect/suggest/validate helpers an upload goes through.

    Returns a note when it had to register, so the caller can report it.
    """
    if not scope.iid or not scope.people_path.exists():
        return None
    from backend.api.main import INV_ROOT as _INV, save_meta, _require_meta
    from backend.ingestion.detector import detect_schema
    from backend.ingestion.mapper import suggest_mapping, validate_mapping

    meta = _require_meta(scope.iid)
    name = scope.people_path.name
    if any(f.get("original") == name for f in meta.get("files", [])):
        return None

    det = detect_schema(scope.people_path)
    mapping = suggest_mapping(det["columns"], det["detected_type"])
    valid, missing = validate_mapping(mapping, det["detected_type"])
    meta.setdefault("files", []).append({
        "original": name,
        "stored": f"{scope.iid}/files/{name}",
        "format": det["format"],
        "detected_type": det["detected_type"],
        "type_confidence": det["type_confidence"],
        "columns": det["columns"],
        "sample_rows": det["sample_rows"][:2],
    })
    meta.setdefault("mapping", {})[name] = {
        "mapping": mapping, "validated": valid, "missing": missing}
    save_meta(scope.iid, meta)
    return (f"registered {name} with case {scope.iid} — it was present but "
            "not being processed")


def _write_people(scope: Scope, directory: Dict) -> None:
    # Some directories carry a total_count alongside the list; keep it honest.
    if "total_count" in directory:
        directory["total_count"] = len(_all_people(directory))
    scope.people_path.parent.mkdir(parents=True, exist_ok=True)
    with open(scope.people_path, "w", encoding="utf-8") as f:
        json.dump(directory, f, ensure_ascii=False, indent=2)


def _snapshot(scope: Scope) -> Dict[Path, Optional[bytes]]:
    return {p: (p.read_bytes() if p.exists() else None)
            for p in (scope.people_path, scope.intel_path)}


def _restore(snapshot: Dict[Path, Optional[bytes]]) -> None:
    for path, blob in snapshot.items():
        if blob is None:
            path.unlink(missing_ok=True)
        else:
            path.write_bytes(blob)


# ── the pipeline, unchanged ───────────────────────────────────────────────

def rebuild_graph(scope: Optional[Scope] = None, operator: str = "voice-operator") -> Dict:
    """
    Run the project's existing pipeline over the modified source data.

    For the shared dataset this is `backend.pipeline.run_pipeline` — the
    identical call the CLI makes. For an investigation it is the very same
    handler the "Process" button hits, `POST /investigations/{iid}/process`,
    called directly. Ingestion gets no build path of its own, which is the only
    way the new record ends up with the same extraction, resolution and
    provenance as everything already in the case.
    """
    scope = scope or scope_for(None)
    log = io.StringIO()
    if scope.iid:
        from backend.api.main import inv_process
        with redirect_stdout(log):
            inv_process(scope.iid, user={"username": operator, "role": "investigator"})
    else:
        from backend.pipeline import run_pipeline
        with redirect_stdout(log):
            run_pipeline(clean=True)
    with open(scope.graph_path, encoding="utf-8") as f:
        return json.load(f)


def _verify(serial: Dict, person_ids: List[str], attributes: Dict[str, str],
            link: Optional[Tuple[str, str]]) -> Dict:
    """Read the rebuilt graph back and check the change is actually in it."""
    nodes = {n["id"]: n for n in serial.get("nodes", [])}
    checks: List[Dict] = []

    for pid in person_ids:
        node = nodes.get(pid)
        checks.append({"check": f"node {pid} present in graph", "ok": node is not None})

    if person_ids:
        node = nodes.get(person_ids[0])
        for field, value in attributes.items():
            if field == "name":
                checks.append({"check": f"label is {value}",
                               "ok": bool(node) and node.get("label") == value})
            elif field in ("phone", "account", "role", "cell"):
                checks.append({"check": f"{field} is {value}",
                               "ok": bool(node) and str(node.get(field)) == str(value)})

    if link:
        src, dst = link
        found = any({e.get("src"), e.get("dst")} == {src, dst}
                    for e in serial.get("edges", []))
        checks.append({"check": f"edge between {src} and {dst}", "ok": found})

    return {"verified": all(c["ok"] for c in checks) if checks else False,
            "checks": checks,
            "node_count": serial.get("stats", {}).get("node_count"),
            "edge_count": serial.get("stats", {}).get("edge_count")}


# ── commit ────────────────────────────────────────────────────────────────

def _new_record(person_id: str, name: str, attributes: Dict[str, str],
                operator: str) -> Dict:
    return {
        "id": person_id,
        "name": name,
        "role": attributes.get("role", DEFAULT_ROLE),
        "cell": attributes.get("cell", DEFAULT_CELL),
        "phone": attributes.get("phone", ""),
        "account": attributes.get("account", ""),
        "photo": "",
        "source": "voice_ingestion",
        "recorded_by": operator,
    }


def commit_ingest(cmd: IngestCommand, operator: str = "voice-operator",
                  iid: Optional[str] = None) -> Dict:
    """
    Apply a confirmed command: write source data, rebuild, verify.

    The plan is recomputed here rather than trusted from the client, so a record
    that changed between preview and confirmation cannot be written over. Any
    failure rolls the source files back to their exact prior bytes.
    """
    with _WRITE_LOCK:
        plan = plan_ingest(cmd, iid)
        if plan["status"] != "ready":
            return {**plan, "committed": False}

        scope = scope_for(iid)
        snapshot = _snapshot(scope)
        directory = load_people(scope)
        universe = load_universe(scope)
        written: List[str] = []
        created_ids: List[str] = []
        link: Optional[Tuple[str, str]] = None

        try:
            # Anyone the command introduces is created first, so a link written
            # afterwards always has two real records to point at.
            new_records: Dict[str, Dict] = {}
            for name in plan.get("creates", []):
                pid = _next_person_id(universe, directory, pending=len(new_records))
                attrs = cmd.attributes if name == cmd.subject_name else {}
                record = _new_record(pid, name, attrs, operator)
                directory.setdefault("network_people", []).append(record)
                new_records[name] = record
                created_ids.append(pid)
                written.append(f"{scope.people_path.name} ← {pid} {name}")
            if new_records:
                _write_people(scope, directory)
                note = _ensure_people_registered(scope)
                if note:
                    written.append(note)

            def _endpoint(side: str, spoken: str) -> Dict:
                resolved = (plan.get(side) or {}).get("person")
                return resolved or new_records[spoken]

            if cmd.operation == "UPDATE":
                pid = plan["subject"]["person"]["id"]
                target = next((p for p in _all_people(directory) if p.get("id") == pid), None)
                if target is None:
                    # Bootstrapped people exist in the graph without a row in the
                    # uploaded directory; write one so the edit has somewhere to
                    # live and the canonical ID survives the rebuild.
                    known = next(p for p in universe if p["id"] == pid)
                    target = _new_record(pid, known["name"],
                                         {k: v for k, v in known.items()
                                          if k in ("role", "cell", "phone", "account") and v},
                                         operator)
                    directory.setdefault("network_people", []).append(target)
                for field, value in cmd.attributes.items():
                    target[field] = value
                target["last_updated_by"] = operator
                _write_people(scope, directory)
                note = _ensure_people_registered(scope)
                if note:
                    written.append(note)
                created_ids = [pid]
                written.append(f"{scope.people_path.name} ← {pid} "
                               + ", ".join(f"{k}={v}" for k, v in cmd.attributes.items()))

            elif cmd.object_name:
                src = _endpoint("subject", cmd.subject_name)
                dst = _endpoint("object", cmd.object_name)
                _, template = _relation_template(cmd)
                row = _append_intel_row(scope, src, dst, template, cmd.transcript, operator)
                written.append(f"{scope.intel_path.name} ← {row['report_id']}")
                link = (src["id"], dst["id"])

            serial = rebuild_graph(scope, operator)
        except Exception as exc:  # noqa: BLE001 — every failure rolls back
            _restore(snapshot)
            raise IngestError(f"ingestion failed and was rolled back: {exc}") from exc

        verify_ids = created_ids or [plan["subject"]["person"]["id"]]
        verification = _verify(serial, verify_ids, cmd.attributes, link)
        return {
            **plan,
            "committed": True,
            "status": "committed" if verification["verified"] else "committed_unverified",
            "entity_id": verify_ids[0] if verify_ids else None,
            "entity_ids": verify_ids,
            "files_written": written,
            "pipeline": ("backend.api.main.inv_process(iid)" if scope.iid
                         else "backend.pipeline.run_pipeline(clean=True)"),
            "verification": verification,
            "message": _confirmation(cmd, plan, verify_ids, link),
        }


def _relation_template(cmd: IngestCommand) -> Tuple[str, str]:
    """The narrative wording bound to the relationship kind this command carries."""
    from backend.voice.ingest_parser import DEFAULT_RELATION, RELATION_VOCAB
    for _, kind, template in RELATION_VOCAB:
        if kind == cmd.relation:
            return kind, template
    return DEFAULT_RELATION


def _confirmation(cmd: IngestCommand, plan: Dict, ids: List[str],
                  link: Optional[Tuple[str, str]]) -> str:
    def _name(side: str, spoken: str) -> str:
        resolved = (plan.get(side) or {}).get("person")
        return resolved["name"] if resolved else spoken

    if cmd.operation == "UPDATE":
        bits = ", ".join(f"{k} to {v}" for k, v in cmd.attributes.items())
        return f"Updated {plan['subject']['person']['name']}'s {bits}."
    if cmd.operation == "CREATE":
        base = f"Added {cmd.subject_name} ({ids[0]})" if ids else f"Added {cmd.subject_name}"
        if link:
            return f"{base} and linked to {_name('object', cmd.object_name or '')}."
        return base + "."
    created = f" ({len(ids)} new record{'s' if len(ids) != 1 else ''} created)" if ids else ""
    return (f"Linked {_name('subject', cmd.subject_name or '')} to "
            f"{_name('object', cmd.object_name or '')} ({cmd.relation}){created}.")
