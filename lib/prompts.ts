/**
 * Versioned prompt templates. Responsible-AI §3: treat prompts as code — version them
 * and reference by id in the log. Each builder returns the system+user messages and
 * carries an id that is recorded with every call.
 *
 * The governing instruction across all of these: AI helps build the map. It names no
 * solutions, never judges a person, never scores the service, and produces drafts a
 * human rebuilds and confirms. (data/_templates/00-layer-1-template-set.md)
 */
import { TAGS, FRICTION_TYPES } from "./schemas";

const COMMON_GUARDRAIL =
  "You assist a service-design mapping practice. You describe the service as it is and propose no fixes or solutions. " +
  "You never judge a person or score the service. Tie every output to the words in the notes. " +
  "When unsure, flag rather than guess. A human confirms everything you produce. " +
  "Respond with a single valid JSON object and nothing else.";

/**
 * Appended to a draft prompt's system message when a DOCUMENTED BASELINE block is present.
 * Holds the line on weighting: interviews (and confirmed upstream artifacts) are the only
 * source of asserted facts; the baseline (the library synthesis) is reference only and may
 * NOT fill any field — it can only surface coverage gaps into a separate `coverageNotes`
 * array. This keeps the as-is map interview-grounded while still letting the documents flag
 * what the conversations may have missed.
 */
const BASELINE_COVERAGE_RULE =
  " A DOCUMENTED BASELINE block may appear last in the input. It describes what written " +
  "policy/procedure SAYS should happen, may be outdated, and is NOT ground truth. Draft every " +
  "field ONLY from the interview notes and any confirmed upstream artifacts; never copy a " +
  'baseline statement into a field as if it were observed. Use the baseline solely to fill the ' +
  'separate "coverageNotes" array: where the notes are silent on something the documents ' +
  'describe, record it there as an open question with its baselineRefs (e.g. "SEC-01"). If no ' +
  "baseline block is present, return an empty coverageNotes array.";

/**
 * Appended to every draft prompt. The service has two sides and the notes say which side each
 * voice speaks from. Keeping them apart is what lets the map show both experiences, and
 * lets a reader see when one side's experience is known only from the other side's account.
 */
const SIDES_RULE =
  " The service has two sides. EXTERNAL is the people the service serves; INTERNAL is the staff who run it. " +
  "Each block of notes is labeled with the side of the person speaking, or OBSERVATION for something the practice " +
  "watched happen. When an internal person describes what the external side goes through, that is a secondhand " +
  "account: use it, but record it as coming from the internal side.";

/** The coverageNotes field appended to a draft's return JSON when the baseline is in play. */
const COVERAGE_JSON = '"coverageNotes":[{"note":"","baselineRefs":[]}]';

export const SUGGEST_TAGS = {
  id: "suggest-tags.v1",
  build(notes: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `Read these interview notes and suggest tags for the passages that matter. Use ONLY these tags: ${TAGS.join(", ")}.\n` +
          `Meanings: STAGE = sets or bounds a stage; TOUCH = a point of contact or channel; HAND = a handoff between roles/units/systems; ` +
          `DEC = a decision/approval/routing point; FRICTION = a friction point; WORKAROUND = an unofficial practice diverging from the written process; ` +
          `CONFLICT = contradicts another account.\n` +
          `For each suggestion include the EXACT verbatim words from the notes that justify it (sourceWords), the tag, and a confidence 0..1.\n` +
          `Return JSON: {"suggestions":[{"tag":"FRICTION","sourceWords":"...","confidence":0.7}]}.\n\n` +
          `NOTES:\n${notes}`,
      },
    ];
  },
};

