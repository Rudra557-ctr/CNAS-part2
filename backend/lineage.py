"""
Score lineage (Gotham trust-lite): per-entity "why this score" breakdown.

Reuses the transparent lead formula (see lead_scoring docstring) — this module
only reshapes existing outputs into contributions + contributing records, so
the numbers shown here can never drift from the scored pipeline.
"""
from datetime import datetime, timezone
from typing import Dict, List, Optional

from backend.analytics.lead_scoring import lead_for_entity
from backend.analytics.anomaly import get_unified_anomalies
from backend.analytics.cross_case import detect_cross_case

# Must mirror the weights in lead_scoring.compute_lead_scores exactly.
WEIGHTS: Dict[str, float] = {
    "bridge_score": 0.25,
    "financial_anomaly": 0.20,
    "communication_anomaly": 0.15,
    "temporal_correlation": 0.10,
    "evidence_quality": 0.15,
    "centrality": 0.10,
    "cross_case": 0.05,
}

LABELS: Dict[str, str] = {
    "bridge_score": "Bridge position",
    "financial_anomaly": "Financial anomaly",
    "communication_anomaly": "Communication bursts",
    "temporal_correlation": "Coordinated timing",
    "evidence_quality": "Evidence quality",
    "centrality": "Network centrality",
    "cross_case": "Cross-case links",
}

FORMULA = "0.25·bridge + 0.20·financial + 0.15·comms + 0.10·temporal + 0.15·evidence + 0.10·centrality + 0.05·cross-case"


def build_lineage(entity_id: str, datasets: Optional[Dict] = None,
                  serial: Optional[Dict] = None) -> Dict:
    lead = None
    try:
        lead = lead_for_entity(entity_id, datasets, serial)
    except Exception:
        lead = None
    signals = (lead or {}).get("signals", {}) if lead else {}

    contributions = []
    for sig, w in WEIGHTS.items():
        v = float(signals.get(sig, 0.0) or 0.0)
        contributions.append({
            "signal": sig,
            "label": LABELS[sig],
            "weight": w,
            "value": round(v, 3),
            "points": round(w * v * 100, 1),
        })
    contributions.sort(key=lambda c: c["points"], reverse=True)

    records: List[Dict] = []
    edges = (serial or {}).get("edges", []) if serial else []
    for e in edges:
        if e.get("src") == entity_id or e.get("dst") == entity_id:
            records.append({
                "kind": "edge",
                "ref": e.get("source"),
                "source_type": e.get("source_type"),
                "detail": (e.get("supporting_text") or "")[:160],
                "confidence": e.get("confidence"),
                "evidence_hash": e.get("evidence_hash"),
            })
            if len(records) >= 8:
                break
    if datasets is not None:
        try:
            for a in get_unified_anomalies(datasets):
                if a.get("entity_id") == entity_id:
                    records.append({
                        "kind": "anomaly",
                        "ref": a.get("anomaly_type"),
                        "source_type": "anomaly",
                        "detail": (a.get("explanation") or "")[:160],
                        "confidence": a.get("score"),
                        "evidence_hash": a.get("evidence_hash"),
                    })
        except Exception:
            pass
        try:
            for c in detect_cross_case(datasets):
                if c.get("shared_entity") == entity_id:
                    records.append({
                        "kind": "cross_case",
                        "ref": "; ".join((c.get("cases") or [])[:4]),
                        "source_type": "cross_case",
                        "detail": (c.get("relationship_path") or "")[:160],
                        "confidence": c.get("confidence"),
                        "evidence_hash": None,
                    })
        except Exception:
            pass

    nodes = (serial or {}).get("nodes", []) if serial else []
    return {
        "id": entity_id,
        "lead_score": (lead or {}).get("lead_score"),
        "priority": (lead or {}).get("priority"),
        "explanation": (lead or {}).get("explanation"),
        "reasons": (lead or {}).get("reasons", []),
        "formula": FORMULA,
        "contributions": contributions,
        "records": records[:14],
        "provenance": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "node_count": len(nodes),
            "edge_count": len(edges),
        },
    }
