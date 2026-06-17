import { TEMPLATE_ROUTES } from "@/lib/templates";
import { ARTIFACT_LABELS, type ArtifactId } from "@/lib/schemas";

/**
 * Horizontal sub-menu of the six templates, shown on every template page so you can
 * hop straight between them (Interviews → Friction → Validation, etc.) without
 * returning to the engagement overview. The active template is marked.
 */
export function TemplateNav({ engagementId, activeId }: { engagementId: string; activeId: ArtifactId }) {
  return (
    <nav className="template-nav" aria-label="Templates">
      {TEMPLATE_ROUTES.map((r) => {
        const active = r.id === activeId;
        return (
          <a
            key={r.id}
            href={`/engagements/${engagementId}/${r.slug}`}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <span className="t-system">{r.id}</span> {ARTIFACT_LABELS[r.id]}
          </a>
        );
      })}
    </nav>
  );
}
