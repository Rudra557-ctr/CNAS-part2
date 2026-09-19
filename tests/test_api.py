from fastapi.testclient import TestClient
from backend.api.main import app

from conftest import auth_headers

client = TestClient(app)
H = auth_headers("admin")

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["graph_nodes"] > 0

def test_graph_day_snapshot():
    r = client.get("/graph?day=58", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert "nodes" in data and "edges" in data
    assert data["day"] == 58
    # ghost trails 6-day fade
    assert len(data["edges"]) > 0

def test_graph_bad_day():
    r = client.get("/graph?day=999", headers=H)
    assert r.status_code == 422
    r = client.get("/graph?day=0", headers=H)
    assert r.status_code == 422

def test_bridges():
    r = client.get("/bridges", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0
    assert all("bridge_score" in b for b in data)

def test_bursts():
    r = client.get("/bursts", headers=H)
    assert r.status_code == 200
    assert len(r.json()) > 0

def test_why():
    r = client.get("/why/X1", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert "top_signals" in data
    assert "sources" in data
    assert len(data["sources"]) >= 2
    assert "Potential investigative lead" in data["disclaimer"]

def test_why_404():
    r = client.get("/why/UNKNOWN123", headers=H)
    assert r.status_code == 404

def test_ask_reports_what_it_understood():
    r = client.get("/ask", params={"q": "calls from A1 on day 61"}, headers=H)
    assert r.status_code == 200
    body = r.json()
    assert body["relation"] == "CALLED"
    assert body["subjects"] == ["A1"]
    assert any("day 61" in u for u in body["understood"])

def test_ask_unknown_returns_empty_not_error():
    # Partial or zero understanding is the normal case, not an HTTP error — but
    # it must never come back as a confident answer drawn from the whole graph.
    r = client.get("/ask", params={"q": "blabla unknown gibberish"}, headers=H)
    assert r.status_code == 200
    body = r.json()
    assert body["results"] == []
    assert body["ignored"], "unparsed terms must be reported, not dropped"

def _whatif_iid():
    r = client.post("/investigations", headers=H, json={"name": "whatif-test"})
    assert r.status_code == 200
    iid = r.json()["id"]
    r = client.post(f"/investigations/{iid}/process", headers=H)
    assert r.status_code == 200, r.text
    return iid

def test_whatif_remove_node():
    iid = _whatif_iid()
    try:
        r = client.get(f"/investigations/{iid}/whatif", params={"remove_id": "X1"}, headers=H)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["remove_id"] == "X1"
        assert d["remaining_nodes"] == d["original_nodes"] - 1
        assert d["remaining_edges"] < d["original_edges"]
        assert d["removed_edges"] == d["original_edges"] - d["remaining_edges"]
        assert d["disconnected_components"] >= 1
        assert 0 <= d["impact_score"] <= 100
        assert d["simulation_only"] is True
    finally:
        client.delete(f"/investigations/{iid}", headers=H)

def test_whatif_unknown_node():
    iid = _whatif_iid()
    try:
        r = client.get(f"/investigations/{iid}/whatif", params={"remove_id": "NOPE"}, headers=H)
        assert r.status_code == 404
    finally:
        client.delete(f"/investigations/{iid}", headers=H)

def test_whatif_role_gated():
    from conftest import auth_headers
    iid = _whatif_iid()
    try:
        assert client.get(f"/investigations/{iid}/whatif", params={"remove_id": "X1"}).status_code == 401
        assert client.get(f"/investigations/{iid}/whatif", params={"remove_id": "X1"}, headers=auth_headers("analyst")).status_code == 200
        assert client.get(f"/investigations/{iid}/whatif", params={"remove_id": "X1"}, headers=auth_headers("investigator")).status_code == 200
    finally:
        client.delete(f"/investigations/{iid}", headers=H)

def test_towers_schematic():
    from conftest import auth_headers
    assert client.get("/towers").status_code == 401
    assert client.get("/towers", headers=auth_headers("analyst")).status_code == 200
    r = client.get("/towers", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] > 0 and len(body["towers"]) == body["count"]
    assert "Schematic" in body["disclaimer"]
    t0 = body["towers"][0]
    assert {"tower_id", "label", "call_count", "cells", "dominant_cell", "co_location_count"} <= set(t0)
    assert t0["tower_id"].startswith("TWR-")
    assert sum(t["call_count"] for t in body["towers"]) == sum(
        1 for e in client.get("/graph", headers=H).json()["edges"] if e["kind"] == "CALLED")

def test_resolution_exposes_identity_matches():
    # The resolver's record of what it merged is the only place the pipeline's
    # identity decisions are visible — it must be readable, not just written to disk.
    assert client.get("/resolution").status_code == 401
    r = client.get("/resolution", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    s = body["summary"]
    assert s["total"] == len(body["rows"])
    assert s["merged"] + s["rejected"] == s["total"]
    row = body["rows"][0]
    assert {"mention", "master_id", "master_label", "script",
            "method_family", "rejected", "source_id"} <= set(row)


def test_resolution_distinguishes_refusals_from_merges():
    rows = client.get("/resolution", headers=H).json()["rows"]
    rejected = [r for r in rows if r["rejected"]]
    assert rejected, "demo data contains candidates scored below the merge threshold"
    for r in rejected:
        assert r["method_family"] == "fuzzy_reject"
        # A refusal must still name the candidate it declined, or an analyst
        # cannot review the decision.
        assert r["master_id"] and not r["master_id"].startswith("candidate->")


def test_resolution_flags_cross_script_matches():
    from backend.config import PROJECT_ROOT

    inv = client.post("/investigations", headers=H, json={"name": "nlq-hindi-res"}).json()
    iid = inv["id"]
    try:
        # Demo fast path first: without an existing identity registry there is
        # nothing for a Devanagari mention to resolve against.
        assert client.post(f"/investigations/{iid}/process", headers=H).status_code == 200
        with open(PROJECT_ROOT / "data" / "_real_samples" / "fir_0231_hindi_narrative.txt",
                  "rb") as fh:
            up = client.post(f"/investigations/{iid}/upload", headers=H,
                             files={"files": ("fir_hindi.txt", fh, "text/plain")})
        assert up.status_code == 200, up.text
        assert client.post(f"/investigations/{iid}/process", headers=H).status_code == 200

        body = client.get("/resolution", params={"iid": iid}, headers=H).json()
        cross = [r for r in body["rows"] if r["script"] == "devanagari"]
        assert cross, "Hindi mentions were not recorded as cross-script matches"
        assert body["summary"]["cross_script"] == len(cross)
        for r in cross:
            assert r["method_family"] == "fuzzy_translit"
            assert r["romanised"], "the romanised reading is what makes the match auditable"
            assert not r["rejected"]
        # The point of the feature: Hindi text resolved to an English person record.
        assert any(r["master_label"] == "Ramesh Yadav" for r in cross)
    finally:
        client.delete(f"/investigations/{iid}", headers=H)


def test_resolution_unknown_case_404s():
    assert client.get("/resolution", params={"iid": "nope"}, headers=H).status_code == 404
