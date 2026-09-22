"""
Voice data ingestion — parsing, entity resolution, refusals, and the write path.

The write tests are the point of this file. A parser test proves the system
understood a sentence; only a commit test proves the case record actually
changed and the derived graph agrees.

Every test that writes does so in its own throwaway case inside the test
session's temporary investigations store (see conftest), never in data/. The
earlier approach wrote the shared demo files and restored them afterwards; a
restore that missed once left test people in the demo dataset. A module-level
tripwire now fails the run if the shared demo files change at all.
"""
import hashlib
import json
import shutil
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
import backend.ingestion.store as store_mod
from backend.ingestion import voice_writer
from backend.ingestion.voice_writer import (
    INTEL_PATH, PEOPLE_PATH, commit_ingest, plan_ingest, resolve_person, scope_for,
)
from backend.voice.ingest_parser import (
    IngestCommand, classify_relation, parse_ingest_command,
)
from conftest import auth_headers

client = TestClient(app)
H = auth_headers("investigator")


def _digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture(scope="module", autouse=True)
def shared_demo_data_untouched():
    """Tripwire: nothing in this module may modify the shared demo files."""
    before = {p: _digest(p) for p in (PEOPLE_PATH, INTEL_PATH)}
    yield
    after = {p: _digest(p) for p in (PEOPLE_PATH, INTEL_PATH)}
    changed = [p.name for p in before if before[p] != after[p]]
    assert not changed, f"voice-ingest tests modified the shared demo data: {changed}"


@pytest.fixture(scope="module")
def template_case():
    """
    One processed case in the session's temp store, built the way an officer
    would: create a case, then Process with no uploads (the demo fast path
    copies the demo files in). Copied per test so writes never share state.
    """
    r = client.post("/investigations", headers=H,
                    json={"name": "voice-ingest template", "description": "pytest"})
    assert r.status_code == 200, r.text
    iid = r.json()["id"]
    r = client.post(f"/investigations/{iid}/process", headers=H)
    assert r.status_code == 200, r.text
    return iid


@pytest.fixture
def case(template_case):
    """A fresh processed copy of the template case."""
    root = store_mod.ROOT
    iid = "vt" + uuid.uuid4().hex[:6]
    shutil.copytree(root / template_case, root / iid)
    meta_path = root / iid / "meta.json"
    meta = json.loads(meta_path.read_text())
    meta["id"] = iid
    for f in meta.get("files", []):
        f["stored"] = f["stored"].replace(template_case, iid)
    meta_path.write_text(json.dumps(meta))
    return iid


def _case_graph(iid):
    return json.loads(scope_for(iid).graph_path.read_text(encoding="utf-8"))


def _case_people(iid):
    return json.loads(scope_for(iid).people_path.read_text(encoding="utf-8"))


@pytest.fixture
def people():
    return voice_writer._all_people(voice_writer.load_people())


# ── understanding the spoken command ──────────────────────────────────────

@pytest.mark.parametrize("text,operation", [
    ("Add a new person named Rajesh Kumar, phone number 9000000901", "CREATE"),
    ("Add a new suspect Rahul Sharma with phone 9000000902", "CREATE"),
    ("Update Rajesh Kumar's phone number to 9000000903", "UPDATE"),
    ("Change Ramesh Yadav's role to Financier", "UPDATE"),
    ("Rajesh Kumar is connected to Ramesh Yadav", "RELATIONSHIP"),
    ("Link Anwar Sheikh to Kavita Desai", "RELATIONSHIP"),
])
def test_operation_detection(text, operation):
    assert parse_ingest_command(text).operation == operation


def test_a_query_is_not_an_ingestion_command():
    # The ingestion endpoint must refuse to act on something the officer meant
    # as a question — otherwise Ask and Ingest can be confused for each other.
    cmd = parse_ingest_command("Show me all connections of Ramesh Yadav")
    assert cmd.operation is None
    assert cmd.ignored


