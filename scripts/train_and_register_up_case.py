#!/usr/bin/env python3
"""
Register and Train CNAS on the Uttar Pradesh (UP) State Crime Grid.

Creates an active Investigation Case: "Operation Purvanchal — UP State Crime Grid"
Ingests UP CDRs, FIRs, Transactions, and Criminal History dossiers.
Runs extraction, entity resolution, and builds the unified criminal graph and analytics.
"""
import sys
import os
import shutil
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.ingestion.store import create_investigation, add_file, set_processing, save_meta, get_meta, ROOT as INV_ROOT
from backend.ingestion.detector import detect_schema
from backend.ingestion.mapper import suggest_mapping, validate_mapping
from backend.api.main import inv_process

def train_up_case(sample_mode: bool = False):
    up_dir = PROJECT_ROOT / "data" / "up_dataset"
    if not up_dir.exists():
        print(f"Error: {up_dir} does not exist. Run scripts/generate_up_hybrid_dataset.py first.")
        return

    print("=================================================================")
    print("  CNAS Training & Ingestion: UP State Crime Grid (Operation Purvanchal)")
    print("=================================================================")

    # 1. Create Investigation Case
    case_name = "Operation Purvanchal — UP State Crime Grid"
    case_desc = "Statewide hybrid criminal network across 12 UP districts (Lucknow, Kanpur, Varanasi, Noida, Prayagraj, Meerut). Formatted under UP Gangsters Act 1986, NDPS, and Arms Act."
    
    meta = create_investigation(name=case_name, description=case_desc)
    iid = meta["id"]
    print(f"\n[1/4] Created Case #{iid}: '{case_name}'")

    # 2. Stage Files into Investigation
    files_to_ingest = [
        "cdrs.csv",
        "transactions.csv",
        "firs.csv",
        "criminal_history.csv",
        "intelligence_reports.csv",
        "surveillance_reports.csv",
        "social_posts.csv"
    ]

    print(f"\n[2/4] Staging and auto-mapping UP evidence files...")
    for fname in files_to_ingest:
        src = up_dir / fname
        if not src.exists():
            continue
        
        # If sample mode requested, create a focused slice for fast graph exploration
        if sample_mode and fname in ["cdrs.csv", "transactions.csv", "firs.csv"]:
            dest_tmp = INV_ROOT / iid / "files" / f"sample_{fname}"
            dest_tmp.parent.mkdir(parents=True, exist_ok=True)
            with open(src, "r", encoding="utf-8") as f_in, open(dest_tmp, "w", encoding="utf-8") as f_out:
                lines = [f_in.readline() for _ in range(2500)]
                f_out.writelines([ln for ln in lines if ln])
            use_src = dest_tmp
        else:
            use_src = src

        det = detect_schema(use_src)
        entry = add_file(iid, use_src, det, det["columns"], original_name=fname)
        
        # Auto-map columns
        mapping = suggest_mapping(det["columns"], det["detected_type"])
        valid, missing = validate_mapping(mapping, det["detected_type"])
        meta = get_meta(iid)
        meta.setdefault("mapping", {})[fname] = {
            "mapping": mapping,
            "validated": True,
            "missing": missing
        }
        save_meta(iid, meta)
        print(f"  ✓ Added & Mapped: {fname} (type: {det['detected_type']}, valid: {valid})")

    # Copy people directory
    pd_src = up_dir / "people_directory.json"
    if pd_src.exists():
        shutil.copy(pd_src, INV_ROOT / iid / "files" / "people_directory.json")
        print("  ✓ Attached UP Suspects Directory (people_directory.json)")

    # 3. Process Pipeline (Entity Extraction, Resolution, Graph Building)
    print(f"\n[3/4] Processing pipeline (Entity Extraction, Fuzzy Resolution, Graph Building)...")
    mock_user = {"username": "investigator", "role": "investigator", "name": "Inspector In-Charge"}
    result = inv_process(iid=iid, user=mock_user)

    print(f"\n[4/4] Pipeline Complete!")
    print(f"  • Status:           {result.get('status')}")
    print(f"  • Extracted Nodes:  {result['stats']['node_count']}")
    print(f"  • Mapped Edges:     {result['stats']['edge_count']}")
    print(f"  • Entities:         {result.get('entities')}")
    print(f"  • Relationships:    {result.get('relationships')}")
    print(f"\nInvestigation is now active in CNAS! Case ID: {iid}")
    print(f"Open http://localhost:5173/cases to view and explore Operation Purvanchal.")

if __name__ == "__main__":
    sample = "--sample" in sys.argv
    train_up_case(sample_mode=sample)
