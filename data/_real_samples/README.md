# Real-World Samples (Days 13–14: real-data readiness proof)

These files prove the pipeline ingests **authorized real-world formats**,
not just the synthetic demo schema. Upload any of them via
Cases → Upload evidence and watch schema auto-detection map the columns.

| File | What it is | Expected detection |
|---|---|---|
| `jio_cdr_mar2024.csv` | Telecom CDR in Jio-style layout (`A_Number/B_Number`, `;` delimiter, **cp1252** Windows encoding, real-format 10-digit mobiles, real tower addresses) | `cdrs` — phones, tower, duration auto-mapped |
| `sbi_txns_mar2024.csv` | Bank transfers in UTR layout (`Debit_Acct/Credit_Acct`, IFSC-style + 15-digit numeric accounts, RTGS/IMPS/NEFT) | `transactions` — accounts, amount, mode auto-mapped |
| `fir_0214_narrative.txt` | FIR narrative with real places (Andheri, Kothrud, Pune, Nashik Road), BNS sections, real-format phone + vehicle in free text | `firs` — spaCy GPE extraction |
| `econ2016.csv` | **Genuine NCRB data**: city-wise Economic Crimes 2016 (source: Crime in India via Open Govt Data mirror). Aggregate stats table — ingests as intelligence context, not entity records | `unknown` → analyst maps manually |

**Verified 2026-09-09:** detector maps all three entity files with zero
manual mapping; extractor pulls real phones (`9820098200`, `+91-9811198111`),
IFSC/numeric accounts, vehicle `MH-12-AB-1234`, and spaCy locations
(Mumbai, Andheri, Kothrud, Nashik Road) from free text.

Known limitation: `en_core_web_sm` occasionally mislabels person names in
free text (e.g. as ORG). Person identity is therefore anchored on structured
fields (CDR name columns, people directory); NER mentions are supporting
signals resolved fuzzily downstream.
