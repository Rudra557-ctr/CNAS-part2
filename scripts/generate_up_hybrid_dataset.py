#!/usr/bin/env python3
"""
Uttar Pradesh (UP) Grounded Hybrid Crime Network Generator.

Generates a large-scale (20,000+ entities) hybrid dataset grounded on:
  - 12 real UP districts & police station jurisdictions (Lucknow, Kanpur, Varanasi,
    Prayagraj, Noida, Ghaziabad, Meerut, Agra, Gorakhpur, Bareilly, Ayodhya, Jhansi)
  - Real UP legal sections: UP Gangsters Act 1986, IPC/BNS sections, NDPS, Arms Act
  - Real UP vehicle series (UP-32, UP-16, UP-78, UP-65, UP-70, etc.)
  - Real UP telecom circle mobile prefixes (UP East: 9415x, 9450x, 9839x, 7007x; UP West: 9837x, 9412x, 8006x)
  - Real UP bank branches & IFSCs (SBIN, PUNB, BARB, UBIN, HDFC)
  - Realistic criminal syndicate hierarchy: Kingpins, Lieutenants, Cut-out Couriers, Shooters, Hawala Mules
"""
import argparse
import csv
import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# ── Authentic UP Districts & Police Stations with Lat/Lng ──────────────────
UP_DISTRICTS = [
    {
        "district": "Lucknow", "circle": "UP East", "rto": "UP-32",
        "lat": 26.8467, "lng": 80.9462,
        "stations": ["Hazratganj PS", "Gomti Nagar PS", "Alambagh PS", "Chowk PS", "Chinhat PS", "Mahanagar PS"],
        "ifsc_prefix": "SBIN0000125", "bank": "State Bank of India Main Branch Lucknow"
    },
    {
        "district": "Kanpur Nagar", "circle": "UP East", "rto": "UP-78",
        "lat": 26.4499, "lng": 80.3319,
        "stations": ["Kotwali PS", "Chakeri PS", "Kalyanpur PS", "Barra PS", "Collectorganj PS", "Govind Nagar PS"],
        "ifsc_prefix": "PUNB0024000", "bank": "Punjab National Bank Civil Lines Kanpur"
    },
    {
        "district": "Varanasi", "circle": "UP East", "rto": "UP-65",
        "lat": 25.3176, "lng": 82.9739,
        "stations": ["Cantt PS", "Dashashwamedh PS", "Sigra PS", "Bhelupur PS", "Shivpur PS", "Chetganj PS"],
        "ifsc_prefix": "BARB0VARANA", "bank": "Bank of Baroda Orderly Bazar Varanasi"
    },
    {
        "district": "Prayagraj", "circle": "UP East", "rto": "UP-70",
        "lat": 25.4358, "lng": 81.8463,
        "stations": ["Civil Lines PS", "Dhoomanganj PS", "George Town PS", "Naini PS", "Kareli PS", "Katra PS"],
        "ifsc_prefix": "UBIN0538051", "bank": "Union Bank of India Civil Lines Prayagraj"
    },
    {
        "district": "Gautam Buddha Nagar (Noida)", "circle": "UP West", "rto": "UP-16",
        "lat": 28.5355, "lng": 77.3910,
        "stations": ["Sector 20 PS", "Sector 24 PS", "Sector 39 PS", "Phase 2 PS", "Surajpur PS", "Knowledge Park PS"],
        "ifsc_prefix": "HDFC0000088", "bank": "HDFC Bank Sector 18 Noida"
    },
    {
        "district": "Ghaziabad", "circle": "UP West", "rto": "UP-14",
        "lat": 28.6692, "lng": 77.4538,
        "stations": ["Kavi Nagar PS", "Indirapuram PS", "Sahibabad PS", "Sihani Gate PS", "Kotwali PS"],
        "ifsc_prefix": "PUNB0017000", "bank": "Punjab National Bank GT Road Ghaziabad"
    },
    {
        "district": "Meerut", "circle": "UP West", "rto": "UP-15",
        "lat": 28.9845, "lng": 77.7064,
        "stations": ["Civil Lines PS", "Nauchandi PS", "Lisari Gate PS", "Partapur PS", "Sadar Bazar PS", "Brahmpuri PS"],
        "ifsc_prefix": "SBIN0000680", "bank": "State Bank of India Cantt Meerut"
    },
    {
        "district": "Agra", "circle": "UP West", "rto": "UP-80",
        "lat": 27.1767, "lng": 78.0081,
        "stations": ["Hari Parbat PS", "Tajganj PS", "Sikandra PS", "Shahganj PS", "Rakabganj PS", "Etmadpur PS"],
        "ifsc_prefix": "BARB0AGRABB", "bank": "Bank of Baroda Belanganj Agra"
    },
    {
        "district": "Gorakhpur", "circle": "UP East", "rto": "UP-53",
        "lat": 26.7606, "lng": 83.3732,
        "stations": ["Cantt PS", "Kotwali PS", "Gorakhnath PS", "Shahpur PS", "Tiwaripur PS", "Ramgarh Tal PS"],
        "ifsc_prefix": "SBIN0000083", "bank": "State Bank of India Golghar Gorakhpur"
    },
    {
        "district": "Bareilly", "circle": "UP West", "rto": "UP-25",
        "lat": 28.3670, "lng": 79.4304,
        "stations": ["Kotwali PS", "Baradari PS", "Subhash Nagar PS", "Izzatnagar PS", "Prem Nagar PS"],
        "ifsc_prefix": "UBIN0531502", "bank": "Union Bank of India Civil Lines Bareilly"
    },
    {
        "district": "Ayodhya", "circle": "UP East", "rto": "UP-42",
        "lat": 26.7730, "lng": 82.1460,
        "stations": ["Kotwali PS", "Cantt PS", "Ayodhya Kotwali PS", "Raunahi PS"],
        "ifsc_prefix": "SBIN0000108", "bank": "State Bank of India Civil Lines Faizabad"
    },
    {
        "district": "Jhansi", "circle": "UP East", "rto": "UP-93",
        "lat": 25.4484, "lng": 78.5685,
        "stations": ["Nawabad PS", "Kotwali PS", "Sipri Bazar PS", "Prem Nagar PS"],
        "ifsc_prefix": "PUNB0025700", "bank": "Punjab National Bank Sadar Bazar Jhansi"
    },
]

