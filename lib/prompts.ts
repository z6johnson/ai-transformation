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
  id: "draft-journey.v1",
  build(taggedNotes: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes, draft a first cut of a journey map: the stages the person goes through, in order. ` +
          `For each stage give: name, what the person is doing, what they want here, points of contact (touchpoints), what they are thinking and feeling, ` +
          `what they wait for, an effort level (low|moderate|high) and a typical duration if stated. Do not invent facts not in the notes; leave blanks empty.\n` +
          `Return JSON: {"stages":[{"name":"","doing":"","wants":"","touchpoints":"","thinkingFeeling":"","waitingFor":"","effort":"moderate","duration":""}]}.\n\n` +
          `TAGGED NOTES:\n${taggedNotes}`,
      },
    ];
  },
};

export const CLUSTER_FRICTION = {
  id: "cluster-friction.v1",
  build(entries: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `Group these friction-register entries into clusters that share a single root cause. ` +
          `Flag where several entries independently point at the same underlying thing. Name no solutions.\n` +
          `Return JSON: {"clusters":[{"name":"","frIds":["FR-01"],"sharedRoot":""}]}.\n\n` +
          `ENTRIES (id, where, type, what's wrong):\n${entries}`,
      },
    ];
  },
};

export const DRAFT_FRICTION = {
  id: "draft-friction.v1",
  build(taggedNotes: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes, draft candidate friction-register entries from the FRICTION-tagged passages. ` +
          `For each: where on the map, a type from [${FRICTION_TYPES.join(", ")}], what's concretely wrong, who feels it, the evidence (quote the words), ` +
          `a severity (low|moderate|high) and how often (rare|occasional|frequent|constant). State what is wrong, never a fix.\n` +
          `Return JSON: {"entries":[{"where":"","type":"Delay","whatsWrong":"","whoFeels":"","evidence":"","severity":"moderate","frequency":"occasional"}]}.\n\n` +
          `TAGGED NOTES:\n${taggedNotes}`,
      },
    ];
  },
};

export const DRAFT_BLUEPRINT = {
  id: "draft-blueprint.v1",
  build(context: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes and the confirmed journey stages, draft the operations view of the service blueprint: ` +
          `the handoffs, the decisions, and the systems and data behind the service. Use the tags as your guide: ` +
          `HAND-tagged passages are handoffs (work, information, or responsibility moving between people, units, or systems); ` +
          `DEC-tagged passages are decisions (a judgment, approval, routing, or qualification call); ` +
          `TOUCH-tagged passages and any system mentioned point to systems and data. Line each item up with the journey stage it belongs to. ` +
          `For a decision, set "kind" to "clear-cut" when a rule decides it and "judgment" when a person uses discretion. ` +
          `Do not invent facts not in the notes; leave blanks empty. Describe the service as it is and name no fixes.\n` +
          `Return JSON: {"handoffs":[{"stage":"","from":"","to":"","whatMoves":"","how":"","whatBreaks":""}],` +
          `"decisions":[{"stage":"","decision":"","whoDecides":"","decidesOn":"","basis":"","failurePath":"","kind":"judgment"}],` +
          `"systems":[{"name":"","usedFor":"","dataHeld":"","owner":"","connectsTo":""}]}.\n\n` +
          `CONTEXT:\n${context}`,
      },
    ];
  },
};

export const DRAFT_PROCESS = {
  id: "draft-process.v1",
  build(context: string) {
    return [
      { role: "system" as const, content: COMMON_GUARDRAIL },
      {
        role: "user" as const,
        content:
          `From these tagged interview notes and the confirmed journey and blueprint, draft the step-by-step process underneath the blueprint: ` +
          `one row per step, in the order they happen. For each step give what happens, what sets it off (trigger), who does it, the system used, ` +
          `the rule or standard it runs under, the hands-on time, the wait time, and what goes wrong. Line steps up with the journey stages and ` +
          `the blueprint's handoffs, decisions, and systems. Keep people's own words. Do not invent facts; leave blanks empty. ` +
          `State what goes wrong, never a fix.\n` +
          `Return JSON: {"steps":[{"step":"","trigger":"","who":"","system":"","rule":"","handsOnTime":"","waitTime":"","whatGoesWrong":""}]}.\n\n` +
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

export const DRAFT_REPORT = {
  id: "draft-report.v1",
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
          `- openQuestions: what is still unsettled or unknown from the map.\n` +
          `Tie everything to the map below; add no new facts and name no fixes.\n` +
          `Return JSON: {"whereItStands":"","frictionPatterns":"","decisionsForDesign":"","openQuestions":""}.\n\n` +
          `CONFIRMED MAP:\n${mapSummary}`,
      },
    ];
  },
};

export const MODEL_TO_MAP = {
  id: "model-to-map.v1",
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
          `into lanes by who does the work (one lane per distinct role). Connect the nodes with flows in the order the ` +
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
