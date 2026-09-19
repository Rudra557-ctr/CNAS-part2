# CNAS Demo Runbook — 8 Minutes (revised 2026-09-19)

**Setup (do 10 min before):** backend `python3 -m uvicorn backend.api.main:app --port 8000`
(from repo root), frontend `npm run dev` (from `ui/`). Open http://localhost:5173/.
Log in as `vibhu123` / `Vibhu@2026` **(investigator)**. The LIVE badge should pulse.

All numbers below were read from the live API on 2026-09-19. If any screen differs,
re-read it aloud instead of quoting this file — never argue with the screen.

**Screen load times, measured on rehearsal hardware:** Fusion Reveal ~9s, Network Graph ~10s
(the 3D layout has to settle), everything else 4–6s. That is a long silence on stage. Click
into the next screen *while you are still talking about the current one*, or open Network
Graph once during setup so it is warm.

**One card to steer around:** the dashboard's *High-Risk Leads* tile reads **0**. Lead
priority and anomaly severity use different scales, so "0 high-risk leads" sits next to
"16 high-severity anomalies" and looks contradictory to anyone reading fast. Don't point
at that tile. If a judge asks, the answer is straight: lead score is a 0–100 triage
ranking where HIGH starts at 75 and the top lead is 74; anomaly severity is a separate
per-detector scale.

## Minute-by-minute

### 0:00 — Dashboard: the one-screen pitch (45s)
> "This is CNAS, our criminal-network intelligence platform for NCRB. One screen:
> **377 entities, 2,065 mapped relationships.** Top of the pile — **Sunil Pillai, C12,
> lead score 74** — also the network's number-one bridge at 0.633. **26 live anomalies,
> 16 of them high severity.** Everything here traces to a source record. I'll prove that."

Click nothing yet. Let the stat cards land.

### 0:45 — Fusion Reveal: why fuse at all (75s)
Open **Fusion Reveal**. Default is FIR records only, day 50.
> "Left is what a police file alone contains. Right is every source fused. Same
> investigation, same slider, one data pull."

Drag the slider to day 70, or hit **Play burst week**.
> "By day 70 the police file names **27 people** and gives you **9 relationships** between
> them. Switch it to social media —" (change the dropdown) "— **32 people, zero
> relationships.** You cannot compute betweenness on a list of names."

Back to the fused panel.
> "Fused: **63 people, 727 relationships**, six bridge entities in gold. The structure only
> exists once the sources are combined. That is the entire argument for this platform."

If a judge asks whether one source is enough, select **Telecom**: it names all six bridge
persons. Say so plainly — "telecom is the richest single source; its blind spot is the
money trail, not the people." Every number on that screen is counted, including that one.

### 2:00 — Network graph: the fused result (60s)
Open **Network Graph**. Drag to rotate.
> "Red persons, blue phones, green accounts, orange locations. Cell A one side, Cell B the
> other, couriers between."

Toggle **Network → Community**: "Five clusters — A, B, C plus noise. The math recovers the
gang structure with zero labels fed in." Toggle back.

### 3:00 — Ask the Case: plain language, honest limits (75s)
Open **Ask the Case**. Click the first example chip.
> "An officer types the question. *Associates of A1 who made transactions over five lakh in
> North Delhi during July.*"

Point at the two panels.
> "It applied three things: A1, transactions, over five lakh. And it refuses two —
> **North Delhi is not a location on record in this case**, and **this case indexes evidence
> by day number, not calendar dates.** Then it answers only what it understood: **zero
> records.** A1's neighbourhood holds 17 transactions, the largest is 2.8 lakh."

Then type a plain one: `meena joshi call records`.
> "**28 call records involving Meena Joshi, days 3 to 82, across 6 counterparties** — every
> row citing its source record and evidence hash."

The line to land, slowly:
> "A narrow answer and a wrong answer look identical unless the system shows its working.
> This one shows it."

### 4:15 — Why Connected: the cut-out (75s)
Open **Why Connected**. Preset **Kingpin ↔ Lieutenant**: "Anwar Sheikh to Suresh Rane —
eight calls, shared FIR under the NDPS Act, common towers, with record IDs."
Then preset **Cross-cell bridge**: "A1 to Rajan Naik — **zero direct calls. One mutual
contact: courier X3.** A cut-out structure, classic compartmentalisation, and the system
surfaced it." Click X3's chip to drill down live.

### 5:30 — Takedown: arrest math (60s)
Open **Takedown Sim**.
> "Four strike packages. The recommended synchronized blitz — A1, A2, C12, C2, C11 —
> **12.9% network dismantlement**, with isolated fragments and freezable assets beside it."

Run it. "Compare: bridge-only interdiction gives 5.5%. This is how you choose *who* first."

Say the disclaimer once, here: *"These are investigative leads, not determinations of
guilt — the system says so on every screen."*

