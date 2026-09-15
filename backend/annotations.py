"""
Analyst annotations: comments pinned to nodes or whole cases (Gotham
collaboration-lite). Stored per scope next to overrides:
output/annotations.json (global) or <iid>/output/annotations.json (case).

Schema: {"comments": [{id, target_type: node|case, target_id, text,
                       created_by, created_at, edited_at?}]}
"""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from backend.graph.overrides import scope_dir_for

TARGET_TYPES = {"node", "case"}
MAX_TEXT = 2000


def _path(scope_dir: Path) -> Path:
    return Path(scope_dir) / "annotations.json"


def load_comments(scope_dir: Path) -> List[Dict]:
    p = _path(scope_dir)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("comments", []) if isinstance(data, dict) else []
    except Exception:
        return []


def _save(scope_dir: Path, comments: List[Dict]) -> None:
    d = Path(scope_dir)
    d.mkdir(parents=True, exist_ok=True)
    _path(d).write_text(json.dumps({"comments": comments}, indent=2), encoding="utf-8")


def add_comment(scope_dir: Path, target_type: str, target_id: str,
                text: str, created_by: str) -> Dict:
    if target_type not in TARGET_TYPES:
        raise ValueError(f"target_type must be one of {sorted(TARGET_TYPES)}")
    text = (text or "").strip()
    if not text:
        raise ValueError("Comment text must not be empty")
    if len(text) > MAX_TEXT:
        raise ValueError(f"Comment exceeds {MAX_TEXT} characters")
    comments = load_comments(scope_dir)
    rec = {"id": uuid.uuid4().hex[:8], "target_type": target_type,
           "target_id": target_id, "text": text,
           "created_by": created_by,
           "created_at": datetime.now(timezone.utc).isoformat()}
    comments.append(rec)
    _save(scope_dir, comments)
    return rec


def delete_comment(scope_dir: Path, cid: str, username: str, role: str) -> bool:
    comments = load_comments(scope_dir)
    for c in comments:
        if c["id"] == cid:
            if c["created_by"] != username and role != "admin":
                raise PermissionError("Only the author or an admin can delete this comment")
            _save(scope_dir, [x for x in comments if x["id"] != cid])
            return True
    return False


def comments_for(scope_dir: Path, target_type: Optional[str] = None,
                 target_id: Optional[str] = None) -> List[Dict]:
    out = load_comments(scope_dir)
    if target_type:
        out = [c for c in out if c["target_type"] == target_type]
    if target_id:
        out = [c for c in out if c["target_id"] == target_id]
    out.sort(key=lambda c: c.get("created_at") or "")
    return out
