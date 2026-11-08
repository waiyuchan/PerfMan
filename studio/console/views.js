import { S, items, find, projectItems, canEdit, canOperate } from "./state.js";
import { t, language, stateLabel } from "./locales.js";
import {
  esc,
  icon,
  button,
  badge,
  fmt,
  date,
  relative,
  avatar,
  heading,
  tabs,
  empty,
  table,
  cell,
  field,
  select,
  area,
  checked,
  protocolIcon,
  chart,
  sparkline,
  active,
} from "./ui.js";
const idattr = (id) => `data-id="${esc(id)}"`;
const kindattr = (kind, id) => `data-kind="${kind}" ${idattr(id)}`;
export const viewLabels = () => ({
  terminal: t("Terminal", "终端"),
  diagnostics: t("Diagnostics", "错误诊断"),
  overview: t("Overview", "工作台"),
  projects: t("Projects", "项目管理"),
  scenarios: t("Test scenarios", "测试场景"),
  runs: t("Test runs", "运行记录"),
  reports: t("Reports", "报告分析"),
  resources: t("Resources", "资源与调度"),
  configuration: t("Configuration", "配置管理"),
  recordings: t("Traffic recording", "流量录制"),
  schedules: t("Schedules", "定时压测"),
  alerts: t("Alerts", "告警管理"),
  settings: t("Settings", "系统管理"),
});
const unitText = (model, value) =>
  `${fmt(value)} ${model === "rps" ? "req/s" : "VU"}`;
