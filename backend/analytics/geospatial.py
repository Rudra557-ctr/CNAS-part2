"""
Geospatial Intelligence & Cell-Tower Movement Engine.

Provides geographic coordinates, call density heatmaps, suspect travel trajectory paths,
and multi-suspect rendezvous meeting hotspots across metropolitan cell sectors.
"""
from typing import Dict, List, Optional, Any, Tuple, Set
from collections import defaultdict
import re
import hashlib

from backend.config import DATA_DIR
from backend.loader import load_all
from backend.graph.builder import load_graph_serial

# Accurate metropolitan coordinates for synthetic case locations (Mumbai/Metro)
LOCATION_COORDINATES: Dict[str, Dict[str, Any]] = {
    "Dockside Ward": {
        "lat": 18.9438, "lng": 72.8423,
        "zone": "South Coast Docks",
        "description": "Port container terminals, cargo bays & transit warehouses",
        "tower_id": "TOW-001"
    },
    "Old Market Circle": {
        "lat": 18.9512, "lng": 72.8315,
        "zone": "Central Commercial",
        "description": "High-density wholesale market, cash exchange & hawala hub",
        "tower_id": "TOW-002"
    },
    "Riverside Colony": {
        "lat": 19.0178, "lng": 72.8478,
        "zone": "Riverfront Sector",
        "description": "Residential cluster near transit canal & safehouse hideouts",
        "tower_id": "TOW-003"
    },
    "Industrial Estate Road": {
        "lat": 19.0024, "lng": 72.8310,
        "zone": "Industrial Zone",
        "description": "Automated workshops, printing presses & logistics parks",
        "tower_id": "TOW-004"
    },
    "Central Junction": {
        "lat": 19.0760, "lng": 72.8777,
        "zone": "Transit Hub",
        "description": "Major railway junction & interstate highway intersection",
        "tower_id": "TOW-005"
    },
    "Eastgate": {
        "lat": 19.0596, "lng": 72.8295,
        "zone": "Coastal Gateway",
        "description": "Commercial avenue with high vehicular traffic & banking branches",
        "tower_id": "TOW-006"
    },
    "Hilltop Society": {
        "lat": 19.0688, "lng": 72.8350,
        "zone": "Uptown Sector",
        "description": "Upscale residential enclave overlooking western coast",
        "tower_id": "TOW-007"
    },
    "Station Road": {
        "lat": 18.9700, "lng": 72.8180,
        "zone": "Terminal Sector",
        "description": "Central commuter station, taxi ranks & payphone clusters",
        "tower_id": "TOW-008"
    },
    "New Colony": {
        "lat": 19.1136, "lng": 72.8697,
        "zone": "North Industrial",
        "description": "Mixed commercial offices & telecom switching centers",
        "tower_id": "TOW-009"
    },
    "Warehouse District": {
        "lat": 19.0330, "lng": 72.8600,
        "zone": "Freight Yards",
        "description": "Bonded storage yards, container storage & courier depots",
        "tower_id": "TOW-010"
    },
    "North Bypass": {
        "lat": 19.1726, "lng": 72.8566,
        "zone": "Highway Arterial",
        "description": "Expressway toll plaza, truck stops & perimeter checkpoints",
        "tower_id": "TOW-011"
    },
    "Lakeview Chowk": {
        "lat": 19.1250, "lng": 72.9050,
        "zone": "Eastern Periphery",
        "description": "Perimeter crossroads near recreational lake & quiet zones",
        "tower_id": "TOW-012"
    },
}

DEFAULT_CENTER = {"lat": 19.0450, "lng": 72.8550, "zoom": 12}