def test_create_captures_attributes_and_a_trailing_link():
    cmd = parse_ingest_command(
        "Add a new person named Rajesh Kumar, phone number 9000000901, "
        "associated with Ramesh Yadav.")
    assert cmd.subject_name == "Rajesh Kumar"
    assert cmd.attributes == {"phone": "9000000901"}
    assert cmd.object_name == "Ramesh Yadav"
    # "phone number" sits in the same sentence; it must not turn an association
    # into a phone contact.
    assert cmd.relation == "ASSOCIATED_WITH"
    assert cmd.ignored == []


def test_role_and_cell_are_separate_attributes():
    cmd = parse_ingest_command(
        "Add a new suspect Rahul Sharma with phone 98765 43210 and role Courier in cell B")
    assert cmd.attributes == {"phone": "9876543210", "role": "Courier", "cell": "B"}


def test_relationship_kind_comes_from_the_qualifier():
    assert parse_ingest_command(
        "Rajesh Kumar is connected to Ramesh Yadav through a financial transaction"
    ).relation == "TRANSFERRED_TO"
    assert parse_ingest_command(
        "Anwar Sheikh is linked to Suresh Rane through phone calls"
    ).relation == "CALLS"
    assert parse_ingest_command(
        "Anwar Sheikh is linked to Suresh Rane"
    ).relation == "ASSOCIATED_WITH"


def test_every_relationship_kind_maps_to_wording_the_extractor_reads_back():
    # The edge is derived by the existing extractor from the narrative we write,
    # so the template must actually round-trip to the kind it claims.
    from backend.extraction.entity_extractor import _infer_relation_kind
    from backend.voice.ingest_parser import DEFAULT_RELATION, RELATION_VOCAB
    pairs = [(kind, template) for _, kind, template in RELATION_VOCAB]
    pairs.append(DEFAULT_RELATION)
    for kind, template in pairs:
        sentence = template.format(a="Anwar Sheikh", b="Suresh Rane")
        assert _infer_relation_kind(sentence)[0] == kind, sentence


def test_unusable_values_are_rejected_not_rounded_off():
    cmd = parse_ingest_command("Update Anwar Sheikh's phone number to 12345")
    assert cmd.attributes == {}
    assert any("10-digit" in i for i in cmd.ignored)

    cmd = parse_ingest_command("Update Ramesh Yadav's favourite colour to blue")
    assert cmd.attributes == {}
    assert any("not a field" in i for i in cmd.ignored)


def test_model_refuses_fields_outside_the_schema():
    with pytest.raises(ValueError):
        IngestCommand(operation="CREATE", attributes={"salary": "100"})
    with pytest.raises(ValueError):
        IngestCommand(operation="DELETE")
    with pytest.raises(ValueError):
        IngestCommand(operation="UPDATE", attributes={"phone": "123"})


def test_classify_relation_defaults_when_no_cue_is_present():
    assert classify_relation("no qualifier here")[0] == "ASSOCIATED_WITH"


# ── entity resolution ─────────────────────────────────────────────────────

def test_existing_person_resolves_to_their_canonical_record(people):
    out = resolve_person("Ramesh Yadav", people)
    assert out["status"] == "resolved" and out["person"]["id"] == "A7"


def test_a_misheard_name_still_resolves(people):
    # Whisper mangles proper nouns; fuzzy matching is what keeps a dictated
    # name from becoming a second record for the same person.
    out = resolve_person("Rameshh Yadav", people)
    assert out["status"] == "resolved" and out["person"]["id"] == "A7"


def test_a_hindi_name_resolves_to_the_same_record(people):
    out = resolve_person("रमेश यादव", people)
    assert out["status"] == "resolved" and out["person"]["id"] == "A7"


def test_an_unknown_name_resolves_to_nothing(people):
    assert resolve_person("Zzyzx Quibbleton", people)["status"] == "absent"