function stat(label, value, unit, sub, points = [], trend = "") {
  return `<div class="summary-item"><span>${label}</span><strong>${value}<small>${unit}</small></strong><div class="sub">${trend ? `<span class="trend">${trend}</span>` : ""}${sub}${points.length ? sparkline(points) : ""}</div></div>`;
}
export function runStats(run) {
  const m = run?.metrics || {};
  return `<div class="summary-strip">${stat(
    t("Requests per second", "每秒请求"),
    fmt(m.rps, 1),
    "req/s",
    t("Average throughput", "平均吞吐"),
    (run?.points || []).map((x) => x.rps),
  )}${stat(
    t("P95 response time", "P95 响应时间"),
    fmt(m.p95),
    "ms",
    t("95th percentile latency", "95 分位响应时延"),
    (run?.points || []).map((x) => x.p95),
  )}${stat(t("Request errors", "请求错误"), fmt(m.errorRate, 2), "%", `${fmt(m.errors)} ${t("failed requests", "次请求失败")}`)}${stat(t("Total requests", "请求总数"), fmt(m.requests), "", `${fmt(m.iterations)} ${t("iterations", "次迭代")}`)}</div>`;
}
function runRows(runs, limit = Infinity) {
  return runs
    .slice(0, limit)
    .map(
      (r) =>
        `<tr data-search="${esc((r.name + " " + r.id).toLowerCase())}"><td>${button("run", cell(esc(r.name), r.id, "scenarios"), "ghost name-button", idattr(r.id))}</td><td>${badge(r.status)}</td><td>${badge(r.verdict)}</td><td>${fmt(r.metrics?.rps, 1)} <small class="muted">req/s</small></td><td>${fmt(r.metrics?.p95)} <small class="muted">ms</small></td><td>${relative(r.createdAt)}</td><td><div class="row-actions">${button("run", icon("arrow"), "ghost small", idattr(r.id) + ` aria-label="${t("Open run", "查看运行")}"`)}</div></td></tr>`,
    );
}
export function overview() {
  const rs = projectItems("runs")
    .filter(
      (r) =>
        (Date.now() - Date.parse(r.createdAt)) / 86400000 <= S.overviewDays,
    )
    .slice()
    .reverse();
  const latest = rs.find(active) || rs.find((r) => r.kind === "load") || rs[0];
  const complete = rs.filter((r) => r.verdict === "passed").length,
    failed = rs.filter((r) => r.verdict === "failed").length;
  const nodes = items("resources"),
    running = projectItems("runs").filter(active);
  return (
    heading(
      t("Performance overview", "性能概览"),
      t(
        "A clear view of your tests, performance and infrastructure.",
        "统一查看测试表现、运行状态与资源。",
      ),
      select("", "overviewDays", String(S.overviewDays), [
        ["1", t("Last 24 hours", "最近 24 小时")],
        ["7", t("Last 7 days", "最近 7 天")],
        ["30", t("Last 30 days", "最近 30 天")],
      ]) +
        button(
          "new-scenario",
          icon("plus") + t("Create test", "创建测试"),
          "primary",
        ),
    ) +
    `<div class="summary-strip">${stat(
      t("Test runs", "测试运行"),
      fmt(rs.length),
      "",
      t("Across your project", "当前项目"),
      rs.slice(0, 10).map((r) => r.metrics?.requests || 0),
    )}${stat(t("Success rate", "性能通过率"), fmt(rs.length ? (complete / rs.length) * 100 : 0, 1), "%", `${complete} ${t("passed", "次通过")}`, [], complete ? t("Healthy", "正常") : "")}${stat(t("Active tests", "执行中的测试"), fmt(running.length), "", `${rs.filter((r) => r.status === "queued").length} ${t("in queue", "个排队中")}`)}${stat(t("Available capacity", "可用并发容量"), fmt(nodes.reduce((n, r) => n + (r.status === "ready" ? r.capacity - r.allocated : 0), 0)), "VU", `${nodes.filter((r) => r.status === "ready").length} ${t("workers ready", "个节点就绪")}`)}</div>
<div class="overview-grid"><section class="panel"><div class="panel-title"><div><h2>${t("Request throughput", "请求吞吐量")}</h2><p>${esc(latest?.name || t("No recent runs", "暂无运行"))}</p></div><div class="chart-controls"><span><i></i>${t("Requests / sec", "请求 / 秒")}</span>${latest ? badge(latest.status) : ""}</div></div><div class="chart-pad">${chart(latest?.points || [])}</div><div class="chart-footer"><span>${latest ? date(latest.startedAt) : "—"}</span>${button("run", t("View run details", "查看运行详情"), "ghost small", idattr(latest?.id || ""))}</div></section><section class="panel"><div class="panel-title"><h2>${t("Workspace health", "工作空间状态")}</h2>${icon("activity")}</div><div class="health-list">${[
      [
        "resources",
        t("Load generators", "施压节点"),
        `${nodes.filter((n) => n.status === "ready").length} / ${nodes.length} ${t("ready", "就绪")}`,
        "ready",
      ],
      [
        "runs",
        t("Release quality", "发布质量"),
        `${failed} ${t("tests need attention", "次测试需要关注")}`,
        failed ? "warning" : "ready",
      ],
      [
        "alerts",
        t("Active alerts", "待处理告警"),
        `${projectItems("alerts").filter((a) => a.status === "open").length} ${t("open notifications", "条待处理")}`,
        "ready",
      ],
    ]
      .map(
        ([v, label, sub, status]) =>
          `<a href="#${v}" class="health-row"><i class="health-dot ${status === "warning" ? "warn" : ""}"></i><div><strong>${label}</strong><small>${sub}</small></div>${icon("arrow")}</a>`,
      )
      .join(
        "",
      )}</div><div class="panel-body"><div class="capacity-label"><span>${t("Resource utilisation", "资源分配率")}</span><span>${fmt(
      (nodes.reduce((n, r) => n + r.allocated, 0) /
        Math.max(
          1,
          nodes.reduce((n, r) => n + r.capacity, 0),
        )) *
        100,
      1,
    )}%</span></div><div class="bar"><span style="width:${
      (nodes.reduce((n, r) => n + r.allocated, 0) /
        Math.max(
          1,
          nodes.reduce((n, r) => n + r.capacity, 0),
        )) *
      100
    }%"></span></div></div></section></div>
<section class="panel"><div class="panel-title"><h2>${t("Recent test runs", "最近运行")}</h2><a href="#runs" class="text-link">${t("View all runs", "查看全部运行")}</a></div>${rs.length ? table([t("Test scenario", "测试场景"), t("Status", "状态"), t("Quality", "性能判定"), t("Throughput", "吞吐量"), "P95", t("Started", "开始时间"), ""], runRows(rs, 6)) : empty(t("Your first test starts here", "开始首次测试"), t("Create a scenario and run it against your resource group.", "创建场景并选择资源组执行。"), button("new-scenario", t("Create test", "创建测试"), "primary"))}</section>`
  );
}
export function scenarioList() {
  const scenes = projectItems("scenarios");
  const filtered = scenes.filter(
    (s) => !S.filters.mode || s.mode === S.filters.mode,
  );
  const models = {
    ramp: t("Ramping", "阶梯"),
    rps: "RPS",
    spike: t("Spike", "突增"),
    constant: t("Constant", "恒定"),
  };
  const rows = filtered.map((s) => {
    const last = items("runs")
      .filter((r) => r.scenarioId === s.id)
      .at(-1);
    return `<tr data-search="${esc((s.name + " " + s.protocol).toLowerCase())}">
      <td>${button("edit-scene", cell(esc(s.name), `${s.mode === "jmeter" ? "JMeter" : s.mode === "script" ? t("Script", "脚本") : t("Simple", "简单")} · v${s.version}`, "scenarios"), "ghost name-button", idattr(s.id))}</td>
      <td>${protocolIcon(s.protocol)}</td>
      <td><strong>${unitText(s.loadModel, s.loadModel === "rps" ? s.rps : s.vus)}</strong><div class="sub">${s.duration}s · ${models[s.loadModel] || esc(s.loadModel)}</div></td>
      <td>${esc(find("environments", s.environmentId)?.name || "—")}</td>
      <td>${last ? badge(last.status) : '<span class="muted">—</span>'}</td>
      <td><div class="row-actions">${button("debug", t("Debug", "调试"), "small ghost", idattr(s.id))}${button("start", icon("play") + t("Run", "运行"), "small", idattr(s.id))}${button("scene-menu", icon("more"), "ghost small", idattr(s.id) + ` aria-label="${t("Scenario actions", "场景操作")}"`)}</div></td>
    </tr>`;
  });
  return (
    heading(
      t("Test scenarios", "测试场景"),
      t(
        "Build realistic user journeys and validate every release.",
        "编排真实业务链路，验证每次发布。",
      ),
      button("import-scene", icon("download") + t("Import", "导入")) +
        button(
          "new-scenario",
          icon("plus") + t("Create scenario", "创建场景"),
          "primary",
        ),
    ) +
    `<div class="toolbar"><div class="toolbar-group"><div class="search-input">${icon("search")}<input id="list-search" type="search" placeholder="${t("Search scenarios…", "搜索场景…")}" aria-label="${t("Search scenarios", "搜索场景")}"></div>${select(
      "",
      "scenario-mode-filter",
      S.filters.mode || "",
      [
        ["", t("All modes", "所有模式")],
        ["simple", t("Simple", "简单模式")],
        ["script", t("Script", "脚本模式")],
        ["jmeter", "JMeter"],
      ],
    )}</div><span class="muted" style="font-size:10px">${filtered.length} ${t("scenarios", "个场景")}</span></div>
    <section class="panel">${rows.length ? table([t("Scenario", "场景"), t("Protocol", "协议"), t("Load profile", "负载模型"), t("Environment", "环境"), t("Last run", "最近运行"), t("Actions", "操作")], rows) : empty(t("No matching scenarios", "没有匹配的场景"), t("Create a scenario or choose another mode.", "创建一个场景，或选择其他模式。"))}</section>`
  );
}
export function runsView() {
  const rs = projectItems("runs").slice().reverse();
  return (
    heading(
      t("Test runs", "运行记录"),
      t(
        "Track execution, investigate failures and revisit results.",
        "跟踪任务执行，定位失败，回看测试结果。",
      ),
      button(
        "new-scenario",
        icon("plus") + t("New test", "新建测试"),
        "primary",
      ),
    ) +
    `<div class="toolbar"><div class="search-input">${icon("search")}<input id="list-search" placeholder="${t("Search runs…", "搜索运行…")}" aria-label="${t("Search runs", "搜索运行")}"></div><span class="muted" style="font-size:11px">${rs.filter(active).length} ${t("active", "个执行中")}</span></div><section class="panel">${rs.length ? table([t("Test scenario", "测试场景"), t("Status", "状态"), t("Quality", "性能判定"), t("Throughput", "吞吐量"), "P95", t("Started", "开始时间"), ""], runRows(rs)) : empty(t("No runs yet", "暂无运行"), t("Run a scenario to start collecting results.", "运行一个场景，开始收集结果。"))}</section>`
  );
}
export function runView() {
  const r = find("runs", S.id);
  if (!r) return empty(t("Run not found", "运行不存在"), "");
  const s = r.snapshot;
  const tab = S.sub || "overview";
  const runTabs = [
    ["overview", t("Overview", "概览")],
    ["services", t("Services", "服务明细")],
    ["checks", t("Checks", "检查点")],
    ["scripts", t("Snapshot", "脚本快照")],
    ["analysis", t("Analysis", "多维分析")],
    ["workers", t("Workers", "施压机")],
    ["samples", t("Samples", "请求采样")],
    ["logs", t("Logs", "日志")],
  ];
  let html =
    heading(
      esc(r.name),
      `${r.id} · v${s.version} · ${esc(r.actor)} · ${date(r.createdAt)}`,
      button(
        "export-run",
        icon("download") + t("Export", "导出"),
        "",
        idattr(r.id),
      ) +
        (active(r)
          ? button(
              "stop-run",
              icon("stop") + t("Stop run", "停止运行"),
              "danger",
              idattr(r.id),
            )
          : button(
              "start",
              icon("play") + t("Run again", "再次运行"),
              "primary",
              idattr(s.id),
            )),
    ) +
    `<div class="run-title-row" style="margin-bottom:20px">${badge(r.status)}${badge(r.verdict)}<span class="muted" style="font-size:10px">${protocolIcon(s.protocol)} &nbsp; ${unitText(s.loadModel, s.loadModel === "rps" ? r.targetRps : s.vus)} &nbsp; ${fmt(r.elapsed, 1)} / ${s.duration}s &nbsp; ${(r.shards || []).length} ${t("workers", "个节点")}</span>${r.baseline ? `<span class="tag">${t("Baseline", "性能基线")}</span>` : ""}</div><div class="run-progress"><span style="width:${Math.min(100, (r.elapsed / s.duration) * 100)}%"></span></div>` +
    tabs(runTabs, tab, "run-tab");
  if (tab === "overview")
    html +=
      runStats(r) +
      `<div class="overview-grid"><section class="panel"><div class="panel-title"><h2>${t("Throughput over time", "吞吐量趋势")}</h2><div class="chart-controls"><span><i></i>req/s</span>${active(r) && s.loadModel === "rps" ? button("change-load", t("Adjust load", "调整压力"), "small", idattr(r.id)) : ""}</div></div><div class="chart-pad">${chart(r.points || [])}</div></section><section class="panel"><div class="panel-title"><h2>${t("Run context", "运行信息")}</h2></div><div class="panel-body"><dl class="detail-grid">${[
        [t("Resource group", "资源组"), find("groups", s.groupId)?.name],
        [t("Environment", "环境"), find("environments", s.environmentId)?.name],
        [
          t("Engine", "执行引擎"),
          s.mode === "jmeter"
            ? "JMeter"
            : s.mode === "script"
              ? "JavaScript"
              : "HTTP",
        ],
        [
          t("Traffic source", "数据来源"),
          r.source === "measured"
            ? t("Measured", "实测")
            : t("Simulated", "模拟"),
        ],
        [t("Load revision", "负载版本"), r.loadRevision || 1],
        [t("Duration", "时长"), `${s.duration}s`],
      ]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || "—")}</dd></div>`)
        .join(
          "",
        )}</dl></div></section></div><div class="two-columns"><section class="panel"><div class="panel-title"><h2>${t("Execution events", "执行事件")}</h2></div><div class="panel-body">${(r.events || []).map((e) => `<div class="event-line ${e.level}"><i></i><div><time>${date(e.at)}</time>${esc(e.message)}</div></div>`).join("")}</div></section><section class="panel" style="margin-top:0"><div class="panel-title"><h2>${t("Performance targets", "性能目标")}</h2></div>${table(
        [t("Metric", "指标"), t("Threshold", "阈值"), t("Action", "动作")],
        (s.sla || []).map(
          (rule) =>
            `<tr><td>${esc(rule.metric)}</td><td>${rule.operator === "lt" ? "<" : ">"} ${fmt(rule.threshold)}</td><td>${rule.stop ? t("Stop run", "停止运行") : t("Notify", "通知")}</td></tr>`,
        ),
      )}<div class="panel-body">${button("baseline", icon("check") + t(r.baseline ? "Baseline selected" : "Set as baseline", r.baseline ? "已设为基线" : "设为性能基线"), "small", idattr(r.id))}</div></section></div>`;
  if (tab === "services")
    html += `<section class="panel">${table(
      [
        t("Service / request", "服务 / 请求"),
        t("Protocol", "协议"),
        t("Requests", "请求数"),
        t("Errors", "错误数"),
        t("Mean", "平均时延"),
        "P95",
      ],
      (r.endpoints || []).map(
        (e) =>
          `<tr><td>${esc(e.name)}</td><td>${protocolIcon(e.protocol)}</td><td>${fmt(e.requests)}</td><td>${fmt(e.errors)}</td><td>${fmt(e.mean, 1)} ms</td><td>${fmt(e.p95)} ms</td></tr>`,
      ),
    )}</section>`;
  if (tab === "checks")
    html += `<div class="summary-strip">${stat(t("Checks evaluated", "检查点执行数"), fmt(r.metrics.checks), "", t("Business assertions", "业务断言"))}${stat(t("Failed checks", "失败检查点"), fmt(r.metrics.checkFailures), "", t("Independent from HTTP errors", "独立于 HTTP 错误"))}${stat(t("Check pass rate", "检查点通过率"), fmt(100 - (r.metrics.checkFailureRate || 0), 2), "%", t("Across all assertions", "所有断言汇总"))}${stat(t("Request error rate", "请求错误率"), fmt(r.metrics.errorRate, 2), "%", t("Transport and status failures", "请求与状态错误"))}</div><section class="panel">${table(
      [
        t("Check name", "检查点名称"),
        t("Evaluations", "执行次数"),
        t("Failed", "失败次数"),
        t("Pass rate", "通过率"),
      ],
      (r.checks || []).map(
        (c) =>
          `<tr><td>${esc(c.name)}</td><td>${fmt(c.total)}</td><td>${fmt(c.failed)}</td><td>${fmt(c.passRate, 2)}%</td></tr>`,
      ),
    )}</section>`;
  if (tab === "scripts")
    html += `<section class="panel"><div class="panel-title"><h2>${t("Frozen scenario version", "冻结的场景版本")} ${s.version}</h2>${button("download-snapshot", icon("download") + t("Download", "下载"), "small", idattr(r.id))}</div><div class="panel-body">${s.mode === "script" ? (s.scripts || []).map((file) => `<h3>${esc(file.name)} <span class="muted">${file.weight}%</span></h3><pre class="request-payload">${esc(file.content)}</pre>`).join("") : `<pre class="request-payload" style="max-height:650px">${esc(JSON.stringify(s, null, 2))}</pre>`}</div></section>`;
  if (tab === "analysis")
    html += `<div class="toolbar"><div class="toolbar-group">${select(
      "",
      "analysis-dimension",
      S.analysisDimension,
      [
        ["overall", t("All traffic", "全部流量")],
        ["regions", t("Region", "地域")],
        ["scripts", t("Script", "脚本")],
        ["services", t("Service", "服务")],
      ],
    )}${
      S.analysisDimension !== "overall"
        ? select(
            "",
            "analysis-value",
            S.analysisValue,
            Object.keys(r.series?.[S.analysisDimension] || {}).map((k) => [
              k,
              k,
            ]),
          )
        : ""
    }</div>${button("add-chart", icon("plus") + t("Add metric", "添加指标"), "small")}</div><div class="two-columns">${S.charts.map((key, i) => `<section class="panel" style="margin-top:0"><div class="panel-title"><h2>${esc(key)}</h2><div class="chart-menu">${select("", "chart-metric-" + i, key, ["rps", "p95", "mean", "errorRate", "checkFailureRate", "vus", "cpu", "memory", "bytesIn", "bytesOut"])}${button("remove-chart", icon("close"), "ghost small", `data-index="${i}" aria-label="${t("Remove chart", "移除图表")}"`)}</div></div><div class="chart-pad">${chart(S.analysisDimension === "overall" ? r.points || [] : r.series?.[S.analysisDimension]?.[S.analysisValue] || Object.values(r.series?.[S.analysisDimension] || {})[0] || [], { metric: key, color: i % 2 ? "#4eaa91" : "#8a79cc" })}</div></section>`).join("")}</div>`;
  if (tab === "workers")
    html += `<section class="panel">${table(
      [
        t("Worker", "节点"),
        t("Region", "地域"),
        t("Shard", "分片"),
        t("Allocation", "分配"),
        t("Requests", "请求数"),
        t("Status", "状态"),
        "",
      ],
      (r.shards || []).map(
        (sh) =>
          `<tr><td>${cell(esc(sh.workerName), sh.workerId, "resources")}</td><td>${esc(sh.region)}</td><td>${esc(sh.id)}<div class="sub">epoch ${sh.epoch}</div></td><td>${fmt(sh.target)} VU</td><td>${fmt(sh.requests)}</td><td>${badge(sh.status)}</td><td><div class="row-actions">${button("detail", t("Pod details", "Pod 详情"), "small ghost", kindattr("pods", sh.podId))}${button("open-terminal", icon("terminal"), "small ghost", idattr(sh.podId) + ` aria-label="${t("Open terminal", "打开终端")}"`)}</div></td></tr>`,
      ),
    )}</section>`;
  if (tab === "samples")
    html += `<div class="toolbar"><div class="search-input">${icon("search")}<input id="list-search" placeholder="${t("Filter samples…", "筛选采样…")}"></div></div><section class="panel">${table(
      [
        t("Request", "请求"),
        t("Protocol", "协议"),
        t("Status", "状态"),
        t("Duration", "时延"),
        t("Checks", "检查点"),
        "",
      ],
      (r.samples || []).map(
        (sample, i) =>
          `<tr data-search="${esc((sample.name + " " + sample.status + " " + sample.error).toLowerCase())}"><td>${esc(sample.name)}</td><td>${protocolIcon(sample.protocol)}</td><td>${sample.status}</td><td>${fmt(sample.duration, 2)} ms</td><td>${(sample.checks || []).filter((c) => c.passed).length} / ${(sample.checks || []).length}</td><td>${button("sample-detail", t("Inspect", "查看"), "small ghost", `data-index="${i}"`)}</td></tr>`,
      ),
    )}</section>`;
  if (tab === "logs")
    html += `<section class="panel"><div class="log-toolbar">${select(
      "",
      "log-level",
      S.filters.logLevel || "",
      [
        ["", t("All levels", "所有级别")],
        ["info", "Info"],
        ["warning", "Warning"],
        ["error", "Error"],
      ],
    )}${select("", "log-source", S.filters.logSource || "", [
      ["", t("All sources", "所有来源")],
      ["engine", t("Engine", "引擎")],
      ["script", t("User output", "用户输出")],
      ["checks", t("Checks", "检查点")],
      ["jmeter", "JMeter"],
    ])}</div><div class="log-output">${
      (r.logs || [])
        .filter(
          (l) =>
            (!S.filters.logLevel || l.level === S.filters.logLevel) &&
            (!S.filters.logSource || l.source === S.filters.logSource),
        )
        .map(
          (l) =>
            `<div class="log-line ${l.level}"><span class="muted">${date(l.at)}</span><span class="level">${esc(l.level)}</span><span>${esc(l.message)}</span></div>`,
        )
        .join("") || t("Waiting for log output…", "等待日志输出…")
    }</div></section>`;
  return html;
}
export function resourceView() {
  const tab = S.id || "groups";
  const nodes = items("resources").filter(
    (n) => !S.filters.group || n.groupId === S.filters.group,
  );
  const groups = items("groups");
  let html =
    heading(
      t("Resources", "资源与调度"),
      t(
        "Orchestrate load across your infrastructure.",
        "统一管理节点容量与跨地域调度。",
      ),
      button(
        "entity-new",
        icon("plus") +
          t(
            tab === "groups" ? "Create group" : "Add resource",
            tab === "groups" ? "创建资源组" : "添加节点",
          ),
        "primary",
        `data-kind="${tab === "groups" ? "groups" : "resources"}"`,
      ),
    ) +
    tabs(
      [
        ["groups", t("Resource groups", "资源组")],
        ["nodes", t("Workers", "节点")],
        ["clusters", t("Clusters", "集群")],
        ["pods", "Pods"],
        ["scheduling", t("Scheduling", "调度总览")],
        ["monitoring", t("Monitoring", "组监控")],
      ],
      tab,
      "resource-tab",
    );
  if (tab === "groups")
    html += `<div class="group-grid">${groups
      .map((g) => {
        const ns = items("resources").filter((n) => n.groupId === g.id),
          cap = ns.reduce((v, n) => v + n.capacity, 0),
          used = ns.reduce((v, n) => v + n.allocated, 0);
        return `<article class="group-card"><div class="group-card-head"><span class="group-icon">${icon("resources")}</span><div><strong>${esc(g.name)}</strong><small>${esc(g.description)}</small></div>${button("entity-edit", icon("more"), "ghost small", kindattr("groups", g.id))}</div><div class="group-capacity"><div class="capacity-label"><span>${t("Capacity allocated", "已分配容量")}</span><span>${fmt(used)} / ${fmt(cap)} VU</span></div><div class="bar"><span style="width:${(used / Math.max(1, cap)) * 100}%"></span></div></div><div class="group-stats"><div><strong>${ns.filter((n) => n.status === "ready").length}<span> / ${ns.length}</span></strong><span>${t("Workers", "节点")}</span></div><div><strong>${items("runs").filter((r) => active(r) && r.snapshot.groupId === g.id).length}</strong><span>${t("Active runs", "执行中")}</span></div><div><strong>${g.autoscale ? t("On", "开启") : t("Off", "关闭")}</strong><span>${t("Autoscaling", "弹性伸缩")}</span></div></div><div class="group-regions">${g.regions.map((region) => `<span><span class="region-dot">●</span>${esc(region.split("-").slice(0, 2).join("-"))}</span>`).join("")}</div><div style="padding:12px 20px;display:flex;justify-content:space-between">${button("group-workers", t("View workers", "查看节点"), "ghost small", idattr(g.id))}${button("group-monitor", icon("chart") + t("Monitor", "监控"), "ghost small", idattr(g.id))}</div></article>`;
      })
      .join(
        "",
      )}</div><section class="panel section-space"><div class="panel-title"><h2>${t("Worker activity", "节点动态")}</h2><span class="muted" style="font-size:10px">${items("resources").length} ${t("registered workers", "个已注册节点")}</span></div>${nodeTable(items("resources").slice(0, 6))}</section>`;
  if (tab === "nodes")
    html += `<div class="toolbar"><div class="toolbar-group"><div class="search-input">${icon("search")}<input id="list-search" placeholder="${t("Search workers…", "搜索节点…")}"></div>${select("", "group-filter", S.filters.group || "", [["", t("All resource groups", "所有资源组")], ...groups.map((g) => [g.id, g.name])])}</div></div><section class="panel">${nodeTable(nodes)}</section>`;
  if (tab === "clusters")
    html += `<section class="panel"><div class="panel-title"><h2>${t("Connected clusters", "已接入集群")}</h2>${button("entity-new", icon("plus") + t("Add cluster", "接入集群"), "small", 'data-kind="clusters"')}</div>${table(
      [
        t("Cluster", "集群"),
        t("Namespace", "命名空间"),
        t("Workers", "节点数"),
        t("Pods", "Pod 数"),
        t("Status", "状态"),
        "",
      ],
      items("clusters").map(
        (c) =>
          `<tr><td>${button("detail", cell(esc(c.name), c.endpoint, "environment"), "ghost name-button", kindattr("clusters", c.id))}</td><td>${esc(c.namespace)}</td><td>${items("resources").filter((n) => n.clusterId === c.id).length}</td><td>${items("pods").filter((p) => p.clusterId === c.id && p.status === "running").length}</td><td>${badge(c.status)}</td><td><div class="row-actions">${button("cluster-probe", t("Test connection", "测试连接"), "small", idattr(c.id))}${button("entity-edit", icon("edit"), "ghost small", kindattr("clusters", c.id))}</div></td></tr>`,
      ),
    )}</section>`;
  if (tab === "pods") {
    const pods = projectItems("pods").slice().reverse();
    html += `<section class="panel">${
      pods.length
        ? table(
            [
              t("Pod", "Pod"),
              t("Worker", "节点"),
              t("Region", "地域"),
              t("Status", "状态"),
              "CPU",
              t("Memory", "内存"),
              "",
            ],
            pods.map(
              (p) =>
                `<tr><td>${button("detail", cell(esc(p.name), p.namespace, "environment"), "ghost name-button", kindattr("pods", p.id))}</td><td>${esc(p.workerName)}</td><td>${esc(p.region)}</td><td>${badge(p.status)}</td><td>${fmt(p.cpu, 1)}%</td><td>${fmt(p.memory)} MiB</td><td><div class="row-actions">${button("run", icon("runs"), "ghost small", idattr(p.runId) + ` aria-label="${t("View run", "查看运行")}"`)}${button("open-terminal", icon("terminal"), "ghost small", idattr(p.id) + ` aria-label="${t("Open terminal", "打开终端")}"`)}</div></td></tr>`,
            ),
          )
        : empty(
            t("Pods appear when tests run", "运行测试时会创建 Pod"),
            t(
              "Start a scenario to allocate workers and containers.",
              "启动场景以分配节点与容器。",
            ),
          )
    }</section>`;
  }
  if (tab === "scheduling") {
    const rs = items("runs").filter(active);
    html += `<div class="summary-strip">${stat(t("Queued runs", "排队任务"), fmt(rs.filter((r) => r.status === "queued").length), "", t("Waiting for capacity", "等待容量"))}${stat(t("Running shards", "执行分片"), fmt(rs.flatMap((r) => r.shards || []).filter((s) => s.status === "running").length), "", t("Across all workers", "所有施压节点"))}${stat(t("Allocated capacity", "已分配并发"), fmt(items("resources").reduce((n, r) => n + r.allocated, 0)), "VU", t("Reserved by active runs", "活跃任务已预留"))}${stat(t("Healthy workers", "健康节点"), fmt(items("resources").filter((r) => r.status === "ready").length), "", t("Heartbeat received", "已收到心跳"))}</div>${
      rs.length
        ? rs
            .map(
              (r) =>
                `<section class="panel"><div class="panel-title"><div><h2>${esc(r.name)}</h2><p>${r.id}</p></div><div class="actions">${badge(r.status)}${button("run", t("Open run", "查看运行"), "small", idattr(r.id))}</div></div><div class="panel-body"><div class="status-timeline">${["queued", "provisioning", "running", "completed"].map((status, i) => `<span class="${["queued", "provisioning", "running", "completed"].indexOf(r.status) >= i ? "done" : ""}">${stateLabel(status)}</span>`).join("")}</div></div>${table(
                  [
                    t("Shard", "分片"),
                    t("Region", "地域"),
                    t("Worker", "节点"),
                    t("Budget", "预算"),
                    t("Lease", "租约"),
                    t("Status", "状态"),
                  ],
                  (r.shards || []).map(
                    (s) =>
                      `<tr><td>${esc(s.id)}</td><td>${esc(s.region)}</td><td>${esc(s.workerName)}</td><td>${fmt(s.target)} VU</td><td>epoch ${s.epoch}<div class="sub">${date(s.leaseExpiresAt)}</div></td><td>${badge(s.status)}</td></tr>`,
                  ),
                )}</section>`,
            )
            .join("")
        : `<section class="panel">${empty(t("The queue is clear", "当前没有等待任务"), t("New test runs are scheduled automatically across available workers.", "新任务会自动调度到可用节点。"), button("go-scenarios", t("Choose a scenario", "选择场景"), "primary"))}</section>`
    }`;
  }
  if (tab === "monitoring") {
    const allNodes = items("resources").filter(
      (n) => !S.filters.group || n.groupId === S.filters.group,
    );
    const r = items("runs")
      .filter((r) => !S.filters.group || r.snapshot.groupId === S.filters.group)
      .at(-1);
    html += `<div class="toolbar">${select("", "group-filter", S.filters.group || "", [["", t("All resource groups", "所有资源组")], ...groups.map((g) => [g.id, g.name])])}</div><div class="summary-strip">${stat(t("Average CPU", "平均 CPU"), fmt(allNodes.reduce((v, n) => v + n.cpu, 0) / Math.max(1, allNodes.length), 1), "%", t("Across selected workers", "当前节点均值"))}${stat(t("Memory utilisation", "内存利用率"), fmt(allNodes.reduce((v, n) => v + n.memory, 0) / Math.max(1, allNodes.length), 1), "%", t("Across selected workers", "当前节点均值"))}${stat(t("Available workers", "可用节点"), allNodes.filter((n) => n.status === "ready").length, "", `${allNodes.length} ${t("registered", "个已注册")}`)}${stat(t("Allocated VUs", "已分配 VU"), fmt(allNodes.reduce((v, n) => v + n.allocated, 0)), "", t("Reserved capacity", "已预留容量"))}</div><div class="two-columns">${[
      ["cpu", t("Worker CPU", "节点 CPU")],
      ["memory", t("Worker memory", "节点内存")],
    ]
      .map(
        ([metric, label]) =>
          `<section class="panel" style="margin-top:0"><div class="panel-title"><h2>${label}</h2><span class="source-caption">${t("Resource telemetry", "资源监控")}</span></div><div class="chart-pad">${chart(r?.points || [], { metric, color: metric === "cpu" ? "#9180cb" : "#5ca790" })}</div></section>`,
      )
      .join(
        "",
      )}</div><section class="panel section-space">${nodeTable(allNodes)}</section>`;
  }
  return html;
}
function nodeTable(nodes) {
  return table(
    [
      t("Worker", "节点"),
      t("Region", "地域"),
      t("Status", "状态"),
      t("Allocated", "已分配"),
      "CPU",
      t("Memory", "内存"),
      "",
    ],
    nodes.map(
      (n) =>
        `<tr data-search="${esc((n.name + " " + n.region + " " + n.address).toLowerCase())}"><td>${button("detail", cell(esc(n.name), n.address, "resources"), "ghost name-button", kindattr("resources", n.id))}</td><td>${esc(n.region)}</td><td>${badge(n.status)}</td><td>${fmt(n.allocated)} / ${fmt(n.capacity)} VU</td><td>${fmt(n.cpu, 1)}%</td><td>${fmt(n.memory, 1)}%</td><td><div class="row-actions">${button("resource-probe", icon("refresh"), "ghost small", idattr(n.id) + ` title="${t("Test connection", "测试连接")}"`)}${button("open-terminal", icon("terminal"), "ghost small", idattr(n.id) + ` title="${t("Open terminal", "打开终端")}"`)}${button("resource-menu", icon("more"), "ghost small", idattr(n.id) + ` aria-label="${t("Worker actions", "节点操作")}"`)}</div></td></tr>`,
    ),
  );
}
export function projectsView() {
  return (
    heading(
      t("Projects", "项目管理"),
      t(
        "Organise performance testing around your teams and services.",
        "按团队与服务组织性能测试。",
      ),
      button(
        "entity-new",
        icon("plus") + t("Create project", "创建项目"),
        "primary",
        'data-kind="projects"',
      ),
    ) +
    `<section class="panel">${table(
      [
        t("Project", "项目"),
        t("Scenarios", "场景"),
        t("Team", "团队"),
        t("Tags", "标签"),
        t("Created", "创建时间"),
        "",
      ],
      items("projects").map(
        (p) =>
          `<tr><td>${button("switch-project", cell(esc(p.name), esc(p.description), "projects"), "ghost name-button", idattr(p.id))}</td><td>${items("scenarios").filter((s) => s.projectId === p.id).length}</td><td>${
            items("users")
              .filter((u) => u.projects?.includes(p.id))
              .map((u) => avatar(u.name))
              .join("") || avatar(S.user.name)
          }</td><td>${(p.tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</td><td>${date(p.createdAt)}</td><td><div class="row-actions">${button("entity-edit", icon("edit"), "ghost small", kindattr("projects", p.id) + ` aria-label="${t("Edit project", "编辑项目")}"`)}${button("entity-delete", icon("trash"), "ghost small", kindattr("projects", p.id) + ` aria-label="${t("Delete project", "删除项目")}"`)}</div></td></tr>`,
      ),
    )}</section>`
  );
}
export function configurationView() {
  const tab = S.id || "files";
  const rows = projectItems(tab === "environments" ? "environments" : "files");
  return (
    heading(
      t("Configuration", "配置管理"),
      t(
        "Reusable files and environment variables for your scenarios.",
        "在场景间复用文件与环境变量。",
      ),
      button(
        "entity-new",
        icon("plus") +
          t(
            tab === "environments" ? "Create environment" : "Upload file",
            tab === "environments" ? "创建环境" : "上传文件",
          ),
        "primary",
        `data-kind="${tab === "environments" ? "environments" : "files"}"`,
      ),
    ) +
    tabs(
      [
        ["files", t("Files", "文件")],
        ["environments", t("Environments", "环境")],
      ],
      tab,
      "configuration-tab",
    ) +
    `<div class="toolbar"><div class="search-input">${icon("search")}<input id="list-search" placeholder="${t("Search configuration…", "搜索配置…")}"></div></div><section class="panel">${table(
      tab === "environments"
        ? [
            t("Environment", "环境"),
            t("Variables", "变量"),
            t("Scenarios", "关联场景"),
            t("Updated", "更新时间"),
            "",
          ]
        : [
            t("File", "文件"),
            t("Type", "类型"),
            t("Size", "大小"),
            t("References", "引用数"),
            t("Updated", "更新时间"),
            "",
          ],
      rows.map(
        (o) =>
          `<tr data-search="${esc(o.name.toLowerCase())}"><td>${button("detail", cell(esc(o.name), tab === "environments" ? esc(o.description) : `v${o.version}`, tab === "environments" ? "environment" : "files"), "ghost name-button", kindattr(tab === "environments" ? "environments" : "files", o.id))}</td>${tab === "environments" ? `<td>${(o.variables || []).length} <span class="muted">${t("variables", "个变量")}</span></td><td>${items("scenarios").filter((s) => s.environmentId === o.id).length}</td>` : `<td><span class="tag">${esc(o.type)}</span></td><td>${fmt(o.size || o.content?.length || 0)} B</td><td>${items("scenarios").filter((s) => s.fileIds?.includes(o.id)).length}</td>`}<td>${date(o.updatedAt)}</td><td><div class="row-actions">${tab === "files" ? button("download-file", icon("download"), "ghost small", idattr(o.id) + ` aria-label="${t("Download file", "下载文件")}"`) : ""}${button("entity-edit", icon("edit"), "ghost small", kindattr(tab === "environments" ? "environments" : "files", o.id) + ` aria-label="${t("Edit", "编辑")}"`)}${button("entity-delete", icon("trash"), "ghost small", kindattr(tab === "environments" ? "environments" : "files", o.id) + ` aria-label="${t("Delete", "删除")}"`)}</div></td></tr>`,
      ),
    )}${!rows.length ? empty(t("Nothing here yet", "暂无配置"), t("Create reusable configuration for this project.", "为此项目创建可复用配置。")) : ""}</section>`
  );
}
export function recordingsView() {
  const rows = projectItems("recordings");
  return (
    heading(
      t("Traffic recording", "流量录制"),
      t(
        "Turn captured traffic into repeatable performance tests.",
        "将采集流量转为可重复执行的性能场景。",
      ),
      button("import-har", icon("download") + t("Import HAR", "导入 HAR")) +
        button(
          "entity-new",
          icon("recordings") + t("New recording", "新建录制"),
          "primary",
          'data-kind="recordings"',
        ),
    ) +
    `<section class="panel">${table(
      [
        t("Recording", "录制会话"),
        t("Source", "来源"),
        t("Requests", "请求数"),
        t("Status", "状态"),
        t("Created", "创建时间"),
        "",
      ],
      rows.map(
        (r) =>
          `<tr><td>${button("detail", cell(esc(r.name), r.filter || "", "recordings"), "ghost name-button", kindattr("recordings", r.id))}</td><td>${esc(r.format || "Browser")}</td><td>${r.requests?.length || 0}</td><td>${badge(r.status || "pending")}</td><td>${date(r.createdAt)}</td><td><div class="row-actions">${r.requests?.length ? button("convert-recording", t("Create scenario", "生成场景"), "small", idattr(r.id)) : button("capture-recording", t("Start capture", "开始录制"), "small", idattr(r.id))}${button("entity-delete", icon("trash"), "ghost small", kindattr("recordings", r.id))}</div></td></tr>`,
      ),
    )}${!rows.length ? empty(t("Capture a user journey", "录制一条用户链路"), t("Create a recording or import a HAR file from your browser.", "创建录制会话或导入浏览器 HAR 文件。")) : ""}</section>`
  );
}
export function schedulesView() {
  const rows = projectItems("schedules");
  return (
    heading(
      t("Schedules", "定时压测"),
      t(
        "Run performance checks at the right time, automatically.",
        "按计划自动执行性能验证。",
      ),
      button(
        "entity-new",
        icon("plus") + t("Create schedule", "创建计划"),
        "primary",
        'data-kind="schedules"',
      ),
    ) +
    `<section class="panel">${table(
      [
        t("Schedule", "计划"),
        t("Scenario", "关联场景"),
        t("Frequency", "频率"),
        t("Next run", "下次执行"),
        t("Status", "状态"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td>${cell(esc(o.name), o.timezone, "schedules")}</td><td>${esc(find("scenarios", o.scenarioId)?.name || "—")}<div class="sub">v${o.snapshot?.version || 1}</div></td><td>${o.frequency === "once" ? t("One-time", "仅一次") : esc(o.cron)}</td><td>${date(o.nextAt)}</td><td>${badge(o.status)}</td><td><div class="row-actions">${button("schedule-run", icon("play"), "ghost small", idattr(o.id) + ` title="${t("Run now", "立即执行")}"`)}${button("schedule-toggle", o.status === "enabled" ? t("Pause", "暂停") : t("Resume", "恢复"), "ghost small", idattr(o.id))}${button("entity-edit", icon("edit"), "ghost small", kindattr("schedules", o.id))}${button("entity-delete", icon("trash"), "ghost small", kindattr("schedules", o.id))}</div></td></tr>`,
      ),
    )}${!rows.length ? empty(t("Keep performance checks on schedule", "让性能验证按计划执行"), t("Create a schedule from a versioned scenario.", "基于已保存的场景版本创建计划。"), button("entity-new", t("Create schedule", "创建计划"), "primary", 'data-kind="schedules"')) : ""}</section><section class="panel section-space"><div class="panel-title"><h2>${t("Execution history", "计划执行历史")}</h2></div>${table(
      [
        t("Schedule", "计划"),
        t("Started", "开始时间"),
        t("Status", "状态"),
        "",
      ],
      projectItems("occurrences")
        .slice()
        .reverse()
        .map(
          (o) =>
            `<tr><td>${esc(o.name)}</td><td>${date(o.createdAt)}</td><td>${badge(o.status)}</td><td>${o.runId ? button("run", t("View report", "查看报告"), "ghost small", idattr(o.runId)) : esc(o.error || "")}</td></tr>`,
        ),
    )}</section>`
  );
}
export function alertsView() {
  const tab = S.id || "history",
    kind =
      tab === "contacts"
        ? "contacts"
        : tab === "deliveries"
          ? "deliveries"
          : "alerts";
  const rows = projectItems(kind).slice().reverse();
  let html =
    heading(
      t("Alerts", "告警管理"),
      t(
        "Stay informed when performance needs your attention.",
        "及时发现并处理性能异常。",
      ),
      button(
        "entity-new",
        icon("plus") + t("Add contact group", "添加联系人组"),
        "primary",
        'data-kind="contacts"',
      ),
    ) +
    tabs(
      [
        ["history", t("Alert history", "告警历史")],
        ["contacts", t("Contact groups", "联系人组")],
        ["deliveries", t("Notification delivery", "通知投递")],
      ],
      tab,
      "alerts-tab",
    );
  if (kind === "alerts")
    html += `<section class="panel">${table(
      [
        t("Alert", "告警"),
        t("Observed", "触发值"),
        t("Action", "停止动作"),
        t("Status", "状态"),
        t("Triggered", "触发时间"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td>${cell(esc(o.name), o.runId, "alerts")}</td><td>${esc(o.metric)} ${fmt(o.value, 2)}<div class="sub">${t("Target", "阈值")} ${o.threshold}</div></td><td>${badge(o.stopStatus)}</td><td>${badge(o.status)}</td><td>${date(o.createdAt)}</td><td><div class="row-actions">${button("run", t("Report", "报告"), "ghost small", idattr(o.runId))}${o.status === "open" ? button("ack-alert", t("Acknowledge", "确认"), "small", idattr(o.id)) : ""}</div></td></tr>`,
      ),
    )}${!rows.length ? empty(t("All clear", "当前没有告警"), t("Alerts will appear when a performance target is triggered.", "性能目标触发后，告警将在这里显示。")) : ""}</section>`;
  else if (kind === "contacts")
    html += `<section class="panel">${table(
      [
        t("Contact group", "联系人组"),
        t("Channel", "渠道"),
        t("Recipient", "接收人"),
        t("Updated", "更新时间"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td>${cell(esc(o.name), esc(o.description), "alerts")}</td><td>${esc(o.channel)}</td><td>${esc(o.email || o.endpoint || "Workspace inbox")}</td><td>${date(o.updatedAt)}</td><td><div class="row-actions">${button("test-contact", t("Test", "测试"), "small", idattr(o.id))}${button("entity-edit", icon("edit"), "ghost small", kindattr(kind, o.id))}${button("entity-delete", icon("trash"), "ghost small", kindattr(kind, o.id))}</div></td></tr>`,
      ),
    )}</section>`;
  else
    html += `<section class="panel">${table(
      [
        t("Notification", "通知"),
        t("Recipient", "接收人"),
        t("Channel", "渠道"),
        t("Status", "状态"),
        t("Sent", "发送时间"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td>${button("detail", cell(esc(o.subject), `${o.attempts} ${t("attempts", "次尝试")}`, "alerts"), "ghost name-button", kindattr(kind, o.id))}</td><td>${esc(o.recipient)}</td><td>${esc(o.channel)}</td><td>${badge(o.status)}</td><td>${date(o.createdAt)}</td><td>${button("retry-delivery", t("Retry", "重试"), "small ghost", idattr(o.id))}</td></tr>`,
      ),
    )}</section>`;
  return html;
}
export function reportsView() {
  const rs = projectItems("runs")
    .filter((r) => !active(r) && r.kind === "load")
    .slice()
    .reverse();
  if (!rs.length)
    return (
      heading(t("Reports", "报告分析"), "") +
      empty(
        t("No reports yet", "暂无报告"),
        t("Complete a test to generate a report.", "完成一次测试后生成报告。"),
      )
    );
  if (!find("runs", S.compareA))
    S.compareA = rs.find((r) => r.baseline)?.id || rs[1]?.id || rs[0].id;
  if (!find("runs", S.compareB)) S.compareB = rs[0].id;
  const a = find("runs", S.compareA),
    b = find("runs", S.compareB);
  const opts = rs.map((r) => [r.id, `${r.name} · ${date(r.createdAt)}`]);
  const comparable =
    JSON.stringify([
      a.snapshot.steps,
      a.snapshot.vus,
      a.snapshot.loadModel,
      a.snapshot.environmentId,
      a.snapshot.profile,
    ]) ===
    JSON.stringify([
      b.snapshot.steps,
      b.snapshot.vus,
      b.snapshot.loadModel,
      b.snapshot.environmentId,
      b.snapshot.profile,
    ]);
  return (
    heading(
      t("Performance comparison", "性能对比"),
      t(
        "Compare outcomes and understand what changed.",
        "比较测试结果，了解性能变化。",
      ),
      button("print", icon("download") + t("Export report", "导出报告")),
    ) +
    `<div class="compare-grid">${select(t("Baseline run", "基线运行"), "compareA", S.compareA, opts)}${select(t("Comparison run", "对比运行"), "compareB", S.compareB, opts)}</div>${!comparable ? `<div class="notice-inline">${t("These runs use different configurations. Review their load profiles and environments before drawing a conclusion.", "这两次运行的配置不同，请结合负载模型与环境判断差异。")}</div>` : ""}<section class="panel">${table(
      [
        t("Metric", "指标"),
        t("Baseline", "基线"),
        t("Comparison", "本次"),
        t("Change", "变化"),
      ],
      [
        ["rps", t("Throughput", "吞吐量"), "req/s", true],
        ["p95", t("P95 latency", "P95 时延"), "ms", false],
        ["p99", t("P99 latency", "P99 时延"), "ms", false],
        ["errorRate", t("Request error rate", "请求错误率"), "%", false],
        [
          "checkFailureRate",
          t("Check failure rate", "检查点失败率"),
          "%",
          false,
        ],
        ["requests", t("Total requests", "请求数"), "", null],
      ].map(([key, label, unit, higher]) => {
        const av = a.metrics[key] || 0,
          bv = b.metrics[key] || 0,
          delta = av ? ((bv - av) / av) * 100 : null;
        return `<tr><td>${label}</td><td><strong>${fmt(av, 2)}</strong> ${unit}</td><td><strong>${fmt(bv, 2)}</strong> ${unit}</td><td class="difference ${(higher === true && bv < av) || (higher === false && bv > av) ? "negative" : ""}">${delta === null ? `${fmt(bv - av, 2)} ${unit}` : `${delta > 0 ? "+" : ""}${fmt(delta, 1)}%`}</td></tr>`;
      }),
    )}</section><div class="two-columns section-space">${[a, b].map((r, i) => `<section class="panel" style="margin-top:0"><div class="panel-title"><div><h2>${i ? t("Comparison", "对比运行") : t("Baseline", "基线运行")}</h2><p>${esc(r.name)}</p></div>${badge(r.verdict)}</div><div class="chart-pad">${chart(r.points || [])}</div><div class="chart-footer"><span>${date(r.startedAt)}</span>${button("run", t("Open report", "打开报告"), "ghost small", idattr(r.id))}</div></section>`).join("")}</div>`
  );
}
export function settingsView() {
  const tab = S.id || "users";
  const links = [
    ["users", t("People & access", "成员与权限")],
    ["policies", t("Policies", "访问策略")],
    ["tags", t("Tags", "标签")],
    ["integrations", t("Integrations", "集成")],
    ["audit", t("Audit log", "审计日志")],
  ];
  let html =
    heading(
      t("Workspace settings", "工作空间设置"),
      t(
        "Manage your team, access and connected services.",
        "管理团队、权限与服务集成。",
      ),
      tab === "audit"
        ? ""
        : button(
            "entity-new",
            icon("plus") +
              t(
                tab === "users"
                  ? "Invite member"
                  : tab === "tags"
                    ? "Create tag"
                    : tab === "policies"
                      ? "Create policy"
                      : "Add integration",
                tab === "users"
                  ? "添加成员"
                  : tab === "tags"
                    ? "创建标签"
                    : tab === "policies"
                      ? "创建策略"
                      : "添加集成",
              ),
            "primary",
            `data-kind="${tab}"`,
          ),
    ) + tabs(links, tab, "settings-tab");
  const rows = items(tab);
  if (tab === "users")
    html += `<section class="panel">${table(
      [
        t("Member", "成员"),
        t("Role", "角色"),
        t("Projects", "项目"),
        t("Status", "状态"),
        "",
      ],
      rows.map(
        (u) =>
          `<tr><td><div class="name-cell">${avatar(u.name)}<div><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></div></div></td><td><span class="tag">${esc(u.role)}</span></td><td>${u.role === "admin" ? t("All projects", "所有项目") : (u.projects || []).map((id) => esc(find("projects", id)?.name)).join(", ")}</td><td>${badge(u.status)}</td><td>${button("entity-edit", icon("edit"), "ghost small", kindattr("users", u.id) + ` aria-label="${t("Edit member", "编辑成员")}"`)}</td></tr>`,
      ),
    )}</section><section class="panel section-space"><div class="panel-title"><h2>${t("Role permissions", "角色权限")}</h2></div>${table(
      [t("Role", "角色"), t("Access", "权限")],
      [
        [
          "Administrator",
          t(
            "Manage workspace, projects, members and infrastructure.",
            "管理工作空间、项目、成员与基础设施。",
          ),
        ],
        [
          "Test engineer",
          t(
            "Edit scenarios and run tests in assigned projects.",
            "在授权项目中编辑场景与执行测试。",
          ),
        ],
        [
          "Resource operator",
          t(
            "Manage workers, Pods and terminal sessions.",
            "管理节点、Pod 与终端会话。",
          ),
        ],
        [
          "Observer",
          t(
            "Read results and configuration in assigned projects.",
            "只读授权项目的结果与配置。",
          ),
        ],
      ].map(([r, desc]) => `<tr><td>${r}</td><td>${desc}</td></tr>`),
    )}</section>`;
  if (tab === "policies")
    html += `<section class="panel">${table(
      [
        t("Policy", "策略"),
        t("Subject", "主体"),
        t("Action", "动作"),
        t("Effect", "效果"),
        t("Scope", "范围"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td>${esc(o.name)}</td><td>${esc(o.subject)}</td><td><span class="mono">${esc(o.action)}</span></td><td>${badge(o.effect === "allow" ? "passed" : "failed")}</td><td>${esc(o.tag || find("projects", o.projectId)?.name || t("All resources", "所有资源"))}</td><td>${button("entity-edit", icon("edit"), "ghost small", kindattr("policies", o.id))}${button("entity-delete", icon("trash"), "ghost small", kindattr("policies", o.id))}</td></tr>`,
      ),
    )}</section>`;
  if (tab === "tags")
    html += `<section class="panel">${table(
      [
        t("Tag", "标签"),
        t("Resources", "绑定资源"),
        t("Updated", "更新时间"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td><span class="tag">${esc(o.name)}</span></td><td>${["projects", "scenarios", "resources"].flatMap((k) => items(k)).filter((x) => (x.tags || []).includes(o.name)).length}</td><td>${date(o.updatedAt)}</td><td>${button("entity-delete", icon("trash"), "ghost small", kindattr("tags", o.id))}</td></tr>`,
      ),
    )}</section>`;
  if (tab === "integrations")
    html += `<section class="panel">${table(
      [
        t("Integration", "集成"),
        t("Type", "类型"),
        t("Status", "状态"),
        t("Last tested", "最近测试"),
        "",
      ],
      rows.map(
        (o) =>
          `<tr><td>${cell(esc(o.name), esc(o.endpoint), "environment")}</td><td>${esc(o.type)}</td><td>${badge(o.status)}</td><td>${date(o.lastTestAt)}</td><td><div class="row-actions">${button("test-integration", t("Test connection", "测试连接"), "small", idattr(o.id))}${button("entity-edit", icon("edit"), "ghost small", kindattr("integrations", o.id))}</div></td></tr>`,
      ),
    )}</section>`;
  if (tab === "audit")
    html += `<section class="panel">${table(
      [
        t("Actor", "操作者"),
        t("Action", "操作"),
        t("Target", "对象"),
        t("Time", "时间"),
      ],
      rows
        .slice()
        .reverse()
        .map(
          (o) =>
            `<tr><td>${esc(o.actor)}</td><td><span class="mono">${esc(o.action)}</span></td><td>${esc(o.target)}</td><td>${date(o.createdAt)}</td></tr>`,
        ),
    )}</section>`;
  return html;
}
