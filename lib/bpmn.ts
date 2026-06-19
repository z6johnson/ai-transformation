/**
 * BPMN 2.0 serializer. Turns an interpreted process graph (lanes, nodes, flows)
 * into standards-compliant BPMN 2.0 XML — including a BPMNDI diagram with computed
 * coordinates so the file renders visually the moment it is imported into a process
 * mapping tool (ProMap, Camunda, Bizagi, Signavio, bpmn.io, etc.).
 *
 * Pure and dependency-free: deterministic left→right layered layout, lanes stacked
 * as horizontal bands. The graph itself is produced upstream by the AI interpret
 * pass (see app/api/ai/model-to-map); this module only draws it.
 */

export type BpmnNodeType = "startEvent" | "task" | "exclusiveGateway" | "endEvent";

export type BpmnLane = { id: string; name: string };
export type BpmnNode = { id: string; type: BpmnNodeType; name: string; lane?: string };
export type BpmnFlow = { source: string; target: string; name?: string };
export type BpmnGraph = { lanes?: BpmnLane[]; nodes?: BpmnNode[]; flows?: BpmnFlow[] };

// Layout constants (px).
const POOL_PAD_X = 30;
const POOL_PAD_Y = 0;
const LANE_LABEL_W = 30; // left strip inside the pool reserved for the lane label
const H_GAP = 60; // horizontal gap between columns
const V_GAP = 24; // vertical gap between stacked nodes in the same lane+column
const LANE_PAD_Y = 20; // padding at top/bottom inside a lane band
const TASK_W = 100;
const TASK_H = 80;
const EVENT_W = 36;
const EVENT_H = 36;
const GATEWAY_W = 50;
const GATEWAY_H = 50;
const COL_W = TASK_W; // columns are spaced on task width

function sizeOf(type: BpmnNodeType): { w: number; h: number } {
  if (type === "task") return { w: TASK_W, h: TASK_H };
  if (type === "exclusiveGateway") return { w: GATEWAY_W, h: GATEWAY_H };
  return { w: EVENT_W, h: EVENT_H }; // start/end events
}

