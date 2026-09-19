"""Hindi / Devanagari narrative support — extraction, transliteration, resolution."""
import json

import pytest

from backend.config import DATA_DIR
from backend.extraction.devanagari import (
    has_devanagari, normalize_digits, transliterate, fold_phonetic,
    romanize_for_match, infer_hindi_relation, extract_person_mentions,
)
from backend.extraction.entity_extractor import (
    extract_unstructured_entities, extract_relationships,
)
from backend.resolution.resolver import resolve_entities, name_similarity

HINDI_FIR = (
    "प्राथमिकी संख्या 0231/2024, थाना कोतवाली। मुखबिर की सूचना पर आरोपी रमेश यादव "
    "तथा आरोपी सुरेश राणे को डॉकसाइड वार्ड के पास देखा गया। दोनों की मुलाकात हुई। "
    "आरोपी रमेश यादव ने मोबाइल नंबर ९८२००९८२०० से संपर्क किया। जांच में पाया गया कि "
    "आरोपी ने ४५००० रुपये नकद सुरेश राणे को भेजे।"
)


def _people():
    with open(DATA_DIR / "people_directory.json", encoding="utf-8") as f:
        return json.load(f)


def _datasets():
    return {
        "people_directory": _people(),
        "firs": [{"fir_id": "FIR-HI-001", "narrative": HINDI_FIR,
                  "day": 61, "date": "2024-03-12"}],
    }


def test_script_detection_and_digits():
    assert has_devanagari(HINDI_FIR)
    assert not has_devanagari("FIR 0214 Andheri Police Station")
    # Devanagari numerals become ASCII so the phone regex can fire
    assert normalize_digits("मोबाइल ९८२००९८२००").endswith("9820098200")
    # 1:1 mapping keeps character offsets stable for evidence snippets
    assert len(normalize_digits(HINDI_FIR)) == len(HINDI_FIR)


def test_transliteration_applies_schwa_deletion():
    assert transliterate("रमेश") == "ramesh"        # not "ramesha"
    assert transliterate("सुरेश राणे") == "suresh raane"
    assert transliterate("Anwar Sheikh") == "Anwar Sheikh"  # Latin passes through


def test_phonetic_folding_collapses_spelling_variance():
    assert fold_phonetic("Anwar") == fold_phonetic("Anvar")
    assert fold_phonetic("Farhan") == fold_phonetic("Pharhan")
    assert romanize_for_match("रमेश यादव") == romanize_for_match("Ramesh Yadav")


def test_cross_script_name_similarity_clears_merge_threshold():
    # The resolver merges at >= 85; every canonical below must clear it.
    for hindi, latin in [("रमेश यादव", "Ramesh Yadav"), ("सुरेश राणे", "Suresh Rane"),
                         ("अनवर शेख", "Anwar Sheikh"), ("राजन नाइक", "Rajan Naik"),
                         ("सुनील पिल्लई", "Sunil Pillai")]:
        assert name_similarity(hindi, latin) >= 85, f"{hindi} vs {latin}"
    # ...and an unrelated pair must not
    assert name_similarity("रमेश यादव", "Kavita Desai") < 85


def test_hindi_relation_cues():
    assert infer_hindi_relation("दोनों की मुलाकात हुई")[0] == "MET"
    assert infer_hindi_relation("रुपये भेजे गए")[0] == "TRANSFERRED_TO"
    assert infer_hindi_relation("फोन पर संपर्क किया")[0] == "CALLS"
    assert infer_hindi_relation("no hindi cue here") is None


def test_particles_are_not_extracted_as_people():
    names = [p["name"] for p in _people()["network_people"]]
    mentions = {m["value"] for m in extract_person_mentions(HINDI_FIR, names)}
    assert "रमेश यादव" in mentions
    assert "सुरेश राणे" in mentions
    # Postpositions sit next to names and must never become entities
    for particle in ("ने", "को", "की", "के"):
        assert particle not in mentions


def test_hindi_fir_yields_entities_and_relationships():
    ds = _datasets()
    ents = extract_unstructured_entities(ds)
    assert any(e["entity_type"] == "Phone" and e["value"] == "9820098200" for e in ents)
    hindi_people = [e for e in ents
                    if e["entity_type"] == "Person_mention" and has_devanagari(e["value"])]
    assert hindi_people, "no Devanagari person mentions extracted"
    assert all(e.get("roman") for e in hindi_people), "mentions must carry romanised form"

    rels = extract_relationships(ds)
    kinds = {r["kind"] for r in rels if has_devanagari(str(r["src"]))}
    assert kinds & {"MET", "CALLS", "TRANSFERRED_TO", "ASSOCIATED_WITH"}
    # No self-loops from surname + full-name pairs in the same sentence
    assert not [r for r in rels if r["src"] == r["dst"]]


def test_hindi_mentions_resolve_to_canonical_ids():
    pd = _people()
    ents = extract_unstructured_entities(_datasets())
    struct = [e for e in ents if e.get("confidence", 0) >= 0.8]
    unstruct = [e for e in ents if e.get("confidence", 0) < 0.8]
    mention_map, rows = resolve_entities(struct, unstruct, pd)

    by_name = {p["name"]: p["id"] for p in pd["network_people"] + pd["noise_people"]}
    assert mention_map.get("रमेश यादव") == by_name["Ramesh Yadav"]
    assert mention_map.get("सुरेश राणे") == by_name["Suresh Rane"]
    # Cross-script merges are labelled so resolution.csv stays auditable
    translit_rows = [r for r in rows if "fuzzy_translit" in r["method"]]
    assert translit_rows and all(r["confidence"] >= 0.65 for r in translit_rows)


def test_person_register_carries_both_scripts():
    # Indian police registers hold the name in both scripts. Deriving Hindi from
    # Roman loses the information it needs (a vs aa, dental vs retroflex), so the
    # Hindi name is stored, never generated.
    pd = _people()
    people = pd["network_people"] + pd["noise_people"]
    # Records dictated in English through voice ingestion have no Hindi
    # spelling on file, and inventing one by machine transliteration was
    # rejected earlier as worse than leaving it blank.
    seeded = [p for p in people if p.get("source") != "voice_ingestion"]
    missing = [p["id"] for p in seeded if not p.get("name_hi")]
    assert not missing, f"no Hindi name on record for {missing}"
    for p in seeded:
        assert has_devanagari(p["name_hi"]), f"{p['id']} name_hi is not Devanagari"


def test_graph_nodes_expose_the_hindi_name():
    import json as _js
    from backend.config import PROJECT_ROOT

    path = PROJECT_ROOT / "output" / "graph.json"
    if not path.exists():
        pytest.skip("graph not built")
    with open(path, encoding="utf-8") as f:
        nodes = _js.load(f)["nodes"]
    persons = [n for n in nodes if n.get("kind") == "Person"]
    assert persons
    seeded = [n for n in persons if not str(n["id"]).startswith("V")]
    assert all(n.get("label_hi") for n in seeded), "person nodes must carry label_hi"
    a1 = next(n for n in persons if n["id"] == "A1")
    assert a1["label"] == "Anwar Sheikh" and a1["label_hi"] == "अनवर शेख"
