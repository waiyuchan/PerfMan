import { diagnosticsView } from "./diagnostics.js";
import { S, items, find, projectItems, canEdit, canOperate } from "./state.js";
import { t, language, setLanguage, errorMessage } from "./locales.js";
import {
  esc,
  icon,
  button,
  badge,
  fmt,
  date,
  avatar,
  heading,
  tabs,
  empty,
  table,
  field,
  select,
  area,
  chart,
  active,
} from "./ui.js";
import {
  viewLabels,
  overview,
  scenarioList,
  runsView,
  runView,
  resourceView,
  projectsView,
  configurationView,
  recordingsView,
  schedulesView,
  alertsView,
  reportsView,
  settingsView,
} from "./views.js";
import {
  draftScene,
  scenarioEditor,
  collectScene,
  entityForm,
  collectEntity,
  stepTemplate,
  clientScriptTemplate,
  protocolNames,
  regions,
} from "./editors.js";
const $ = (selector, root = document) => root.querySelector(selector);
let polling = false,
  newMode = "simple",
  changing = false;
const clone = (x) => structuredClone(x);
async function api(path, method = "GET", body) {
  const res = await fetch("/api/v1/" + path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error(
      t(
        "The service returned an unexpected response.",
        "服务返回异常，请重试。",
      ),
    );
  }
  if (!res.ok) {
    if (res.status === 401 && path !== "session") {
      S.user = null;
      login();
    }
    throw Error(errorMessage(data.code || data.error || "request_failed"));
  }
  return data;
}
async function refresh() {
  const data = await api("state");
  S.data = data.collections;
  S.user = data.user;
  S.workspace = data.workspace;
  if (S.user.dashboardMetrics?.length) S.charts = S.user.dashboardMetrics;
  if (!items("projects").some((p) => p.id === S.project) && S.project !== "all")
    S.project = items("projects")[0]?.id || "";
}
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 3800);
}
function go(view, id = "", sub = "") {
  closeOverlay();
  const hash = [view, id, sub].filter(Boolean).join("/");
  if (location.hash.slice(1) === hash) {
    readRoute();
    shell();
  } else location.hash = hash;
}
function closeOverlay() {
  $("#overlay").innerHTML = "";
}
function dialog(title, body, wide = false) {
  $("#overlay").innerHTML =
    `<div class="dialog-backdrop"><section class="dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2>${button("close-overlay", icon("close"), "ghost icon-btn", `aria-label="${t("Close", "关闭")}"`)}</header>${body}</section></div>`;
  $("#overlay input:not([type=hidden]), #overlay textarea")?.focus();
}
function drawer(title, body) {
  $("#overlay").innerHTML =
    `<div class="dialog-backdrop drawer-backdrop"><section class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${title}</h2>${button("close-overlay", icon("close"), "ghost icon-btn", `aria-label="${t("Close", "关闭")}"`)}</header><div class="drawer-body">${body}</div></section></div>`;
}
const brand = () =>
  `<svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="1" y="1" width="34" height="34" rx="9" fill="#74a993" fill-opacity=".2"/><path d="M7 20h7l3-10 5 17 3-10h5" stroke="#b6d7c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function login() {
  document.title = "Sign in · PerfMan";
  $("#app").innerHTML =
    `<div class="login-page"><aside class="login-aside"><div class="login-brand">${brand()}PerfMan</div><div class="login-statement"><h1>${t("Confidence in every release.", "让每次发布都有性能依据。")}</h1><p>${t("Bring your tests, infrastructure and performance insights into one workspace.", "在同一工作空间，连接性能测试、基础设施与分析结果。")}</p><svg class="login-plot" viewBox="0 0 470 160" aria-hidden="true"><path d="M0 140H470 M0 90H470 M0 40H470" stroke="#36515b"/><path d="M0 130L40 128 70 123 100 125 130 85 160 89 190 72 220 76 250 35 280 40 310 21 340 26 370 17 400 23 435 18 470 20" fill="none" stroke="#87b8a5" stroke-width="2"/><path d="M0 125L40 121 70 122 100 119 130 111 160 114 190 106 220 107 250 93 280 96 310 90 340 94 370 82 400 88 435 75 470 79" fill="none" stroke="#8d9eae" stroke-width="1.6"/></svg></div><span class="login-foot">${t("Performance engineering, connected.", "连接性能工程的每个环节。")}</span></aside><div class="login-form-wrap"><div class="login-language">${languageSelect()}</div><form id="login-form" class="login-form"><div class="login-workspace"><span class="workspace-mark">A</span>Acme Engineering</div><h2>${t("Welcome back", "欢迎回来")}</h2><p>${t("Sign in to your performance workspace.", "登录你的性能测试工作空间。")}</p>${field(t("Work email", "工作邮箱"), "email", "", "email", 'required autocomplete="username" placeholder="you@company.com"')}${field(t("Password", "密码"), "password", "", "password", 'required autocomplete="current-password"')}<div class="form-error" id="login-error"></div><button type="submit" class="btn primary">${t("Sign in", "登录")}${icon("arrow")}</button><div class="login-caption">${t("Your workspace. Your performance standards.", "你的工作空间，你的性能标准。")}</div></form></div></div>`;
}
function languageSelect() {
  return `<select class="language" id="language" aria-label="Language"><option value="en" ${language === "en" ? "selected" : ""}>English</option><option value="zh" ${language === "zh" ? "selected" : ""}>简体中文</option></select>`;
}
function shell() {
  if (!S.user) return login();
  const labels = viewLabels();
  const nav = (view, iconName, count) =>
    `<a href="#${view}" class="${S.view === view ? "active" : ""}">${icon(iconName || view)}<span>${labels[view]}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</a>`;
  const running = projectItems("runs").filter(active).length;
  document.title = (labels[S.view] || "PerfMan") + " · PerfMan";
  $("#app").innerHTML =
    `<aside class="sidebar"><a href="#overview" class="brand">${brand()}PerfMan</a><div class="workspace-select"><span class="workspace-mark">A</span><div><select id="project-select" aria-label="${t("Project", "项目")}">${items(
      "projects",
    )
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === S.project ? "selected" : ""}>${esc(p.name)}</option>`,
      )
      .join(
        "",
      )}<option value="all" ${S.project === "all" ? "selected" : ""}>${t("All projects", "所有项目")}</option></select><span style="font-size:9px;display:block;margin-top:5px;color:#7f969f">Acme Engineering</span></div></div><div class="sidebar-label">${t("Workspace", "工作空间")}</div><nav class="nav">${nav("overview")}${nav("scenarios", "scenarios")}${nav("runs", "runs", running)}${nav("reports", "reports")}${nav("resources", "resources")}</nav><div class="nav-sep"></div><div class="sidebar-label">${t("Manage", "管理")}</div><nav class="nav">${nav("projects", "projects")}${nav("configuration", "environment")}${nav("recordings", "recordings")}${nav("schedules", "schedules")}${nav("alerts", "alerts")}${nav("diagnostics", "shield")}${S.user.role === "admin" ? nav("settings", "settings") : ""}</nav><div class="user-box">${avatar(S.user.name)}<div><strong>${esc(S.user.name)}</strong><small>${esc(S.user.email)}</small></div>${button("logout", icon("logout"), "ghost icon-btn", `style="margin-left:auto;color:#829aa5" title="${t("Sign out", "退出登录")}"`)}</div></aside><header class="topbar">${button("menu", icon("menu"), "ghost mobile-menu", `aria-label="${t("Open navigation", "打开导航")}"`)}<div class="crumb">${icon("projects")}<span>${esc(find("projects", S.project)?.name || t("All projects", "所有项目"))}</span><span>/</span><strong>${labels[S.view] || t("Terminal", "终端")}</strong></div><div class="top-tools"><button class="top-search btn ghost" data-action="search">${icon("search")}<span>${t("Search workspace…", "搜索工作空间…")}</span><kbd>⌘ K</kbd></button>${languageSelect()}${button("notifications", icon("alerts") + (projectItems("alerts").some((a) => a.status === "open") ? "<b></b>" : ""), "ghost icon-btn notification-button", `aria-label="${t("Notifications", "通知")}"`)}${avatar(S.user.name)}</div></header><main id="main"></main>`;
  render();
}
function render() {
  if (!$("#main")) return;
  const runLink = $('.nav a[href="#runs"]');
  if (runLink) {
    runLink.querySelector(".nav-count")?.remove();
    const count = projectItems("runs").filter(active).length;
    if (count)
      runLink.insertAdjacentHTML(
        "beforeend",
        `<span class="nav-count">${count}</span>`,
      );
  }
  const views = {
    overview,
    projects: projectsView,
    scenarios: S.id ? scenarioEditor : scenarioList,
    runs: S.id ? runView : runsView,
    reports: reportsView,
    resources: resourceView,
    configuration: configurationView,
    recordings: recordingsView,
    schedules: schedulesView,
    alerts: alertsView,
    settings: settingsView,
    terminal: terminalView,
    diagnostics: diagnosticsView,
  };
  $("#main").innerHTML = (views[S.view] || overview)();
  if (!canOperate()) {
    for (const el of document.querySelectorAll("[data-action]")) {
      if (
        [
          "open-terminal",
          "resource-probe",
          "resource-menu",
          "resource-drain",
          "resource-enable",
          "resource-offline",
        ].includes(el.dataset.action) ||
        (["resources", "groups", "pods", "clusters"].includes(
          el.dataset.kind,
        ) &&
          ["entity-new", "entity-edit", "entity-delete"].includes(
            el.dataset.action,
          ))
      )
        el.disabled = true;
    }
  }
  if (!canEdit())
    for (const el of document.querySelectorAll("[data-action]"))
      if (
        [
          "new-scenario",
          "start",
          "debug",
          "entity-new",
          "entity-edit",
          "entity-delete",
          "save-scene",
          "save-run",
          "resource-probe",
        ].includes(el.dataset.action)
      )
        el.disabled = true;
}
function readRoute() {
  const [view = "overview", id = "", sub = ""] = location.hash
    .slice(1)
    .split("/");
  if (S.view === "scenarios" && S.id && !(view === "scenarios" && id === S.id))
    S.draft = null;
  S.view = view || "overview";
  S.id = id;
  S.sub = sub;
  if (S.view === "runs" && id) {
    const r = find("runs", id);
    if (r) S.project = r.projectId;
  }
  if (S.view === "scenarios" && id && id !== "new" && !S.draft) {
    const s = find("scenarios", id);
    if (s) {
      S.project = s.projectId;
      S.draft = clone(s);
    }
  }
}
function download(name, data, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function newScenarioModal() {
  newMode = "simple";
  dialog(
    t("Create a test scenario", "创建测试场景"),
    `<div class="dialog-body"><div class="mode-choices">${[
      [
        "simple",
        t("Simple", "简单模式"),
        t("Compose an API journey visually.", "以可视化方式编排 API 链路。"),
        "scenarios",
      ],
      [
        "script",
        t("Script", "脚本模式"),
        t("Full control with JavaScript.", "使用 JavaScript 自定义逻辑。"),
        "code",
      ],
      [
        "jmeter",
        "JMeter",
        t("Import your existing test plans.", "导入已有的测试计划。"),
        "files",
      ],
    ]
      .map(
        ([mode, title, desc, ico]) =>
          `<button type="button" class="mode-choice ${mode === "simple" ? "active" : ""}" data-action="choose-mode" data-mode="${mode}">${icon(ico)}<strong>${title}</strong><small>${desc}</small></button>`,
      )
      .join(
        "",
      )}</div><div class="dialog-footer">${button("close-overlay", t("Cancel", "取消"))}${button("create-draft", t("Continue", "继续") + icon("arrow"), "primary")}</div></div>`,
  );
}
async function start(id, kind = "load") {
  const run = await api("runs", "POST", {
    scenarioId: id,
    kind,
    idempotencyKey: crypto.randomUUID(),
  });
  await refresh();
  closeOverlay();
  go("runs", run.id);
  if (S.id === run.id) render();
  toast(
    t(
      kind === "debug" ? "Debug run started" : "Test run queued",
      kind === "debug" ? "调试已开始" : "测试已加入队列",
    ),
  );
}
function entityDialog(kind, id = "") {
  const o = id ? find(kind, id) : {};
  const labels = {
    projects: t("Project", "项目"),
    groups: t("Resource group", "资源组"),
    resources: t("Worker", "节点"),
    environments: t("Environment", "环境"),
    files: t("File", "文件"),
    schedules: t("Schedule", "计划"),
    recordings: t("Recording", "录制会话"),
    contacts: t("Contact group", "联系人组"),
    users: t("Member", "成员"),
    tags: t("Tag", "标签"),
    integrations: t("Integration", "集成"),
    policies: t("Policy", "访问策略"),
    clusters: t("Cluster", "集群"),
  };
  dialog(
    (id ? t("Edit ", "编辑") : t("New ", "新建")) + labels[kind],
    entityForm(kind, o),
    ["files", "environments"].includes(kind),
  );
}
function showDetail(kind, id) {
  const o = find(kind, id);
  if (!o) return;
  let body = `<div class="actions" style="margin-bottom:23px">${o.status ? badge(o.status) : ""}${canEdit() && !["pods", "deliveries", "runs"].includes(kind) ? button("entity-edit", icon("edit") + t("Edit", "编辑"), "small", `data-kind="${kind}" data-id="${id}"`) : ""}</div>`;
  const omit = [
    "id",
    "name",
    "content",
    "variables",
    "probe",
    "requests",
    "history",
    "snapshot",
    "hash",
    "projectId",
    "version",
    "createdAt",
    "updatedAt",
    "size",
    "columns",
  ];
  body += `<dl class="detail-grid">${Object.entries(o)
    .filter(
      ([k, v]) =>
        !omit.includes(k) && typeof v !== "object" && !k.startsWith("_"),
    )
    .map(
      ([k, v]) =>
        `<div><dt>${esc({ groupId: t("Resource group", "资源组"), resourceId: t("Worker", "节点"), provider: t("Provider", "提供方"), region: t("Region", "地域"), address: t("Address", "地址"), capacity: t("Capacity", "容量"), allocated: t("Allocated", "已分配"), heartbeatAt: t("Last heartbeat", "最近心跳"), description: t("Description", "说明") }[k] || k)}</dt><dd>${esc(k === "groupId" ? find("groups", v)?.name || v : String(v))}</dd></div>`,
    )
    .join("")}</dl>`;
  if (kind === "files") {
    body += `<div class="detail-section"><div class="actions"><h3>${t("File contents", "文件内容")}</h3>${button("download-file", icon("download") + t("Download", "下载"), "small", `data-id="${id}"`)}</div><pre class="request-payload">${esc(o.content)}</pre><p class="help">${t("Used by", "引用此文件的场景")} ${
      items("scenarios")
        .filter((s) => s.fileIds?.includes(id))
        .map((s) => s.name)
        .join(", ") || "—"
    }</p></div>`;
  }
  if (kind === "environments")
    body += `<div class="detail-section"><h3>${t("Environment variables", "环境变量")}</h3>${table(
      [t("Variable", "变量"), t("Value", "值"), t("Type", "类型")],
      (o.variables || []).map(
        (v) =>
          `<tr><td>${esc(v.name)}</td><td class="mono">${esc(v.value)}</td><td>${v.secret ? t("Encrypted", "加密") : t("Plain text", "明文")}</td></tr>`,
      ),
    )}</div>`;
  if (kind === "recordings")
    body += `<div class="detail-section"><div class="actions"><h3>${t("Captured requests", "已采集请求")}</h3>${button("convert-recording", t("Create scenario", "生成场景"), "small primary", `data-id="${id}"`)}</div>${table(
      [t("Request", "请求"), t("Method", "方法")],
      (o.requests || []).map(
        (r) =>
          `<tr><td>${esc(r.name)}<div class="sub">${esc(r.url)}</div></td><td>${esc(r.method)}</td></tr>`,
      ),
    )}</div>`;
  if (["resources", "pods"].includes(kind)) {
    body += `<div class="detail-section"><div class="actions">${button("open-terminal", icon("terminal") + t("Open terminal", "打开终端"), "primary", `data-id="${id}"`)}${kind === "resources" ? button("resource-probe", icon("refresh") + t("Test connection", "测试连接"), "", `data-id="${id}"`) : button("run", t("View test run", "查看任务"), "", `data-id="${o.runId}"`)}</div>${o.probe ? `<div class="section-space">${o.probe.map((p) => `<div class="event-line"><div>${esc(p.name)}</div><span style="margin-left:auto">${badge(p.status)}</span></div>`).join("")}</div>` : ""}</div>`;
  }
  if (kind === "deliveries")
    body += `<div class="detail-section"><h3>${esc(o.subject)}</h3><p style="color:#8c9ba3;line-height:1.9;font-size:12px">${esc(o.body)}</p></div>`;
  drawer(esc(o.name || o.subject), body);
}
function validationDrawer(result) {
  drawer(
    t(
      result.valid ? "Validation complete" : "Validation failed",
      result.valid ? "校验完成" : "校验失败",
    ),
    `<div class="actions">${badge(result.valid ? "passed" : "failed")}<span class="muted">${result.samples?.length || 0} ${t("requests", "个请求")} · ${result.checks?.length || 0} ${t("checks", "个检查点")}</span></div>${result.error ? `<p class="form-error">${esc(result.error)}</p>` : ""}<div class="detail-section"><h3>${t("Request results", "请求结果")}</h3>${table(
      [t("Request", "请求"), t("Status", "状态"), t("Duration", "时延")],
      (result.samples || []).map(
        (s) =>
          `<tr><td>${esc(s.name)}</td><td>${s.status}</td><td>${fmt(s.duration, 1)} ms</td></tr>`,
      ),
    )}</div><div class="detail-section"><h3>${t("Checks", "检查点")}</h3>${(result.checks || []).map((c) => `<div class="event-line"><span>${esc(c.name)}</span><span style="margin-left:auto">${badge(c.passed ? "passed" : "failed")}</span></div>`).join("")}</div><div class="detail-section"><h3>${t("Output", "输出")}</h3><div class="log-output">${(result.logs || []).map((l) => `[${esc(l.level)}] ${esc(l.message)}`).join("\n")}</div></div>`,
  );
}
function terminalView() {
  const session = find("terminals", S.id);
  if (!session)
    return empty(t("Terminal session not found", "终端会话不存在"), "");
  const resource =
    find("resources", session.resourceId) || find("pods", session.resourceId);
  return (
    heading(
      esc(resource?.name || session.name),
      t("Terminal session", "终端会话") + ` · ${esc(S.user.name)}`,
      badge(session.status) +
        button(
          "close-terminal",
          t("End session", "结束会话"),
          "",
          `data-id="${session.id}"`,
        ),
    ) +
    `<div class="terminal"><div class="terminal-head"><i></i>${esc(S.user.name.split(" ")[0].toLowerCase())}@${esc(resource?.name || "worker")}<span style="margin-left:auto">${esc(resource?.region || "")} &nbsp; /workspace</span></div><div class="terminal-output" id="terminal-output"><span class="muted">${t("Connected. Type help to see available commands.", "已连接。输入 help 查看可用命令。")}</span>${(session.history || []).map((h) => `<div class="terminal-command">perfman@${esc(resource?.name)}:${esc(h.cwd || "/workspace")}$ ${esc(h.command)}</div><div>${esc(h.output)}</div>`).join("")}</div><form id="terminal-form" class="terminal-input"><span>$</span><input name="command" autofocus autocomplete="off" spellcheck="false" aria-label="${t("Terminal command", "终端命令")}" ${session.status === "closed" ? "disabled" : ""}><button type="submit" class="btn ghost small" style="color:#9ab9c5">${icon("arrow")}</button></form></div>`
  );
}
function showSample(i) {
  const r = find("runs", S.id),
    sample = r?.samples?.[i];
  if (!sample) return;
  const colors = [
    "#a6b6c4",
    "#88b9b6",
    "#a797cf",
    "#b4c9d1",
    "#6caa94",
    "#bdb3d7",
  ];
  const times = sample.timing || {};
  drawer(
    t("Request inspection", "请求详情"),
    `<div class="name-cell"><strong>${esc(sample.name)}</strong></div><div class="asset-meta"><span>${esc(sample.protocol)}</span><span>${sample.status}</span><span>${fmt(sample.duration, 2)} ms</span></div><div class="detail-section"><h3>${t("Timing breakdown", "耗时分布")}</h3><div class="waterfall">${Object.entries(
      times,
    )
      .map(
        ([k, v], n) =>
          `<span style="flex:${v || 0.1};background:${colors[n % colors.length]}" title="${k}: ${v}ms"></span>`,
      )
      .join("")}</div><dl class="detail-grid section-space">${Object.entries(
      times,
    )
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${fmt(v, 2)} ms</dd></div>`)
      .join(
        "",
      )}</dl></div><div class="detail-section"><h3>${t("Request body", "请求正文")}</h3><pre class="request-payload">${esc(sample.requestBody || "—")}</pre></div><div class="detail-section"><h3>${t("Response body", "响应正文")}</h3><pre class="request-payload">${esc(sample.responseBody)}</pre></div><div class="detail-section"><h3>${t("Checks", "检查点")}</h3>${(sample.checks || []).map((c) => `<div class="event-line">${esc(c.name)}<span style="margin-left:auto">${badge(c.passed ? "passed" : "failed")}</span></div>`).join("")}</div><div class="detail-section"><h3>${t("Extraction tool", "提取器工具")}</h3><form id="extract-form" data-index="${i}">${select(
      t("Mode", "提取方式"),
      "mode",
      "jsonpath",
      [
        ["jsonpath", "JSONPath"],
        ["regex", t("Regular expression", "正则表达式")],
      ],
    )}${field(t("Expression", "表达式"), "expression", "$.id")}<button class="btn small primary" type="submit">${t("Evaluate", "提取")}</button></form><pre class="request-payload" id="extract-result">—</pre></div>`,
  );
}
async function action(a, el) {
  const id = el.dataset.id,
    kind = el.dataset.kind,
    index = Number(el.dataset.index);
  if (a === "menu") return $(".sidebar").classList.toggle("open");
  if (a === "close-overlay") return closeOverlay();
  if (a === "logout") {
    await api("session", "DELETE", {});
    S.user = null;
    closeOverlay();
    login();
    return;
  }
  if (a === "new-scenario") return newScenarioModal();
  if (a === "choose-mode") {
    newMode = el.dataset.mode;
    for (const e of document.querySelectorAll(".mode-choice"))
      e.classList.toggle("active", e.dataset.mode === newMode);
    return;
  }
  if (a === "create-draft") {
    S.draft = draftScene(newMode);
    S.editorTab = "build";
    S.step = 0;
    S.script = 0;
    closeOverlay();
    go("scenarios", "new");
    return;
  }
  if (a === "go-scenarios") return go("scenarios");
  if (a === "edit-scene") {
    S.draft = clone(find("scenarios", id));
    S.editorTab = "build";
    S.step = 0;
    S.script = 0;
    return go("scenarios", id);
  }
  if (a === "editor-back") {
    S.draft = null;
    return go("scenarios");
  }
  if (a === "run") return go("runs", id);
  if (a === "start" || a === "debug")
    return start(id, a === "debug" ? "debug" : "load");
  if (a === "scene-menu") {
    const s = find("scenarios", id);
    return drawer(
      esc(s.name),
      `<div class="actions">${button("edit-scene", icon("edit") + t("Edit scenario", "编辑场景"), "", `data-id="${id}"`)}${button("duplicate-scene", icon("copy") + t("Duplicate", "复制"), "", `data-id="${id}"`)}${button("export-scene", icon("download") + t("Export JSON", "导出 JSON"), "", `data-id="${id}"`)}${button("entity-delete", icon("trash") + t("Delete", "删除"), "danger", `data-kind="scenarios" data-id="${id}"`)}</div><div class="detail-section"><p class="muted">${esc(s.description)}</p><div class="asset-meta"><span>${esc(s.protocol)}</span><span>${s.vus} VU</span><span>${s.duration}s</span></div></div>`,
    );
  }
  if (a === "duplicate-scene") {
    S.draft = clone(find("scenarios", id));
    S.draft.id = "";
    S.draft.version = 0;
    S.draft.name += " copy";
    closeOverlay();
    go("scenarios", "new");
    return;
  }
  if (a === "export-scene")
    return download(
      "scenario-" + id + ".json",
      JSON.stringify(find("scenarios", id), null, 2),
    );
  if (a === "import-scene" || a === "import-har")
    return dialog(
      a === "import-scene"
        ? t("Import scenario", "导入场景")
        : t("Import HAR recording", "导入 HAR 录制"),
      `<form id="${a === "import-scene" ? "import-scene-form" : "import-har-form"}">${a === "import-har" ? field(t("Recording name", "录制名称"), "name", "Browser session") : ""}<label class="field"><span>${t("Choose file", "选择文件")}</span><input type="file" id="json-upload" accept=".json,.har"></label>${area("JSON", "content", "", 14, 'class="mono" required')}<div class="form-error" id="form-error"></div><div class="dialog-footer"><button class="btn primary" type="submit">${t("Import", "导入")}</button></div></form>`,
      true,
    );
  if (a === "save-scene" || a === "save-run") {
    const d = collectScene();
    if (!$("#scenario-editor").reportValidity()) return;
    const saved = await api("scenarios", "POST", d);
    await refresh();
    S.draft = clone(saved);
    toast(t("Scenario saved", "场景已保存"));
    if (a === "save-run") return start(saved.id);
    go("scenarios", saved.id);
    render();
    return;
  }
  if (a === "validate-scene") {
    const d = collectScene();
    return validationDrawer(await api("validate", "POST", d));
  }
  if (a === "editor-tab") {
    collectScene();
    S.editorTab = el.dataset.tab;
    return render();
  }
  if (a === "select-step") {
    collectScene();
    S.step = index;
    return render();
  }
  if (a === "select-script") {
    collectScene();
    S.script = index;
    return render();
  }
  if (
    [
      "add-step",
      "remove-step",
      "move-step",
      "add-header",
      "add-extract",
      "add-check",
      "add-script",
      "remove-script",
      "apply-template",
      "add-sla",
      "remove-sla",
    ].includes(a)
  ) {
    const d = collectScene();
    if (a === "add-step") {
      d.steps.push({
        ...stepTemplate(),
        name: "Request " + (d.steps.length + 1),
      });
      S.step = d.steps.length - 1;
    }
    if (a === "remove-step") {
      d.steps.splice(S.step, 1);
      S.step = 0;
    }
    if (a === "move-step") {
      [d.steps[S.step - 1], d.steps[S.step]] = [
        d.steps[S.step],
        d.steps[S.step - 1],
      ];
      S.step--;
    }
    if (a === "add-header")
      d.steps[S.step].headers[
        "Header-" + (Object.keys(d.steps[S.step].headers).length + 1)
      ] = "";
    if (a === "add-extract")
      d.steps[S.step].extracts.push({
        name: "value",
        path: "$.id",
        mode: "jsonpath",
      });
    if (a === "add-check")
      d.steps[S.step].checks.push({
        name: "New check",
        type: "json",
        path: "$.ok",
        operator: "eq",
        expected: "true",
      });
    if (a === "add-script") {
      d.scripts.push({
        name: "script-" + (d.scripts.length + 1) + ".js",
        weight: 0,
        content: "export const value = 42;",
      });
      S.script = d.scripts.length - 1;
    }
    if (a === "remove-script") {
      d.scripts.splice(S.script, 1);
      S.script = 0;
    }
    if (a === "apply-template") {
      const p = $('[name="script-template"]').value;
      d.protocol = p;
      d.scripts[S.script].content = clientScriptTemplate(p);
    }
    if (a === "add-sla")
      d.sla.push({
        id: crypto.randomUUID(),
        metric: "errorRate",
        operator: "gt",
        threshold: 2,
        windows: 3,
        stop: true,
        notify: true,
      });
    if (a === "remove-sla") d.sla.splice(index, 1);
    return render();
  }
  if (a === "remove-row") return el.closest(".mini-row").remove();
  if (a === "add-env-var") {
    const n = document.querySelectorAll(".env-var-row").length;
    $("#env-variables").insertAdjacentHTML(
      "beforeend",
      `<div class="mini-row env-var-row">${field(t("Variable", "变量名"), "var-name-" + n, "", "text", "data-key")}${field(t("Value", "值"), "var-value-" + n, "", "text", "data-value")}<label class="checkbox"><input type="checkbox" data-secret>${t("Secret", "加密")}</label>${button("remove-row", icon("close"), "ghost small")}</div>`,
    );
    return;
  }
  if (a.endsWith("-tab")) {
    const target = {
      "run-tab": "runs",
      "resource-tab": "resources",
      "configuration-tab": "configuration",
      "settings-tab": "settings",
      "alerts-tab": "alerts",
    }[a];
    if (target === "runs") go(target, S.id, el.dataset.tab);
    else go(target, el.dataset.tab);
    return;
  }
  if (a === "entity-new" || a === "entity-edit") return entityDialog(kind, id);
  if (a === "entity-delete") {
    const o = find(kind, id);
    return dialog(
      t("Delete item", "删除记录"),
      `<div class="dialog-body"><p style="line-height:1.8;color:#8a9ba5">${t("This will permanently remove", "此操作将删除")} <strong>${esc(o?.name || id)}</strong>.</p><div class="dialog-footer">${button("close-overlay", t("Cancel", "取消"))}${button("confirm-delete", t("Delete", "删除"), "danger", `data-kind="${kind}" data-id="${id}"`)}</div></div>`,
    );
  }
  if (a === "confirm-delete") {
    await api(kind + "/" + id, "DELETE", {});
    await refresh();
    closeOverlay();
    render();
    return toast(t("Deleted", "已删除"));
  }
  if (a === "detail") return showDetail(kind, id);
  if (a === "switch-project") {
    S.project = id;
    localStorage.setItem("perfman.project", id);
    go("overview");
    shell();
    return;
  }
  if (a === "group-workers" || a === "group-monitor") {
    S.filters.group = id;
    go("resources", a === "group-workers" ? "nodes" : "monitoring");
    return;
  }
  if (a === "resource-menu") {
    const r = find("resources", id);
    return drawer(
      esc(r.name),
      `<div class="actions">${button("detail", t("Details", "详情"), "", `data-kind="resources" data-id="${id}"`)}${button("entity-edit", t("Edit", "编辑"), "", `data-kind="resources" data-id="${id}"`)}${button("resource-drain", t("Drain", "排空"), "", `data-id="${id}"`)}${button("resource-enable", t("Enable", "启用"), "", `data-id="${id}"`)}${button("resource-offline", t("Disconnect", "断开连接"), "danger", `data-id="${id}"`)}${button("entity-delete", icon("trash"), "danger", `data-kind="resources" data-id="${id}"`)}</div>`,
    );
  }
  const commands = {
    "cluster-probe": ["clusters", "probe"],
    "resource-probe": ["resources", "probe"],
    "resource-drain": ["resources", "drain"],
    "resource-enable": ["resources", "enable"],
    "resource-offline": ["resources", "offline"],
    "ack-alert": ["alerts", "acknowledge"],
    "retry-delivery": ["deliveries", "retry"],
    "test-contact": ["contacts", "test"],
    "test-integration": ["integrations", "test"],
    "capture-recording": ["recordings", "capture"],
    "schedule-run": ["schedules", "run"],
  };
  if (commands[a]) {
    const [k, command] = commands[a];
    const result = await api(`${k}/${id}/action`, "POST", { action: command });
    await refresh();
    if (a === "schedule-run") {
      closeOverlay();
      go("runs", result.id);
    } else if (a === "resource-probe" || a === "capture-recording")
      showDetail(k, id);
    else {
      closeOverlay();
      render();
    }
    return toast(t("Action completed", "操作已完成"));
  }
  if (a === "convert-recording") {
    const result = await api(`recordings/${id}/action`, "POST", {
      action: "convert",
    });
    await refresh();
    S.draft = clone(result);
    S.editorTab = "build";
    closeOverlay();
    go("scenarios", result.id);
    return;
  }
  if (a === "schedule-toggle") {
    const r = find("schedules", id);
    await api(`schedules/${id}/action`, "POST", {
      action: r.status === "enabled" ? "pause" : "resume",
    });
    await refresh();
    return render();
  }
  if (a === "open-terminal") {
    const resource = find("resources", id) || find("pods", id);
    const session = await api("terminals", "POST", {
      name: resource.name,
      resourceId: id,
      projectId: resource.projectId || "",
    });
    await refresh();
    closeOverlay();
    go("terminal", session.id);
    return;
  }
  if (a === "close-terminal") {
    await api(`terminals/${id}/action`, "POST", { action: "close" });
    await refresh();
    render();
    return;
  }
  if (a === "stop-run" || a === "baseline") {
    await api(
      `runs/${id}/${a === "stop-run" ? "stop" : "baseline"}`,
      "POST",
      {},
    );
    await refresh();
    return render();
  }
  if (a === "export-run")
    return dialog(
      t("Export report", "导出报告"),
      `<div class="dialog-body"><div class="actions">${button("export-json", t("JSON report", "JSON 报告"), "", `data-id="${id}"`)}${button("export-csv", t("CSV metrics", "CSV 指标"), "", `data-id="${id}"`)}${button("print", t("Print / PDF", "打印 / PDF"))}</div></div>`,
    );
  if (a === "export-json") return location.assign(`/api/v1/runs/${id}/export`);
  if (a === "export-csv") return location.assign(`/api/v1/runs/${id}/csv`);
  if (a === "download-snapshot")
    return download(
      id + "-scenario.json",
      JSON.stringify(find("runs", id).snapshot, null, 2),
    );
  if (a === "download-file") {
    const f = find("files", id);
    return download(f.name, f.content, "text/plain");
  }
  if (a === "print") return window.print();
  if (a === "change-load") {
    const r = find("runs", id);
    return dialog(
      t("Adjust request rate", "调整请求速率"),
      `<form id="load-form" data-id="${id}">${field(t("Target requests per second", "目标每秒请求数"), "rps", r.targetRps, "number", `min="1" max="${r.snapshot.maxRps}" required`)}<p class="help">${t("Maximum", "上限")}: ${r.snapshot.maxRps} req/s</p><div class="dialog-footer"><button type="submit" class="btn primary">${t("Apply change", "应用调整")}</button></div></form>`,
    );
  }
  if (a === "add-chart") {
    S.charts.push("p99");
    await api("preferences", "POST", { dashboardMetrics: S.charts });
    return render();
  }
  if (a === "remove-chart") {
    S.charts.splice(index, 1);
    await api("preferences", "POST", { dashboardMetrics: S.charts });
    return render();
  }
  if (a === "sample-detail") return showSample(index);
  if (a === "notifications")
    return drawer(
      t("Notifications", "通知"),
      projectItems("deliveries")
        .slice()
        .reverse()
        .slice(0, 15)
        .map(
          (n) =>
            `<div class="notification"><strong>${esc(n.subject)}</strong><p>${esc(n.body)}</p><time>${date(n.createdAt)}</time></div>`,
        )
        .join("") || empty(t("You’re all caught up", "暂无新通知"), ""),
    );
  if (a === "search")
    return dialog(
      t("Search workspace", "搜索工作空间"),
      `<div class="dialog-body"><div class="search-input" style="max-width:100%">${icon("search")}<input id="global-search" placeholder="${t("Scenarios, workers, projects…", "场景、节点、项目…")}" autofocus></div><div class="search-results" id="search-results"></div></div>`,
    );
  if (a === "preflight") {
    const d = collectScene();
    const g = find("groups", d.groupId);
    const total = d.regions.reduce((n, r) => n + r.percent, 0);
    if (total !== 100) throw Error(errorMessage("region_total_required"));
    return drawer(
      t("Resource plan", "资源预检计划"),
      `<div class="actions">${badge("ready")}<span class="muted">${esc(g.name)}</span></div><div class="detail-section">${table(
        [
          t("Region", "地域"),
          t("Traffic", "流量"),
          t("Required", "需要"),
          t("Available", "可用"),
        ],
        d.regions.map(
          (r) =>
            `<tr><td>${esc(r.region)}</td><td>${r.percent}%</td><td>${Math.round((d.vus * r.percent) / 100)} VU</td><td>${fmt(
              items("resources")
                .filter(
                  (n) =>
                    n.groupId === g.id &&
                    n.region === r.region &&
                    n.status === "ready",
                )
                .reduce((v, n) => v + n.capacity - n.allocated, 0),
            )} VU</td></tr>`,
        ),
      )}</div><div class="detail-section"><h3>${t("Autoscaling", "弹性伸缩")}</h3><p class="help">${g.autoscale ? t("Additional workers are provisioned up to the group limit.", "容量不足时，在资源组上限内自动增加节点。") : t("This group uses its existing worker capacity.", "此资源组仅使用现有节点容量。")}</p><p class="help">${t("Worker limit", "节点上限")}: ${g.maxNodes}</p></div>`,
    );
  }
  if (a === "preview-schedule") {
    const form = $("#entity-form"),
      o = collectEntity(form);
    const result = await api("schedules/preview", "POST", o);
    $("#schedule-preview").innerHTML = result.times
      .map((time) => `<div>${date(time)}</div>`)
      .join("");
    return;
  }
}
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.disabled) return;
  event.preventDefault();
  el.disabled = true;
  try {
    await action(el.dataset.action, el);
  } catch (err) {
    toast(err.message);
  } finally {
    el.disabled = false;
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const submit = form.querySelector("[type=submit]");
  if (submit) submit.disabled = true;
  try {
    if (form.id === "login-form") {
      const f = new FormData(form);
      await api("session", "POST", {
        email: f.get("email"),
        password: f.get("password"),
      });
      await refresh();
      readRoute();
      shell();
    }
    if (form.id === "entity-form") {
      if (S.view === "scenarios" && S.id) collectScene();
      const kind = form.dataset.kind,
        o = collectEntity(form);
      await api(kind, "POST", o);
      await refresh();
      closeOverlay();
      render();
      toast(t("Changes saved", "保存成功"));
    }
    if (form.id === "import-scene-form") {
      const d = JSON.parse(new FormData(form).get("content"));
      d.id = "";
      d.version = 0;
      d.projectId = S.project === "all" ? items("projects")[0].id : S.project;
      S.draft = d;
      S.editorTab = "build";
      closeOverlay();
      go("scenarios", "new");
    }
    if (form.id === "import-har-form") {
      const f = new FormData(form);
      await api("recordings", "POST", {
        name: f.get("name"),
        projectId: S.project === "all" ? items("projects")[0].id : S.project,
        format: "har",
        content: f.get("content"),
      });
      await refresh();
      closeOverlay();
      go("recordings");
      render();
      toast(t("Recording imported", "已导入录制"));
    }
    if (form.id === "load-form") {
      await api(`runs/${form.dataset.id}/load`, "POST", {
        rps: Number(new FormData(form).get("rps")),
      });
      await refresh();
      closeOverlay();
      render();
      toast(t("Load updated", "压力已调整"));
    }
    if (form.id === "terminal-form") {
      const command = new FormData(form).get("command");
      const entry = await api(`terminals/${S.id}/command`, "POST", { command });
      const input = form.querySelector("input");
      input.value = "";
      const output = $("#terminal-output");
      if (command === "clear") {
        output.innerHTML = "";
      } else {
        output.insertAdjacentHTML(
          "beforeend",
          `<div class="terminal-command">$ ${esc(command)}</div><div>${esc(entry.output)}</div>`,
        );
      }
      output.scrollTop = output.scrollHeight;
      await refresh();
      input.focus();
    }
    if (form.id === "extract-form") {
      const f = new FormData(form);
      const sample = find("runs", S.id).samples[Number(form.dataset.index)];
      const mode = f.get("mode");
      const body =
        mode === "regex"
          ? sample.responseBody
          : JSON.parse(sample.responseBody);
      const result = await api("extract", "POST", {
        mode,
        body,
        expression: f.get("expression"),
      });
      $("#extract-result").textContent = JSON.stringify(
        result.value ?? null,
        null,
        2,
      );
    }
  } catch (err) {
    const target = $("#form-error") || $("#login-error");
    if (target) target.textContent = err.message;
    else toast(err.message);
  } finally {
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "list-search") {
    for (const row of document.querySelectorAll("[data-search]"))
      row.hidden = !row.dataset.search.includes(el.value.toLowerCase());
  }
  if (el.id === "global-search") {
    const query = el.value.toLowerCase();
    $("#search-results").innerHTML = query
      ? ["scenarios", "resources", "projects"]
          .flatMap((kind) =>
            items(kind)
              .filter((o) => o.name.toLowerCase().includes(query))
              .slice(0, 6)
              .map(
                (o) =>
                  `<button data-action="${kind === "scenarios" ? "edit-scene" : kind === "projects" ? "switch-project" : "detail"}" data-kind="${kind}" data-id="${o.id}">${icon(kind)}<span style="margin-left:11px">${esc(o.name)}</span><small>${kind}</small></button>`,
              ),
          )
          .join("")
      : "";
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  try {
    if (el.id === "language") {
      if (S.view === "scenarios" && S.id) collectScene();
      const lang = el.value;
      const scroll = scrollY;
      setLanguage(lang);
      if (S.user) await api("preferences", "POST", { language: lang });
      S.user ? shell() : login();
      window.scrollTo(0, scroll);
      return;
    }
    if (el.id === "project-select") {
      S.project = el.value;
      localStorage.setItem("perfman.project", S.project);
      S.draft = null;
      if (S.id) go(S.view === "scenarios" ? "scenarios" : "overview");
      else shell();
    }
    if (
      el.name === "frequency" &&
      $("#entity-form")?.dataset.kind === "schedules"
    ) {
      document.querySelectorAll("[data-schedule-mode]").forEach((row) => {
        row.hidden = row.dataset.scheduleMode !== el.value;
      });
    }
    if (
      ["frequency", "timezone", "cron", "nextAt"].includes(el.name) &&
      $("#schedule-preview")
    )
      $("#schedule-preview").innerHTML = "";
    if (el.name === "overviewDays") {
      S.overviewDays = Number(el.value);
      render();
    }
    if (el.name === "scenario-mode-filter") {
      S.filters.mode = el.value;
      render();
    }
    if (el.name === "group-filter") {
      S.filters.group = el.value;
      render();
    }
    if (
      ["loadModel", "groupId", "network", "jmxId", "threadMode"].includes(
        el.name,
      ) &&
      S.view === "scenarios" &&
      S.id
    ) {
      collectScene();
      if (el.name === "groupId") {
        const group = find("groups", el.value);
        S.draft.regions = group.regions.map((region, i) => ({
          region,
          percent: i === 0 ? 100 : 0,
        }));
      }
      render();
    }
    if (el.name === "compareA" || el.name === "compareB") {
      S[el.name] = el.value;
      render();
    }
    if (el.name?.startsWith("chart-metric-")) {
      S.charts[Number(el.name.slice(13))] = el.value;
      await api("preferences", "POST", { dashboardMetrics: S.charts });
      render();
    }
    if (el.name === "analysis-dimension") {
      S.analysisDimension = el.value;
      S.analysisValue = "";
      render();
    }
    if (el.name === "analysis-value") {
      S.analysisValue = el.value;
      render();
    }
    if (el.name === "log-level") {
      S.filters.logLevel = el.value;
      render();
    }
    if (el.name === "log-source") {
      S.filters.logSource = el.value;
      render();
    }
    if (el.id === "artifact-upload" && el.files[0]) {
      const file = el.files[0];
      const form = $("#entity-form");
      $('[name="name"]', form).value = file.name;
      const ext = file.name.split(".").at(-1);
      $('[name="content"]', form).value =
        ext === "zip" || ext === "jar"
          ? await binaryBase64(file)
          : await file.text();
      $('[name="type"]', form).value =
        {
          csv: "parameter",
          proto: "protocol",
          jce: "protocol",
          jmx: "jmeter",
          js: "module",
          jar: "plugin",
          zip: "protocol",
        }[ext] || "request";
    }
    if (el.id === "json-upload" && el.files[0]) {
      $('[name="content"]', el.closest("form")).value =
        await el.files[0].text();
    }
  } catch (err) {
    toast(err.message);
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeOverlay();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    action("search", {});
  }
  if (event.key === "Tab" && event.target.classList.contains("code-editor")) {
    event.preventDefault();
    const el = event.target;
    el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
  }
});
window.addEventListener("hashchange", () => {
  closeOverlay();
  readRoute();
  shell();
  window.scrollTo(0, 0);
});
async function init() {
  setLanguage(language);
  try {
    await refresh();
    readRoute();
    shell();
  } catch {
    login();
  }
  setInterval(async () => {
    if (!S.user || polling || document.hidden) return;
    polling = true;
    try {
      await refresh();
      const focused = document.activeElement;
      const editing =
        focused && ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName);
      if (
        !editing &&
        !$("#overlay").firstChild &&
        !(S.view === "scenarios" && S.id) &&
        S.view !== "terminal"
      ) {
        const scroll = scrollY;
        render();
        window.scrollTo(0, scroll);
      }
    } catch {
    } finally {
      polling = false;
    }
  }, 1800);
}
init();

async function binaryBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