# Real UP Names Pool
FIRST_NAMES = [
    "Ajay", "Virendra", "Rajesh", "Dharmendra", "Akhilesh", "Alok", "Sunil", "Rakesh",
    "Munna", "Sanjay", "Deepak", "Manoj", "Amit", "Pankaj", "Santosh", "Pramod",
    "Satish", "Imran", "Tariq", "Aslam", "Rizwan", "Gufran", "Bablu", "Guddu",
    "Chhotu", "Pappu", "Sonu", "Vikram", "Brijesh", "Abhay", "Mukhtar", "Atiq",
    "Dhananjay", "Babloo", "Mahesh", "Neeraj", "Ravindra", "Ramesh", "Anil", "Suresh"
]

LAST_NAMES = [
    "Yadav", "Shukla", "Tiwari", "Singh", "Mishra", "Verma", "Pandey", "Dubey",
    "Tripathi", "Chauhan", "Maurya", "Gupta", "Srivastav", "Khan", "Ansari", "Qureshi",
    "Siddiqui", "Rajput", "Tomar", "Nagar", "Tyagi", "Gurjar", "Nishad", "Bind",
    "Jaiswal", "Kushwaha", "Chaudhary", "Rawat", "Pal", "Gautam"
]

ALIASES = [
    "Pahalwan", "Shooter", "Pandit", "Don", "Urf Chhotu", "Fauji", "Kabadi",
    "Contractor", "Netaji", "Bhaiya", "Vakil", "Chacha", "Babu", "Raja"
]