# Real coordinates for Indian cities, so non-Mumbai cases (e.g. UP-grid
# towers like "Kotwali PS Tower, Ayodhya") resolve to their true location
# instead of being hash-scattered around the Mumbai default.
# alias-lowercase -> (display name, lat, lng, zone)
CITY_COORDINATES: Dict[str, Tuple[str, float, float, str]] = {
    # Uttar Pradesh (Purvanchal case grid)
    "ayodhya": ("Ayodhya", 26.7968, 82.1944, "Awadh Sector"),
    "faizabad": ("Ayodhya", 26.7755, 82.1391, "Awadh Sector"),
    "jhansi": ("Jhansi", 25.4484, 78.5685, "Bundelkhand Sector"),
    "ghaziabad": ("Ghaziabad", 28.6692, 77.4538, "NCR West Sector"),
    "sahibabad": ("Ghaziabad", 28.6692, 77.4538, "NCR West Sector"),
    "kanpur": ("Kanpur", 26.4499, 80.3319, "Central UP Sector"),
    "lucknow": ("Lucknow", 26.8467, 80.9462, "Awadh Capital Sector"),
    "varanasi": ("Varanasi", 25.3176, 82.9739, "Purvanchal Sector"),
    "banaras": ("Varanasi", 25.3176, 82.9739, "Purvanchal Sector"),
    "noida": ("Noida", 28.5355, 77.3910, "NCR East Sector"),
    "gautam buddha nagar": ("Noida", 28.5355, 77.3910, "NCR East Sector"),
    "greater noida": ("Noida", 28.4744, 77.5030, "NCR East Sector"),
    "prayagraj": ("Prayagraj", 25.4358, 81.8463, "Sangam Sector"),
    "allahabad": ("Prayagraj", 25.4358, 81.8463, "Sangam Sector"),
    "meerut": ("Meerut", 28.9845, 77.7064, "Western UP Sector"),
    "agra": ("Agra", 27.1767, 78.0081, "Brij Sector"),
    "bareilly": ("Bareilly", 28.3670, 79.4304, "Rohilkhand Sector"),
    "gorakhpur": ("Gorakhpur", 26.7606, 83.3732, "Purvanchal East Sector"),
    "mathura": ("Mathura", 27.4924, 77.6737, "Brij Sector"),
    "aligarh": ("Aligarh", 27.8974, 78.0880, "Western UP Sector"),
    "moradabad": ("Moradabad", 28.8389, 78.7733, "Rohilkhand Sector"),
    "saharanpur": ("Saharanpur", 29.9680, 77.5552, "Upper Doab Sector"),
    "muzaffarnagar": ("Muzaffarnagar", 29.4727, 77.7085, "Upper Doab Sector"),
    "bulandshahr": ("Bulandshahr", 28.4089, 77.8498, "Western UP Sector"),
    "hapur": ("Hapur", 28.7306, 77.7759, "NCR West Sector"),
    "baghpat": ("Baghpat", 28.9417, 77.2167, "NCR West Sector"),
    "firozabad": ("Firozabad", 27.1591, 78.3958, "Brij Sector"),
    "etawah": ("Etawah", 26.7767, 79.0213, "Central UP Sector"),
    "mainpuri": ("Mainpuri", 27.2269, 79.0293, "Central UP Sector"),
    "budaun": ("Budaun", 28.0304, 79.1213, "Rohilkhand Sector"),
    "shahjahanpur": ("Shahjahanpur", 27.8817, 79.9098, "Rohilkhand Sector"),
    "pilibhit": ("Pilibhit", 28.6409, 79.8040, "Rohilkhand Sector"),
    "rampur": ("Rampur", 28.8158, 79.0259, "Rohilkhand Sector"),
    "bijnor": ("Bijnor", 29.3724, 78.1358, "Western UP Sector"),
    "amroha": ("Amroha", 28.9036, 78.4699, "Western UP Sector"),
    "sambhal": ("Sambhal", 28.5878, 78.5697, "Western UP Sector"),
    "farrukhabad": ("Farrukhabad", 27.3923, 79.5801, "Central UP Sector"),
    "kannauj": ("Kannauj", 27.0543, 79.9220, "Central UP Sector"),
    "hardoi": ("Hardoi", 27.3919, 80.1295, "Awadh Sector"),
    "sitapur": ("Sitapur", 27.5617, 80.6820, "Awadh Sector"),
    "unnao": ("Unnao", 26.5483, 80.4837, "Awadh Sector"),
    "raebareli": ("Raebareli", 26.2309, 81.2331, "Awadh Sector"),
    "sultanpur": ("Sultanpur", 26.2649, 82.0727, "Awadh Sector"),
    "amethi": ("Amethi", 26.1545, 81.8139, "Awadh Sector"),
    "barabanki": ("Barabanki", 26.9390, 81.1952, "Awadh Sector"),
    "gonda": ("Gonda", 27.1324, 81.9614, "Awadh Sector"),
    "bahraich": ("Bahraich", 27.5743, 81.5944, "Awadh Sector"),
    "shrawasti": ("Shrawasti", 27.5222, 81.8479, "Awadh Sector"),
    "balrampur": ("Balrampur", 27.4295, 82.1873, "Awadh Sector"),
    "siddharthnagar": ("Siddharthnagar", 27.3017, 83.0900, "Purvanchal Sector"),
    "basti": ("Basti", 26.8009, 82.7612, "Purvanchal Sector"),
    "sant kabir nagar": ("Sant Kabir Nagar", 26.7464, 83.0588, "Purvanchal Sector"),
    "maharajganj": ("Maharajganj", 27.1477, 83.5678, "Purvanchal Sector"),
    "kushinagar": ("Kushinagar", 26.7399, 83.8866, "Purvanchal Sector"),
    "deoria": ("Deoria", 26.5041, 83.7867, "Purvanchal Sector"),
    "ballia": ("Ballia", 25.7599, 84.1489, "Purvanchal Sector"),
    "mau": ("Mau", 25.9405, 83.5619, "Purvanchal Sector"),
    "azamgarh": ("Azamgarh", 26.0682, 83.1836, "Purvanchal Sector"),
    "jaunpur": ("Jaunpur", 25.7537, 82.6860, "Purvanchal Sector"),
    "ghazipur": ("Ghazipur", 25.5841, 83.5770, "Purvanchal Sector"),
    "chandauli": ("Chandauli", 25.2607, 83.2648, "Purvanchal Sector"),
    "mirzapur": ("Mirzapur", 25.1483, 82.5644, "Vindhya Sector"),
    "bhadohi": ("Bhadohi", 25.3958, 82.5667, "Vindhya Sector"),
    "sonbhadra": ("Sonbhadra", 24.6869, 83.0657, "Vindhya Sector"),
    "kaushambi": ("Kaushambi", 25.3301, 81.3854, "Sangam Sector"),
    "fatehpur": ("Fatehpur", 25.9347, 80.7986, "Sangam Sector"),
    "pratapgarh": ("Pratapgarh", 25.9149, 81.9591, "Awadh Sector"),
    "hamirpur": ("Hamirpur", 25.9531, 80.1458, "Bundelkhand Sector"),
    "mahoba": ("Mahoba", 25.2926, 79.8741, "Bundelkhand Sector"),
    "banda": ("Banda", 25.4757, 80.3398, "Bundelkhand Sector"),
    "chitrakoot": ("Chitrakoot", 25.1996, 80.9470, "Bundelkhand Sector"),
    "lalitpur": ("Lalitpur", 24.6901, 78.4183, "Bundelkhand Sector"),
    "jalaun": ("Jalaun", 26.1449, 79.3368, "Bundelkhand Sector"),
    "auraiya": ("Auraiya", 26.4651, 79.5098, "Central UP Sector"),
    "kheri": ("Lakhimpur Kheri", 27.9475, 80.7820, "Awadh Sector"),
    "lakhimpur": ("Lakhimpur Kheri", 27.9475, 80.7820, "Awadh Sector"),
    "etah": ("Etah", 27.6398, 78.6723, "Brij Sector"),
    "kasganj": ("Kasganj", 27.8122, 78.6409, "Brij Sector"),
    "hathras": ("Hathras", 27.5968, 78.0446, "Brij Sector"),
    # NCR + Delhi
    "delhi": ("New Delhi", 28.6139, 77.2090, "National Capital Sector"),
    "new delhi": ("New Delhi", 28.6139, 77.2090, "National Capital Sector"),
    "gurgaon": ("Gurugram", 28.4595, 77.0266, "NCR South Sector"),
    "gurugram": ("Gurugram", 28.4595, 77.0266, "NCR South Sector"),
    "faridabad": ("Faridabad", 28.4089, 77.3178, "NCR South Sector"),
    # Maharashtra (Real Format case)
    "mumbai": ("Mumbai", 19.0760, 72.8777, "Coastal Metro Sector"),
    "bombay": ("Mumbai", 19.0760, 72.8777, "Coastal Metro Sector"),
    "andheri": ("Mumbai", 19.1136, 72.8697, "Coastal Metro Sector"),
    "bandra": ("Mumbai", 19.0596, 72.8295, "Coastal Metro Sector"),
    "pune": ("Pune", 18.5204, 73.8567, "Deccan Sector"),
    "kothrud": ("Pune", 18.5204, 73.8567, "Deccan Sector"),
    "viman nagar": ("Pune", 18.5679, 73.9143, "Deccan Sector"),
    "nashik": ("Nashik", 19.9975, 73.7898, "North Maharashtra Sector"),
    "thane": ("Thane", 19.2183, 72.9781, "Mumbai Metro Sector"),
    "nagpur": ("Nagpur", 21.1458, 79.0882, "Vidarbha Sector"),
    # Other metros / states
    "kolkata": ("Kolkata", 22.5726, 88.3639, "Eastern Metro Sector"),
    "chennai": ("Chennai", 13.0827, 80.2707, "Southern Metro Sector"),
    "bengaluru": ("Bengaluru", 12.9716, 77.5946, "Southern Metro Sector"),
    "bangalore": ("Bengaluru", 12.9716, 77.5946, "Southern Metro Sector"),
    "hyderabad": ("Hyderabad", 17.3850, 78.4867, "Deccan Metro Sector"),
    "ahmedabad": ("Ahmedabad", 23.0225, 72.5714, "Western Sector"),
    "surat": ("Surat", 21.1702, 72.8311, "Western Sector"),
    "jaipur": ("Jaipur", 26.9124, 75.7873, "Pink City Sector"),
    "indore": ("Indore", 22.7196, 75.8577, "Central Sector"),
    "bhopal": ("Bhopal", 23.2599, 77.4126, "Central Sector"),
    "patna": ("Patna", 25.5941, 85.1376, "Eastern Sector"),
    "ranchi": ("Ranchi", 23.3441, 85.3096, "Eastern Sector"),
    "bhubaneswar": ("Bhubaneswar", 20.2961, 85.8245, "Eastern Sector"),
    "guwahati": ("Guwahati", 26.1445, 91.7362, "Northeast Sector"),
    "chandigarh": ("Chandigarh", 30.7333, 76.7794, "Northern Sector"),
    "amritsar": ("Amritsar", 31.6340, 74.8723, "Northern Sector"),
    "ludhiana": ("Ludhiana", 30.9010, 75.8573, "Northern Sector"),
    "jalandhar": ("Jalandhar", 31.3260, 75.5762, "Northern Sector"),
    "dehradun": ("Dehradun", 30.3165, 78.0322, "Hill Sector"),
    "haridwar": ("Haridwar", 29.9457, 78.1642, "Hill Sector"),
    "shimla": ("Shimla", 31.1048, 77.1734, "Hill Sector"),
    "srinagar": ("Srinagar", 34.0837, 74.7973, "Northern Sector"),
    "jammu": ("Jammu", 32.7266, 74.8570, "Northern Sector"),
    "kochi": ("Kochi", 9.9312, 76.2673, "Coastal Sector"),
    "thiruvananthapuram": ("Thiruvananthapuram", 8.5241, 76.9366, "Coastal Sector"),
    "vijayawada": ("Vijayawada", 16.5062, 80.6480, "Coastal Sector"),
    "amaravati": ("Amaravati", 16.5737, 80.3578, "Coastal Sector"),
    "raipur": ("Raipur", 21.2514, 81.6296, "Central Sector"),
    "panaji": ("Panaji", 15.4909, 73.8278, "Coastal Sector"),
    "goa": ("Goa", 15.2993, 74.1240, "Coastal Sector"),
    "gangtok": ("Gangtok", 27.3389, 88.6065, "Northeast Sector"),
    "imphal": ("Imphal", 24.8074, 93.9384, "Northeast Sector"),
    "shillong": ("Shillong", 25.5788, 91.8933, "Northeast Sector"),
    "aizawl": ("Aizawl", 23.7271, 92.7176, "Northeast Sector"),
    "kohima": ("Kohima", 25.6751, 94.1086, "Northeast Sector"),
    "agartala": ("Agartala", 23.8315, 91.2868, "Northeast Sector"),
    "itanagar": ("Itanagar", 27.0844, 93.6053, "Northeast Sector"),
}

