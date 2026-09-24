/**
 * Zod schemas — one definition of the engagement and the six Layer 1 artifacts,
 * shared across API routes and UI. These are the trust boundary: model output and
 * client payloads are validated here before anything is committed to the repo.
 */
import { z } from "zod";

/**
 * Provenance stamp on any value that an AI feature can originate.
 *  - human        — typed or edited by a person.
 *  - ai-draft     — proposed, not yet in the artifact (e.g. low-confidence, awaiting review).
 *  - ai-applied   — auto-applied by AI at/above the confidence threshold; in the artifact,
 *                   not explicitly human-confirmed, but the human can edit or remove it.
 *  - ai-confirmed — a human explicitly accepted the AI output.
 */
export const Origin = z.enum(["human", "ai-draft", "ai-applied", "ai-confirmed"]);
export type Origin = z.infer<typeof Origin>;

export const Provenanced = z.object({
  value: z.string().default(""),
  origin: Origin.default("human"),
  promptId: z.string().optional(),
  confirmedBy: z.string().optional(),
  confirmedAt: z.string().optional(),
});
export type Provenanced = z.infer<typeof Provenanced>;

export const ARTIFACT_IDS = ["00", "01", "02", "03", "04", "05", "06", "07", "measures"] as const;
export type ArtifactId = (typeof ARTIFACT_IDS)[number];

export const ArtifactStatus = z.enum(["draft", "in-review", "confirmed"]);

/** Shared envelope every stored artifact carries. */
export const Envelope = z.object({
  artifactId: z.enum(ARTIFACT_IDS),
  engagementId: z.string(),
  status: ArtifactStatus.default("draft"),
  updatedAt: z.string().optional(),
  updatedBy: z.string().optional(),
  aiAssisted: z.boolean().default(false),
});

// ---- Engagement -----------------------------------------------------------

export const EngagementStage = z.enum(["selection", "mapping", "design", "implementation"]);
export type EngagementStage = z.infer<typeof EngagementStage>;

/** Ordered lifecycle stages and their human labels. Shared by the home, detail, form, and stepper. */
export const STAGES = EngagementStage.options;
export const STAGE_LABELS: Record<EngagementStage, string> = {
  selection: "Selection",
  mapping: "Mapping",
  design: "Design",
  implementation: "Implementation & transfer",
};

/**
 * The two sides of a service. `external` is the people the service serves (fans, employees
 * under review, applicants); `internal` is the people who run it. Every artifact records side
 * where it matters so the map can show both experiences and where one root cause hits both.
 * The engagement names each side in plain words (e.g. "Fans and donors" / "Athletics staff").
 */
export const SIDES = ["external", "internal"] as const;
export const Side = z.enum(SIDES);
export type Side = z.infer<typeof Side>;
export const SideOrBoth = z.enum(["external", "internal", "both"]);
export type SideOrBoth = z.infer<typeof SideOrBoth>;

export const DEFAULT_SIDE_NAMES = { external: "People served", internal: "Staff" };
export const SideNames = z
  .object({ external: z.string().default(DEFAULT_SIDE_NAMES.external), internal: z.string().default(DEFAULT_SIDE_NAMES.internal) })
  .default(DEFAULT_SIDE_NAMES);
export type SideNames = z.infer<typeof SideNames>;

/** The label for a side (or "both"), falling back to the defaults when a name is blank. */
export function sideLabel(names: Partial<SideNames> | undefined, side: SideOrBoth): string {
  const n = { external: names?.external || DEFAULT_SIDE_NAMES.external, internal: names?.internal || DEFAULT_SIDE_NAMES.internal };
  return side === "both" ? `Both (${n.external}; ${n.internal})` : n[side];
}

/** When in the service cycle something happens. Blank when the notes don't say. */
export const When = z.enum(["", "year-round", "game-day"]);
export type When = z.infer<typeof When>;
export const WHEN_LABELS: Record<When, string> = { "": "—", "year-round": "Across the season", "game-day": "Event day" };

