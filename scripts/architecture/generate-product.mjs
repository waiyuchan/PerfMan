import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ExcalidrawDiagram, COLORS } from "./excalidraw-kit.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const out = path.join(root, "docs/design");
const featureNodes = [
  [
    "access",
    "Workspace & access",
    "workspace.go",
    "Projects and membership\nAdmin / Engineer / Operator / Viewer\nProject + tag policies\nSession and audit history",
  ],
  [
    "author",
    "Scenario authoring",
    "console/editors.js",
    "Simple request journeys\nJavaScript modules + lifecycle\nJMX plans + thread groups\nVU / RPS / ramp / spike profiles",
  ],
  [
    "assets",
    "Data & configuration",
    "workspace_assets.go",
    "CSV parameters and partitions\nEnvironment variables + secrets\nProtocol bundles and script modules\nJMX and plugin dependencies",
  ],
  [
    "fleet",
    "Resource fleet",
    "console/views.js",
    "Groups, regions and capacity\nWorkers, clusters and Pods\nProbe, drain and disconnect\nSimulated group autoscaling",
  ],
  [
    "execution",
    "Run orchestration",
    "workspace_scheduler.go",
    "Queue and capacity admission\nRegional shards + start barrier\nLease, heartbeat and cancellation\nFrozen bundles + resource release",
  ],
  [
    "observe",
    "Monitoring & investigation",
    "workspace_series.go",
    "Request / latency / error series\nService, script and region views\nSamples, extraction, checks and logs\nWorker allocation and utilization",
  ],
  [
    "quality",
    "Quality & reporting",
    "workspace_scheduler.go",
    "Consecutive-window SLA rules\nProtection stops and notifications\nBaselines and report comparison\nJSON / CSV / print-to-PDF",
  ],
  [
    "automation",
    "Scheduling & recording",
    "workspace_scheduler.go",
    "Once or cron with IANA timezones\nPinned scenario + occurrence history\nHAR import and managed capture\nConvert captured traffic to a test",
  ],
  [
    "operations",
    "Operations & governance",
    "workspace_policy.go",
    "Audited virtual Pod terminal\nContacts, delivery inbox and retry\nPeople, tags and integrations\nEnglish / Chinese preferences",
  ],
].map(([id, label, evidence, subtitle]) => ({
  id,
  label,
  subtitle,
  kind: "module",
  lifecycle: "existing",
  plane: "workspace",
  owner: "Go Workspace",
  evidence: "studio/" + evidence,
}));
const featureModel = {
  diagram: {
    title: "PerfMan · Product capability map",
    view: "as-is",
    direction: "top-to-bottom",
    question: "Which product domains make up the managed testing workflow?",
  },
  nodes: featureNodes,
  flows: [],
  boundaries: [],
  constraints: [
    "Nine implemented management domains, grouped by user task",
    "Default infrastructure and network protocol traffic use managed simulation",
    "Each organization is a separate workspace database; no cross-organization SaaS tenancy",
  ],
};
const features = new ExcalidrawDiagram({ width: 1490, height: 1090 });
features.text({
  x: 45,
  y: 26,
  width: 1400,
  height: 45,
  value: featureModel.diagram.title,
  fontSize: 32,
});
features.text({
  x: 47,
  y: 88,
  width: 1400,
  height: 30,
  value:
    "DESIGN VIEW · Author tests, coordinate resources, investigate results and operate the workspace",
  fontSize: 16,
  color: COLORS.muted,
});
features.text({
  x: 47,
  y: 145,
  width: 1395,
  height: 36,
  value:
    "Administrator: workspace + access  ·  Engineer: author + run  ·  Operator: fleet + terminal  ·  Viewer: review",
  fontSize: 15,
  color: COLORS.ink,
});
for (const [i, n] of featureNodes.entries()) {
  const x = 45 + (i % 3) * 480,
    y = 215 + Math.floor(i / 3) * 245;
  features.node({
    id: n.id,
    x,
    y,
    width: 440,
    height: 205,
    title: n.label,
    subtitle: n.subtitle,
    kind: "existing",
    fontSize: 21,
    subtitleSize: 15,
  });
}
features.text({
  x: 47,
  y: 985,
  width: 1400,
  height: 65,
  value:
    "Blue solid cards = implemented product domains. This is a functional grouping, not a deployment diagram.\nExecution boundary: managed workers / Pods / terminal and protocol fixtures; native HTTP measures the bundled local target.",
  fontSize: 15,
  color: COLORS.muted,
});
write("feature-map", features, featureModel, { width: 1490, height: 1090 });

