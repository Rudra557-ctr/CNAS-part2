"""
Temporal Intelligence (Task 3 Feature 4).

Explain why activities on Days 58/61/64 are considered correlated, derived from data
(not hardcoded). Uses burst detection window analysis.
"""
from typing import Dict, List
from collections import defaultdict

from backend.config import DATA_DIR
from backend.loader import load_all
from backend.analytics.burst_detection import detect_bursts, daily_counts_by_cell

def get_temporal_intelligence(datasets: Dict = None) -> Dict:
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)
    bursts = detect_bursts(datasets)
    # Group bursts by day proximity (7-day span = correlated per spec)
    # Correct: group days where max-min <=7 (not just anchor distance)
    sorted_b = sorted(bursts, key=lambda x: x["day"])
    groups = []
    used = set()
    for b in sorted_b:
        if b["day"] in used:
            continue
        # Collect bursts where each day is within 7 of *all* group members (max-min <=7)
        # Start with anchor, expand while span <=7
        group = [b]
        for other in sorted_b:
            if other["day"] == b["day"]:
                continue
            candidate_days = sorted(set(x["day"] for x in group + [other]))
            if max(candidate_days) - min(candidate_days) <= 7 and abs(other["day"] - b["day"]) <= 7:
                group.append(other)
        if len(set(x["cell"] for x in group)) >= 2:
            cells = sorted(set(x["cell"] for x in group))
            days = sorted(set(x["day"] for x in group))
            span = max(days) - min(days)
            max_z = max(x["zscore"] for x in group)
            groups.append({
                "span": [min(days), max(days)],
                "days": days,
                "cells": cells,
                "burst_count": len(group),
                "max_zscore": max_z,
                "explanation": f"Correlated burst: {len(cells)} cells ({', '.join(cells)}) exceeded z>2.0 within {span}-day span {days}, max z={max_z}. Each burst derived as (count - mean[day-6..day-1])/std.",
                "supporting_bursts": group,
                "evidence_hash": f"temporal-{min(days)}-{max(days)}"
            })
            for x in group:
                used.add(x["day"])
    # Story slice 50-70 specific highlight
    story_bursts = [b for b in bursts if 50 <= b["day"] <= 70]
    story_groups = [g for g in groups if any(50 <= d <= 70 for d in g["days"])]
    # Derive Day 58/61/64 narrative from actual closest bursts
    narrative = []
    for target in [58, 61, 64]:
        closest = min(bursts, key=lambda x: abs(x["day"]-target)) if bursts else None
        if closest and abs(closest["day"]-target) <= 3:
            narrative.append({"target_day": target, "actual_burst": closest, "offset": closest["day"]-target})
        else:
            narrative.append({"target_day": target, "actual_burst": None, "offset": None})

    return {
        "bursts": bursts,
        "correlated_groups": groups,
        "story_slice": {"range": [50,70], "bursts_in_slice": story_bursts, "correlated_in_slice": story_groups},
        "narrative_days": narrative,
        "explanation": f"Derived from {len(bursts)} bursts (z>2.0) across A/B/C. {len(groups)} correlated groups where ≥2 cells spiked within 7 days. Story slice 50-70 contains {len(story_bursts)} bursts."
    }

def temporal_for_entity(entity_id: str, datasets: Dict = None) -> Dict:
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)
    intel = get_temporal_intelligence(datasets)
    # Map entity to its cell, then find its cell's bursts
    pd = datasets.get("people_directory", {})
    id_to_cell = {p["id"]: p.get("cell") for p in pd.get("network_people", [])+pd.get("noise_people",[])}
    cell = id_to_cell.get(entity_id)
    if not cell:
        return {"correlated": False, "reason": "Unknown cell"}
    cell_bursts = [b for b in intel["bursts"] if b["cell"]==cell]
    correlated = any(cell in g["cells"] for g in intel["correlated_groups"])
    return {
        "entity_id": entity_id,
        "cell": cell,
        "cell_bursts": cell_bursts[:3],
        "correlated": correlated,
        "explanation": f"Entity {entity_id} cell {cell} has {len(cell_bursts)} bursts; correlated={correlated} (within 7-day multi-cell span)" if cell_bursts else "No bursts for entity cell"
    }


def _as_int_day(v):
    try:
        d = int(v)
        return d if d >= 0 else None
    except (TypeError, ValueError):
        return None