export const Engagement = z.object({
  id: z.string(),
  name: z.string(),
  service: z.string().default(""),
  scopeStart: z.string().default(""),
  scopeEnd: z.string().default(""),
  lead: z.string().default(""),
  lifecycleOwner: z.object({ name: z.string().default(""), role: z.string().default("") }).default({ name: "", role: "" }),
  stage: EngagementStage.default("mapping"),
  owner: z.string().default(""),
  sides: SideNames,
  createdAt: z.string().optional(),
});
export type Engagement = z.infer<typeof Engagement>;

// ---- 01 Interview guide ---------------------------------------------------

export const TAGS = ["STAGE", "TOUCH", "HAND", "DEC", "FRICTION", "WORKAROUND", "CONFLICT"] as const;
export const Tag = z.enum(TAGS);

export const InterviewTag = z.object({
  id: z.string(),
  tag: Tag,
  sourceWords: z.string(),
  span: z.object({ start: z.number(), end: z.number() }).optional(),
  origin: Origin.default("ai-draft"),
  promptId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmedBy: z.string().optional(),
  confirmedAt: z.string().optional(),
});
export type InterviewTag = z.infer<typeof InterviewTag>;

export const Interview = z.object({
  id: z.string(),
  header: z.object({
    person: z.string().default(""),
    role: z.string().default(""),
    relationship: z.string().default(""),
    interviewer: z.string().default(""),
    date: z.string().default(""),
    consent: z.string().default(""),
    // Which side the speaker is on. Defaults to external so older interviews parse.
    side: Side.default("external"),
    // An observation (e.g. a game-day visit) records what was seen, often on both sides.
    sourceType: z.enum(["interview", "observation"]).default("interview"),
  }),
  rawNotes: z.string().default(""),
  tags: z.array(InterviewTag).default([]),
  // Provenance for interviews imported from a transcript (file upload or pasted text).
  // Optional and backward-compatible: hand-entered interviews simply omit it.
  source: z
    .object({ filename: z.string(), uploadedAt: z.string(), uploadedBy: z.string() })
    .optional(),
});
export type Interview = z.infer<typeof Interview>;

export const InterviewGuide = Envelope.extend({
  data: z.object({ interviews: z.array(Interview).default([]) }),
});

// ---- 02 Journey map -------------------------------------------------------

export const JourneyStage = z.object({
  name: z.string().default(""),
  order: z.number().default(0),
  doing: Provenanced,
  wants: Provenanced,
  touchpoints: Provenanced,
  thinkingFeeling: Provenanced,
  waitingFor: Provenanced,
  effort: z.enum(["low", "moderate", "high"]).default("moderate"),
  effortWhy: Provenanced,
  frictionRefs: z.array(z.string()).default([]),
  duration: z.string().default(""),
  when: When.default(""),
  // The evidence behind the stage: how strong, and which side's accounts it rests on. An
  // external stage that rests only on internal accounts is secondhand and is flagged as such.
  evidence: z
    .object({
      level: z.enum(["", "observed", "several", "one"]).default(""),
      fromSides: z.array(Side).default([]),
    })
    .default({ level: "", fromSides: [] }),
});
export type JourneyStage = z.infer<typeof JourneyStage>;

export const EVIDENCE_LABELS = {
  "": "Not marked",
  observed: "Observed this season",
  several: "Described by several people",
  one: "Described by one person",
} as const;

/** One person's journey through the service, from one side. */
export const Journey = z.object({
  id: z.string().default("J-1"),
  side: Side.default("external"),
  person: z.string().default(""),
  stages: z.array(JourneyStage).default([]),
  momentsThatMatter: z.array(z.object({ moment: z.string(), why: z.string() })).default([]),
  dropoutPoints: z.array(z.object({ point: z.string(), what: z.string() })).default([]),
});
export type Journey = z.infer<typeof Journey>;