UP_CRIME_SECTIONS = [
    ("Sec 2/3 UP Gangsters Act 1986", "Organized crime syndicate running extortion, tender rigging, and contract killings"),
    ("IPC 302 / BNS 103 (Murder)", "Armed shootout outside court premises resulting in fatal casualty"),
    ("IPC 307 / BNS 109 (Attempt to Murder)", "Firing upon police patrol unit during vehicle interdiction checking"),
    ("IPC 386 / BNS 308 (Extortion)", "Extortion demand of 50 Lakhs delivered via WhatsApp call to local infrastructure contractor"),
    ("IPC 395 / BNS 310 (Dacoity)", "Armed highway robbery of cash transit vehicle on expressway"),
    ("Arms Act Sec 25/27", "Recovery of illegal 0.32 bore pistols and country-made firearms without valid license"),
    ("NDPS Act Sec 8/20/21", "Interception of commercial consignment of contraband narcotics transported across state border"),
    ("IPC 420/467/468 (Cheating & Forgery)", "Fraudulent land registry using forged power of attorney and impersonation")
]


def _gen_phone(circle: str, idx: int) -> str:
    # Real UP prefixes
    if circle == "UP East":
        prefix = random.choice(["94150", "94500", "98390", "70070", "91250", "88400"])
    else:
        prefix = random.choice(["98370", "94120", "80060", "97190", "75000", "99270"])
    suffix = f"{idx % 100000:05d}"
    return f"{prefix}{suffix}"


def _gen_account(ifsc_prefix: str, idx: int) -> str:
    bank_code = ifsc_prefix[:4]
    acc_num = f"{idx % 10000000000:010d}"
    return f"{bank_code}00{acc_num}"


def _gen_vehicle(rto: str, idx: int) -> str:
    series = random.choice(["AB", "CD", "EF", "GH", "JK", "LM", "NP", "RS", "TZ"])
    num = f"{(idx * 17 + 101) % 9999 + 1:04d}"
    return f"{rto}-{series}-{num}"


