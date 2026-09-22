# CNAS Demo Runbook — 8 Minutes (revised 2026-09-22)

**Setup (do 10 min before):** backend `python3 -m uvicorn backend.api.main:app --port 8000`
(from repo root), frontend `npm run dev` (from `ui/`). Open http://localhost:5173/.
Log in as `vibhu123` **(investigator)**. The password is in the team's private note, not
in this repo: the repo is public. The LIVE badge should pulse.
On the deployed site, use the Render URL instead; everything below is the same.

**Reset before every run.** The Dictate step writes a real record. A second run would
hit "already exists" at that step, so put the demo data back first:
`git checkout -- data/people_directory.json data/intelligence_reports.csv && python3 -m backend.pipeline --clean`
(takes ~5s; the dashboard must read **372 / 2,105** afterwards). On Render the data
resets on every restart or redeploy, so **don't redeploy between the final rehearsal and
judging**, and nothing entered on stage survives a restart.

All numbers below were read from the live API on 2026-09-22. If any screen differs,
re-read it aloud instead of quoting this file — never argue with the screen.

**Where things live now.** Sidebar: *Workspace* (Dashboard, Cases), *Network
Intelligence* (Network Graph, Map, Timeline), *Analytics* (Alerts, Key Insights),
*Governance* (Data Connectors, Evidence Trust). **Fusion Reveal, Takedown Sim and Why
Connected are tabs inside Network Graph.** **Ask AI** and **Dictate** are buttons in the
top bar.

**Load times.** API responses are cached and warm at startup, so data arrives in
milliseconds. The 3D graph still needs a few seconds to settle after it arrives. Open
Network Graph once during setup, and time each screen in Run 1 before quoting any
number here.

**Lead score vs. anomaly severity.** The dashboard's *Top Lead Score* tile reads **74 —
Sunil Pillai (C12)**. If a judge asks why 74 isn't "high": lead score is a 0–100 triage
ranking where HIGH starts at 75, and anomaly severity is a separate per-detector scale.

## Minute-by-minute

### 0:00 — Dashboard: the one-screen pitch (45s)
> "This is CNAS, our criminal-network intelligence platform for NCRB. One screen:
> **372 entities, 2,105 mapped relationships.** Top of the pile — **Sunil Pillai, C12,
> lead score 74** (point at the tile) — also the network's number-one bridge at 0.633. **26 live anomalies,
> 16 of them high severity.** Everything here traces to a source record. I'll prove that."

Click nothing yet. Let the stat cards land.

### 0:45 — Fusion Reveal: why fuse at all (60s)
Sidebar → **Network Graph** → **Fusion Reveal** tab. Default is FIR records only, day 50.
> "Left is what a police file alone contains. Right is every source fused. Same
> investigation, same slider, one data pull."

Drag the slider to day 70, or hit **Play burst week**.
> "By day 70 the police file names **33 people** and gives you **25 relationships** between
> them. Switch it to social media —" (change the dropdown) "— **32 people, zero
> relationships.** You cannot compute betweenness on a list of names."

Back to the fused panel.
> "Fused: **63 people, 749 relationships**, six bridge entities in gold. The structure only
> exists once the sources are combined."

If a judge asks whether one source is enough, select **Telecom**: it names all six bridge
persons. Say so plainly — "telecom is the richest single source; its blind spot is the
money trail, not the people."

### 1:45 — Network graph: the fused result (45s)
**Network Graph** tab. Drag to rotate.
> "Red persons, blue phones, green accounts, orange locations. Cell A one side, Cell B the
> other, couriers between."

Toggle **Network → Community**: "The math recovers the gang structure with zero labels
fed in." Toggle back.

### 2:30 — Ask AI: plain language, honest limits (60s)
Top bar → **Ask AI**. Click the first example chip.
> "An officer types the question. *Associates of A1 who made transactions over five lakh in
> North Delhi during July.*"

Point at the two panels.
> "It applied four things: A1, one hop out for 'associates', transactions, over five lakh.
> And it refuses two — **North Delhi is not a location on record in this case**, and **this
> case indexes evidence by day number, not calendar dates.** Then it answers only what it
> understood: **zero records.** A1's neighbourhood holds 17 transactions; the largest is
> 2.8 lakh."

Then type a plain one: `meena joshi call records`.
> "**28 call records involving Meena Joshi, days 3 to 82, across 6 counterparties** — every
> row citing its source record and evidence hash."

The line to land:
> "A narrow answer and a wrong answer look identical unless the system shows its working."

### 3:30 — Dictate: writing to the case by voice (60s)
Top bar → **Dictate**. Speak, or click the first example chip:
*"Add a new person named Rajesh Kumar, phone number 9876543210, associated with Ramesh
Yadav."*
> "Ask reads the case. This writes to it, so it works differently: it shows what it
> understood first, and nothing is saved until I confirm."

Point at the preview: **CREATE**, *Rajesh Kumar — will be created as new*, *Ramesh Yadav →
A7, 100% match*, and the list of changes. Click **Confirm and write** (about 4 seconds).
> "It wrote the record to the case's source files, re-ran the same pipeline an upload goes
> through, and checked the rebuilt graph: new node, phone number, and the link to A7."

If there is time, click the same chip again: **duplicate — Rajesh Kumar already exists at
100% match. No duplicate was created.** "It won't create the same person twice."

The dashboard now reads **375 entities, 2,109 relationships**: the person, his phone number
and the intelligence record that holds the link. If anyone notices the change, that's why.

