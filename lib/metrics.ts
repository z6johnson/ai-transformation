/**
 * Reads measures.json across engagements plus the framework files, and assembles the
 * executive dashboard view model. Values are authored and re-baselined quarterly, not
 * telemetric (see design/design-notes.md). Server-only.
 */
import { getJson, listDir, isStorageConfigured } from "./github";
import { ENGAGEMENTS_ROOT, FRAMEWORK_ROOT, artifactFile } from "./paths";
import { Measures, IMPACT_DIMENSIONS, type ImpactDimension, type BaselineKpi, type AdaptiveMeasure } from "./schemas";

export type DashboardKpi = BaselineKpi & { engagementId: string; engagementName: string };

// Pure display helpers live in a client-safe module (no server imports); re-exported
// here so existing server-side importers keep working unchanged.
export { DIMENSION_LABELS, formatKpi, delta } from "./metrics-format";

export type Dashboard = {
  configured: boolean;
  roiDefinition: string;
  dimensions: Record<ImpactDimension, DashboardKpi[]>;
  destination: DashboardKpi[];
  adaptive: Array<AdaptiveMeasure & { engagementId: string; engagementName: string }>;
  rebaselinedQuarter: string;
  engagementCount: number;
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
