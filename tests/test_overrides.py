"""Analyst curation layer — store round-trip + serve-time transform.

Pure unit tests against tmp_path: no server, no fixture graphs touched.
"""
import pytest

from backend.graph.overrides import (
    add_override, add_merge, history_for, apply_overrides,
    drop_target_of, OVERRIDABLE_FIELDS,
)


def _serial():
    return {
        "nodes": [
            {"id": "A1", "label": "Anwar", "kind": "Person", "cell": "A", "role": "Kingpin"},
            {"id": "AUTO-1", "label": "AUTO-1", "kind": "Person", "cell": "Unknown", "role": "Unknown"},
            {"id": "T1", "label": "Tower", "kind": "Location", "cell": "Location"},
        ],
        "edges": [
            {"src": "A1", "dst": "AUTO-1", "kind": "CALLED"},
            {"src": "AUTO-1", "dst": "T1", "kind": "LOCATED_AT"},
            {"src": "A1", "dst": "T1", "kind": "LOCATED_AT"},
        ],
        "stats": {"node_count": 3, "edge_count": 3},
    }


def test_override_round_trip_and_apply(tmp_path):
    add_override(tmp_path, "A1", "role", "Kingpin", "Don", "tester")
    out = apply_overrides(_serial(), tmp_path)
    n = next(x for x in out["nodes"] if x["id"] == "A1")
    assert n["role"] == "Don"
    assert n["analyst_edited"] is True
    assert n["analyst_override"]["role"]["by"] == "tester"
    # disk serial untouched
    assert _serial()["nodes"][0]["role"] == "Kingpin"


def test_override_rejects_unknown_field(tmp_path):
    with pytest.raises(ValueError):
        add_override(tmp_path, "A1", "phone", "x", "y", "tester")


def test_merge_repoints_edges_and_drops_node(tmp_path):
    add_merge(tmp_path, "A1", "AUTO-1", "tester")
    assert drop_target_of(tmp_path, "AUTO-1") == "A1"
    out = apply_overrides(_serial(), tmp_path)
    ids = {n["id"] for n in out["nodes"]}
    assert "AUTO-1" not in ids and "A1" in ids
    kinds = {(e["src"], e["dst"], e["kind"]) for e in out["edges"]}
    assert ("A1", "T1", "LOCATED_AT") in kinds  # re-pointed, flagged
    remapped = [e for e in out["edges"] if e.get("analyst_remapped")]
    assert remapped and remapped[0]["analyst_remap_from"] == ["AUTO-1", "T1"]
    # A1->AUTO-1 CALLED would self-loop after re-point: dropped
    assert not any(e["src"] == e["dst"] for e in out["edges"])
    assert out["stats"]["node_count"] == 2


def test_merge_validation(tmp_path):
    with pytest.raises(ValueError):
        add_merge(tmp_path, "A1", "A1", "tester")
    add_merge(tmp_path, "A1", "AUTO-1", "tester")
    with pytest.raises(ValueError):
        add_merge(tmp_path, "T1", "AUTO-1", "tester")  # already merged


def test_history_orders_events(tmp_path):
    add_override(tmp_path, "A1", "role", "Kingpin", "Don", "tester")
    add_merge(tmp_path, "A1", "AUTO-1", "tester")
    ev = history_for(tmp_path, "A1")
    assert [e["kind"] for e in ev] == ["override", "merge"]
    assert history_for(tmp_path, "T1") == []
    assert history_for(tmp_path, "AUTO-1")[0]["kind"] == "merge"


def test_no_store_noop(tmp_path):
    s = _serial()
    out = apply_overrides(s, tmp_path)
    assert out is s  # untouched, same object
    assert "label" in OVERRIDABLE_FIELDS | {"cell", "role"}