function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Drop control chars and collapse whitespace for safe ids derived from arbitrary text. */
function slug(s: string): string {
  return String(s || "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

type NormNode = BpmnNode & { laneIndex: number; w: number; h: number };

/**
 * Validate and normalize the raw graph: ensure unique node ids, drop flows that
 * point at unknown nodes, guarantee at least one start and one end node exist, and
 * resolve each node to a lane band index.
 */
function normalize(graph: BpmnGraph): {
  lanes: BpmnLane[];
  nodes: NormNode[];
  flows: BpmnFlow[];
} {
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawFlows = Array.isArray(graph.flows) ? graph.flows : [];
  const rawLanes = Array.isArray(graph.lanes) ? graph.lanes : [];

  // De-duplicate / mint node ids.
  const seen = new Set<string>();
  const nodes: BpmnNode[] = [];
  let auto = 0;
  for (const n of rawNodes) {
    if (!n || typeof n !== "object") continue;
    const type: BpmnNodeType =
      n.type === "startEvent" || n.type === "endEvent" || n.type === "exclusiveGateway" ? n.type : "task";
    let id = slug(n.id) || `Node_${++auto}`;
    while (seen.has(id)) id = `${id}_${++auto}`;
    seen.add(id);
    nodes.push({ id, type, name: n.name || "", lane: n.lane });
  }

  // Ensure a start and an end exist so the diagram is well-formed and connectable.
  if (!nodes.some((n) => n.type === "startEvent")) {
    nodes.unshift({ id: "Start_auto", type: "startEvent", name: "Start", lane: nodes[0]?.lane });
    seen.add("Start_auto");
  }
  if (!nodes.some((n) => n.type === "endEvent")) {
    nodes.push({ id: "End_auto", type: "endEvent", name: "End", lane: nodes[nodes.length - 1]?.lane });
    seen.add("End_auto");
  }

  // Keep only flows whose endpoints both exist; mint flow ids later.
  const flows = rawFlows.filter(
    (f) => f && seen.has(slug(f.source)) && seen.has(slug(f.target)),
  ).map((f) => ({ source: slug(f.source), target: slug(f.target), name: f.name || "" }));

  // Resolve lanes. Use declared lanes; fall back to lanes implied by node.lane.
  let lanes: BpmnLane[] = rawLanes
    .filter((l) => l && l.id)
    .map((l) => ({ id: slug(l.id) || l.id, name: l.name || l.id }));
  const laneById = new Map(lanes.map((l, i) => [l.id, i] as const));

  // Map node.lane onto a lane index; collect any lane referenced but not declared.
  for (const n of nodes) {
    const laneRef = n.lane ? slug(n.lane) : "";
    if (laneRef && !laneById.has(laneRef)) {
      laneById.set(laneRef, lanes.length);
      lanes.push({ id: laneRef, name: n.lane || laneRef });
    }
  }
  // If no lanes at all, create a single default band so the pool still renders.
  if (lanes.length === 0) {
    lanes = [{ id: "Lane_default", name: "Process" }];
    laneById.set("Lane_default", 0);
  }

  const normNodes: NormNode[] = nodes.map((n) => {
    const laneRef = n.lane ? slug(n.lane) : "";
    const laneIndex = laneById.get(laneRef) ?? 0;
    const { w, h } = sizeOf(n.type);
    return { ...n, laneIndex, w, h };
  });

  return { lanes, nodes: normNodes, flows };
}

/**
 * Longest-path column rank for each node. Rework loops are common in real processes
 * (a gateway routing back to an earlier step), so we first strip back-edges via DFS to
 * get a DAG, then take the longest path with Kahn's topological order. Back-edges do
 * not push their target rightward; they simply render as a return arrow.
 */
function rankNodes(nodes: NormNode[], flows: BpmnFlow[]): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const n of nodes) children.set(n.id, []);
  for (const f of flows) children.get(f.source)!.push(f.target);

  // DFS three-colouring to find back-edges (edge to a node on the current stack).
  const color = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on-stack, 2 done
  const back = new Set<string>();
  const stack: { id: string; i: number }[] = [];
  for (const start of nodes) {
    if ((color.get(start.id) || 0) !== 0) continue;
    stack.push({ id: start.id, i: 0 });
    color.set(start.id, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const kids = children.get(top.id)!;
      if (top.i < kids.length) {
        const v = kids[top.i++];
        const c = color.get(v) || 0;
        if (c === 1) back.add(`${top.id}>${v}`);
        else if (c === 0) {
          color.set(v, 1);
          stack.push({ id: v, i: 0 });
        }
      } else {
        color.set(top.id, 2);
        stack.pop();
      }
    }
  }

  // Build the DAG (forward edges only) and longest-path via Kahn's algorithm.
  const dag = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    dag.set(n.id, []);
    indeg.set(n.id, 0);
  }
  for (const f of flows) {
    if (back.has(`${f.source}>${f.target}`)) continue;
    dag.get(f.source)!.push(f.target);
    indeg.set(f.target, (indeg.get(f.target) || 0) + 1);
  }

  const rank = new Map<string, number>();
  for (const n of nodes) rank.set(n.id, 0);
  const queue = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift()!;
    const base = rank.get(id) || 0;
    for (const c of dag.get(id) || []) {
      if ((rank.get(c) || 0) < base + 1) rank.set(c, base + 1);
      indeg.set(c, (indeg.get(c) || 0) - 1);
      if ((indeg.get(c) || 0) === 0) queue.push(c);
    }
  }
  return rank;
}

type Placed = NormNode & { x: number; y: number; col: number };