def _city_coord_for(loc: str):
    """Match a free-text tower/location string against the city gazetteer.

    Longest alias first so multi-word names ("gautam buddha nagar") win.
    Short aliases (<4 chars like "goa"/"mau") require word boundaries to
    avoid matching inside unrelated words.
    """
    low = loc.lower()
    for alias in sorted(CITY_COORDINATES.keys(), key=len, reverse=True):
        if len(alias) < 4:
            if not re.search(r"\b" + re.escape(alias) + r"\b", low):
                continue
        elif alias not in low:
            continue
        display, lat, lng, zone = CITY_COORDINATES[alias]
        h = int(hashlib.md5(loc.encode()).hexdigest()[:6], 16)
        # Deterministic per-tower jitter (~±2km) so same-city towers
        # don't stack on one identical pin.
        j_lat = (((h // 1000) % 100) / 100.0 - 0.5) * 0.04
        j_lng = ((h % 100) / 100.0 - 0.5) * 0.04
        return {
            "lat": round(lat + j_lat, 4),
            "lng": round(lng + j_lng, 4),
            "zone": zone,
            "description": f"{display} sector",
            # Deterministic per-tower id so nearby towers stay distinct
            "tower_id": f"GEO-{abs(h) % 900 + 100}",
        }
    return None


def _get_loc_coords(loc_name: str) -> Dict[str, Any]:
    for name, data in LOCATION_COORDINATES.items():
        if name.lower() in loc_name.lower() or loc_name.lower() in name.lower():
            return data
    city = _city_coord_for(loc_name or "")
    if city:
        return city
    # Fallback to hash-deterministic offset near center
    h = int(hashlib.md5(loc_name.encode()).hexdigest()[:6], 16)
    d_lat = ((h % 1000) / 1000.0 - 0.5) * 0.15
    d_lng = (((h // 1000) % 1000) / 1000.0 - 0.5) * 0.15
    return {
        "lat": round(DEFAULT_CENTER["lat"] + d_lat, 4),
        "lng": round(DEFAULT_CENTER["lng"] + d_lng, 4),
        "zone": "Peripheral Zone",
        "description": f"Extrapolated sector for {loc_name}",
        "tower_id": f"TOW-{abs(h)%900+100}"
    }


import hashlib


def get_cell_towers_geospatial(datasets: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Compile rich geospatial data for all cell towers:
    - Latitude/longitude coordinates
    - Call volume intensity & duration
    - Unique suspects active
    - Cell group distribution (Cell A, B, C, Bridge)
    """
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)

    pd = datasets.get("people_directory", {})
    person_to_cell = {p["id"]: p.get("cell", "Unknown") for p in pd.get("network_people", []) + pd.get("noise_people", [])}

    tower_stats = defaultdict(lambda: {
        "call_count": 0,
        "total_duration_sec": 0,
        "callers": set(),
        "callees": set(),
        "cell_counts": defaultdict(int),
        "days_active": set(),
    })

    for cdr in datasets.get("cdrs", []):
        loc = cdr.get("cell_tower_location") or "Unknown"
        dur = int(cdr.get("duration_sec") or 0)
        c1 = str(cdr.get("caller_id") or "")
        c2 = str(cdr.get("callee_id") or "")
        day = cdr.get("day")

        stats = tower_stats[loc]
        stats["call_count"] += 1
        stats["total_duration_sec"] += dur
        if c1: stats["callers"].add(c1)
        if c2: stats["callees"].add(c2)
        if day: stats["days_active"].add(day)

        cell1 = person_to_cell.get(c1, "Unknown")
        cell2 = person_to_cell.get(c2, "Unknown")
        if cell1 in ("A", "B", "C"): stats["cell_counts"][cell1] += 1
        if cell2 in ("A", "B", "C"): stats["cell_counts"][cell2] += 1

    towers_list = []
    max_calls = max((s["call_count"] for s in tower_stats.values()), default=1)

    for loc, stats in tower_stats.items():
        coords = _get_loc_coords(loc)
        active_suspects = list(stats["callers"] | stats["callees"])
        dominant_cell = max(stats["cell_counts"], key=stats["cell_counts"].get) if stats["cell_counts"] else "Unknown"

        intensity = round(stats["call_count"] / max_calls, 3)

        towers_list.append({
            "name": loc,
            "tower_name": loc,
            "tower_id": coords.get("tower_id", f"TOW-{len(towers_list)+1:03d}"),
            "lat": coords["lat"],
            "lng": coords["lng"],
            "zone": coords.get("zone", "Metropolitan Area"),
            "description": coords.get("description", ""),
            "call_count": stats["call_count"],
            "total_duration_minutes": round(stats["total_duration_sec"] / 60.0, 1),
            "unique_suspects_count": len(active_suspects),
            "unique_suspects": active_suspects[:10],
            "dominant_cell": dominant_cell,
            "cell_distribution": dict(stats["cell_counts"]),
            "is_cross_cell": len([c for c in stats["cell_counts"] if stats["cell_counts"][c] >= 3]) >= 2,
            "intensity": intensity,
            "days_active_count": len(stats["days_active"]),
        })

    towers_list.sort(key=lambda t: t["call_count"], reverse=True)

    return {
        "status": "success",
        "center": DEFAULT_CENTER,
        "total_towers": len(towers_list),
        "towers": towers_list,
    }


def get_suspect_trajectories(
    datasets: Optional[Dict] = None,
    person_id: Optional[str] = None,
    day_start: Optional[int] = None,
    day_end: Optional[int] = None
) -> Dict[str, Any]:
    """
    Reconstruct suspect travel trajectories over time across towers,
    surveillance sightings, and crime scenes.
    """
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)

    pd = datasets.get("people_directory", {})
    all_people = pd.get("network_people", []) + pd.get("noise_people", [])
    person_map = {p["id"]: p for p in all_people}

    target_pids = [person_id] if person_id else [p["id"] for p in all_people if p.get("cell") in ("A", "B", "C", "Bridge")]
    if not target_pids:
        # Unlabeled real-world cases (e.g. bulk uploads with Unknown cells):
        # track everyone rather than returning nothing.
        target_pids = [p["id"] for p in all_people]

    trajectories_by_person = defaultdict(list)

    # 1. From CDRs
    for cdr in datasets.get("cdrs", []):
        day = cdr.get("day")
        if day is None:
            continue
        try:
            day_int = int(day)
        except ValueError:
            continue
        if day_start is not None and day_int < day_start:
            continue
        if day_end is not None and day_int > day_end:
            continue

        c1, c2 = str(cdr.get("caller_id") or ""), str(cdr.get("callee_id") or "")
        loc = cdr.get("cell_tower_location") or "Unknown"
        coords = _get_loc_coords(loc)
        ts = cdr.get("timestamp") or f"Day {day_int}"

        for pid, role in [(c1, "caller"), (c2, "callee")]:
            if pid in target_pids:
                trajectories_by_person[pid].append({
                    "day": day_int,
                    "timestamp": ts,
                    "location_name": loc,
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "event_type": "CDR_CALL",
                    "details": f"Call as {role} ({cdr.get('duration_sec', 0)}s) via tower {loc}",
                })

    # 2. From Surveillance Reports
    for surv in datasets.get("surveillance_reports", []):
        day = surv.get("day")
        loc = surv.get("location") or "Unknown"
        coords = _get_loc_coords(loc)
        notes = surv.get("activity_notes", "")
        for p in all_people:
            pid = p["id"]
            if (pid in target_pids) and (pid.lower() in notes.lower() or p.get("name", "").lower() in notes.lower()):
                trajectories_by_person[pid].append({
                    "day": int(day) if str(day).isdigit() else 1,
                    "timestamp": surv.get("date") or f"Day {day}",
                    "location_name": loc,
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "event_type": "SURVEILLANCE_SIGHTING",
                    "details": f"Physical sighting: {notes[:100]}",
                })

    result_trajectories = []
    for pid, points in trajectories_by_person.items():
        if not points:
            continue
        # Sort chronologically by day
        points.sort(key=lambda x: (x["day"], x["timestamp"]))
        p_info = person_map.get(pid, {"id": pid, "name": pid, "role": "Suspect", "cell": "Unknown"})

        result_trajectories.append({
            "person_id": pid,
            "person_name": p_info.get("name", pid),
            "role": p_info.get("role", "Suspect"),
            "cell": p_info.get("cell", "Unknown"),
            "color": "#4C9AFF" if p_info.get("cell") == "A" else "#AB68FF" if p_info.get("cell") == "B" else "#FF7A45" if p_info.get("cell") == "C" else "#FFC53D",
            "waypoints_count": len(points),
            "path_coordinates": [[pt["lat"], pt["lng"]] for pt in points],
            "timeline_events": points,
        })

    result_trajectories.sort(key=lambda t: t["waypoints_count"], reverse=True)

    return {
        "status": "success",
        "total_tracked_suspects": len(result_trajectories),
        "trajectories": result_trajectories,
    }


def get_co_location_hotspots(datasets: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Identify meeting hotspots where multiple suspects converged.
    """
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)

    pd = datasets.get("people_directory", {})
    all_people = pd.get("network_people", []) + pd.get("noise_people", [])
    person_map = {p["id"]: p for p in all_people}

    location_events = defaultdict(lambda: {
        "suspects": set(),
        "cells": set(),
        "days": set(),
        "total_interactions": 0,
        "sample_evidence": [],
    })

    for cdr in datasets.get("cdrs", []):
        loc = cdr.get("cell_tower_location") or "Unknown"
        c1, c2 = str(cdr.get("caller_id") or ""), str(cdr.get("callee_id") or "")
        day = cdr.get("day")
        if c1:
            location_events[loc]["suspects"].add(c1)
            cell = person_map.get(c1, {}).get("cell")
            if cell: location_events[loc]["cells"].add(cell)
        if c2:
            location_events[loc]["suspects"].add(c2)
            cell = person_map.get(c2, {}).get("cell")
            if cell: location_events[loc]["cells"].add(cell)
        if day: location_events[loc]["days"].add(day)
        location_events[loc]["total_interactions"] += 1

    for surv in datasets.get("surveillance_reports", []):
        loc = surv.get("location") or "Unknown"
        notes = surv.get("activity_notes", "")
        for p in all_people:
            if p["id"].lower() in notes.lower() or p.get("name", "").lower() in notes.lower():
                location_events[loc]["suspects"].add(p["id"])
                if p.get("cell"): location_events[loc]["cells"].add(p.get("cell"))
        location_events[loc]["total_interactions"] += 2
        location_events[loc]["sample_evidence"].append(surv.get("activity_notes", "")[:120])

    hotspots = []
    for loc, data in location_events.items():
        distinct_cells = [c for c in data["cells"] if c in ("A", "B", "C", "Bridge")]
        if len(data["suspects"]) >= 3 and len(distinct_cells) >= 2:
            coords = _get_loc_coords(loc)
            hotspots.append({
                "location_name": loc,
                "lat": coords["lat"],
                "lng": coords["lng"],
                "zone": coords.get("zone", "Metropolitan Area"),
                "description": coords.get("description", ""),
                "suspects_count": len(data["suspects"]),
                "suspects_list": list(data["suspects"])[:8],
                "cells_involved": distinct_cells,
                "days_count": len(data["days"]),
                "total_events": data["total_interactions"],
                "risk_tier": "CRITICAL MEETING HUB" if len(distinct_cells) >= 3 else "HIGH CO-LOCATION SITE",
                "sample_evidence": data["sample_evidence"][:2],
            })

    if not hotspots:
        # Unlabeled real-world cases: no A/B/C cells exist, so fall back to
        # pure co-location density rather than returning nothing.
        for loc, data in location_events.items():
            if len(data["suspects"]) >= 3:
                coords = _get_loc_coords(loc)
                hotspots.append({
                    "location_name": loc,
                    "lat": coords["lat"],
                    "lng": coords["lng"],
                    "zone": coords.get("zone", "Metropolitan Area"),
                    "description": coords.get("description", ""),
                    "suspects_count": len(data["suspects"]),
                    "suspects_list": list(data["suspects"])[:8],
                    "cells_involved": sorted(data["cells"]),
                    "days_count": len(data["days"]),
                    "total_events": data["total_interactions"],
                    "risk_tier": "CO-LOCATION SITE (UNLABELED CELLS)",
                    "sample_evidence": data["sample_evidence"][:2],
                })

    hotspots.sort(key=lambda h: (len(h["cells_involved"]), h["suspects_count"]), reverse=True)

    return {
        "status": "success",
        "total_hotspots": len(hotspots),
        "hotspots": hotspots,
    }


def get_heatmap_grid(datasets: Optional[Dict] = None, day_start: Optional[int] = None,
                     day_end: Optional[int] = None) -> Dict[str, Any]:
    """Per-day call-count grid for the heatmap layer and timeline scrubber.

    Returns {points: [[lat, lng, intensity], ...], day_range: [min,max]}.
    intensity is 0..1 normalised by max cell count in the window.
    """
    if datasets is None:
        datasets, _ = load_all(DATA_DIR)
    buckets: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    days: List[int] = []
    for cdr in datasets.get("cdrs", []):
        try:
            d = int(cdr.get("day"))  # type: ignore[arg-type]
        except Exception:
            continue
        if day_start is not None and d < day_start:
            continue
        if day_end is not None and d > day_end:
            continue
        loc = cdr.get("cell_tower_location") or "Unknown"
        buckets[d][loc] += 1
        days.append(d)
    if not buckets:
        return {"points": [], "day_range": [1, 1]}
    max_c = max(max(v.values()) for v in buckets.values())
    pts: List[List[float]] = []
    for d, locs in buckets.items():
        for loc, cnt in locs.items():
            coords = _get_loc_coords(loc)
            pts.append([coords["lat"], coords["lng"], round(cnt / max_c, 3), int(d)])
    return {"points": pts, "day_range": [min(days), max(days)]}
