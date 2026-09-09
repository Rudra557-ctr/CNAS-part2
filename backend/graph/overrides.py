"""
Analyst curation layer (Gotham Browser-lite): property overrides + entity merges.

Analysts correct the machine — rename a mislabeled entity, fix a role/cell,
merge two AUTO-bootstrapped profiles that are the same person — without ever
touching source files or the built graph. Curation lives in
output/overrides.json (global demo graph) or <iid>/output/overrides.json
(case scope) and is applied at graph-serve time with analyst_override
provenance, so every curated value is traceable to who set it and when.

Schema:
  {"overrides": [{entity_id, field, old_value, new_value, updated_by, updated_at}],
   "merges":    [{keep_id, drop_id, merged_by, merged_at}]}
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from backend.config import PROJECT_ROOT

OVERRIDABLE_FIELDS = {"label", "cell", "role"}
GLOBAL_SCOPE_DIR = PROJECT_ROOT / "output"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def scope_dir_for(iid: Optional[str] = None) -> Path:
    if iid:
        from backend.ingestion.store import ROOT as INV_ROOT
        return INV_ROOT / iid / "output"
    return GLOBAL_SCOPE_DIR


def _path(scope_dir: Path) -> Path:
    return Path(scope_dir) / "overrides.json"


def load_store(scope_dir: Path) -> Dict[str, List[Dict]]:
    p = _path(scope_dir)
    if not p.exists():
        return {"overrides": [], "merges": []}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return {"overrides": data.get("overrides", []), "merges": data.get("merges", [])}
    except Exception:
        return {"overrides": [], "merges": []}


def _save(scope_dir: Path, store: Dict[str, List[Dict]]) -> None:
    d = Path(scope_dir)
    d.mkdir(parents=True, exist_ok=True)
    _path(d).write_text(json.dumps(store, indent=2), encoding="utf-8")


def add_override(scope_dir: Path, entity_id: str, field: str,
                 old_value, new_value, updated_by: str) -> Dict:
    if field not in OVERRIDABLE_FIELDS:
        raise ValueError(f"Field '{field}' is not analyst-editable (allowed: {sorted(OVERRIDABLE_FIELDS)})")
    store = load_store(scope_dir)
    rec = {"entity_id": entity_id, "field": field, "old_value": old_value,
           "new_value": new_value, "updated_by": updated_by, "updated_at": _now()}
    store["overrides"].append(rec)
    _save(scope_dir, store)
    return rec


def add_merge(scope_dir: Path, keep_id: str, drop_id: str, merged_by: str) -> Dict:
    if keep_id == drop_id:
        raise ValueError("keep_id and drop_id must differ")
    store = load_store(scope_dir)
    if any(m["drop_id"] == keep_id for m in store["merges"]):
        raise ValueError(f"{keep_id} is itself merged away — unmerge it first")
    if any(m["drop_id"] == drop_id for m in store["merges"]):
        raise ValueError(f"{drop_id} is already merged away")
    rec = {"keep_id": keep_id, "drop_id": drop_id, "merged_by": merged_by, "merged_at": _now()}
    store["merges"].append(rec)
    _save(scope_dir, store)
    return rec


def drop_target_of(scope_dir: Path, entity_id: str) -> Optional[str]:
    """If entity_id was merged away, return the surviving keep_id."""
    for m in load_store(scope_dir)["merges"]:
        if m["drop_id"] == entity_id:
            return m["keep_id"]
    return None


def history_for(scope_dir: Path, entity_id: str) -> List[Dict]:
    store = load_store(scope_dir)
    events = []
    for o in store["overrides"]:
        if o["entity_id"] == entity_id:
            events.append({"kind": "override", **o})
    for m in store["merges"]:
        if m["keep_id"] == entity_id or m["drop_id"] == entity_id:
            events.append({"kind": "merge", **m})
    events.sort(key=lambda e: e.get("updated_at") or e.get("merged_at") or "")
    return events


def apply_overrides(serial: Dict, scope_dir: Path) -> Dict:
    """Return a serve-time copy of serial with merges + overrides applied.

    - drop_id nodes are removed; their incident edges are re-pointed to keep_id
      (edges that would become self-loops are dropped) and flagged
      analyst_remapped with the original endpoint preserved.
    - property overrides win over canonical attributes; the node carries
      analyst_edited=True plus per-field {by, at} provenance.
    The stored serial on disk is never modified.
    """
    store = load_store(scope_dir)
    if not store["overrides"] and not store["merges"]:
        return serial

    keep_of = {m["drop_id"]: m["keep_id"] for m in store["merges"]}
    dropped = set(keep_of)

    nodes = []
    for n in serial.get("nodes", []):
        nid = n.get("id")
        if nid in dropped:
            continue
        n = dict(n)
        prov = {}
        for o in store["overrides"]:
            if o["entity_id"] == nid and o["field"] in OVERRIDABLE_FIELDS:
                n[o["field"]] = o["new_value"]
                prov[o["field"]] = {"by": o["updated_by"], "at": o["updated_at"]}
        if prov:
            n["analyst_edited"] = True
            n["analyst_override"] = prov
        nodes.append(n)

    edges = []
    for e in serial.get("edges", []):
        e = dict(e)
        src, dst = e.get("src"), e.get("dst")
        nsrc, ndst = keep_of.get(src, src), keep_of.get(dst, dst)
        if nsrc == ndst and (src in dropped or dst in dropped):
            continue  # merge would create a self-loop
        if nsrc != src or ndst != dst:
            e["analyst_remapped"] = True
            e["analyst_remap_from"] = [src, dst]
            e["src"], e["dst"] = nsrc, ndst
        edges.append(e)

    out = dict(serial)
    out["nodes"] = nodes
    out["edges"] = edges
    stats = dict(out.get("stats", {}))
    stats["node_count"] = len(nodes)
    stats["edge_count"] = len(edges)
    stats["analyst_curated"] = True
    out["stats"] = stats
    return out