function layout(lanes: BpmnLane[], nodes: NormNode[], flows: BpmnFlow[]) {
  const rank = rankNodes(nodes, flows);
  const maxCol = nodes.reduce((m, n) => Math.max(m, rank.get(n.id) || 0), 0);

  // Per-lane required height: max number of nodes stacked in any single column of that lane.
  const stackCount: Map<string, number> = new Map(); // key `${lane}:${col}` -> count
  for (const n of nodes) {
    const key = `${n.laneIndex}:${rank.get(n.id) || 0}`;
    stackCount.set(key, (stackCount.get(key) || 0) + 1);
  }
  const laneMaxStack: number[] = lanes.map((_, li) => {
    let m = 1;
    for (let c = 0; c <= maxCol; c++) m = Math.max(m, stackCount.get(`${li}:${c}`) || 0);
    return m;
  });
  const laneHeights = laneMaxStack.map((s) => LANE_PAD_Y * 2 + s * TASK_H + (s - 1) * V_GAP);
  const laneTops: number[] = [];
  let acc = POOL_PAD_Y;
  for (let i = 0; i < lanes.length; i++) {
    laneTops.push(acc);
    acc += laneHeights[i];
  }
  const poolHeight = acc;
  const contentLeft = POOL_PAD_X + LANE_LABEL_W;

  // Place nodes. Track per (lane,col) how many already placed to stack vertically.
  const placedCount: Map<string, number> = new Map();
  const placed: Placed[] = nodes.map((n) => {
    const col = rank.get(n.id) || 0;
    const key = `${n.laneIndex}:${col}`;
    const slot = placedCount.get(key) || 0;
    placedCount.set(key, slot + 1);

    const colCenterX = contentLeft + col * (COL_W + H_GAP) + COL_W / 2;
    const x = colCenterX - n.w / 2;

    const laneTop = laneTops[n.laneIndex] + LANE_PAD_Y;
    const rowTop = laneTop + slot * (TASK_H + V_GAP);
    const y = rowTop + (TASK_H - n.h) / 2; // center the node within its row band
    return { ...n, x, y, col };
  });

  const poolWidth = contentLeft + (maxCol + 1) * (COL_W + H_GAP);

  return { placed, laneTops, laneHeights, poolHeight, poolWidth };
}