const steps = [
  [
    "sign-in",
    "01  Sign in & choose project",
    "workspace.go",
    "Check session, role and membership\nSelect the working environment",
  ],
  [
    "author",
    "02  Build a scenario",
    "console/editors.js",
    "Simple / JavaScript / JMeter\nBind data, checks, load and regions",
  ],
  [
    "validate",
    "03  Validate & debug",
    "workspace_engine.go",
    "Validate files, imports and inputs\nEvaluate a bounded preview",
  ],
  [
    "submit",
    "04  Run or schedule",
    "workspace_scheduler.go",
    "Start now or use a timezone plan\nCheck the pinned scenario version",
  ],
  [
    "freeze",
    "05  Freeze & queue",
    "workspace_scheduler.go",
    "Freeze scenario, files and environment\nWait for group admission",
  ],
  [
    "allocate",
    "06  Reserve regional capacity",
    "workspace_scheduler.go",
    "Split the VU budget across workers\nWait or simulate scale-out if needed",
  ],
  [
    "barrier",
    "07  Prepare Pods & release",
    "workspace_scheduler.go",
    "Observe worker readiness\nRelease the shared start barrier",
  ],
  [
    "execute",
    "08  Execute worker contexts",
    "workspace_series.go",
    "Separate script state and CSV shards\nEvaluate representative samples",
  ],
  [
    "collect",
    "09  Aggregate & inspect",
    "workspace_series.go",
    "Combine integer counts and histograms\nCollect logs, samples and checks",
  ],
  [
    "sla",
    "10  Evaluate quality windows",
    "workspace_scheduler.go",
    "Evaluate SLA on each sample window\nTrack notify and stop independently",
  ],
  [
    "finalize",
    "11  Finalize & release",
    "workspace_scheduler.go",
    "Complete / protect / cancel / interrupt\nA lost worker stays inconclusive",
  ],
  [
    "report",
    "12  Review & share results",
    "console/views.js",
    "Compare baseline and inspect snapshot\nExport JSON / CSV / print-to-PDF",
  ],
].map(([id, label, evidence, subtitle], i) => ({
  id,
  label,
  subtitle,
  step: i + 1,
  kind: "module",
  lifecycle: "existing",
  plane: i < 4 ? "authoring" : i < 8 ? "orchestration" : "assessment",
  owner: i < 4 ? "workspace user" : "Go Workspace",
  evidence: "studio/" + evidence,
}));
const flows = steps
  .slice(0, -1)
  .map((n, i) => ({
    from: n.id,
    to: steps[i + 1].id,
    label: [
      "Select project scope",
      "Bind and edit scenario",
      "Validate before admission",
      "Admit frozen bundle",
      "Reserve worker budget",
      "Provision and await readiness",
      "Release start barrier",
      "Collect bounded samples",
      "Evaluate sampled windows",
      "Finalize on duration / stop / failure",
      "Read finalized report",
    ][i],
    semantic: "sync-call",
    direction: "forward",
  }));
const workflow = {
  diagram: {
    title: "PerfMan · End-to-end testing workflow",
    view: "flow",
    direction: "left-to-right by numbered lane",
    question: "How does a user move from sign-in to a finalized report?",
  },
  nodes: steps,
  flows,
  boundaries: [],
  constraints: [
    "Capacity shortages remain queued; runs do not claim capacity that was not reserved",
    "SLA evaluation continues window by window until duration, stop or failure",
    "All terminal states release allocations; lost-shard runs cannot pass",
    "Default worker execution is an in-process simulation",
  ],
};
const d = new ExcalidrawDiagram({ width: 1480, height: 1110 });
d.text({
  x: 45,
  y: 24,
  width: 1400,
  height: 45,
  value: workflow.diagram.title,
  fontSize: 32,
});
d.text({
  x: 47,
  y: 87,
  width: 1390,
  height: 30,
  value:
    "BUSINESS FLOW · Follow steps 01 → 12 through preparation, orchestration and assessment",
  fontSize: 16,
  color: COLORS.muted,
});
const columns = [45, 405, 765, 1125],
  rows = [215, 480, 745],
  w = 310,
  h = 135;