/**
 * Older journey maps stored one journey as `stages` at the top level. Wrap that as a single
 * external journey so stored data keeps loading; the next save writes the new shape.
 */
function upgradeJourneyData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const d = raw as Record<string, unknown>;
  if (Array.isArray(d.journeys)) return d;
  const header = (d.header || {}) as Record<string, unknown>;
  const { stages, momentsThatMatter, dropoutPoints, ...rest } = d;
  const hasOld = Array.isArray(stages) && stages.length > 0;
  return {
    ...rest,
    journeys: hasOld
      ? [{ id: "J-1", side: "external", person: header.person || "", stages, momentsThatMatter: momentsThatMatter || [], dropoutPoints: dropoutPoints || [] }]
      : [],
  };
}

export const JourneyMap = Envelope.extend({
  data: z.preprocess(
    upgradeJourneyData,
    z.object({
      header: z
        .object({
          service: z.string().default(""),
          scope: z.string().default(""),
          // Kept for older data; each journey now names its own person.
          person: z.string().default(""),
          others: z.string().default(""),
          sources: z.array(z.string()).default([]),
        })
        .default({}),
      journeys: z.array(Journey).default([]),
    }),
  ),
});
export type JourneyMapData = z.infer<typeof JourneyMap>["data"];

// ---- 03 Service blueprint -------------------------------------------------

export const Handoff = z.object({
  id: z.string(),
  stage: z.string().default(""),
  from: z.string().default(""),
  to: z.string().default(""),
  whatMoves: z.string().default(""),
  how: z.string().default(""),
  whatBreaks: z.string().default(""),
  // Does the person served see or feel this handoff? False means it is backstage only.
  visibleToExternal: z.boolean().default(false),
  origin: Origin.default("human"),
});

export const Decision = z.object({
  id: z.string(),
  stage: z.string().default(""),
  decision: z.string().default(""),
  whoDecides: z.string().default(""),
  decidesOn: z.string().default(""),
  basis: z.string().default(""),
  failurePath: z.string().default(""),
  kind: z.enum(["clear-cut", "judgment"]).default("judgment"),
  visibleToExternal: z.boolean().default(false),
  origin: Origin.default("human"),
});

export const Blueprint = Envelope.extend({
  data: z.object({
    header: z.object({ service: z.string().default(""), scope: z.string().default(""), lead: z.string().default("") }).default({}),
    stageRows: z
      .array(
        z.object({
          stage: z.string().default(""),
          personDoes: Provenanced,
          frontstage: Provenanced,
          backstage: Provenanced,
          systems: Provenanced,
        }),
      )
      .default([]),
    handoffs: z.array(Handoff).default([]),
    decisions: z.array(Decision).default([]),
    systems: z
      .array(
        z.object({
          name: z.string().default(""),
          usedFor: z.string().default(""),
          dataHeld: z.string().default(""),
          owner: z.string().default(""),
          connectsTo: z.string().default(""),
          // Provenance so an AI-drafted system carries a visible mark (responsible-AI §2).
          origin: Origin.default("human"),
        }),
      )
      .default([]),
    breakingPoints: z.array(z.object({ what: z.string(), refs: z.array(z.string()).default([]) })).default([]),
  }),
});

// ---- 04 Process documentation ---------------------------------------------

export const ProcessDoc = Envelope.extend({
  data: z.object({
    header: z.object({ service: z.string().default(""), scope: z.string().default(""), stages: z.string().default("") }).default({}),
    steps: z
      .array(
        z.object({
          id: z.string(),
          step: z.string().default(""),
          trigger: z.string().default(""),
          who: z.string().default(""),
          system: z.string().default(""),
          rule: z.string().default(""),
          handsOnTime: z.string().default(""),
          waitTime: z.string().default(""),
          whatGoesWrong: z.string().default(""),
          // Where the step sits on the blueprint: done by the person served, by staff in
          // contact with them (frontstage), or by staff out of their sight (backstage).
          lane: z.enum(["", "external", "frontstage", "backstage"]).default(""),
          when: When.default(""),
          origin: Origin.default("human"),
        }),
      )
      .default([]),
  }),
});

