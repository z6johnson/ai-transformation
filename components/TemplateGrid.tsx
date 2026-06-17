import { ARTIFACT_LABELS, type ArtifactId } from "@/lib/schemas";

export type TemplateItem = { id: ArtifactId; slug: string; blurb: string; status: string };

/**
 * Engagement-overview template list. The six Layer 1 templates are shown in their
 * canonical 01–06 order.
 */
export function TemplateGrid({ engagementId, items }: { engagementId: string; items: TemplateItem[] }) {
  return (
    <div className="template-grid">
      {items.map((item) => (
        <div key={item.id} className="template-row">
          <a href={`/engagements/${engagementId}/${item.slug}`}>
            <span>
              <span className="t-system">{item.id}</span> {ARTIFACT_LABELS[item.id]}
              <span className="t-faint t-block">{item.blurb}</span>
            </span>
            <span className="t-system">{item.status}</span>
          </a>
        </div>
      ))}
    </div>
  );
}
