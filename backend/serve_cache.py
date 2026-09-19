"""
Serve-time cache for derived reads.

Why this exists: every analytics endpoint used to re-read graph.json and all
CSVs from disk and recompute full-graph analytics (centrality, bridges,
bursts, structuring, cross-case, anomalies, temporal, lead scores) on EVERY
request — and /why runs seven of those at once. On localhost nobody notices;
on a small cloud CPU that is seconds per endpoint (42s observed for /why).

What is cached: parsed graph serials (overrides applied), parsed datasets,
and per-scope analytics results. Keys are (scope, name) with a fingerprint
of (mtime_ns, size) over every source file all scopes derive from, so any
write — process, voice ingest, patch, merge, upload — busts the cache with
no explicit invalidation calls anywhere. Audit logging stays in the endpoint
bodies and still fires per request.
"""
import json
import threading
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from backend.config import DATA_DIR, PROJECT_ROOT

_LOCK = threading.Lock()
_SERIALS: Dict[str, tuple] = {}
_DATASETS: Dict[str, tuple] = {}
_RESULTS: Dict[tuple, tuple] = {}


def _stat(p: Path):
    try:
        st = p.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def _inv_root() -> Path:
    # Resolved lazily (not from DATA_DIR) because tests redirect
    # backend.ingestion.store.ROOT into a tmp dir per session.
    from backend.ingestion import store as _store
    return _store.ROOT


def fingerprint() -> tuple:
    """(mtime,size) over every file any scope derives from. stat-only: cheap."""
    files = [
        PROJECT_ROOT / "output" / "graph.json",
        PROJECT_ROOT / "output" / "overrides.json",
        DATA_DIR / "people_directory.json",
    ]
    try:
        files += [p for p in DATA_DIR.glob("*.csv") if p.is_file()]
    except OSError:
        pass
    inv = _inv_root()
    try:
        for d in inv.iterdir():
            if d.is_dir():
                files += [d / "output" / "graph.json",
                          d / "output" / "overrides.json",
                          d / "mapped" / "full_datasets.json"]
    except OSError:
        pass
    return tuple(_stat(p) for p in files)


def _scope(iid: Optional[str]) -> str:
    return iid or "global"


def get_serial(iid: Optional[str] = None) -> Dict:
    """Graph serial with analyst overrides applied. Shared reference: read-only."""
    from backend.graph.builder import load_graph_serial
    from backend.graph.overrides import apply_overrides, scope_dir_for

    scope, fp = _scope(iid), fingerprint()
    with _LOCK:
        hit = _SERIALS.get(scope)
        if hit and hit[0] == fp:
            return hit[1]
    if iid:
        p = _inv_root() / iid / "output" / "graph.json"
        try:
            serial = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            serial = {"nodes": [], "edges": [],
                      "stats": {"node_count": 0, "edge_count": 0}}
    else:
        serial = load_graph_serial()
    serial = apply_overrides(serial, scope_dir_for(iid))
    with _LOCK:
        _SERIALS[scope] = (fp, serial)
    return serial


def get_datasets(iid: Optional[str] = None) -> Dict:
    """Parsed datasets. Mirrors _get_inv_datasets_and_serial's fallback:
    an iid with no built graph reads the shared datasets."""
    from backend.loader import load_all

    scope, fp = _scope(iid), fingerprint()
    with _LOCK:
        hit = _DATASETS.get(scope)
        if hit and hit[0] == fp:
            return hit[1]
    if iid and (_inv_root() / iid / "output" / "graph.json").exists():
        p = _inv_root() / iid / "mapped" / "full_datasets.json"
        try:
            datasets = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        except ValueError:
            datasets = {}
        if not isinstance(datasets, dict):
            datasets = {}
    else:
        datasets, _ = load_all(DATA_DIR)
    with _LOCK:
        _DATASETS[scope] = (fp, datasets)
    return datasets


def get_datasets_and_serial(iid: Optional[str] = None):
    return get_datasets(iid), get_serial(iid)


def get_result(iid: Optional[str], name: str, compute: Callable[[], Any]) -> Any:
    """Cache one analytics result for a scope. `compute` runs on miss only."""
    scope, fp = _scope(iid), fingerprint()
    key = (scope, name)
    with _LOCK:
        hit = _RESULTS.get(key)
        if hit and hit[0] == fp:
            return hit[1]
    value = compute()
    with _LOCK:
        _RESULTS[key] = (fp, value)
    return value


def warmup(iid: Optional[str] = None) -> Dict[str, bool]:
    """Precompute the hot read path once (called at startup). Never raises."""
    from backend.analytics.bridge_detection import compute_bridges
    from backend.analytics.burst_detection import detect_bursts
    from backend.analytics.centrality import compute_centrality
    from backend.analytics.lead_scoring import compute_lead_scores
    from backend.analytics.anomaly import get_unified_anomalies

    done: Dict[str, bool] = {}
    try:
        serial = get_serial(iid)
        datasets = get_datasets(iid)
        scope = _scope(iid)
        get_result(iid, "centrality", lambda: compute_centrality(graph_serial=serial))
        get_result(iid, "bridges", lambda: compute_bridges(graph_serial=serial))
        get_result(iid, "bursts", lambda: detect_bursts(datasets))
        get_result(iid, "leads_all", lambda: compute_lead_scores(datasets, serial))
        get_result(iid, "anomalies", lambda: get_unified_anomalies(datasets=datasets))
        done[scope] = True
    except Exception as exc:  # noqa: BLE001 — warmup is best-effort
        print(f"[warmup] {iid or 'global'} skipped: {exc}")
        done[_scope(iid)] = False
    return done