// ---- 05 Friction register -------------------------------------------------

export const FRICTION_TYPES = [
  "Delay",
  "Rework",
  "Error",
  "Handoff gap",
  "Effort",
  "Experience",
  "Risk",
  "Capacity",
] as const;

export const FrictionEntry = z.object({
  id: z.string(),
  where: z.string().default(""),
  type: z.enum(FRICTION_TYPES).default("Delay"),
  whatsWrong: z.string().default(""),
  // Which side feels it. `whoFeels` stays as the specific group within that side.
  side: SideOrBoth.default("external"),
  whoFeels: z.string().default(""),
  evidence: z.string().default(""),
  severity: z.enum(["low", "moderate", "high"]).default("moderate"),
  frequency: z.enum(["rare", "occasional", "frequent", "constant"]).default("occasional"),
  atDecision: z.object({ yes: z.boolean().default(false), ref: z.string().default("") }).default({ yes: false, ref: "" }),
  notes: z.string().default(""),
  origin: Origin.default("human"),
});
export type FrictionEntry = z.infer<typeof FrictionEntry>;

export const FrictionRegister = Envelope.extend({
  data: z.object({
    header: z.object({ service: z.string().default(""), scope: z.string().default(""), lead: z.string().default("") }).default({}),
    entries: z.array(FrictionEntry).default([]),
    clusters: z
      .array(
        z.object({
          name: z.string().default(""),
          frIds: z.array(z.string()).default([]),
          sharedRoot: z.string().default(""),
          // Sides the cluster's entries sit on. A cluster on both sides is one root cause
          // felt by the people served and by staff.
          sides: z.array(SideOrBoth).default([]),
          origin: Origin.default("human"),
        }),
      )
      .default([]),
    // The friction summary is the lead's to write — never AI. No provenance choice offered.
    honestAccount: z.string().default(""),
  }),
});

// ---- 06 Validation packet -------------------------------------------------

export const ValidationPacket = Envelope.extend({
  data: z.object({
    header: z
      .object({
        service: z.string().default(""),
        scope: z.string().default(""),
        lifecycleOwner: z.object({ name: z.string().default(""), role: z.string().default("") }).default({}),
        businessOwners: z.string().default(""),
        lead: z.string().default(""),
      })
      .default({}),
    coverageCheck: z
      .object({
        scopeAligned: z.boolean().default(false),
        stepsTrace: z.boolean().default(false),
        handoffsDecisionsLogged: z.boolean().default(false),
        frictionGrounded: z.boolean().default(false),
        conflictsSettled: z.boolean().default(false),
        bothSidesCovered: z.boolean().default(false),
        externalNotOnlySecondhand: z.boolean().default(false),
      })
      .default({
        scopeAligned: false,
        stepsTrace: false,
        handoffsDecisionsLogged: false,
        frictionGrounded: false,
        conflictsSettled: false,
        bothSidesCovered: false,
        externalNotOnlySecondhand: false,
      }),
    reviewSession: z
      .object({
        date: z.string().default(""),
        attendees: z.string().default(""),
        confirmed: z.string().default(""),
        corrected: z.string().default(""),
        contested: z.string().default(""),
      })
      .default({ date: "", attendees: "", confirmed: "", corrected: "", contested: "" }),
    honestAccount: z.string().default(""),
    openQuestions: z.string().default(""),
    signOff: z
      .object({
        ownerName: z.string().default(""),
        ownerSigned: z.boolean().default(false),
        ownerDate: z.string().default(""),
        leadName: z.string().default(""),
        leadSubmitted: z.boolean().default(false),
        leadDate: z.string().default(""),
      })
      .default({ ownerName: "", ownerSigned: false, ownerDate: "", leadName: "", leadSubmitted: false, leadDate: "" }),
  }),
});

