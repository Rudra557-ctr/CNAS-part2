# CNAS — Opening Pitch (2 minutes, spoken)

Deliver this **before** the demo, standing, with nothing on screen but the dashboard.
Then go straight into `DEMO_RUNBOOK.md` at 0:00. Every number here is measured from the
running system — if a screen ever disagrees, read the screen, never this file.

---

## The script

### 1. The problem — 35s

> "Problem Statement 189 comes from the National Crime Records Bureau. One investigation
> produces call records, bank transfers, FIRs written in Hindi and in English, surveillance
> logs, social media. The same person appears across all of them, under slightly different
> names.
>
> So the people are named everywhere. **The structure is nowhere.** In our case file, the
> police records alone name **33 people and give 25 links between them.** Social media names
> 32 people and gives **zero.** You cannot rank a courier by their position in a network
> nobody has built yet."

### 2. Our idea — 35s

> "So our idea is one sentence: **build the network first, then rank people by where they sit
> in it.**
>
> Fuse every source into a single graph. Decide with evidence when two records are the same
> person — including when the name is written in Devanagari. Rank by network position, not by
> how often somebody is mentioned. And show the working behind every number, because an officer
> has to defend it in court. All of it runs **offline, on a department machine** — no cloud
> model, no API key. This is crime data."

### 3. What we built — 40s

> "And we built it. Not a mockup — a working system.
>
> Seven upload connectors. Identity resolution that **refuses a match as readily as it makes
> one.** Centrality, communities, activity bursts, financial structuring. Questions in plain
> language that tell you what they answered **and what they refused.** Voice entry: an officer
> dictates a new suspect, and nothing is written until they confirm it. An arrest-impact
> simulator. And a court-format case file, in one click."

### 4. The proof, and hand over — 10s

> "One number. Fusing the sources takes this same investigation from
> **25 relationships to 749** — and puts **six bridge entities** on screen that no single
> source ranks at all.
>
> Let me show you."

---

## If you only get 30 seconds

> "Problem Statement 189, NCRB. A case file names everybody and connects nobody — 33 people,
> 25 links. We fuse every source into one graph, resolve the same person across all of them
> including Hindi text, and rank by network position: **749 relationships, six bridge
> entities.** Offline, no cloud. Every number traces to a source record. It's built and
> running — let me show you."

---

## Don't say it here

The demo makes these points better than the pitch can. Leave them for the screen:

- **How** entity resolution works (thresholds, phonetic folding) — that's the Hindi step at 6:15.
- The Palantir comparison — only if a judge raises it.
- Scale (Operation Purvanchal, ~9,600 entities) — that's a Q&A answer, not an opening claim.
- Anything about Neo4j, architecture or the tech stack. No judge has asked for a stack list in
  the first two minutes, and it costs you the problem.

## Before you use it

- Read it aloud against a timer once. It is ~290 words, which is about 2 minutes at a normal
  pace. If you run long, cut the second half of beat 3 — the feature list survives being shorter.
- Say the numbers slowly. They are the whole argument: 33 and 25, zero, 749, six.
- End on "let me show you" and move. Don't pause for a reaction.
