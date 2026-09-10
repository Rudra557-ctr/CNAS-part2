"""
Dossier-lite storage: per-case report blocks (Gotham Dossier-lite).

A dossier is an ordered list of blocks pinned by analysts:
  note      — free prose {title, text}
  entity    — live reference {entity_id} + snapshot at pin time
  explainer — live reference {src, dst} + snapshot at pin time
  stats     — live case counters + snapshot at pin time

Blocks store refs, never frozen copies: the /live endpoint re-resolves every
ref against current data and flags changed blocks, so reports stay live-linked.
Stored at <iid>/output/dossier.json — never inside source data or graphs.
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

BLOCK_KINDS = {"note", "entity", "explainer", "stats"}


def _path(iid: str) -> Path:
    from backend.ingestion.store import ROOT as INV_ROOT
    return INV_ROOT / iid / "output" / "dossier.json"


def load_blocks(iid: str) -> List[Dict]:
    p = _path(iid)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("blocks", []) if isinstance(data, dict) else []
    except Exception:
        return []


def save_blocks(iid: str, blocks: List[Dict], username: str) -> List[Dict]:
    cleaned = []
    for b in blocks:
        if not isinstance(b, dict) or b.get("kind") not in BLOCK_KINDS:
            raise ValueError(f"Block kind must be one of {sorted(BLOCK_KINDS)}")
        nb = {"id": b.get("id") or uuid.uuid4().hex[:8], "kind": b["kind"],
              "created_by": b.get("created_by") or username,
              "created_at": b.get("created_at") or datetime.now(timezone.utc).isoformat()}
        for k in ("title", "text", "entity_id", "src", "dst", "snapshot"):
            if b.get(k) is not None:
                nb[k] = b[k]
        if nb["kind"] == "entity" and not nb.get("entity_id"):
            raise ValueError("entity blocks require entity_id")
        if nb["kind"] == "explainer" and (not nb.get("src") or not nb.get("dst")):
            raise ValueError("explainer blocks require src and dst")
        cleaned.append(nb)
    p = _path(iid)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"blocks": cleaned}, indent=2), encoding="utf-8")
    return cleaned


def append_block(iid: str, block: Dict, username: str) -> Dict:
    blocks = load_blocks(iid)
    if not isinstance(block, dict) or block.get("kind") not in BLOCK_KINDS:
        raise ValueError(f"Block kind must be one of {sorted(BLOCK_KINDS)}")
    saved = save_blocks(iid, blocks + [block], username)
    return saved[-1]