def generate_up_dataset(total_people: int = 20000, out_dir: Path = None):
    if out_dir is None:
        out_dir = Path("data/up_dataset")
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Generating Uttar Pradesh Criminal Network Dataset with {total_people} persons...")

    # 1. Create Core Persons Directory
    people = []
    # 3 Major Crime Syndicates
    syndicates = [
        {"name": "Purvanchal Syndicate", "base": ["Varanasi", "Prayagraj", "Gorakhpur", "Lucknow"], "cell": "UP-East-Ring"},
        {"name": "NCR Western UP Syndicate", "base": ["Gautam Buddha Nagar (Noida)", "Ghaziabad", "Meerut", "Agra"], "cell": "UP-West-Ring"},
        {"name": "Kanpur-Central Industrial Ring", "base": ["Kanpur Nagar", "Lucknow", "Jhansi", "Bareilly"], "cell": "UP-Central-Ring"},
    ]

    print("Phase 1: Synthesizing suspect directory with authentic UP demographics & RTO codes...")
    for i in range(1, total_people + 1):
        dist_info = random.choice(UP_DISTRICTS)
        fname = random.choice(FIRST_NAMES)
        lname = random.choice(LAST_NAMES)
        full_name = f"{fname} {lname}"
        
        # Determine syndicate membership or background civilian/petty offender
        is_syndicate = (i <= 1200) # Core organized crime network
        if is_syndicate:
            synd_idx = (i - 1) % 3
            synd = syndicates[synd_idx]
            cell = synd["cell"]
            if i <= 3:
                role = "Kingpin"
            elif i <= 30:
                role = "Lieutenant"
            elif i <= 150:
                role = "Courier / Cut-out"
            elif i <= 600:
                role = "Enforcer / Shooter"
            else:
                role = "Hawala Mule"
        else:
            cell = "Local-Offender"
            role = random.choice(["Petty Offender", "Suspect Associate", "Informant", "Vehicle Handler", "Courier", "Noise"])

        phone = _gen_phone(dist_info["circle"], i)
        account = _gen_account(dist_info["ifsc_prefix"], i)
        station = random.choice(dist_info["stations"])
        vehicle = _gen_vehicle(dist_info["rto"], i) if random.random() < 0.35 else ""
        alias = f"{full_name} @ {random.choice(ALIASES)}" if random.random() < 0.2 else ""

        p_entry = {
            "id": f"UP{i:05d}",
            "name": full_name,
            "alias": alias,
            "role": role,
            "cell": cell,
            "district": dist_info["district"],
            "station": station,
            "phone": phone,
            "account": account,
            "vehicle": vehicle,
            "lat": dist_info["lat"] + random.uniform(-0.04, 0.04),
            "lng": dist_info["lng"] + random.uniform(-0.04, 0.04),
        }
        people.append(p_entry)

    # Save people_directory.json
    people_path = out_dir / "people_directory.json"
    with open(people_path, "w", encoding="utf-8") as f:
        json.dump({"network_people": people[:1500], "total_count": len(people)}, f, indent=2)

    # 2. Generate FIR Records
    print("Phase 2: Generating authentic FIR incident records with UP Gangsters Act & IPC sections...")
    firs = []
    num_firs = min(4000, total_people // 4)
    start_date = datetime(2024, 1, 1)
    
    for fir_idx in range(1, num_firs + 1):
        dist_info = random.choice(UP_DISTRICTS)
        station = random.choice(dist_info["stations"])
        incident_date = start_date + timedelta(days=random.randint(0, 240))
        day_num = (incident_date - start_date).days + 1
        sec_title, sec_desc = random.choice(UP_CRIME_SECTIONS)
        
        # Pick 1 to 4 accused
        accused_pool = [p for p in people[random.randint(0, min(2000, len(people)-10)):][:10]]
        accused_subset = random.sample(accused_pool, k=min(len(accused_pool), random.randint(1, 3)))
        accused_names = ", ".join([a["name"] for a in accused_subset])
        lead_accused = accused_subset[0]

        narrative = (
            f"Case Crime No. {fir_idx:04d}/2024 registered at {station}, {dist_info['district']}. "
            f"Charges under {sec_title}. Sub-Inspector report states that accused {accused_names} "
            f"were identified operating in jurisdiction of {dist_info['district']}. {sec_desc}. "
            f"Primary accused tracked using mobile {lead_accused['phone']}"
        )
        if lead_accused["vehicle"]:
            narrative += f" operating vehicle registration {lead_accused['vehicle']}."

        firs.append({
            "fir_id": f"UP-FIR-{fir_idx:04d}",
            "date": incident_date.strftime("%Y-%m-%d"),
            "day": day_num,
            "station": station,
            "location": f"{station}, {dist_info['district']}",
            "ipc_sections": sec_title,
            "narrative": narrative,
            "ground_truth_flag": "syndicate" if any(a["role"] in ["Kingpin", "Lieutenant", "Courier / Cut-out"] for a in accused_subset) else "local_crime"
        })

    firs_path = out_dir / "firs.csv"
    with open(firs_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["fir_id", "date", "day", "station", "location", "ipc_sections", "narrative", "ground_truth_flag"])
        writer.writeheader()
        writer.writerows(firs)

    # 3. Generate CDR Call Detail Records
    print("Phase 3: Synthesizing telecom CDR graph with burst spikes & cut-out bridges...")
    cdrs = []
    num_cdrs = min(50000, total_people * 3)
    core_suspects = people[:600]

    for c_idx in range(1, num_cdrs + 1):
        if random.random() < 0.70 and len(core_suspects) >= 2:
            # High-density calls within organized crime network
            caller = random.choice(core_suspects)
            # Find peer in same cell or cross-cell courier
            callee = random.choice(core_suspects)
            while callee["id"] == caller["id"]:
                callee = random.choice(core_suspects)
        else:
            # Calls across broader suspect population
            caller = random.choice(people[:3000])
            callee = random.choice(people[:3000])
            while callee["id"] == caller["id"]:
                callee = random.choice(people[:3000])

        call_date = start_date + timedelta(days=random.randint(0, 240))
        day_num = (call_date - start_date).days + 1
        call_time = f"{random.randint(0, 23):02d}:{random.randint(0, 59):02d}:{random.randint(0, 59):02d}"
        dur = random.randint(15, 1200)
        dist_info = random.choice(UP_DISTRICTS)
        tower = f"{random.choice(dist_info['stations'])} Tower, {dist_info['district']}"

        cdrs.append({
            "call_id": f"UP-CDR-{c_idx:06d}",
            "caller_id": caller["id"],
            "caller_name": caller["name"],
            "caller_phone": caller["phone"],
            "callee_id": callee["id"],
            "callee_name": callee["name"],
            "callee_phone": callee["phone"],
            "timestamp": f"{call_date.strftime('%Y-%m-%d')} {call_time}",
            "day": day_num,
            "call_type": "voice" if random.random() < 0.85 else "sms",
            "duration_sec": dur,
            "cell_tower_location": tower
        })

    cdrs_path = out_dir / "cdrs.csv"
    with open(cdrs_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "call_id", "caller_id", "caller_name", "caller_phone",
            "callee_id", "callee_name", "callee_phone", "timestamp", "day",
            "call_type", "duration_sec", "cell_tower_location"
        ])
        writer.writeheader()
        writer.writerows(cdrs)

    # 4. Generate Financial Transactions (Mule accounts, Structuring, RTGS)
    print("Phase 4: Synthesizing financial crime layer (Hawala channels, UPI, RTGS)...")
    txns = []
    num_txns = min(15000, total_people)
    for t_idx in range(1, num_txns + 1):
        sender = random.choice(core_suspects)
        receiver = random.choice(core_suspects)
        while receiver["id"] == sender["id"]:
            receiver = random.choice(core_suspects)

        txn_date = start_date + timedelta(days=random.randint(0, 240))
        day_num = (txn_date - start_date).days + 1
        txn_time = f"{random.randint(9, 19):02d}:{random.randint(0, 59):02d}:00"
        
        # Structuring pattern: 48,000 to 49,999 (avoid 50k PAN/CTR threshold)
        if random.random() < 0.4:
            amt = random.randint(45000, 49950)
            mode = random.choice(["IMPS", "UPI", "NEFT"])
        else:
            amt = random.randint(5000, 450000)
            mode = "RTGS" if amt > 200000 else random.choice(["NEFT", "IMPS", "Bank Transfer"])

        txns.append({
            "txn_id": f"UP-TXN-{t_idx:05d}",
            "sender_id": sender["id"],
            "sender_name": sender["name"],
            "sender_account": sender["account"],
            "receiver_id": receiver["id"],
            "receiver_name": receiver["name"],
            "receiver_account": receiver["account"],
            "amount_inr": amt,
            "timestamp": f"{txn_date.strftime('%Y-%m-%d')} {txn_time}",
            "day": day_num,
            "txn_type": mode,
            "ground_truth_flag": "hawala_structuring" if (45000 <= amt <= 49999) else "none"
        })

    txns_path = out_dir / "transactions.csv"
    with open(txns_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "txn_id", "sender_id", "sender_name", "sender_account",
            "receiver_id", "receiver_name", "receiver_account", "amount_inr",
            "timestamp", "day", "txn_type", "ground_truth_flag"
        ])
        writer.writeheader()
        writer.writerows(txns)

    # 5. Generate Criminal History Records
    print("Phase 5: Generating state criminal dossier history...")
    crim_hist = []
    for c_idx, p in enumerate(core_suspects[:800], start=1):
        sec_title, _ = random.choice(UP_CRIME_SECTIONS)
        crim_hist.append({
            "record_id": f"UP-CRIM-{c_idx:04d}",
            "person_id": p["id"],
            "name": p["name"],
            "alias": p["alias"],
            "dob": f"{random.randint(1975, 2003)}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}",
            "prior_offences": f"2022 - {sec_title}; 2023 - UP Gangsters Act",
            "gang_affiliation": p["cell"],
            "known_address": f"{random.randint(10, 250)}, Near {p['station']}, {p['district']}, Uttar Pradesh",
            "ground_truth_flag": "core_gang"
        })

    crim_path = out_dir / "criminal_history.csv"
    with open(crim_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "record_id", "person_id", "name", "alias", "dob",
            "prior_offences", "gang_affiliation", "known_address", "ground_truth_flag"
        ])
        writer.writeheader()
        writer.writerows(crim_hist)

    print(f"\nSUCCESS! Uttar Pradesh Hybrid Dataset Generated in {out_dir.resolve()}:")
    print(f"  • Suspects Synthesized: {total_people}")
    print(f"  • Case FIRs Generated:   {len(firs)}")
    print(f"  • CDR Call Records:      {len(cdrs)}")
    print(f"  • Financial Transfers:   {len(txns)}")
    print(f"  • Prior Criminal History: {len(crim_hist)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate UP State Hybrid Criminal Network Dataset")
    parser.add_argument("--count", type=int, default=20000, help="Total number of suspects (default: 20000)")
    parser.add_argument("--out", type=str, default="data/up_dataset", help="Output directory")
    args = parser.parse_args()
    generate_up_dataset(total_people=args.count, out_dir=Path(args.out))

