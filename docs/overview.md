# Overview

**AI Transformation Practice · OSI · UC San Diego**

This document explains, in plain language, what this project is, what it does
today, and where it is headed. It is the non-technical companion to the
[README](../README.md) (which covers setup and deployment) and is written for
service owners, university leaders, and partners who want to understand the work
without reading the code or the templates themselves.

---

## What this is

The AI Transformation Practice is a **working web application** — a beta — that
helps a university team write down how one of its services actually works, find
where that service causes friction, and lay clean groundwork for deciding, later
and carefully, where artificial intelligence could responsibly help.

It pairs a structured method with software that puts that method to work. The
method comes from six lifecycle-mapping templates and a set of binding responsible-AI
principles. The software gives a team a place to run the method end to end, with AI
assisting along the way and a person in charge of every result.

The whole practice rests on one discipline: **understand the service as it really
is before naming a single fix.** Most efforts to "add AI" skip this step and bolt
technology onto a process nobody fully understands. This practice slows down at the
start so the later decisions rest on how the service truly runs, not on how an org
chart says it runs.

## Who it's for

A single person from the practice — **the lead** — runs each engagement in the app
and works alongside the people who own and operate the service:

- **The lifecycle owner** — owns the service and signs off on the finished map.
- **Business owners** — run the service day to day and provide the ground truth.
- **Frontline staff** — do the parts of the work the customer sees.
- **Behind-the-scenes staff** — do the work the customer never sees.
- **The people the service is for** — the ones living the experience being mapped.

A separate audience — **university executives and leadership** — uses the
measurement dashboard to see what transformation is returning across engagements.

Examples of a "service" or "lifecycle": employee onboarding, admissions, financial
aid, procurement, or a single slice of one such as performance review. A seeded
**HR Performance Appraisal pilot** ships with the app as a worked example.

## The problem it solves

AI opportunities inside a large institution are scattered, easy to overstate, and
easy to misjudge. Without a shared picture of how a service works, teams argue
about solutions before they agree on the problem, and they reach for AI where a
simpler fix — or no change at all — would serve people better. And once AI is in
use, leaders struggle to say honestly what it is actually returning.

This application gives a repeatable way to:

1. Map how a service really works, end to end, with AI helping to organize the raw
   material.
2. Catalog its friction with evidence, not impressions.
3. Hand a clean, agreed picture to the people who will later weigh AI options.
4. Measure the return on AI transformation in terms executives have agreed to use.

## What it does today

The app has **two surfaces**.

### 1. The AI-assisted mapping workspace

A team creates an **engagement** for one service lifecycle, then works it through
the six Layer 1 templates, each with its own editor in the app:

| # | Template | What it captures |
|---|----------|------------------|
| 01 | **Interview Guide** | Raw, first-person accounts of how the work really happens — gathered before anything is mapped. |
| 02 | **Journey Map** | The experience from the customer's side: what they do at each stage, and how it feels. |
| 03 | **Service Blueprint** | The operations behind each stage — what staff do up front and behind the scenes, plus every handoff and decision. |
| 04 | **Process Documentation** | The step-by-step detail underneath, including where the official procedure and the real one diverge. |
| 05 | **Friction Register** | A running log of problems, each tied to a place on the map and to evidence, with how bad it is and how often it happens. |
| 06 | **Validation Packet** | The review, the reconciliation of conflicting accounts, and the lifecycle owner's sign-off. |

Around those six, the workspace also includes:

- **A reference library.** Upload the service's existing policy and procedure
  documents (PDF, Word, text, or Markdown). The app reads them and can run a **gap
  analysis** that contrasts what the written procedure *says* should happen against
  what the map shows *actually* happens — naming the divergences without taking
  sides.
- **A Layer 1 briefing.** Once the map is confirmed, the app drafts a short,
  plain-language briefing — where the service stands, how the friction clusters,
  the decisions a later design phase will weigh, and the open questions — to hand
  cleanly into the next stage.

**What "done" means.** The mapping stage is finished when the journey map and
blueprint cover the agreed scope end to end and line up; every process step traces
to a stage; the friction register rests on evidence with severity and frequency
recorded; the owners have reviewed the map in a working session; and the validation
packet is signed.

### 2. The executive measurement dashboard

A separate dashboard gives leadership an honest view of what AI transformation is
returning:

- **A working definition of AI ROI** — value returned against what it cost to
  transform and run a service, measured broadly enough to count experience, risk,
  and institutional-capability gains, not just dollars.
- **A four-dimension impact framework** — operational capacity, institutional
  readiness, risk reduction, and system-level influence.
- **Destination and adaptive-capacity measures** — what each engagement promised
  versus the institution's growing capacity to change — re-baselined quarterly.
  Because outcomes are not comparable unit to unit, each measure is tracked against
  its *own* baseline and target rather than ranked against others.

## How AI helps — and its limits

AI plays a real but tightly bounded role in building the map. It helps the team
hold more of what people say than any single reader could:

- **Tagging** passages of interview notes against a shared set of labels (stage,
  touchpoint, handoff, decision, friction, workaround, contradiction).
- **Drafting first cuts** of the journey map, service blueprint, process
  documentation, and friction entries for a person to rebuild.
- **Clustering related friction** so separate complaints can be traced to a shared
  root cause.
- **Comparing the written baseline** against the real map (the gap analysis) and
  **drafting the Layer 1 briefing**.

The limits are the point, and they are built into the software:

- **A person decides what is true.** Where the AI is confident it applies its
  output and marks it plainly as *AI-applied*; where it is unsure it flags the case
  for a human rather than guessing. Everything it produces stays editable and
  removable, and each item carries a visible mark of where it came from (typed by a
  person, drafted by AI, applied by AI, or confirmed by a person).
- **Nothing happens in secret.** AI involvement is always shown, and every AI call
  is written to a per-engagement decision log that travels with the work as an audit
  trail.
- **Privacy is protected.** The default model runs **on UC San Diego's own
  infrastructure** (the TritonAI service), and personal details are stripped from
  text before any model call. The key that reaches the AI service never reaches the
  browser.
- **AI never judges a person or scores the service, and it names no fixes.** It is
  a tool for organizing and cross-checking accounts, nothing more.

This restraint is what protects the trust the interviews depend on.

## How it's built, in plain terms

- It is a **web application** anyone on the team uses in a browser; there is no
  separate server to run or database to maintain.
- **The work is its own record.** Instead of a database, the app saves each
  engagement's artifacts straight into this code repository, so the full history of
  every change — who changed what, and when — is preserved automatically as the
  audit trail.
- It is built to a strict **style and accessibility standard** (the Seed Style
  Guide), with accessibility (WCAG 2.1 AA) treated as a floor, not a feature.

## The principles behind it

All work is governed by eight **Responsible AI Seed Principles**, which translate the
University of California's Responsible AI Principles into concrete, binding rules —
and which are enforced in the software itself, not just stated on paper. In plain
terms:

1. **Appropriateness** — not every problem needs AI; prefer the simplest solution
   that works.
2. **Transparency** — people should know when AI is involved and be able to
   understand and contest its outcomes.
3. **Accuracy, reliability & safety** — AI features must be measured, monitored,
   and given a safe fallback when they fail.
4. **Fairness & non-discrimination** — check for bias continuously and across
   different groups of people.
5. **Privacy & security** — minimize data, protect personal information, and never
   send sensitive records to outside services without proper agreements.
6. **Human values** — people keep agency; AI assists but does not replace human
   judgment in consequential decisions.
7. **Shared benefit** — judge a feature by how it serves those least well-served
   today, not the average user.
8. **Accountability** — every AI feature has a named human owner; using a vendor
   does not transfer responsibility.

## Where it's headed

The work today maps services and measures impact. The pieces below are **planned —
not yet built** — and describe where the practice is designed to go next.

### Layer 2 — Design

The app deliberately names **no** AI opportunities today; that is the next phase's
job, done by people. Layer 2 begins against the finished, confirmed map:

- Take the list of decisions and the friction register the map produced.
- Weigh where AI could genuinely create value — and prefer a non-AI fix wherever one
  would serve as well.

An engagement already moves through stages of *selection → mapping → design →
implementation* in the app, so the structure to hold this next phase is in place;
the design tooling itself is still to come.

### Layer 3 — Governance

Layer 3 is where guardrails are built around whatever Layer 2 decides to pursue:
evaluation sets and baselines, fairness checks, ongoing monitoring, graceful
fallbacks, named owners, and clear appeal paths for anyone affected by an AI-driven
decision. The responsible-AI engineering already in the app (decision logs,
provenance, fallbacks, PII redaction) is the foundation this layer will build on.

### A maturing measurement layer

The four-dimension impact framework on the dashboard is, by its own description, "a
starting point to test and extend, not the finished answer." As more engagements run
beyond the seeded pilot, the measures and the ROI definition are meant to be refined
against real results.

## How to use it today

The app is a **beta**. Setup, configuration, and deployment are covered in the
[README](../README.md); the in-app flow is:

1. **Create an engagement** and set its scope with the lifecycle owner. Hold to that
   scope — scope drift is the most common way an engagement loses its footing.
2. **Work the six templates in order,** starting with interviews. Let the AI tag and
   draft; confirm, edit, or remove everything it proposes.
3. **Bring in reference documents** if you have them, and run the gap analysis to see
   where the written process and the real one diverge.
4. **Validate and sign off.** Review the finished map with the owners and capture the
   lifecycle owner's sign-off, then generate the Layer 1 briefing.
5. **Track impact** for engagements that have moved further, on the executive
   dashboard.

For the underlying method and the rules behind it, see:

- [The six Layer 1 templates](../data/_templates/)
- [Responsible AI Seed Principles](../responsible-ai-seed-principles.md)
- [Seed Style Guide](../seed-style-guide.md)
