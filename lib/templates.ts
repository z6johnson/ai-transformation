import type { ArtifactId } from "./schemas";

/**
 * The six Layer 1 templates (artifacts) in their canonical order. 01 is the input
 * bookend and 06 the output bookend; 02–05 are the middle mapping artifacts that can
 * be worked in any order. Shared by the engagement overview and the template sub-menu.
 */
export type TemplateRoute = { id: ArtifactId; slug: string; blurb: string };

export const TEMPLATE_ROUTES: TemplateRoute[] = [
  { id: "01", slug: "interviews", blurb: "Raw notes + AI-assisted tagging pass" },
  { id: "02", slug: "journey", blurb: "The experience view, stage by stage" },
  { id: "03", slug: "blueprint", blurb: "Operations, handoffs, decisions, systems" },
  { id: "04", slug: "process", blurb: "Step-by-step record underneath the blueprint" },
  { id: "05", slug: "friction", blurb: "Evidence-grounded friction register + clusters" },
  { id: "06", slug: "validation", blurb: "Coverage, review, friction summary, sign-off" },
];