export const DRAFT_JOURNEY = {
  id: "draft-journey.v2",
  /** `side` picks whose journey to draft; `sideName` is the engagement's plain name for it. */
  build(taggedNotes: string, withBaseline = false, side: "external" | "internal" = "external", sideName = "") {
    const fields =
      `"person":"","stages":[{"name":"","doing":"","wants":"","touchpoints":"","thinkingFeeling":"","waitingFor":"",` +
      `"effort":"moderate","duration":"","when":"","evidenceLevel":"","evidenceFrom":["external"]}]`;
    const json = withBaseline ? `{${fields},${COVERAGE_JSON}}` : `{${fields}}`;
    const whose =
      side === "external"
        ? `the journey of a person the service serves (EXTERNAL${sideName ? `: ${sideName}` : ""}). Draw it from the EXTERNAL voices and ` +
          `OBSERVATION notes first; use INTERNAL accounts only where they describe what the external person goes through`
        : `the journey of the staff who run the service (INTERNAL${sideName ? `: ${sideName}` : ""}): the stages of their year and of an ` +
          `event day, what they are doing, what they need, what they wait on, and where the effort falls. Draw it from the INTERNAL voices ` +
          `and OBSERVATION notes`;
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL + SIDES_RULE + (withBaseline ? BASELINE_COVERAGE_RULE : "") },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes, draft a first cut of ${whose}. List the stages in order. ` +
          `Name the person whose journey it is in "person" (a role, never a real name). ` +
          `For each stage give: name, what the person is doing, what they want here, points of contact (touchpoints), what they are thinking and feeling, ` +
          `what they wait for, an effort level (low|moderate|high) and a typical duration if stated. ` +
          `Set "when" to "year-round" for work or experience spread across the season, "game-day" for what happens on an event day, or "" if unclear. ` +
          `Set "evidenceFrom" to the sides whose notes support the stage (["external"], ["internal"], or both), and "evidenceLevel" to ` +
          `"observed" when an OBSERVATION supports it, "several" when more than one person describes it, or "one" when only one does. ` +
          `Do not invent facts not in the notes; leave blanks empty.\n` +
          `Return JSON: ${json}.\n\n` +
          `TAGGED NOTES:\n${taggedNotes}`,
      },
    ];
  },
};

export const CLUSTER_FRICTION = {
  id: "cluster-friction.v2",
  build(entries: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `Group these friction-register entries into clusters that share a single root cause. ` +
          `Flag where several entries independently point at the same underlying thing. Each entry says which side feels it: ` +
          `EXTERNAL (the people served), INTERNAL (the staff who run the service), or BOTH. Look hard for a root cause that shows ` +
          `up on both sides, where the same underlying thing makes work harder for staff and the experience worse for the people served; ` +
          `those clusters matter most. Do not force a pairing the entries don't support. Name no solutions.\n` +
          `Return JSON: {"clusters":[{"name":"","frIds":["FR-01"],"sharedRoot":""}]}.\n\n` +
          `ENTRIES (id, side, where, type, what's wrong):\n${entries}`,
      },
    ];
  },
};

export const DRAFT_FRICTION = {
  id: "draft-friction.v3",
  build(context: string, withBaseline = false) {
    const fields = `"entries":[{"where":"","type":"Delay","whatsWrong":"","side":"external","whoFeels":"","evidence":"","severity":"moderate","frequency":"occasional"}]`;
    const json = withBaseline ? `{${fields},${COVERAGE_JSON}}` : `{${fields}}`;
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL + SIDES_RULE + (withBaseline ? BASELINE_COVERAGE_RULE : "") },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes — and the confirmed journey stages and blueprint when present — draft candidate ` +
          `friction-register entries from the FRICTION-tagged passages. Use the confirmed stages, handoffs, and decisions to ` +
          `place each entry precisely in "where" (a stage name, H- handoff, or D- decision). For each: where on the map, a type ` +
          `from [${FRICTION_TYPES.join(", ")}], what's concretely wrong, which side feels it ("external", "internal", or "both" when ` +
          `the same problem lands on the people served and on staff), who specifically feels it, the evidence (quote the words from ` +
          `the notes and name the side of the person who said them), ` +
          `a severity (low|moderate|high) and how often (rare|occasional|frequent|constant). State what is wrong, never a fix.\n` +
          `Return JSON: ${json}.\n\n` +
          `CONTEXT:\n${context}`,
      },
    ];
  },
};

export const DRAFT_BLUEPRINT = {
  id: "draft-blueprint.v2",
  build(context: string, withBaseline = false) {
    const fields =
      `"handoffs":[{"stage":"","from":"","to":"","whatMoves":"","how":"","whatBreaks":"","visibleToExternal":false}],` +
      `"decisions":[{"stage":"","decision":"","whoDecides":"","decidesOn":"","basis":"","failurePath":"","kind":"judgment","visibleToExternal":false}],` +
      `"systems":[{"name":"","usedFor":"","dataHeld":"","owner":"","connectsTo":""}]`;
    const json = withBaseline ? `{${fields},${COVERAGE_JSON}}` : `{${fields}}`;
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL + SIDES_RULE + (withBaseline ? BASELINE_COVERAGE_RULE : "") },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes and the confirmed journeys (external and internal), draft the operations view of the service blueprint: ` +
          `the handoffs, the decisions, and the systems and data behind the service. Use the tags as your guide: ` +
          `HAND-tagged passages are handoffs (work, information, or responsibility moving between people, units, or systems); ` +
          `DEC-tagged passages are decisions (a judgment, approval, routing, or qualification call); ` +
          `TOUCH-tagged passages and any system mentioned point to systems and data. Line each item up with the journey stage it belongs to. ` +
          `For a decision, set "kind" to "clear-cut" when a rule decides it and "judgment" when a person uses discretion. ` +
          `Set "visibleToExternal" to true when the person served sees or feels the handoff or decision directly, false when it stays ` +
          `backstage. Line each item up with the EXTERNAL journey's stage names. ` +
          `Do not invent facts not in the notes; leave blanks empty. Describe the service as it is and name no fixes.\n` +
          `Return JSON: ${json}.\n\n` +
          `CONTEXT:\n${context}`,
      },
    ];
  },
};