/** Serialize a process graph to BPMN 2.0 XML with a laid-out BPMNDI diagram. */
export function graphToBpmnXml(graph: BpmnGraph): string {
  const { lanes, nodes, flows } = normalize(graph);
  const { placed, laneTops, laneHeights, poolHeight, poolWidth } = layout(lanes, nodes, flows);

  const byId = new Map(placed.map((p) => [p.id, p] as const));
  const processId = "Process_1";
  const participantId = "Participant_1";

  // Mint deterministic flow ids.
  const flowDefs = flows.map((f, i) => ({ id: `Flow_${i + 1}`, ...f }));

  // ---- Semantic layer ----
  const laneSetXml =
    `      <bpmn:laneSet id="LaneSet_1">\n` +
    lanes
      .map((lane, li) => {
        const refs = placed
          .filter((p) => p.laneIndex === li)
          .map((p) => `          <bpmn:flowNodeRef>${p.id}</bpmn:flowNodeRef>`)
          .join("\n");
        return (
          `        <bpmn:lane id="${lane.id}" name="${xmlEscape(lane.name)}">\n` +
          (refs ? refs + "\n" : "") +
          `        </bpmn:lane>`
        );
      })
      .join("\n") +
    `\n      </bpmn:laneSet>`;

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const f of flowDefs) {
    (outgoing.get(f.source) || outgoing.set(f.source, []).get(f.source)!).push(f.id);
    (incoming.get(f.target) || incoming.set(f.target, []).get(f.target)!).push(f.id);
  }

  const nodeTag: Record<BpmnNodeType, string> = {
    startEvent: "bpmn:startEvent",
    endEvent: "bpmn:endEvent",
    exclusiveGateway: "bpmn:exclusiveGateway",
    task: "bpmn:task",
  };

  const nodesXml = placed
    .map((n) => {
      const tag = nodeTag[n.type];
      const ins = (incoming.get(n.id) || []).map((id) => `        <bpmn:incoming>${id}</bpmn:incoming>`).join("\n");
      const outs = (outgoing.get(n.id) || []).map((id) => `        <bpmn:outgoing>${id}</bpmn:outgoing>`).join("\n");
      const inner = [ins, outs].filter(Boolean).join("\n");
      const nameAttr = n.name ? ` name="${xmlEscape(n.name)}"` : "";
      if (!inner) return `      <${tag} id="${n.id}"${nameAttr} />`;
      return `      <${tag} id="${n.id}"${nameAttr}>\n${inner}\n      </${tag}>`;
    })
    .join("\n");

  const flowsXml = flowDefs
    .map((f) => {
      const nameAttr = f.name ? ` name="${xmlEscape(f.name)}"` : "";
      return `      <bpmn:sequenceFlow id="${f.id}"${nameAttr} sourceRef="${f.source}" targetRef="${f.target}" />`;
    })
    .join("\n");

  // ---- Diagram (BPMNDI) layer ----
  const poolX = POOL_PAD_X;
  const poolY = POOL_PAD_Y;

  const poolShape =
    `      <bpmndi:BPMNShape id="${participantId}_di" bpmnElement="${participantId}" isHorizontal="true">\n` +
    `        <omgdc:Bounds x="${poolX}" y="${poolY}" width="${poolWidth - poolX}" height="${poolHeight}" />\n` +
    `      </bpmndi:BPMNShape>`;

  const laneShapes = lanes
    .map((lane, li) => {
      const ly = poolY + laneTops[li];
      return (
        `      <bpmndi:BPMNShape id="${lane.id}_di" bpmnElement="${lane.id}" isHorizontal="true">\n` +
        `        <omgdc:Bounds x="${poolX + LANE_LABEL_W}" y="${ly}" width="${poolWidth - poolX - LANE_LABEL_W}" height="${laneHeights[li]}" />\n` +
        `      </bpmndi:BPMNShape>`
      );
    })
    .join("\n");

  const nodeShapes = placed
    .map((n) => {
      const labelLine =
        n.type !== "task" && n.name
          ? `\n        <bpmndi:BPMNLabel><omgdc:Bounds x="${Math.round(n.x - 10)}" y="${Math.round(n.y + n.h + 4)}" width="${n.w + 20}" height="14" /></bpmndi:BPMNLabel>`
          : "";
      return (
        `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}">\n` +
        `        <omgdc:Bounds x="${Math.round(n.x)}" y="${Math.round(n.y)}" width="${n.w}" height="${n.h}" />${labelLine}\n` +
        `      </bpmndi:BPMNShape>`
      );
    })
    .join("\n");

  const edgeShapes = flowDefs
    .map((f) => {
      const s = byId.get(f.source)!;
      const t = byId.get(f.target)!;
      const sx = Math.round(s.x + s.w);
      const sy = Math.round(s.y + s.h / 2);
      const tx = Math.round(t.x);
      const ty = Math.round(t.y + t.h / 2);
      // Simple orthogonal routing: straight when level, else step through the mid-x.
      const waypoints =
        sy === ty
          ? `        <omgdi:waypoint x="${sx}" y="${sy}" />\n        <omgdi:waypoint x="${tx}" y="${ty}" />`
          : `        <omgdi:waypoint x="${sx}" y="${sy}" />\n` +
            `        <omgdi:waypoint x="${Math.round((sx + tx) / 2)}" y="${sy}" />\n` +
            `        <omgdi:waypoint x="${Math.round((sx + tx) / 2)}" y="${ty}" />\n` +
            `        <omgdi:waypoint x="${tx}" y="${ty}" />`;
      return `      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">\n${waypoints}\n      </bpmndi:BPMNEdge>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:omgdc="http://www.omg.org/spec/DD/20100524/DC" xmlns:omgdi="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="${participantId}" name="Process" processRef="${processId}" />
  </bpmn:collaboration>
  <bpmn:process id="${processId}" isExecutable="false">
${laneSetXml}
${nodesXml}
${flowsXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
${poolShape}
${laneShapes}
${nodeShapes}
${edgeShapes}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/** Stable, filesystem-friendly filename for the process map download. */
export function processToBpmnFilename(engagementId: string): string {
  const base = slug(engagementId).toLowerCase() || "process";
  return `${base}-process.bpmn`;
}
