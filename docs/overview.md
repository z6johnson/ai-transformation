# Overview

**AI Transformation Practice · OSI · UC San Diego**

This document explains, in plain language, what this project is, what it does
today, and where it could go next. It is written for service owners, university
leaders, and partners who want to understand the practice without reading the
templates themselves.

---

## What this is

The AI Transformation Practice is a **method, not a piece of software**. It is a
set of templates and ground rules that helps a university team write down how one
of its services actually works, find where that service causes friction, and
decide — carefully, and only later — where artificial intelligence could
responsibly help.

The whole practice is built on one discipline: **understand the service as it
really is before naming a single fix.** Most efforts to "add AI" skip this step
and bolt technology onto a process nobody fully understands. This practice slows
down at the start so the later decisions rest on how the service truly runs, not
on how an org chart says it runs.

Today the project ships as a small library of Markdown documents you fill in by
hand. There is no app to log into yet. The value is in the questions it asks and
the order it asks them in.

## Who it's for

A single person from the practice — **the lead** — runs each engagement and works
alongside the people who own and operate the service:

- **The lifecycle owner** — owns the service and signs off on the finished map.
- **Business owners** — run the service day to day and provide the ground truth.
- **Frontline staff** — do the parts of the work the customer sees.
- **Behind-the-scenes staff** — do the work the customer never sees.
- **The people the service is for** — the ones living the experience being mapped.

Examples of a "service" or "lifecycle": employee onboarding, admissions,
financial aid, procurement, or a single slice of one such as performance review.

## The problem it solves

AI opportunities inside a large institution are scattered, easy to overstate, and
easy to misjudge. Without a shared picture of how a service works, teams argue
about solutions before they agree on the problem, and they reach for AI where a
simpler fix — or no change at all — would serve people better.

This practice gives a repeatable way to:

1. Map how a service really works, end to end.
2. Catalog its friction with evidence, not impressions.
3. Hand a clean, agreed picture to the people who will later weigh AI options.

## How it works today: Layer 1, the Lifecycle Map

The practice is organized into three layers. **Layer 1 — Lifecycle Mapping — is
the part that exists today.** It produces a written, agreed account of a service
from start to finish: its stages, points of contact, handoffs, decisions, and the
places where it breaks down.

Layer 1 is done with six templates, used in order. Each one feeds the next, and
the last pulls them together.

| # | Template | What it captures |
|---|----------|------------------|
| 01 | **Interview Guide** | Raw, first-person accounts of how the work really happens — gathered before anything is mapped. |
| 02 | **Journey Map** | The experience from the customer's side: what they do at each stage, and how it feels. |
| 03 | **Service Blueprint** | The operations behind each stage — what staff do up front and behind the scenes, plus every handoff and decision. |
| 04 | **Process Documentation** | The step-by-step detail underneath, including where the official procedure and the real one diverge. |
| 05 | **Friction Register** | A running log of problems, each tied to a place on the map and to evidence, with how bad it is and how often it happens. |
| 06 | **Validation Packet** | The review, the reconciliation of conflicting accounts, and the lifecycle owner's sign-off. |

A few things worth knowing about how these fit together:

- **Interviews are the source for everything else.** The lead listens for the gap
  between the written process and the real one, and follows the friction wherever
  people hedge or describe a workaround.
- **The journey map and blueprint line up stage for stage** — one shows the
  experience, the other shows the machinery behind it.
- **Handoffs and decisions are where services break,** so the blueprint records
  every one. The list of decisions is the single most important thing that
  carries forward.

**What "done" means.** The mapping stage is finished when the journey map and
blueprint cover the agreed scope end to end and line up; every process step traces
to a stage; the friction register rests on evidence with severity and frequency
recorded; the owners have reviewed the map in a working session; and the
validation packet is signed.

## How AI is used today — and its limits

AI plays a real but tightly bounded role in building the map. It helps the team
hold more of what people say than any single reader could:

- **Tagging** passages of interview notes against a shared set of labels (stage,
  handoff, decision, friction, workaround, and so on).
- **Finding contradictions** where two accounts of the same service disagree.
- **Grouping related friction** so separate complaints can be traced to a shared
  root cause.
- **Drafting first cuts** of the maps for a person to rebuild.

The limits are the point:

- **A person decides what is true.** AI tags and drafts; humans confirm or reject
  every suggestion, and anything the AI is unsure of it flags rather than guesses.
- **Nothing happens in secret.** Everyone interviewed is told, in plain terms,
  how AI is used before they speak.
- **AI never judges a person or scores the service.** It is a tool for organizing
  and cross-checking accounts, nothing more.

This restraint is what protects the trust the interviews depend on.

## The principles behind it

All work in this project is governed by eight **Responsible AI Seed Principles**,
which translate the University of California's Responsible AI Principles into
concrete, binding rules. In plain terms:

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

A companion **Seed Style Guide** sets the visual and accessibility standards for
anything the practice eventually builds, with accessibility (WCAG 2.1 AA at
minimum) treated as a floor, not a feature.

## Potential future scope

The pieces below are **planned or aspirational — none of them exist in the project
today.** They describe where the practice is designed to go.

### Layer 2 — AI Opportunity Design (planned)

Layer 2 begins against the finished Layer 1 map. Where Layer 1 deliberately names
no solutions, Layer 2 is where opportunities get named and weighed:

- Take the list of decisions and the friction register from Layer 1.
- Tag each decision or friction point by the value AI could create there.
- Weigh that opportunity against the friction it would relieve — and prefer a
  non-AI fix wherever one would serve as well.

A clean, specific Layer 1 map is what makes this possible; a vague map produces
vague opportunities.

### Layer 3 — Governance (planned)

Layer 3 is where guardrails are built for whatever Layer 2 decides to pursue:
evaluation criteria and baselines, fairness checks, ongoing monitoring,
graceful fallbacks, named owners, and clear appeal paths for anyone affected by an
AI-driven decision. This layer turns the seed principles from rules on paper into
working controls around a live feature.

### An interactive web tool (aspirational)

The existence of a detailed style guide — covering buttons, inputs, status bars,
and accessibility targets — points to a future interactive product. Such a tool
could host the templates online and take over the manual work that is done by hand
today: capturing interviews, auto-suggesting tags, surfacing contradictions across
accounts, clustering related friction, and assembling the validation packet. The
manual Markdown templates would then become the foundation the product is built on,
rather than the product itself.

## Current status and how to use it today

The practice is at **draft v1**, and Layer 1 is the working part. To use it now:

1. Set the scope with the lifecycle owner before the first interview, and write it
   on every artifact. Scope drift is the most common way an engagement loses its
   footing.
2. Copy the templates in [`../data/`](../data/) and fill them in order, starting
   with the [Interview Guide](../data/01-interview-guide.md) and ending with the
   [Validation Packet](../data/06-lifecycle-map-validation-packet.md).
3. Build the [Friction Register](../data/05-friction-register.md) as you go, tying
   each entry to a place on the map and to evidence.
4. Review the finished map with the owners and capture the lifecycle owner's
   sign-off.

For the full set of templates and the rules behind them, see:

- [Layer 1 template set](../data/00-layer-1-template-set.md)
- [Responsible AI Seed Principles](../responsible-ai-seed-principles.md)
- [Seed Style Guide](../seed-style-guide.md)
