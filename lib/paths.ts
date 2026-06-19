/** Repo path builders. The repo is the database; these are the file locations. */
import type { ArtifactId } from "./schemas";

const FILENAMES: Record<ArtifactId, string> = {
  "00": "00-overview.json",
  "01": "01-interview-guide.json",
  "02": "02-journey-map.json",
  "03": "03-service-blueprint.json",
  "04": "04-process-doc.json",
  "05": "05-friction-register.json",
  "06": "06-validation-packet.json",
  "07": "07-level-1-report.json",
  measures: "measures.json",
};

export const engagementDir = (id: string) => `data/engagements/${id}`;
export const engagementFile = (id: string) => `${engagementDir(id)}/engagement.json`;
export const artifactFile = (id: string, artifact: ArtifactId) => `${engagementDir(id)}/${FILENAMES[artifact]}`;
export const aiLogFile = (id: string) => `${engagementDir(id)}/_ai-log.jsonl`;
export const ENGAGEMENTS_ROOT = "data/engagements";
export const FRAMEWORK_ROOT = "data/framework";

// Reference Library — baseline policy/procedure/historical documents for the unit.
// The documents file is human-browsable; the index is machine-generated (kept separate
// so browsing never loads vectors); gap-analysis holds the human-confirmed findings.
export const libraryDir = (id: string) => `${engagementDir(id)}/_library`;
export const libraryDocsFile = (id: string) => `${libraryDir(id)}/documents.json`;
export const libraryIndexFile = (id: string) => `${libraryDir(id)}/index.json`;
export const gapAnalysisFile = (id: string) => `${libraryDir(id)}/gap-analysis.json`;