def test_near_identical_names_are_reported_ambiguous_not_guessed(people):
    # Two records at the same score must never be silently collapsed to one.
    twin = dict(people[0])
    twin["id"] = "ZZ1"
    out = resolve_person(people[0]["name"], people + [twin])
    assert out["status"] == "ambiguous"
    assert len(out["candidates"]) >= 2
    assert out["person"] is None


# ── planning refuses before it writes ─────────────────────────────────────

def test_creating_an_existing_person_is_refused_as_a_duplicate():
    plan = plan_ingest(parse_ingest_command("Add a new person named Ramesh Yadav"))
    assert plan["status"] == "duplicate"
    assert plan["requires_confirmation"] is False
    assert "A7" in plan["message"]


def test_creating_with_a_phone_already_on_file_is_refused():
    plan = plan_ingest(parse_ingest_command(
        "Add a new person named Brand Newname, phone number 7000000001"))
    assert plan["status"] == "duplicate"
    assert "7000000001" in plan["message"]


def test_updating_an_unknown_person_is_refused():
    plan = plan_ingest(parse_ingest_command(
        "Update Zzyzx Quibbleton's role to Financier"))
    assert plan["status"] == "not_found"


def test_linking_to_an_unknown_person_creates_them():
    # A link introduces its own endpoint. Refusing here would make "X is
    # connected to Y" impossible whenever Y is the new lead, which is the
    # commonest thing an officer dictates from the field.
    plan = plan_ingest(parse_ingest_command(
        "Anwar Sheikh is connected to Zzyzx Quibbleton"))
    assert plan["status"] == "ready"
    assert plan["creates"] == ["Zzyzx Quibbleton"]
    assert plan["subject"]["person"]["id"] == "A1"


def test_creating_a_person_who_is_absent_is_not_a_failure():
    # NOT_FOUND must never block a CREATE — the subject of a create is
    # *expected* to be absent.
    plan = plan_ingest(parse_ingest_command(
        "Add a new person named Zzyzx Quibbleton whose phone number is 9000000123"))
    assert plan["status"] == "ready"
    assert plan["creates"] == ["Zzyzx Quibbleton"]
    assert plan["command"]["attributes"] == {"phone": "9000000123"}


def test_both_endpoints_new_creates_both():
    plan = plan_ingest(parse_ingest_command(
        "Zzyzx Quibbleton is connected to Aaaa Bbbbcccc"))
    assert plan["status"] == "ready"
    assert plan["creates"] == ["Zzyzx Quibbleton", "Aaaa Bbbbcccc"]


def test_a_grammatical_connector_never_becomes_part_of_a_name():
    # "whose" is a separator; a name that swallows it resolves to nobody.
    for text in ("Add a new person named Vibhanshu Sharma whose phone number is 9335028378",
                 "Add a person named Vibhanshu Sharma Whose phone number is 9335028378",
                 "Add a new person named Asha Nair who has phone number 9000000902"):
        cmd = parse_ingest_command(text)
        assert cmd.subject_name is not None
        assert "whose" not in cmd.subject_name.lower()
        assert "who" not in cmd.subject_name.lower().split()


def test_natural_create_phrasings_all_parse():
    for text, subject, obj in [
        ("Create Vibhanshu Sharma with phone number 9335028378", "Vibhanshu Sharma", None),
        ("Add Vibhanshu Sharma, phone number 9335028378, connected to Ramesh Yadav",
         "Vibhanshu Sharma", "Ramesh Yadav"),
        ("Create Vibhanshu Sharma and link them with Ramesh Yadav",
         "Vibhanshu Sharma", "Ramesh Yadav"),
    ]:
        cmd = parse_ingest_command(text)
        assert cmd.operation == "CREATE", text
        assert cmd.subject_name == subject, text
        assert cmd.object_name == obj, text


def test_a_self_link_is_refused():
    plan = plan_ingest(parse_ingest_command(
        "Anwar Sheikh is connected to Anwar Sheikh"))
    assert plan["status"] in ("invalid", "unrecognised")