def generate_auxiliary_reports(total_people: int, out_dir: Path):
    start_date = datetime(2024, 1, 1)
    
    # 6. Surveillance Reports
    surv = []
    for s_idx in range(1, 401):
        dist_info = random.choice(UP_DISTRICTS)
        station = random.choice(dist_info["stations"])
        s_date = start_date + timedelta(days=random.randint(0, 240))
        day_num = (s_date - start_date).days + 1
        surv.append({
            "report_id": f"UP-SURV-{s_idx:04d}",
            "date": s_date.strftime("%Y-%m-%d"),
            "day": day_num,
            "team": f"STF Unit {random.randint(1, 8)} ({dist_info['district']})",
            "location": f"{station}, {dist_info['district']}",
            "confidence": random.choice(["High", "Medium", "Low"]),
            "activity_notes": f"Static surveillance outside suspect safehouse near {station}. Identified suspicious movement of vehicles.",
            "ground_truth_flag": "core_surveillance" if s_idx <= 100 else "routine"
        })
    with open(out_dir / "surveillance_reports.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["report_id", "date", "day", "team", "location", "confidence", "activity_notes", "ground_truth_flag"])
        writer.writeheader()
        writer.writerows(surv)

    # 7. Intelligence Reports
    intel = []
    for i_idx in range(1, 301):
        dist_info = random.choice(UP_DISTRICTS)
        i_date = start_date + timedelta(days=random.randint(0, 240))
        day_num = (i_date - start_date).days + 1
        intel.append({
            "report_id": f"UP-INTEL-{i_idx:04d}",
            "date": i_date.strftime("%Y-%m-%d"),
            "day": day_num,
            "source_reliability": random.choice(["A1 (Completely Reliable)", "B2 (Usually Reliable)", "C3 (Fairly Reliable)"]),
            "narrative": f"HUMINT operative reports illicit arms consignment moving via highway toward {dist_info['district']}. Cash routing managed through hawala operators.",
            "mentioned_entity_ids": f"UP{random.randint(1, 200):05d}",
            "ground_truth_flag": "syndicate_intel" if i_idx <= 80 else "noise"
        })
    with open(out_dir / "intelligence_reports.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["report_id", "date", "day", "source_reliability", "narrative", "mentioned_entity_ids", "ground_truth_flag"])
        writer.writeheader()
        writer.writerows(intel)

    # 8. Social Posts
    social = []
    for sp_idx in range(1, 601):
        dist_info = random.choice(UP_DISTRICTS)
        sp_date = start_date + timedelta(days=random.randint(0, 240))
        day_num = (sp_date - start_date).days + 1
        social.append({
            "post_id": f"UP-SOC-{sp_idx:04d}",
            "handle": f"@user_up_{sp_idx}",
            "person_id": f"UP{random.randint(1, 1000):05d}",
            "timestamp": f"{sp_date.strftime('%Y-%m-%d')} {random.randint(10, 23):02d}:15:00",
            "day": day_num,
            "location_tag": f"{dist_info['district']}, UP",
            "post_text": "Live meeting with associates in Lucknow. #Power #Network",
            "hashtags": "#UPgangs,#purvanchal",
            "ground_truth_flag": "noise"
        })
    with open(out_dir / "social_posts.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["post_id", "handle", "person_id", "timestamp", "day", "location_tag", "post_text", "hashtags", "ground_truth_flag"])
        writer.writeheader()
        writer.writerows(social)