// ---- 07 Level 1 report (design briefing) ----------------------------------

/**
 * The lead-in briefing that hands the Mapping stage off to Design (Layer 2). The page
 * assembles the read-only roll-up from the confirmed artifacts (02/03/05/06) at render
 * time; this artifact stores only what is authored ON the report — a short synthesis
 * that a human reviews. Per template 00, the synthesis stays descriptive: it names where
 * friction concentrates and restates the decisions carried forward, but proposes no fix.
 */
export const Level1Report = Envelope.extend({
  data: z.object({
    header: z.object({ service: z.string().default(""), scope: z.string().default(""), lead: z.string().default("") }).default({}),
    synthesis: z
      .object({
        whereItStands: Provenanced,
        frictionPatterns: Provenanced,
        decisionsForDesign: Provenanced,
        openQuestions: Provenanced,
        externalExperience: Provenanced.default({}),
        internalExperience: Provenanced.default({}),
        sharedRoots: Provenanced.default({}),
      })
      .default({
        whereItStands: {},
        frictionPatterns: {},
        decisionsForDesign: {},
        openQuestions: {},
        externalExperience: {},
        internalExperience: {},
        sharedRoots: {},
      }),
    generatedAt: z.string().default(""),
  }),
});
export type Level1Report = z.infer<typeof Level1Report>;

// ---- Measures (executive dashboard) ---------------------------------------

export const IMPACT_DIMENSIONS = [
  "operational-capacity",
  "institutional-readiness",
  "risk-reduction",
  "system-level-influence",
] as const;
export type ImpactDimension = (typeof IMPACT_DIMENSIONS)[number];

export const BaselineKpi = z.object({
  id: z.string(),
  label: z.string(),
  dimension: z.enum(IMPACT_DIMENSIONS),
  baseline: z.number().nullable().default(null),
  baselineDate: z.string().default(""),
  current: z.number().nullable().default(null),
  currentDate: z.string().default(""),
  target: z.number().nullable().default(null),
  unit: z.enum(["ratio", "percent", "hours", "days", "count"]).default("count"),
  betterDirection: z.enum(["up", "down"]).default("up"),
});
export type BaselineKpi = z.infer<typeof BaselineKpi>;

export const AdaptiveMeasure = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().nullable().default(null),
  baseline: z.number().nullable().default(null),
  quarter: z.string().default(""),
  note: z.string().default(""),
});
export type AdaptiveMeasure = z.infer<typeof AdaptiveMeasure>;

export const Measures = Envelope.extend({
  data: z.object({
    roiHypothesis: z.string().default(""),
    destination: z.object({ baselineKpis: z.array(BaselineKpi).default([]) }).default({ baselineKpis: [] }),
    adaptiveCapacity: z.array(AdaptiveMeasure).default([]),
    rebaselinedQuarter: z.string().default(""),
  }),
});
export type Measures = z.infer<typeof Measures>;

/** Map an artifact id to its schema (used by the save route to validate payloads). */
export const ARTIFACT_SCHEMAS = {
  "00": Envelope.extend({ data: z.object({ overview: z.string().default("") }) }),
  "01": InterviewGuide,
  "02": JourneyMap,
  "03": Blueprint,
  "04": ProcessDoc,
  "05": FrictionRegister,
  "06": ValidationPacket,
  "07": Level1Report,
  measures: Measures,
} as const;

export const ARTIFACT_LABELS: Record<ArtifactId, string> = {
  "00": "Overview",
  "01": "Interview Guide",
  "02": "Journey Map",
  "03": "Service Blueprint",
  "04": "Process Documentation",
  "05": "Friction Register",
  "06": "Validation Packet",
  "07": "Level 1 Report",
  measures: "Measures",
};
