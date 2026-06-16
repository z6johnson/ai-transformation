/**
 * Reads measures.json across engagements plus the framework files, and assembles the
 * executive dashboard view model. Values are authored and re-baselined quarterly, not
 * telemetric (see design/design-notes.md). Server-only.
 */
import { getJson, listDir, isStorageConfigured } from "./github";
import { ENGAGEMENTS_ROOT, FRAMEWORK_ROOT, artifactFile } from "./paths";
import { Measures, IMPACT_DIMENSIONS, type ImpactDimension, type BaselineKpi, type AdaptiveMeasure } from "./schemas";

export type DashboardKpi = BaselineKpi & { engagementId: string; engagementName: string };

export type Dashboard = {
  configured: boolean;
  roiDefinition: string;
  dimensions: Record<ImpactDimension, DashboardKpi[]>;
  destination: DashboardKpi[];
  adaptive: Array<AdaptiveMeasure & { engagementId: string; engagementName: string }>;
  rebaselinedQuarter: string;
  engagementCount: number;
};

export const DIMENSION_LABELS: Record<ImpactDimension, string> = {
  "operational-capacity": "Operational capacity",
  "institutional-readiness": "Institutional readiness",
  "risk-reduction": "Risk reduction",
  "system-level-influence": "System-level influence",
};

export async function getDashboard(): Promise<Dashboard> {
  const empty = (): Record<ImpactDimension, DashboardKpi[]> => ({
    "operational-capacity": [],
    "institutional-readiness": [],
    "risk-reduction": [],
    "system-level-influence": [],
  });

  if (!isStorageConfigured()) {
    return {
      configured: false,
      roiDefinition: "",
      dimensions: empty(),
      destination: [],
      adaptive: [],
      rebaselinedQuarter: "",
      engagementCount: 0,
    };
  }

  const roiFile = await getJson<{ definition?: string }>(`${FRAMEWORK_ROOT}/roi-definition.json`).catch(() => null);
  const roiDefinition = roiFile?.data.definition || "";

  const ids = await listDir(ENGAGEMENTS_ROOT);
  const dimensions = empty();
  const destination: DashboardKpi[] = [];
  const adaptive: Dashboard["adaptive"] = [];
  let rebaselinedQuarter = "";

  for (const id of ids) {
    const raw = await getJson<unknown>(artifactFile(id, "measures")).catch(() => null);
    if (!raw) continue;
    const parsed = Measures.safeParse(raw.data);
    if (!parsed.success) continue;
    const m = parsed.data;
    const eng = await getJson<{ name?: string }>(`${ENGAGEMENTS_ROOT}/${id}/engagement.json`).catch(() => null);
    const engagementName = eng?.data.name || id;
    rebaselinedQuarter = m.data.rebaselinedQuarter || rebaselinedQuarter;

    for (const kpi of m.data.destination.baselineKpis) {
      const row: DashboardKpi = { ...kpi, engagementId: id, engagementName };
      destination.push(row);
      if (IMPACT_DIMENSIONS.includes(kpi.dimension)) dimensions[kpi.dimension].push(row);
    }
    for (const a of m.data.adaptiveCapacity) {
      adaptive.push({ ...a, engagementId: id, engagementName });
    }
  }

  return {
    configured: true,
    roiDefinition,
    dimensions,
    destination,
    adaptive,
    rebaselinedQuarter,
    engagementCount: ids.length,
  };
}

/** Format a KPI value for display given its unit. */
export function formatKpi(value: number | null, unit: BaselineKpi["unit"]): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (unit) {
    case "ratio":
      return `${Math.round(value * 100)}%`;
    case "percent":
      return `${value}%`;
    case "hours":
      return `${value} h`;
    case "days":
      return `${value} d`;
    default:
      return `${value}`;
  }
}