def test_a_refused_plan_never_writes(case):
    people = scope_for(case).people_path
    before = people.read_bytes()
    result = commit_ingest(parse_ingest_command("Add a new person named Ramesh Yadav"),
                           iid=case)
    assert result["committed"] is False
    assert result["status"] == "duplicate"
    assert people.read_bytes() == before, "a refusal must leave source data untouched"


# ── the write path, end to end ────────────────────────────────────────────

def test_create_reaches_the_graph_through_the_real_pipeline(case):
    result = commit_ingest(parse_ingest_command(
        "Add a new person named Rajesh Kumar, phone number 9000000901, "
        "associated with Ramesh Yadav."), operator="pytest", iid=case)

    assert result["committed"] is True
    assert result["status"] == "committed"
    assert result["verification"]["verified"] is True

    # 1. the case's source data really changed
    directory = _case_people(case)
    record = next(p for p in directory["network_people"] if p["id"] == result["entity_id"])
    assert record["name"] == "Rajesh Kumar" and record["phone"] == "9000000901"
    assert "Rajesh Kumar" in scope_for(case).intel_path.read_text(encoding="utf-8")

    # 2. the pipeline ran and the graph derived from it agrees
    serial = _case_graph(case)
    node = next(n for n in serial["nodes"] if n["id"] == result["entity_id"])
    assert node["label"] == "Rajesh Kumar" and node["kind"] == "Person"
    assert any({e["src"], e["dst"]} == {result["entity_id"], "A7"} for e in serial["edges"])

    # 3. the edge carries provenance, like every other edge in this graph
    edge = next(e for e in serial["edges"]
                if {e["src"], e["dst"]} == {result["entity_id"], "A7"})
    assert edge["supporting_text"] and edge["source"].startswith("INTEL")


def test_update_changes_the_record_and_the_node(case):
    result = commit_ingest(parse_ingest_command(
        "Update Ramesh Yadav's role to Financier"), operator="pytest", iid=case)
    assert result["committed"] is True and result["entity_id"] == "A7"
    assert result["verification"]["verified"] is True

    directory = _case_people(case)
    assert next(p for p in directory["network_people"]
                if p["id"] == "A7")["role"] == "Financier"
    serial = _case_graph(case)
    assert next(n for n in serial["nodes"] if n["id"] == "A7")["role"] == "Financier"


def test_relationship_between_two_existing_people_becomes_an_edge(case):
    serial_before = _case_graph(case)
    had = any({e["src"], e["dst"]} == {"A1", "B11"} for e in serial_before["edges"])

    result = commit_ingest(parse_ingest_command(
        "Anwar Sheikh is connected to Kavita Desai through a financial transaction"),
        operator="pytest", iid=case)
    assert result["committed"] is True
    assert result["verification"]["verified"] is True
    assert any("intelligence_reports.csv" in f for f in result["files_written"])

    serial = _case_graph(case)
    assert any({e["src"], e["dst"]} == {"A1", "B11"} for e in serial["edges"])
    if not had:
        assert serial["stats"]["edge_count"] > serial_before["stats"]["edge_count"]


def test_two_creates_do_not_collide_on_an_id(case):
    first = commit_ingest(parse_ingest_command(
        "Add a new person named Rajesh Kumar, phone number 9000000901"),
        operator="pytest", iid=case)
    second = commit_ingest(parse_ingest_command(
        "Add a new person named Suneeta Bhosle, phone number 9000000902"),
        operator="pytest", iid=case)
    assert first["entity_id"] != second["entity_id"]
    serial = _case_graph(case)
    ids = {n["id"] for n in serial["nodes"]}
    assert first["entity_id"] in ids and second["entity_id"] in ids


def test_update_of_an_absent_person_is_still_refused():
    # The one operation that must insist the target exists.
    plan = plan_ingest(parse_ingest_command(
        "Update Zzyzx Quibbleton's role to Financier"))
    assert plan["status"] == "not_found"


