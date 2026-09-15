"""Score lineage — contributions mirror the documented formula; records cite evidence."""
from backend.lineage import build_lineage, WEIGHTS


def _ds():
    return {
        "people_directory": {
            "network_people": [
                {"id": "A1", "name": "Al", "cell": "A", "phone": "111", "account": ""},
                {"id": "B1", "name": "Bo", "cell": "B", "phone": "222", "account": ""},
            ],
            "noise_people": [],
        },
        "cdrs": [{"caller_id": "A1", "callee_id": "B1", "day": 5,
                  "cell_tower_location": "T1", "duration_sec": 60,
                  "timestamp": "", "call_id": "c1"}],
        "transactions": [], "firs": [], "social_posts": [],
        "criminal_history": [], "intelligence_reports": [],
        "surveillance_reports": [],
    }


def _serial():
    return {
        "nodes": [{"id": "A1", "label": "Al"}, {"id": "B1", "label": "Bo"}],
        "edges": [{"src": "A1", "dst": "B1", "kind": "CALLED", "source": "c1",
                   "source_type": "cdr", "supporting_text": "Al -> Bo",
                   "confidence": 1.0, "evidence_hash": "abc"}],
        "stats": {"node_count": 2, "edge_count": 1},
    }


def test_weights_sum_to_one():
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9
    assert len(WEIGHTS) == 7


def test_contributions_match_score():
    out = build_lineage("A1", _ds(), _serial())
    assert len(out["contributions"]) == 7
    assert out["formula"].startswith("0.25")
    if out["lead_score"] is not None:
        total = sum(c["points"] for c in out["contributions"])
        assert abs(total - out["lead_score"]) <= 1.0
    kinds = [r["kind"] for r in out["records"]]
    assert "edge" in kinds
    edge = next(r for r in out["records"] if r["kind"] == "edge")
    assert edge["ref"] == "c1" and edge["evidence_hash"] == "abc"
    assert out["provenance"]["node_count"] == 2


def test_unknown_entity_empty():
    out = build_lineage("ZZZ", _ds(), _serial())
    assert out["lead_score"] is None
    assert all(c["points"] == 0 for c in out["contributions"])
    assert out["records"] == []