const positions = {};
for (const [i, n] of steps.entries()) {
  const row = Math.floor(i / 4),
    col = row === 1 ? 3 - (i % 4) : i % 4;
  positions[n.id] = [columns[col], rows[row], w, h];
}
[
  "PREPARE  ·  User and project scope",
  "ORCHESTRATE  ·  Controller and managed workers",
  "ASSESS  ·  Monitoring, quality and results",
].forEach((value, i) =>
  d.text({
    x: i === 2 ? 405 : 47,
    y: rows[i] - 52,
    width: 1390,
    height: 30,
    value,
    fontSize: 18,
    color: COLORS.ink,
  }),
);
for (const n of steps) {
  const [x, y, width, height] = positions[n.id];
  d.node({
    id: n.id,
    x,
    y,
    width,
    height,
    title: n.label,
    subtitle: n.subtitle,
    kind: "existing",
    fontSize: 18,
    subtitleSize: 12,
  });
}
for (const f of flows) {
  const a = positions[f.from],
    b = positions[f.to],
    same = a[1] === b[1];
  let points;
  if (same) {
    const right = b[0] > a[0];
    points = right
      ? [
          [a[0] + w, a[1] + h / 2],
          [b[0], b[1] + h / 2],
        ]
      : [
          [a[0], a[1] + h / 2],
          [b[0] + w, b[1] + h / 2],
        ];
  } else
    points = [
      [a[0] + w / 2, a[1] + h],
      [b[0] + w / 2, b[1]],
    ];
  d.arrow({ startId: f.from, endId: f.to, points, strokeColor: COLORS.added });
  if (!same)
    d.text({
      x: a[0] > 1000 ? a[0] - 70 : a[0] + w / 2 + 22,
      y: a[1] + h + 32,
      width: a[0] > 1000 ? 200 : 330,
      height: 40,
      value: f.label,
      fontSize: 12,
      color: COLORS.added,
      textAlign: a[0] > 1000 ? "right" : "left",
    });
}
d.text({
  x: 47,
  y: 935,
  width: 1380,
  height: 50,
  value:
    "Control rules: insufficient capacity stays queued; SLA is evaluated each window; stop / failure enters finalization.\nData rule: integer request totals and merged histogram buckets feed reports; terminal states return reserved capacity.",
  fontSize: 15,
  color: COLORS.ink,
});
d.text({
  x: 47,
  y: 1020,
  width: 1380,
  height: 60,
  value:
    "Blue solid nodes = implemented steps. Green arrows = ordered internal transitions (not transport or network boundaries).\nDefault execution uses managed simulation. Real Kubernetes / SSH / JVM integration remains an external-provider extension.",
  fontSize: 14,
  color: COLORS.muted,
});
write("business-flow", d, workflow, { width: 1480, height: 1110 });

function write(name, d, model, canvas) {
  d.write({
    excalidrawPath: path.join(out, name + ".excalidraw"),
    svgPath: path.join(out, name + ".svg"),
  });
  fs.writeFileSync(
    path.join(out, name + "-model.json"),
    JSON.stringify(model, null, 2) + "\n",
  );
  const contract = {
    canvas,
    requiredLabels: model.nodes.map((n) => n.label),
    styleRules: model.nodes.map((n) => ({
      label: n.label,
      strokeColor: COLORS.existing,
      strokeStyle: "solid",
    })),
    requiredRelations: model.flows.map((f) => ({
      from: model.nodes.find((n) => n.id === f.from).label,
      to: model.nodes.find((n) => n.id === f.to).label,
    })),
    overlapSets: [model.nodes.map((n) => n.label)],
    requireBoundArrows: model.flows.length > 0,
  };
  fs.writeFileSync(
    path.join(out, name + "-contract.json"),
    JSON.stringify(contract, null, 2) + "\n",
  );
  console.log("Generated " + name);
}
