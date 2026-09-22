"""
Serve-time cache for derived reads.

Why this exists: every analytics endpoint used to re-read graph.json and all
CSVs from disk and recompute full-graph analytics (centrality, bridges,
bursts, structuring, cross-case, anomalies, temporal, lead scores) on EVERY
request — and /why runs seven of those at once. On localhost nobody notices;
on a small cloud CPU that is seconds per endpoint (42s observed for /why).

What is cached: parsed graph serials (overrides applied), parsed datasets,
and per-scope analytics results. Keys are (scope, name) with a fingerprint
of (mtime_ns, size) over the source files *that scope* derives from, so any
write — process, voice ingest, patch, merge, upload — busts that scope's
cache with no explicit invalidation calls anywhere, and leaves every other
case warm. Audit logging stays in the endpoint bodies and still fires per
request.

Concurrent misses on the same key are collapsed: the dashboard fires several
analytics requests at once, and on a one-CPU host each of them recomputing
the same full-graph centrality would multiply the cold-start cost by the
number of tabs asking. The first caller computes; the rest wait for it.
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
# One lock per cache entry, so a miss blocks only callers of that same entry.
# RLock: a compute may legitimately re-enter its own key on the same thread.
_KEY_LOCKS: Dict[tuple, threading.RLock] = {}


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


def _global_files() -> list:
    files = [
        PROJECT_ROOT / "output" / "graph.json",
        PROJECT_ROOT / "output" / "overrides.json",
        DATA_DIR / "people_directory.json",
    ]
    try:
        files += sorted(p for p in DATA_DIR.glob("*.csv") if p.is_file())
    except OSError:
        pass
    return files


def fingerprint(iid: Optional[str] = None) -> tuple:
    """
    (mtime,size) over the files one scope derives from. stat-only: cheap.

    Scoped rather than global: a write to one case must not throw away every
    other case's analytics. No analytic reads across cases, and curation
    overrides live per scope, so a case's own output/ and mapped/ are its
    whole input — except for a case with no built graph, which serves the
    shared datasets (see get_datasets) and so depends on the shared files too.
    """
    if not iid:
        files = _global_files()
    else:
        d = _inv_root() / iid
        files = [d / "output" / "graph.json",
                 d / "output" / "overrides.json",
                 d / "mapped" / "full_datasets.json"]
        if not files[0].exists():
            files += _global_files()
    return tuple(_stat(p) for p in files)


def _lock_for(key: tuple) -> threading.RLock:
    with _LOCK:
        lk = _KEY_LOCKS.get(key)
        if lk is None:
            lk = _KEY_LOCKS[key] = threading.RLock()
        return lk


def _cached(store: Dict, key, iid: Optional[str], compute: Callable[[], Any]) -> Any:
    """Return store[key] if its fingerprint is current, else compute it once."""
    fp = fingerprint(iid)
    with _LOCK:
        hit = store.get(key)
        if hit and hit[0] == fp:
            return hit[1]
    with _lock_for((id(store), key)):
        # Another caller may have filled it while we waited.
        fp = fingerprint(iid)
        with _LOCK:
            hit = store.get(key)
            if hit and hit[0] == fp:
                return hit[1]
        value = compute()
        with _LOCK:
            store[key] = (fp, value)
        return value


def _scope(iid: Optional[str]) -> str:
    return iid or "global"


def get_serial(iid: Optional[str] = None) -> Dict:
    """Graph serial with analyst overrides applied. Shared reference: read-only."""
    from backend.graph.builder import load_graph_serial
    from backend.graph.overrides import apply_overrides, scope_dir_for

    def _load():
        if iid:
            p = _inv_root() / iid / "output" / "graph.json"
            try:
                serial = json.loads(p.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                serial = {"nodes": [], "edges": [],
                          "stats": {"node_count": 0, "edge_count": 0}}
        else:
            serial = load_graph_serial()
        return apply_overrides(serial, scope_dir_for(iid))

    return _cached(_SERIALS, _scope(iid), iid, _load)


def get_datasets(iid: Optional[str] = None) -> Dict:
    """Parsed datasets. Mirrors _get_inv_datasets_and_serial's fallback:
    an iid with no built graph reads the shared datasets."""
    from backend.loader import load_all

    def _load():
        if iid and (_inv_root() / iid / "output" / "graph.json").exists():
            p = _inv_root() / iid / "mapped" / "full_datasets.json"
            try:
                datasets = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
            except ValueError:
                datasets = {}
            return datasets if isinstance(datasets, dict) else {}
        datasets, _ = load_all(DATA_DIR)
        return datasets

    return _cached(_DATASETS, _scope(iid), iid, _load)


def get_datasets_and_serial(iid: Optional[str] = None):
    return get_datasets(iid), get_serial(iid)


def get_result(iid: Optional[str], name: str, compute: Callable[[], Any]) -> Any:
    """Cache one analytics result for a scope. `compute` runs on miss only,
    and only once however many requests miss at the same moment."""
    return _cached(_RESULTS, (_scope(iid), name), iid, compute)


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


def warmup_all() -> Dict[str, bool]:
    """
    Warm the shared graph, then every case that has a built graph.

    Purvanchal (≈9.6k entities) is the scale story, and before this only the
    shared graph was warmed — so the one case a judge is most likely to open
    was also the one guaranteed to be cold. Shared first: it is the default
    dashboard.
    """
    done = warmup(None)
    try:
        cases = sorted(d.name for d in _inv_root().iterdir()
                       if (d / "output" / "graph.json").exists())
    except OSError:
        cases = []
    for iid in cases:
        done.update(warmup(iid))
    return done