### 6:30 — Real formats, Hindi, connectors (60s)
**Cases → Operation Real Format**: "Telecom-format CDRs, bank UTR exports, an FIR
narrative. Foreign schemas, Windows encoding, real-format numbers. Auto-detected, mapped,
graphed."

Then **Cases → Hindi Resolution Demo**, and open **Evidence Trust → Identity Matches**. Click
**Cross-script only**. Don't narrate over this — let them read the table:

> "That FIR was written in Hindi. Left column is the text exactly as the document had it.
> **रमेश यादव** — the system reads it as *ramesh yaadav*, matches it to **Ramesh Yadav**, the
> suspect already on file, at 100%, and cites the document it came from. Same for
> **सुरेश राणे** and **कविता देसाई**. Offline, no translation service."

Then clear the filter and point at the red rows:
> "And these three it **refused** to merge — scored 40, 50, 37 against the threshold of 85.
> It shows you what it declined as readily as what it matched."

> **Build note, not a spoken line.** If you ever rebuild this case: run the analysis on an
> empty case *first* so the identity registry loads, *then* upload the Hindi FIR, *then*
> re-run. A brand-new case holding only a narrative has nothing to match against. The case is
> already built and saved, so this should never come up on stage.

**Data Connectors**: "Seven upload pipelines live today. The locked rows — CCTNS, TRAI,
FIU-IND, NATGRID — need agency authorization tokens. **We built the platform. We just need
the key.**"

### 7:30 — Close with the artifact (30s)
Back to **Dashboard** → **Export case file**. Measured at **20–25 seconds** on rehearsal
hardware, so click it first and deliver the line while it builds.
> "Everything you just saw, as a court-format case file: priority suspects, the evidence
> basis behind every flag, bridge and burst tables, and the detection thresholds we used —
> so it can be audited without access to this system."

The PDF drops. Hold eye contact on the last line. Stop talking.

## 8:00 — Q&A bank (don't volunteer these)
- *"Real data or synthetic?"* → Demo graph is synthetic micro-data; the pipeline is proven
  on real formats (show the case). NCRB public releases are aggregate tables — entity
  records come via authorized uploads, which is what the connectors panel models.
- *"False positives?"* → Scores are triaged leads with confidences, evidence hashes, and
  full audit logging. The UI labels them leads, never verdicts.
- *"Palantir does this."* → "Correct workflow — Gotham is the reference for this problem
  statement. Ours is built for NCRB data realities: mixed schemas, mixed encodings,
  Hindi/English narratives, role-gated access."
- *"Scale?"* → File-backed today with Neo4j wired in (compose file ships); analytics are
  modular per case.
- *"Privacy/misuse?"* → Every action is audit-logged to an append-only trail, writes
  (entity edits, merges, curation) are restricted to admin and investigator, and evidence
  carries SHA-256 hashes chained into a Merkle-rooted ledger.
- *"Is the NL query an LLM?"* → No. It is a deterministic parser running offline — which is
  why it can tell you exactly which constraints it applied and which it refused. An LLM
  would answer more phrasings and could not give you that guarantee.
- *"What can't it do?"* → Say it plainly: calendar-date filters, locations outside the
  case, and query shapes the parser hasn't been taught. It reports all three rather than
  guessing. The README's scope section lists the rest.

## Failure backups
- Backend down: `pkill -f uvicorn; python3 -m uvicorn backend.api.main:app --port 8000`
  (root). Takes 8s. Stall by retelling the connector story.
- Map tiles need internet — the map is not in this script; skip it entirely if offline.
- Ask the Case returns nothing for an improvised question: that is the feature, not a
  failure. Read the *Not applied* panel aloud and move to an example chip.
- Fusion Reveal panels empty: the day slider is at 50 and the source is a thin one. Hit
  **Play burst week** or switch the dropdown to Telecom.
- Case file PDF doesn't download: keep talking, it is a closing flourish, not a proof.
- Port busy: `lsof -ti:8000 | xargs kill -9`, same for 5173.

## What was cut and why
Map View and Timeline are out of the 8-minute script. Both look good, but Fusion Reveal
makes the same temporal point with a stronger argument, and the map depends on network
tiles. If you get 10 minutes instead of 8, add Timeline after Takedown — bursts, Cell A
day 32, z-score 4.47.

## Rehearsal log (target: 5 full runs)
- [ ] Run 1 — timing only (phone timer visible). Three screens are new; expect to run long.
- [ ] Run 2 — no notes, recover from one deliberate mistake (kill backend mid-demo)
- [ ] Run 3 — flat, fast, under 8:00
- [ ] Run 4 — with Q&A ambush (teammate asks the bank questions, including the two new ones)
- [ ] Run 5 — dress rehearsal, exact hardware + projector