export const DRAFT_PROCESS = {
  id: "draft-process.v2",
  build(context: string, withBaseline = false) {
    const fields = `"steps":[{"step":"","trigger":"","who":"","system":"","rule":"","handsOnTime":"","waitTime":"","whatGoesWrong":"","lane":"backstage","when":""}]`;
    const json = withBaseline ? `{${fields},${COVERAGE_JSON}}` : `{${fields}}`;
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL + SIDES_RULE + (withBaseline ? BASELINE_COVERAGE_RULE : "") },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes and the confirmed journey and blueprint, draft the step-by-step process underneath the blueprint: ` +
          `one row per step, in the order they happen. For each step give what happens, what sets it off (trigger), who does it, the system used, ` +
          `the rule or standard it runs under, the hands-on time, the wait time, and what goes wrong. ` +
          `Set "lane" to "external" when the person served does the step, "frontstage" when staff do it in contact with them, or ` +
          `"backstage" when staff do it out of their sight. Set "when" to "year-round", "game-day", or "" if unclear. ` +
          `Include the staff's own steps across the season, not only the ones that touch the person served. Line steps up with the journey stages and ` +
          `the blueprint's handoffs, decisions, and systems. Keep people's own words. Do not invent facts; leave blanks empty. ` +
          `State what goes wrong, never a fix.\n` +
          `Return JSON: ${json}.\n\n` +
          `CONTEXT:\n${context}`,
      },
    ];
  },
};

/**
 * Format retrieved reference passages as a clearly-labeled baseline block. The label is
 * load-bearing: it tells the model these passages describe what is SUPPOSED to happen
 * (per written policy/procedure, possibly outdated), never what does — the interviews and
 * confirmed map remain the ground truth. Each passage keeps its [chunkId] ref for tracing.
 */
export function baselineBlock(passages: { ref: string; text: string }[]): string {
  if (!passages.length) return "";
  const body = passages.map((p) => `[${p.ref}] ${p.text}`).join("\n\n");
  return (
    "=== DOCUMENTED BASELINE (reference only — what the written policy/procedure SAYS should happen; " +
    `may be outdated; NOT ground truth) ===\n${body}`
  );
}

export const GAP_ANALYSIS = {
  id: "gap-analysis.v1",
  build(mapSummary: string, baseline: string) {
    return [
      {
        role: "system" as const,
        content:
          COMMON_GUARDRAIL +
          " The DOCUMENTED BASELINE describes what is SUPPOSED to happen per policy/procedure and may be outdated; " +
          "it is NOT ground truth. The interviews and confirmed map are the primary account of what ACTUALLY happens. " +
          "Contrast the two descriptively and name where they diverge. Name no fixes, assign no blame, and do not " +
          "declare either side 'right'.",
      },
      {
        role: "user" as const,
        content:
          `Compare the DOCUMENTED BASELINE against the AS-IS MAP and list where they diverge. For each divergence give: ` +
          `the area (a journey stage or part of the service); what the baseline says should happen (documentedBaseline); ` +
          `what actually happens per the map (actualPractice); a short descriptive contrast (divergence); the baseline ` +
          `passage refs it draws on (baselineRefs, e.g. "DOC-01#3"); and the map refs (mapRefs). Only include divergences ` +
          `grounded in BOTH sources. If the baseline is silent on something, do not invent it; if the two agree, omit it.\n` +
          `Return JSON: {"findings":[{"area":"","documentedBaseline":"","actualPractice":"","divergence":"","baselineRefs":[],"mapRefs":[]}]}.\n\n` +
          `=== AS-IS MAP (ground truth — what actually happens) ===\n${mapSummary}\n\n${baseline}`,
      },
    ];
  },
};

