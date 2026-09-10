"""Tests for Gotham Dossier-lite storage and API endpoints.

Covers:
  - block validation and storage (note, entity, explainer, stats)
  - load/save/append
  - GET/POST/DELETE API endpoints
  - /live endpoint snapshot diffing
"""
import pytest
from fastapi.testclient import TestClient

from backend.api.main import app
from backend.dossier import load_blocks, save_blocks, append_block, BLOCK_KINDS
from backend.auth import create_token


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    token = create_token({"username": "vibhu123", "role": "investigator"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def analyst_headers():
    token = create_token({"username": "analyst_user", "role": "analyst"})
    return {"Authorization": f"Bearer {token}"}


def test_dossier_block_kinds():
    assert BLOCK_KINDS == {"note", "entity", "explainer", "stats"}


def test_save_and_load_blocks(tmp_path, monkeypatch):
    import backend.ingestion.store as store_mod
    monkeypatch.setattr(store_mod, "ROOT", tmp_path)

    iid = "test_case_dossier_01"
    b1 = {"kind": "note", "title": "Lead summary", "text": "Suspect frequenting station road."}
    b2 = {"kind": "entity", "title": "Anwar", "entity_id": "A1", "snapshot": {"role": "Kingpin"}}
    b3 = {"kind": "explainer", "title": "A1-A2 link", "src": "A1", "dst": "A2"}
    b4 = {"kind": "stats", "title": "Overview", "snapshot": {"node_count": 10, "edge_count": 15}}

    saved = save_blocks(iid, [b1, b2, b3, b4], "vibhu123")
    assert len(saved) == 4
    assert saved[0]["kind"] == "note"
    assert saved[0]["created_by"] == "vibhu123"
    assert saved[0]["id"]

    loaded = load_blocks(iid)
    assert len(loaded) == 4
    assert loaded[1]["entity_id"] == "A1"
    assert loaded[2]["src"] == "A1"
    assert loaded[2]["dst"] == "A2"


def test_append_block(tmp_path, monkeypatch):
    import backend.ingestion.store as store_mod
    monkeypatch.setattr(store_mod, "ROOT", tmp_path)

    iid = "test_case_dossier_02"
    rec = append_block(iid, {"kind": "note", "title": "First note", "text": "Hello"}, "vibhu123")
    assert rec["title"] == "First note"

    blocks = load_blocks(iid)
    assert len(blocks) == 1

    rec2 = append_block(iid, {"kind": "stats", "title": "Counts"}, "vibhu123")
    assert len(load_blocks(iid)) == 2


def test_validation_errors(tmp_path, monkeypatch):
    import backend.ingestion.store as store_mod
    monkeypatch.setattr(store_mod, "ROOT", tmp_path)

    iid = "test_case_dossier_03"
    with pytest.raises(ValueError, match="Block kind must be one of"):
        save_blocks(iid, [{"kind": "invalid_kind"}], "vibhu123")

    with pytest.raises(ValueError, match="entity blocks require entity_id"):
        save_blocks(iid, [{"kind": "entity", "title": "No ID"}], "vibhu123")

    with pytest.raises(ValueError, match="explainer blocks require src and dst"):
        save_blocks(iid, [{"kind": "explainer", "title": "Incomplete", "src": "A1"}], "vibhu123")


def test_api_dossier_flow(client, auth_headers, tmp_path, monkeypatch):
    from backend.ingestion.store import create_investigation
    import backend.ingestion.store as store_mod
    monkeypatch.setattr(store_mod, "ROOT", tmp_path)

    meta = create_investigation("Dossier Case", "For testing dossier API")
    iid = meta["id"]

    # 1. Initially empty
    res = client.get(f"/investigations/{iid}/dossier", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["blocks"] == []

    # 2. Pin a note block
    res = client.post(
        f"/investigations/{iid}/dossier/blocks",
        json={"kind": "note", "title": "Surveillance Log", "text": "Observed contact at 22:00"},
        headers=auth_headers
    )
    assert res.status_code == 200
    bid = res.json()["id"]

    # 3. Check dossier list
    res = client.get(f"/investigations/{iid}/dossier", headers=auth_headers)
    assert len(res.json()["blocks"]) == 1

    # 4. Delete block
    res = client.delete(f"/investigations/{iid}/dossier/blocks/{bid}", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()["blocks"]) == 0

def test_api_dossier_live_snapshot_diff(client, auth_headers, tmp_path, monkeypatch):
    from backend.ingestion.store import create_investigation
    import backend.ingestion.store as store_mod
    monkeypatch.setattr(store_mod, "ROOT", tmp_path)

    meta = create_investigation("Live Diff Case", "Testing live snapshot comparison")
    iid = meta["id"]

    # Pin a stats block with outdated snapshot (node_count=1, edge_count=0)
    # The live investigation will have different or empty counts
    client.post(
        f"/investigations/{iid}/dossier/blocks",
        json={
            "kind": "stats",
            "title": "Case Snapshot",
            "snapshot": {"node_count": 999, "edge_count": 999}
        },
        headers=auth_headers
    )

    # Fetch live dossier
    res = client.get(f"/investigations/{iid}/dossier/live", headers=auth_headers)
    assert res.status_code == 200
    blocks = res.json()["blocks"]
    assert len(blocks) == 1
    # Should flag changed because live node_count (0) != snapshot (999)
    assert blocks[0]["changed"] is True
    assert "fresh" in blocks[0]
