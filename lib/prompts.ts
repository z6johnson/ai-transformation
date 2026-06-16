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