export const LIBRARY_SYNTHESIS = {
  id: "library-synthesis.v1",
  build(baseline: string) {
    return [
      {
        role: "system" as const,
        content:
          COMMON_GUARDRAIL +
          " This is a faithful, descriptive summary of what the reference DOCUMENTS say SHOULD happen — the documented " +
          "baseline. It is NOT a statement of what actually happens (that is the as-is map), and it is NOT ground truth. " +
          "Summarize only what the passages state, quote-anchor each section to the passage refs it draws on, and name no " +
          "fixes. If the documents are silent on something, leave it out.",
      },
      {
        role: "user" as const,
        content:
          `From these reference-library passages, write a structured synthesis of the documented baseline: the policies, ` +
          `procedures, roles, systems, and steps the documents say should govern this service. For each section give a short ` +
          `heading, a plain-language body, and the passage refs it draws on (baselineRefs, e.g. "DOC-01#3"). Add a ` +
          `one-paragraph overall summary. Include only what the passages support; invent nothing.\n` +
          `Return JSON: {"summary":"","sections":[{"heading":"","body":"","baselineRefs":[]}]}.\n\n` +
          `${baseline}`,
      },
    ];
  },
};

export const DRAFT_REPORT = {
  id: "draft-report.v2",
  build(mapSummary: string) {
    return [
      {
        role: "system" as const,
        content:
          COMMON_GUARDRAIL +
          " This is a Layer 1 briefing that leads into the Design phase. Synthesize only what the confirmed map already says. " +
          "Name no opportunities, fixes, or redesigns — naming opportunities is the next phase's job, done by people. " +
          "Restate the friction and the decisions descriptively so the design phase has a clean lead-in.",
      },
      {
        role: "user" as const,
        content:
          `From this confirmed lifecycle map, draft a short briefing for the design phase. Write four plain-language sections, each a few sentences:\n` +
          `- whereItStands: what the map shows overall — the shape of the service and where it concentrates effort.\n` +
          `- frictionPatterns: how the friction clusters relate, where it concentrates, and who feels it.\n` +
          `- decisionsForDesign: restate the decisions (D-) the design phase will weigh, descriptively. Propose nothing.\n` +
          `- openQuestions: what is still unsettled or unknown from the map, including any stage where the map knows the ` +
          `external side's experience only from staff accounts.\n` +
          `- externalExperience: what the service is like for the people it serves (EXTERNAL), in their terms.\n` +
          `- internalExperience: what running the service is like for staff (INTERNAL), across the season and on event days.\n` +
          `- sharedRoots: the friction clusters that land on both sides, and how the same cause shows up for each.\n` +
          `Tie everything to the map below; add no new facts and name no fixes.\n` +
          `Return JSON: {"whereItStands":"","frictionPatterns":"","decisionsForDesign":"","openQuestions":"",` +
          `"externalExperience":"","internalExperience":"","sharedRoots":""}.\n\n` +
          `CONFIRMED MAP:\n${mapSummary}`,
      },
    ];
  },
};

export const MODEL_TO_MAP = {
  id: "model-to-map.v2",
  build(processDigest: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `Read this step-by-step process documentation and interpret it as a BPMN flow graph for a process map. ` +
          `Produce one "task" node per step (a short, plain name taken from what happens). Add a single "startEvent" ` +
          `at the front (named from the first step's trigger) and an "endEvent" at the close. Where a step describes a ` +
          `decision, approval, routing, or a failure/exception path (look at the rule and what goes wrong), add an ` +
          `"exclusiveGateway" node and label its outgoing flows (e.g. "yes"/"no", "approved"/"returned"). Group nodes ` +
          `into lanes by who does the work (one lane per distinct role). When a step's lane is "external", the person the ` +
          `service serves does it: give them their own lane and list it first, above the staff lanes. Connect the nodes with flows in the order the ` +
          `steps happen. Use ONLY these node types: startEvent, task, exclusiveGateway, endEvent. Give every node a ` +
          `stable id. Do not invent steps, roles, or branches that the documentation does not support; describe the ` +
          `process as it is and name no fixes.\n` +
          `Return JSON: {"lanes":[{"id":"L1","name":""}],` +
          `"nodes":[{"id":"N1","type":"task","name":"","lane":"L1"}],` +
          `"flows":[{"source":"N1","target":"N2","name":""}]}.\n\n` +
          `PROCESS:\n${processDigest}`,
      },
    ];
  },
};