def _as_amount(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def get_playback(datasets: Dict = None) -> Dict:
    """Day-by-day case playback + algorithm-picked highlights.

    Works on ANY case (not just A/B/C demo cells): per-day stats come from
    raw rows; bursts/anomalies/correlated groups layer on top when present.
    Returns days (chronological), key_dates, unusual_periods, flagged_days.
    """
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)

    pd = datasets.get("people_directory", {}) or {}
    id_to_name = {}
    for p in (pd.get("network_people", []) + pd.get("noise_people", [])):
        id_to_name[p.get("id")] = p.get("name") or p.get("id")

    def _name(pid):
        return id_to_name.get(pid) or pid

    per_day: Dict[int, Dict] = {}

    def _d(day):
        if day not in per_day:
            per_day[day] = {"day": day, "calls": 0, "minutes": 0,
                            "transactions": 0, "txn_amount": 0.0,
                            "firs": [], "reports": 0,
                            "entities": defaultdict(int), "pairs": defaultdict(int)}
        return per_day[day]

    for c in (datasets.get("cdrs", []) or []):
        day = _as_int_day(c.get("day"))
        if day is None:
            continue
        d = _d(day)
        d["calls"] += 1
        try:
            d["minutes"] += int(float(str(c.get("duration_sec", 0) or 0))) // 60
        except (TypeError, ValueError):
            pass
        a, b = c.get("caller_id"), c.get("callee_id")
        if a:
            d["entities"][a] += 1
        if b:
            d["entities"][b] += 1
        if a and b:
            d["pairs"][(a, b)] += 1

    for t in (datasets.get("transactions", []) or []):
        day = _as_int_day(t.get("day"))
        if day is None:
            continue
        d = _d(day)
        d["transactions"] += 1
        d["txn_amount"] += _as_amount(t.get("amount_inr"))
        for pid in (t.get("sender_id"), t.get("receiver_id")):
            if pid:
                d["entities"][pid] += 1

    for f in (datasets.get("firs", []) or []):
        day = _as_int_day(f.get("day"))
        if day is None:
            continue
        d = _d(day)
        d["firs"].append({"fir_id": f.get("fir_id"), "station": f.get("station"),
                          "location": f.get("location"),
                          "ipc_sections": f.get("ipc_sections")})

    for key in ("surveillance_reports", "intelligence_reports", "social_posts"):
        for r in (datasets.get(key, []) or []):
            day = _as_int_day(r.get("day"))
            if day is None:
                continue
            _d(day)["reports"] += 1

    days = []
    for day in sorted(per_day):
        d = per_day[day]
        top_ents = sorted(d["entities"].items(), key=lambda x: -x[1])[:5]
        top_pairs = sorted(d["pairs"].items(), key=lambda x: -x[1])[:3]
        days.append({
            "day": day,
            "calls": d["calls"],
            "minutes": d["minutes"],
            "transactions": d["transactions"],
            "txn_amount": round(d["txn_amount"], 2),
            "firs": d["firs"][:5],
            "fir_count": len(d["firs"]),
            "reports": d["reports"],
            "top_entities": [{"id": pid, "name": _name(pid), "events": n} for pid, n in top_ents],
            "top_pairs": [{"a": a, "a_name": _name(a), "b": b, "b_name": _name(b), "n": n}
                          for (a, b), n in top_pairs],
        })

    if not days:
        return {"day_start": 0, "day_end": 0, "days": [], "key_dates": [],
                "unusual_periods": [], "flagged_days": []}

    totals = {d["day"]: d["calls"] + d["transactions"] for d in days}
    bursts = detect_bursts(datasets)
    try:
        anoms = get_unified_anomalies(datasets)
    except Exception:
        anoms = []
    try:
        ti = get_temporal_intelligence(datasets)
        groups = ti.get("correlated_groups", [])
    except Exception:
        groups = []

    # Merge overlapping coordination spans so the timeline shows a handful
    # of distinct operations instead of a burst per window edge.
    merged: List[Dict] = []
    for g in sorted(groups, key=lambda x: x["span"][0]):
        if merged and g["span"][0] <= merged[-1]["span"][1] + 1:
            m = merged[-1]
            m["span"] = [m["span"][0], max(m["span"][1], g["span"][1])]
            m["days"] = sorted(set(m["days"]) | set(g["days"]))
            m["cells"] = sorted(set(m["cells"]) | set(g["cells"]))
            m["burst_count"] = m.get("burst_count", 0) + g.get("burst_count", 0)
            m["max_zscore"] = max(m.get("max_zscore", 0), g.get("max_zscore", 0))
            m["evidence_hash"] = f"temporal-{m['span'][0]}-{m['span'][1]}"
            m["explanation"] = (
                f"Coordinated operation: {len(m['cells'])} cells ({', '.join(m['cells'])}) "
                f"spiked across days {m['span'][0]}–{m['span'][1]}, max z={m['max_zscore']}.")
        else:
            merged.append(dict(g))
    groups = merged

    key_dates = []
    seen_days = set()

    def _add_key(day, kind, title, reason, ev_names, ev_refs):
        if day in seen_days:
            return
        seen_days.add(day)
        key_dates.append({"day": day, "kind": kind, "title": title,
                          "reason": reason,
                          "evidence": {"names": ev_names[:5], "refs": ev_refs[:5]}})

    def _day_names(day, n=5):
        d = next((x for x in days if x["day"] == day), None)
        return [e["name"] for e in (d["top_entities"] if d else [])[:n]]

    for b in sorted(bursts, key=lambda x: -x.get("zscore", 0))[:3]:
        _add_key(b["day"], "burst",
                 f"Strongest burst — Cell {b.get('cell')} (z={b.get('zscore')})",
                 f"Call volume spiked to {b.get('count')} (z={b.get('zscore')}) against a {b.get('mean')} baseline.",
                 _day_names(b["day"]),
                 [f"burst:{b.get('cell')}:{b.get('day')}"])
    if totals:
        peak = max(totals, key=lambda d: totals[d])
        _add_key(peak, "peak", f"Peak activity — day {peak}",
                 f"Highest combined event volume in the case ({totals[peak]} calls + transfers).",
                 _day_names(peak), [f"volume:{peak}"])
        money_day = max(days, key=lambda d: d["txn_amount"])
        if money_day["txn_amount"] > 0:
            _add_key(money_day["day"], "money",
                     f"Heaviest money movement — day {money_day['day']}",
                     f"Rs.{money_day['txn_amount']:,.0f} moved across {money_day['transactions']} transfers, the case maximum.",
                     _day_names(money_day["day"]), [f"funds:{money_day['day']}"])
    for g in groups[:2]:
        mid = g["days"][len(g["days"]) // 2] if g.get("days") else None
        if mid is not None:
            _add_key(mid, "coordination",
                     f"Coordinated window — days {g['span'][0]}–{g['span'][1]}",
                     g.get("explanation") or f"{len(g.get('cells', []))} cells spiked within 7 days.",
                     _day_names(mid), [f"temporal:{g['span'][0]}-{g['span'][1]}"])
    key_dates.sort(key=lambda x: x["day"])

    unusual = []
    for g in groups:
        names: Dict[str, int] = defaultdict(int)
        for d in days:
            if g["span"][0] <= d["day"] <= g["span"][1]:
                for e in d["top_entities"]:
                    names[e["name"]] += e["events"]
        top_names = [n for n, _ in sorted(names.items(), key=lambda x: -x[1])[:5]]
        unusual.append({"span": g["span"], "kind": "coordination",
                        "title": f"Coordinated operation — days {g['span'][0]}–{g['span'][1]}",
                        "reason": g.get("explanation", ""),
                        "key_names": top_names,
                        "evidence": [f"temporal:{g['span'][0]}-{g['span'][1]}",
                                     f"hash:{g.get('evidence_hash', '')}"]})
    day_list = [d["day"] for d in days]
    if len(day_list) >= 3:
        best = max(range(len(day_list) - 2),
                   key=lambda i: sum(totals.get(day_list[i + k], 0) for k in range(3)))
        surge = day_list[best:best + 3]
        if sum(totals.get(d, 0) for d in surge) > 0:
            names2: Dict[str, int] = defaultdict(int)
            for d in days:
                if d["day"] in surge:
                    for e in d["top_entities"]:
                        names2[e["name"]] += e["events"]
            unusual.append({"span": [surge[0], surge[-1]], "kind": "surge",
                            "title": f"Activity surge — days {surge[0]}–{surge[-1]}",
                            "reason": f"Densest 3-day window in the case ({sum(totals.get(d, 0) for d in surge)} events).",
                            "key_names": [n for n, _ in sorted(names2.items(), key=lambda x: -x[1])[:5]],
                            "evidence": [f"volume:{surge[0]}-{surge[-1]}"]})
    if len(day_list) >= 2:
        gaps = [(day_list[i + 1] - day_list[i] - 1, day_list[i] + 1, day_list[i + 1] - 1)
                for i in range(len(day_list) - 1)]
        gap_len, gs, ge = max(gaps, key=lambda x: x[0])
        if gap_len >= 3:
            unusual.append({"span": [gs, ge], "kind": "lull",
                            "title": f"Quiet gap — days {gs}–{ge}",
                            "reason": f"No recorded events for {gap_len} consecutive days. Gaps often precede regrouping or handler switchovers.",
                            "key_names": [],
                            "evidence": [f"gap:{gs}-{ge}"]})
    unusual.sort(key=lambda x: x["span"][0])

    flagged: Dict[int, Dict] = {}

    def _flag(day, issue, insight):
        f = flagged.setdefault(day, {"day": day, "issues": [], "insights": []})
        if issue not in f["issues"]:
            f["issues"].append(issue)
        if insight and insight not in f["insights"]:
            f["insights"].append(insight)

    for b in bursts:
        _flag(b["day"],
              f"Call burst: Cell {b.get('cell')} hit {b.get('count')} calls (z={b.get('zscore')}, baseline {b.get('mean')}).",
              "Burst windows precede coordination — check the 7-day span for linked cells.")
    for a in anoms:
        ad = _as_int_day(a.get("day"))
        if ad is None:
            continue
        _flag(ad,
              f"{a.get('anomaly_type', 'Anomaly')} — {a.get('entity_id')} (score {a.get('score')}, {a.get('severity')}).",
              a.get("explanation", ""))
    flagged_days = [flagged[d] for d in sorted(flagged)]

    return {"day_start": days[0]["day"], "day_end": days[-1]["day"], "days": days,
            "key_dates": key_dates, "unusual_periods": unusual, "flagged_days": flagged_days}