def test_a_second_create_of_the_same_person_is_caught_after_the_first_landed(case):
    # Duplicate prevention has to hold against records this feature itself
    # created, not just against the seed dataset.
    commit_ingest(parse_ingest_command(
        "Add a new person named Rajesh Kumar, phone number 9000000901"),
        operator="pytest", iid=case)
    again = commit_ingest(parse_ingest_command(
        "Add a new person named Rajesh Kumar"), operator="pytest", iid=case)
    assert again["committed"] is False and again["status"] == "duplicate"


# ── API contract ──────────────────────────────────────────────────────────

def test_ingest_requires_authentication():
    assert client.post("/api/voice-ingest", data={"text": "hello"}).status_code == 401
    assert client.post("/api/voice-ingest/commit", json={"command": {}}).status_code == 401


def test_analyst_cannot_reach_the_write_endpoints():
    analyst = auth_headers("analyst")
    assert client.post("/api/voice-ingest", headers=analyst,
                       data={"text": "Add a new person named X Y"}).status_code == 403


def test_preview_endpoint_interprets_without_writing():
    before = PEOPLE_PATH.read_bytes()
    r = client.post("/api/voice-ingest", headers=H, data={
        "text": "Add a new person named Rajesh Kumar, phone number 9000000901"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["operation"] == "CREATE"
    assert body["status"] == "ready"
    assert body["requires_confirmation"] is True
    assert body["command"]["subject_name"] == "Rajesh Kumar"
    assert PEOPLE_PATH.read_bytes() == before, "preview must not write"


def test_preview_reports_an_ambiguous_or_duplicate_target_without_writing():
    r = client.post("/api/voice-ingest", headers=H,
                    data={"text": "Add a new person named Ramesh Yadav"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "duplicate"
    assert body["success"] is False
    assert body["requires_confirmation"] is False


def test_empty_transcript_is_handled():
    r = client.post("/api/voice-ingest", headers=H, data={"text": "   "})
    assert r.status_code == 200 and r.json()["status"] == "empty"


def test_commit_rejects_a_command_the_schema_does_not_allow():
    r = client.post("/api/voice-ingest/commit", headers=H,
                    json={"command": {"operation": "DROP_TABLE", "subject_name": "X"}})
    assert r.status_code == 400
    assert "Traceback" not in str(r.json().get("detail", ""))


def test_commit_rejects_a_field_outside_the_writable_set():
    # The client cannot widen the write surface by editing the previewed command.
    r = client.post("/api/voice-ingest/commit", headers=H, json={"command": {
        "operation": "UPDATE", "subject_name": "Ramesh Yadav",
        "attributes": {"account_balance": "0"}}})
    assert r.status_code == 400


def test_full_round_trip_through_the_api(case):
    spoken = ("Add a new person named Rajesh Kumar, phone number 9000000901, "
              "associated with Ramesh Yadav.")
    preview = client.post(f"/api/voice-ingest?iid={case}", headers=H,
                          data={"text": spoken}).json()
    assert preview["status"] == "ready"
    assert preview["scope"] == case

    committed = client.post("/api/voice-ingest/commit", headers=H,
                            json={"command": preview["command"], "iid": case}).json()
    assert committed["success"] is True
    assert committed["verification"]["verified"] is True
    assert "Rajesh Kumar" in committed["message"]

    # the graph the UI reads for this case is the graph that changed
    graph = client.get(f"/investigations/{case}/graph", headers=H).json()
    assert any(n["id"] == committed["entity_id"] for n in graph["nodes"])


def test_bad_audio_is_rejected_with_a_readable_message():
    r = client.post("/api/voice-ingest", headers=H,
                    files={"file": ("notes.txt", b"hello", "application/octet-stream")})
    assert r.status_code == 400
    assert "Traceback" not in str(r.json().get("detail", ""))
