# Service Blueprint

**Layer 1 · Lifecycle Map · Template 03**

The blueprint is the operations view. Where the journey map (02) shows what the person experiences, the blueprint shows the machinery that produces that experience: what staff do in front of the person, what they do behind the scenes, the systems behind both, and the points where work passes between them. It lines up stage for stage with the journey map.

This is the template where handoffs and decisions get written down on their own, because they are where work breaks and where Layer 2 will later look for AI opportunities.

AI can draft the stage rows and the handoff and decision lists from the tagged interviews, as a first cut for a person to rebuild and check against the source. It names no solutions here; that comes later, in Layer 2.

---

## Header

| Field | Entry |
|---|---|
| Service / lifecycle | [name] |
| Scope | [start and end, matching the journey map] |
| Stages (from journey map 02) | [Stage 1] → [Stage 2] → [Stage 3] → ... |
| Lead | [name] · [date] |

## The blueprint, by stage

For each stage, fill in the rows below.

- **What the person does**: what the person the service is for does in this stage (mirror the journey map).
- **In front of the person**: staff work the person can see, and the people and screens they deal with directly.
- **Behind the scenes**: staff work the person cannot see but that makes the front possible.
- **Systems behind it**: the tools, data, and processes the behind-the-scenes work runs on.

### Stage: [name]

| Row | Entry |
|---|---|
| What the person does | [their actions here] |
| In front of the person | [staff actions and screens they deal with] |
| Behind the scenes | [staff actions out of sight that enable the front] |
| Systems behind it | [systems, data sources, and processes relied on] |

Repeat per stage.

## Handoffs

A handoff is any point where work, information, or responsibility moves between people, units, or systems. They are the most common place for delay and loss. Log every one.

| ID | Stage | From | To | What moves | How it moves | What can break here |
|---|---|---|---|---|---|---|
| H-01 | [stage] | [role/unit/system] | [role/unit/system] | [the work or information] | [channel or method] | [how it fails: delay, loss, duplication, ambiguity] |

## Decisions

A decision is any place the service makes a judgment, an approval, a routing choice, or a call on who qualifies. These carry straight into Layer 2 as the moments where AI might help, so write each one down precisely, as the decision is made today.

| ID | Stage | The decision | Who decides | What they decide on | Rule or basis | What happens when the information is missing or wrong | Clear-cut or judgment |
|---|---|---|---|---|---|---|---|
| D-01 | [stage] | [what is being decided] | [role] | [the inputs to the decision] | [the rule, policy, or basis used] | [the failure path] | [clear-cut / real judgment] |

The "clear-cut or judgment" column matters for Layer 3 later: clear-cut, rule-based decisions and real human-judgment decisions need different guardrails. Record what you see, not what would be convenient.

## Systems and data

List the systems the service runs on and what each one holds. This grounds later conversations with ITS and Data Insights & Analytics.

| System | What it is used for | What data it holds | Owner | Connects to |
|---|---|---|---|---|
| [name] | [use] | [data] | [owner] | [other systems] |

## Where it breaks

Pull together where the blueprint shows the service breaking: handoffs that drop work, decisions with no clean path when information is missing, systems that do not talk to each other. Point to the Friction Register (05).

- [breaking point]: [what breaks, with H- / D- / FR- IDs]

## Where this goes next

Lines up with the journey map (02). The handoff and decision lists feed the Friction Register (05) and carry into Layer 2 through the validation packet (06). The systems list grounds the Layer 2 and Layer 3 technical conversations.
