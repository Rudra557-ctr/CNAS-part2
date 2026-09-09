# CNAS Demo Runbook — 8 Minutes (verified 2026-09-09)

**Setup (do 10 min before):** backend `python3 -m uvicorn backend.api.main:app --port 8000`
(from repo root), frontend `npm run dev` (from `ui/`). Open http://localhost:5173/.
Log in as `vibhu123` / `Vibhu@2026` **(investigator — never demo as analyst; analysts are
role-blocked from the graph by design).** Dismiss nothing; the LIVE badge should pulse.

All numbers below were read from the live API on rehearsal day. If any screen differs,
re-read it aloud instead of quoting this file — never argue with the screen.

## Minute-by-minute

### 0:00 — Dashboard: the one-screen pitch (60s)
> "This is CNAS, our criminal-network intelligence platform for NCRB. One screen:
> **377 entities, 2,065 mapped relationships.** Top of the pile — **Sunil Pillai, C12,
> lead score 74** — flagged as the network's number-one bridge. **26 live anomalies,
> 16 of them high severity.** Everything here traces to a source record — I'll prove that."

Click nothing yet. Let the stat cards land.

### 1:00 — Network graph: two cells and a courier (90s)
Open **Network Graph**. Drag to rotate the 3D force layout. "Red is persons, blue phones,
green accounts, orange locations.
Cell A on one side, Cell B on the other — and couriers like X3 sitting between them."
Toggle **Network → Community**: "Five detected clusters — A, B, C, plus noise. The math
recovers the gang structure with zero labels fed in." Toggle back. Click node **B1**.

### 2:00 — Search that crosses all sources (45s)
Top-bar search, type **Rajan**. "One search across persons, phones, accounts —
**Rajan Naik, Kingpin, Cell B**." Click him: graph focuses, profile opens.
"Found in CDRs, transactions, and surveillance — one identity, every data stream."

### 3:00 — Profile: why he's flagged (60s)
Read the panel: "**Degree 162. 86 call edges — a communication hub. 8 financial edges
with structuring relevance. Lead score 61.** Every bullet cites its evidence."
Say the disclaimer line once, early: *"These are investigative leads, not determinations
of guilt — the system says so on every screen."*

### 4:00 — Why Connected: the money moment (90s)
Open **Why Connected**. Preset: **Kingpin ↔ Lieutenant**. "Why is Anwar Sheikh linked to
Suresh Rane? **Eight calls, shared FIR under the NDPS Act, common towers** — evidence
chain on screen with record IDs." Then preset **Cross-cell bridge**: "A1 to Rajan Naik —
**zero direct calls. One mutual contact: courier X3.** That's a cut-out structure,
classic compartmentalisation — and the system surfaced it." Click X3's chip to drill down live.

### 5:00 — Takedown: arrest math (60s)
Open **Takedown Sim**. "Four AI strike packages. The recommended synchronized blitz —
**A1, A2, C12, C2, C11 — 12.9% network dismantlement**, with the isolated-fragment count
and freezable assets beside it." Run it. "Compare: bridge-only interdiction gives 5.5%.
This is how you choose *who* to arrest first."

### 6:00 — Map + Timeline: movement and rhythm (60s)
**Map View → Trajectories**: "43 tracked suspects. Tower-to-tower movement reconstructed
from call records." Switch to **Hotspots**: "12 rendezvous sites where cells converge."
**Timeline**: "Bursts — Cell A, day 32, z-score 4.47 — with multi-cell correlated groups.
That's operation tempo."

### 7:00 — Real data + connectors: the closer (60s)
Open **Cases → Operation Real Format**: "Now the question you're all thinking — does this
work on *real* data? This case was built from **telecom-format CDRs, bank UTR exports,
and an FIR narrative** — foreign schemas, Windows encoding, real-format numbers.
Auto-detected, mapped, graphed: 20 entities, money trail included."
Open **Data Connectors**: "Seven upload pipelines live today. The locked rows — CCTNS,
TRAI, FIU-IND, NATGRID — need agency authorization tokens. **We built the platform.
We just need the key.**" Hold eye contact on the last line. Stop talking.

### 8:00 — Q&A bank (don't volunteer these)
- *"Real data or synthetic?"* → Demo graph is synthetic micro-data; the pipeline is proven
  on real formats (show the case). NCRB public releases are aggregate tables — entity
  records come via authorized uploads, which is exactly what the connectors panel models.
- *"False positives?"* → Scores are triaged leads with confidences, evidence hashes, and
  full audit logging. The UI labels them leads, never verdicts.
- *"Palantir does this."* → "Correct workflow — Gotham is the reference for this problem
  statement. Ours is built for NCRB data realities: mixed schemas, mixed encodings, Hindi/
  English narratives, role-gated access."
- *"Scale?"* → File-backed today with Neo4j wired in (compose file ships); analytics are
  modular per case.
- *"Privacy/misuse?"* → JWT + role gating (analysts can't even open the graph), every
  action audit-logged, evidence hashes for chain of custody.

## Failure backups
- Backend down: `pkill -f uvicorn; python3 -m uvicorn backend.api.main:app --port 8000`
  (root). Takes 8s. Stall by retelling the connector story.
- Map tiles need internet. Offline? Skip the map minute; spend it on the Explainer drill-down.
- Logged in as analyst by mistake: graph shows the role message — laugh it off as the
  RBAC demo ("see? even I can't see it without the role") and re-login.
- Port busy: `lsof -ti:8000 | xargs kill -9`, same for 5173.

## Rehearsal log (target: 5 full runs)
- [ ] Run 1 — timing only (phone timer visible)
- [ ] Run 2 — no notes, recover from one deliberate mistake (kill backend mid-demo)
- [ ] Run 3 — flat, fast, under 8:00
- [ ] Run 4 — with Q&A ambush (teammate asks the four bank questions)
- [ ] Run 5 — dress rehearsal, exact hardware + projector