### 4:30 — Why Connected: the cut-out (60s)
**Network Graph** → **Why Connected** tab. Preset **Kingpin ↔ Lieutenant**: "Anwar Sheikh to
Suresh Rane — eight calls, shared FIR under the NDPS Act, common towers, with record IDs."
Then preset **Cross-cell bridge**: "A1 to Rajan Naik — **zero direct calls. One person in
common: X3, Arvind Kapoor, a logistics broker.** A cut-out, classic compartmentalisation,
and the system surfaced it." Click X3's chip to drill down live.

### 5:30 — Takedown: arrest math (45s)
**Network Graph** → **Takedown Sim** tab.
> "Four strike packages. The recommended synchronized strike — A1, A2, C12, B1, C11 —
> **13.7% network dismantlement**, with isolated fragments and freezable assets beside it."

Run it. "Compare: bridge-only interdiction gives 8.2%. This is how you choose *who* first."

Say the disclaimer once, here: *"These are investigative leads, not determinations of
guilt — the system says so on every screen."*

### 6:15 — Real formats, Hindi, connectors (75s)
Sidebar → **Cases → Operation Real Format**: "Telecom-format CDRs, bank UTR exports, an FIR
narrative. Foreign schemas, Windows encoding, real-format numbers. Auto-detected, mapped,
graphed."

Then **Cases → Hindi Resolution Demo**, and open **Evidence Trust → Identity Matches**
(sidebar, Governance). Click **Cross-script only**. Don't narrate over this — let them read
the table:

> "That FIR was written in Hindi. Left column is the text exactly as the document had it.
> **रमेश यादव** — the system reads it as *ramesh yaadav*, matches it to **Ramesh Yadav**, the
> suspect already on file, at 100%, and cites the document it came from. Same for
> **सुरेश राणे** and **कविता देसाई**. Offline, no translation service."

Then clear the filter and point at the red rows:
> "And these three it **refused** to merge — scored 40, 50 and 37.5 against the threshold of
> 85. It shows you what it declined as readily as what it matched."

> **Build note, not a spoken line.** If you ever rebuild this case: run the analysis on an
> empty case *first* so the identity registry loads, *then* upload the Hindi FIR, *then*
> re-run. The case is already built and saved, so this should never come up on stage.

**Data Connectors** (sidebar, Governance): "Seven upload pipelines live today. The locked
rows — CCTNS, TRAI, FIU-IND, NATGRID — need agency authorization tokens. **We built the
platform. We just need the key.**"

### 7:30 — Close with the artifact (30s)
Back to **Dashboard** → **Export case file**. Click it first and deliver the line while it
builds (time it in Run 1).
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
- *"Scale?"* → Open **Cases → Operation Purvanchal**: 1,500 people on file, about 9,600
  entities and 25,000 relationships in one case. File-backed today with Neo4j wired in;
  analytics are cached per case.
- *"What if two suspects share a name?"* → Dictate refuses to guess. Purvanchal has three
  different men called Ravindra Chaudhary; saying the name lists every close match with
  role, cell and phone, and the officer picks one by saying the ID (e.g. UP00303) or the
  phone number. Nothing is written until the choice is made.
- *"Does Dictate need the internet?"* → No. Speech is transcribed on the server by an
  offline Whisper model, and the parser that reads it is deterministic, not an LLM.
- *"Privacy/misuse?"* → Every action is audit-logged, writes (entity edits, merges,
  curation, dictation) are restricted to admin and investigator, and evidence carries
  SHA-256 hashes chained into a Merkle-rooted ledger. On the hosted demo the log resets
  with the server; in a deployment it sits on persistent storage.
- *"Is the NL query an LLM?"* → No. It is a deterministic parser running offline — which is
  why it can tell you exactly which constraints it applied and which it refused.
- *"What can't it do?"* → Say it plainly: calendar-date filters, locations outside the
  case, and query shapes the parser hasn't been taught. It reports all three rather than
  guessing. The README's scope section lists the rest.

## Failure backups
- Backend down: `pkill -f uvicorn; python3 -m uvicorn backend.api.main:app --port 8000`
  (root). Stall by retelling the connector story while it warms up.
- Dictate says **duplicate** on the first try: the data wasn't reset. Use it — "it won't
  create the same person twice" — and move on.
- Microphone blocked or no mic: click the example chip instead; the text path is the same
  interpreter.
- Map tiles need internet — the map is not in this script; skip it entirely if offline.
- Ask AI returns nothing for an improvised question: that is the feature, not a failure.
  Read the *Not applied* panel aloud and move to an example chip.
- Fusion Reveal panels empty: the day slider is at 50 and the source is a thin one. Hit
  **Play burst week** or switch the dropdown to Telecom.
- Case file PDF doesn't download: keep talking, it is a closing flourish, not a proof.
- Port busy: `lsof -ti:8000 | xargs kill -9`, same for 5173.

## What was cut and why
Map View and Timeline are out of the 8-minute script. Fusion Reveal makes the same temporal
point with a stronger argument, and the map depends on network tiles. If you get 10 minutes
instead of 8, add Timeline after Takedown (bursts, Cell A day 32), then Purvanchal for
scale.

## Rehearsal log (target: 5 full runs)
- [ ] Run 1 — timing only (phone timer visible). Navigation moved and Dictate is new;
  time every screen and the case-file export.
- [ ] Run 2 — no notes, recover from one deliberate mistake (kill backend mid-demo)
- [ ] Run 3 — flat, fast, under 8:00
- [ ] Run 4 — with Q&A ambush (teammate asks the bank questions, including the namesake one)
- [ ] Run 5 — dress rehearsal, exact hardware + projector (or the Render URL)
