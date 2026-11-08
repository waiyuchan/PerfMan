import { S, items, find, projectItems } from "./state.js";
import { t } from "./locales.js";
import {
  esc,
  icon,
  button,
  badge,
  fmt,
  date,
  heading,
  tabs,
  table,
  cell,
  field,
  select,
  area,
  checked,
  protocolIcon,
  chart,
} from "./ui.js";
export const protocolNames = [
  "HTTP",
  "gRPC",
  "Protobuf",
  "WebSocket",
  "SQL",
  "Socket.IO",
  "TCP",
  "UDP",
  "Redis",
];
export const regions = ["us-east-1", "eu-west-1", "ap-southeast-1"];
export function stepTemplate(protocol = "HTTP") {
  const spec = {
    HTTP: ["GET", "https://api.acme.internal/v1/catalog", "", 200],
    gRPC: ["INVOKE", "catalog.v1.Catalog/GetProduct", '{"id":"sku-1042"}', 0],
    WebSocket: [
      "SEND",
      "wss://stream.acme.internal/events",
      '{"event":"subscribe"}',
      101,
    ],
    SQL: [
      "QUERY",
      "postgres://orders.internal/commerce",
      "SELECT id, total FROM orders LIMIT 20",
      200,
    ],
    Redis: ["GET", "redis://cache.internal:6379/0", "product:1042", 200],
    "Socket.IO": [
      "EMIT",
      "https://events.acme.internal/orders",
      '{"event":"order.create"}',
      200,
    ],
    TCP: ["EXCHANGE", "tcp://gateway.internal:9090", "PING", 200],
    UDP: ["SEND", "udp://telemetry.internal:8125", "orders.completed:1|c", 200],
    Protobuf: ["ROUNDTRIP", "catalog.Product", '{"id":"sku-1042"}', 200],
  }[protocol];
  return {
    name: `${protocol} request`,
    protocol,
    method: spec[0],
    url: spec[1],
    body: spec[2],
    headers: {},
    extracts: [],
    checks: [
      {
        name: "Response is valid",
        type: "status",
        operator: "eq",
        expected: spec[3],
      },
    ],
  };
}
export function clientScriptTemplate(protocol) {
  const head = "import { check, sleep, env, metadata } from 'perfman';\n";
  switch (protocol) {
    case "HTTP":
      return `import http from 'perfman/http';\n${head}export function setup() { return { token: 'workspace-token' }; }\nexport default function(data) {\n  const response = http.get('https://api.acme.internal/v1/catalog');\n  check('HTTP 200', () => response.status === 200, response);\n  check('Product exists', () => response.json().id !== undefined, response);\n  sleep(0.2);\n}\nexport function teardown() { console.log('Cleanup completed'); }`;
    case "gRPC":
      return `import grpc from 'perfman/grpc';\n${head}const client = new grpc.Client();\nclient.load([], 'catalog.proto');\nexport default function() {\n  client.connect('catalog.internal:50051', {insecure:true});\n  const result = client.invoke('catalog.Catalog/GetProduct', {id:'sku-1042'});\n  check('RPC completed', () => result.status === 0, result);\n  client.close();\n}`;
    case "WebSocket":
      return `import ws from 'perfman/ws';\n${head}export default function() {\n  const result = ws.connect('wss://stream.acme.internal/events', socket => {\n    socket.on('message', message => console.log(message));\n    socket.send('subscribe:orders');\n    socket.ping();\n    socket.close();\n  });\n  check('Connection upgraded', () => result.status === 101);\n}`;
    case "Redis":
      return `import redis from 'perfman/redis';\n${head}const client = new redis.Client('redis://cache.internal:6379/0');\nexport default function() {\n  client.set('product:1042', 'Studio desk');\n  check('Value is cached', () => client.get('product:1042') === 'Studio desk');\n  client.del('product:1042');\n}`;
    case "SQL":
      return `import sql from 'perfman/sql';\n${head}const db = new sql.Database('postgres', 'orders.internal/commerce');\nexport default function() {\n  const rows = db.query('SELECT id, total FROM orders LIMIT 20');\n  check('Orders returned', () => rows.length > 0);\n}`;
    case "Socket.IO":
      return `import io from 'perfman/socketio';\n${head}export default function() {\n  io.connect('https://events.acme.internal', {namespace:'/orders'}, socket => {\n    socket.emit('order.create', {id:'sku-1042'}, ack => check('Acknowledged', () => ack.ok));\n    socket.close();\n  });\n}`;
    case "Protobuf":
      return `import protobuf from 'perfman/protobuf';\n${head}protobuf.load([], 'catalog.proto');\nexport default function() {\n  const bytes = protobuf.marshal('catalog.Product', {id:'sku-1042'});\n  const result = protobuf.unmarshal('catalog.Product', bytes);\n  check('Round trip succeeded', () => result.id === 'sku-1042');\n}`;
    default:
      return `import socket from 'perfman/socket';\n${head}export default function() {\n  const conn = new socket.Conn('${protocol}', 'gateway.internal:9090');\n  conn.write('PING');\n  check('Reply received', () => conn.read(64).length > 0);\n  conn.close();\n}`;
  }
}
export function draftScene(mode = "simple") {
  const project = S.project === "all" ? items("projects")[0].id : S.project;
  return {
    id: "",
    name: "Untitled scenario",
    projectId: project,
    description: "",
    version: 0,
    mode,
    protocol: "HTTP",
    engine: "simulator",
    profile: "normal",
    loadModel: "ramp",
    vus: 120,
    rps: 300,
    maxRps: 2000,
    duration: 30,
    thinkMs: 200,
    environmentId:
      items("environments").find((e) => e.projectId === project)?.id || "",
    groupId: "grp_global",
    network: "public",
    regions: regions.map((region, i) => ({ region, percent: [50, 30, 20][i] })),
    steps: [stepTemplate()],
    scripts: [
      { name: "main.js", weight: 100, content: clientScriptTemplate("HTTP") },
    ],
    fileIds: [],
    sla: [
      {
        id: "latency",
        metric: "p95",
        operator: "gt",
        threshold: 400,
        windows: 3,
        stop: true,
        notify: true,
      },
    ],
    options: {
      timeoutMs: 3000,
      keepAlive: true,
      http2: false,
      maxRedirects: 0,
      setupTimeout: 10,
      teardownTimeout: 10,
      dns: {},
    },
    contactId: projectItems("contacts")[0]?.id || "",
    tags: [],
  };
}
const inputNames = [
  "name",
  "description",
  "environmentId",
  "groupId",
  "profile",
  "protocol",
  "loadModel",
  "network",
  "jmxId",
  "threadMode",
  "contactId",
  "vpc",
  "subnet",
];
const numberNames = ["vus", "duration", "rps", "maxRps", "thinkMs", "loops"];
export function collectScene() {
  const form = document.querySelector("#scenario-editor");
  if (!form) return S.draft;
  const d = S.draft;
  const data = new FormData(form);
  for (const name of inputNames) if (data.has(name)) d[name] = data.get(name);
  for (const name of numberNames)
    if (data.has(name)) d[name] = Number(data.get(name));
  for (const name of ["csvSplit", "logRequests", "logChecks"])
    if (form.querySelector(`[name="${name}"]`)) d[name] = data.has(name);
  for (const name of [
    "timeoutMs",
    "maxRedirects",
    "setupTimeout",
    "teardownTimeout",
  ])
    if (data.has("option-" + name))
      d.options[name] = Number(data.get("option-" + name));
  for (const name of ["keepAlive", "http2"])
    if (form.querySelector(`[name="option-${name}"]`))
      d.options[name] = data.has("option-" + name);
  if (data.has("dns-lines")) {
    d.options.dns = {};
    for (const line of String(data.get("dns-lines")).split("\n")) {
      const [host, ip] = line.trim().split(/\s+/);
      if (host && ip) d.options.dns[host] = ip;
    }
  }
  if (form.querySelector("[data-file]"))
    d.fileIds = [...form.querySelectorAll("[data-file]:checked")].map(
      (e) => e.dataset.file,
    );
  if (form.querySelector("[data-region]"))
    d.regions = [...form.querySelectorAll("[data-region]")]
      .filter((e) => Number(e.value) > 0)
      .map((e) => ({ region: e.dataset.region, percent: Number(e.value) }));
  if (data.has("step-name")) {
    const step = d.steps[S.step];
    step.name = data.get("step-name");
    step.method = data.get("step-method");
    step.url = data.get("step-url");
    step.body = data.get("step-body");
    step.headers = {};
    for (const row of form.querySelectorAll("[data-header-row]")) {
      const k = row.querySelector("[data-key]").value;
      if (k) step.headers[k] = row.querySelector("[data-value]").value;
    }
    step.extracts = [...form.querySelectorAll("[data-extract-row]")].map(
      (row) => ({
        name: row.querySelector("[data-key]").value,
        path: row.querySelector("[data-value]").value,
        mode: row.querySelector("select").value,
      }),
    );
    step.checks = [...form.querySelectorAll("[data-check-row]")].map((row) => {
      const expected = row.querySelector("[data-expected]").value;
      return {
        name: row.querySelector("[data-name]").value,
        type: row.querySelector("[data-type]").value,
        path: row.querySelector("[data-path]").value,
        operator: row.querySelector("[data-operator]").value,
        expected: /^-?\d+(\.\d+)?$/.test(expected)
          ? Number(expected)
          : expected,
      };
    });
  }
  if (data.has("script-content")) {
    const script = d.scripts[S.script];
    script.content = data.get("script-content");
    script.name = data.get("script-name");
    script.weight = Number(data.get("script-weight"));
  }
  if (form.querySelector("[data-sla-row]"))
    d.sla = [...form.querySelectorAll("[data-sla-row]")].map((row, i) => ({
      id: row.dataset.id || "rule-" + i,
      metric: row.querySelector("[data-metric]").value,
      operator: row.querySelector("[data-op]").value,
      threshold: Number(row.querySelector("[data-threshold]").value),
      windows: Number(row.querySelector("[data-windows]").value),
      stop: row.querySelector("[data-stop]").checked,
      notify: row.querySelector("[data-notify]").checked,
    }));
  return d;
}
export function scenarioEditor() {
  if (!S.draft)
    S.draft = structuredClone(find("scenarios", S.id) || draftScene());
  const d = S.draft,
    tab = S.editorTab;
  const fileList = items("files").filter((f) => f.projectId === d.projectId);
  let html =
    heading(
      esc(d.id ? d.name : t("New scenario", "新建场景")),
      `${d.mode === "simple" ? t("Simple mode", "简单模式") : d.mode === "script" ? t("Script mode", "脚本模式") : "JMeter"} · ${d.id ? "v" + d.version : t("Unsaved", "未保存")}`,
      button("editor-back", t("Cancel", "取消")) +
        button("validate-scene", t("Validate", "校验")) +
        button("save-scene", t("Save", "保存")) +
        button(
          "save-run",
          icon("play") + t("Save & run", "保存并运行"),
          "primary",
        ),
    ) +
    `<form id="scenario-editor"><div class="form-grid editor-title">${field(t("Scenario name", "场景名称"), "name", d.name, "text", "required")}${select(
      t("Environment", "环境"),
      "environmentId",
      d.environmentId,
      [
        ["", t("No environment", "不使用环境")],
        ...items("environments")
          .filter((e) => e.projectId === d.projectId)
          .map((e) => [e.id, e.name]),
      ],
    )}</div>` +
    tabs(
      [
        ["build", t("Scenario builder", "场景编排")],
        ["files", t("Files & dependencies", "文件与依赖")],
        ["load", t("Load configuration", "施压配置")],
        ["sla", t("Performance targets", "性能目标")],
        ["advanced", t("Advanced", "高级配置")],
      ],
      tab,
      "editor-tab",
    );
  if (tab === "build" && d.mode === "simple") {
    S.step = Math.min(S.step, d.steps.length - 1);
    const st = d.steps[S.step];
    html += `<div class="editor-layout"><aside class="editor-tree"><div class="tree-label">${t("Request sequence", "请求顺序")}</div>${d.steps.map((s, i) => `<div class="tree-item ${i === S.step ? "active" : ""}" data-action="select-step" data-index="${i}">${protocolIcon(s.protocol)}<span>${esc(s.name)}</span></div>`).join("")}${button("add-step", icon("plus") + t("Add request", "添加请求"), "ghost small")}</aside><section class="editor-body"><div class="editor-topline">${field(t("Request name", "请求名称"), "step-name", st.name)}<div class="actions">${button("move-step", t("Move up", "上移"), "small ghost", S.step === 0 ? "disabled" : "")}${button("remove-step", icon("trash"), "small ghost", d.steps.length < 2 ? "disabled" : "")}</div></div><div class="request-line">${select("", "step-method", st.method, ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])}${field("", "step-url", st.url)}</div><div class="step-section"><h3>${t("Request headers", "请求头")}</h3>${Object.entries(
      st.headers || {},
    )
      .map(
        ([k, v], i) =>
          `<div class="mini-row" data-header-row>${field("", "h-key-" + i, k, "text", "data-key")}${field("", "h-value-" + i, v, "text", "data-value")}${button("remove-row", icon("close"), "ghost small")}</div>`,
      )
      .join(
        "",
      )}${button("add-header", icon("plus") + t("Add header", "添加请求头"), "ghost small")}</div><div class="step-section">${area(t("Request body", "请求正文"), "step-body", st.body || "", 4, 'class="code-body" spellcheck="false"')}</div><div class="step-section"><h3>${t("Response extraction", "响应提取")}</h3>${(
      st.extracts || []
    )
      .map(
        (ex, i) =>
          `<div class="mini-row" data-extract-row>${field(t("Variable", "变量"), "ex-name-" + i, ex.name, "text", "data-key")}${field(t("Expression", "表达式"), "ex-path-" + i, ex.path, "text", "data-value")}${select(
            "",
            "ex-mode-" + i,
            ex.mode,
            [
              ["jsonpath", "JSONPath"],
              ["regex", t("Regex", "正则")],
            ],
          )}${button("remove-row", icon("close"), "ghost small")}</div>`,
      )
      .join(
        "",
      )}${button("add-extract", icon("plus") + t("Add extraction", "添加提取器"), "ghost small")}</div><div class="step-section"><h3>${t("Checks", "检查点")}</h3>${(st.checks || []).map((rule, i) => checkRow(rule, i)).join("")}${button("add-check", icon("plus") + t("Add check", "添加检查点"), "ghost small")}</div></section></div>`;
  }
  if (tab === "build" && d.mode === "script") {
    S.script = Math.min(S.script, d.scripts.length - 1);
    const script = d.scripts[S.script];
    html += `<div class="editor-layout"><aside class="editor-tree"><div class="tree-label">${t("Script entries", "脚本文件")}</div>${d.scripts.map((s, i) => `<div class="tree-item ${i === S.script ? "active" : ""}" data-action="select-script" data-index="${i}">${icon("code")}<span>${esc(s.name)}</span><span class="tree-weight">${s.weight}%</span></div>`).join("")}${button("add-script", icon("plus") + t("Add script", "添加脚本"), "ghost small")}</aside><section class="editor-body"><div class="form-grid three">${field(t("Filename", "文件名"), "script-name", script.name)}${field(t("Weight", "权重"), "script-weight", script.weight, "number", 'min="0" max="100"')}${select(t("Template", "模板"), "script-template", d.protocol, protocolNames)}</div><div class="actions" style="justify-content:space-between;margin:15px 0">${button("apply-template", t("Insert template", "插入模板"), "small")}${button("remove-script", t("Remove script", "移除脚本"), "small ghost", d.scripts.length === 1 ? "disabled" : "")}</div><textarea class="code-editor" name="script-content" spellcheck="false" aria-label="${t("Script editor", "脚本编辑器")}">${esc(script.content)}</textarea><p class="help">${t("Use relative imports for shared modules. Set a weight of 0 for library files.", "公共模块使用相对路径导入，权重为 0 的文件只作为依赖。")}</p></section></div>`;
  }
  if (tab === "build" && d.mode === "jmeter") {
    const main = find("files", d.jmxId);
    const threadGroups = main
      ? [...main.content.matchAll(/<ThreadGroup[^>]*testname="([^"]+)"/g)].map(
          (m) => m[1],
        )
      : [];
    html += `<section class="panel"><div class="panel-title"><h2>${t("JMeter test plan", "JMeter 测试计划")}</h2>${button("entity-new", icon("plus") + t("Upload file", "上传文件"), "small", 'data-kind="files"')}</div><div class="panel-body"><div class="form-grid">${select(t("Main JMX file", "主 JMX 文件"), "jmxId", d.jmxId || "", [["", t("Select test plan", "选择测试计划")], ...fileList.filter((f) => f.type === "jmeter").map((f) => [f.id, f.name])])}${select(
      t("Thread group execution", "线程组执行方式"),
      "threadMode",
      d.threadMode || "parallel",
      [
        ["parallel", t("Parallel", "并行")],
        ["serial", t("Sequential", "串行")],
      ],
    )}${field(t("Iterations per thread", "每线程循环次数"), "loops", d.loops || 20, "number", 'min="1"')}</div><div class="actions section-space">${checked(t("Split CSV data across workers", "在节点间切分 CSV 数据"), "csvSplit", d.csvSplit)}${checked(t("Request logs", "请求日志"), "logRequests", d.logRequests)}${checked(t("Check logs", "检查点日志"), "logChecks", d.logChecks)}</div></div>${table(
      [
        t("Thread group", "线程组"),
        t("Mode", "执行方式"),
        t("Load allocation", "负载分配"),
      ],
      threadGroups.map(
        (n, i) =>
          `<tr><td>${esc(n)}</td><td>${esc(d.threadMode || "parallel")}</td><td>${Math.round(d.vus / Math.max(1, threadGroups.length))} VU</td></tr>`,
      ),
    )}</section>`;
  }
  if (tab === "files")
    html += `<section class="panel"><div class="panel-title"><h2>${t("Scenario dependencies", "场景依赖")}</h2>${button("entity-new", icon("plus") + t("Upload file", "上传文件"), "small", 'data-kind="files"')}</div>${table(
      [
        "",
        t("File", "文件"),
        t("Type", "类型"),
        t("Columns / size", "参数 / 大小"),
      ],
      fileList.map(
        (f) =>
          `<tr><td><input type="checkbox" data-file="${f.id}" aria-label="${esc(f.name)}" ${d.fileIds.includes(f.id) ? "checked" : ""}></td><td>${cell(esc(f.name), "v" + f.version, "files")}</td><td><span class="tag">${esc(f.type)}</span></td><td>${f.columns?.map(esc).join(", ") || fmt(f.size || f.content?.length || 0) + " B"}</td></tr>`,
      ),
    )}<div class="panel-body"><p class="help">${t("Selected files are frozen with each run. Parameter columns are available as ${variable}.", "选中文件随运行冻结，参数列可使用 ${variable} 引用。")}</p></div></section>`;
  if (tab === "load") {
    const group = find("groups", d.groupId);
    const available = group?.regions || regions;
    html += `<div class="load-layout"><div><section class="panel"><div class="panel-title"><h2>${t("Load profile", "负载模型")}</h2></div><div class="panel-body"><div class="form-grid">${select(
      t("Load model", "施压模式"),
      "loadModel",
      d.loadModel,
      [
        ["constant", t("Constant VUs", "恒定 VU")],
        ["ramp", t("Ramping VUs", "阶梯 VU")],
        ["spike", t("Spike VUs", "突增 VU")],
        ["rps", t("Requests per second", "每秒请求数")],
      ],
    )}${field(t("Duration (seconds)", "持续时间（秒）"), "duration", d.duration, "number", 'min="3" max="3600"')}${field(t("Virtual users", "并发用户数"), "vus", d.vus, "number", 'min="1" max="1000000"')}${field(t("Think time (ms)", "思考时间（ms）"), "thinkMs", d.thinkMs, "number", 'min="0"')}${field(t("Initial RPS", "起始 RPS"), "rps", d.rps, "number", 'min="1"')}${field(t("Maximum RPS", "最大 RPS"), "maxRps", d.maxRps, "number", 'min="1"')}</div></div></section><section class="panel"><div class="panel-title"><h2>${t("Traffic distribution", "流量分布")}</h2></div><div class="panel-body"><div class="form-grid">${select(
      t("Resource group", "资源组"),
      "groupId",
      d.groupId,
      items("groups").map((g) => [g.id, g.name]),
    )}${select(t("Network", "网络"), "network", d.network, [
      ["public", t("Public network", "公共网络")],
      ["private", t("Private network", "私有网络")],
    ])}${d.network === "private" ? field("VPC", "vpc", d.vpc || "vpc-commerce") + field(t("Subnet", "子网"), "subnet", d.subnet || "subnet-perf") : ""}</div><div class="section-space">${available.map((region) => `<div class="mini-row"><span>${esc(region)}</span><label class="field"><input type="number" data-region="${region}" min="0" max="100" value="${d.regions.find((r) => r.region === region)?.percent || 0}" aria-label="${region} %"></label><span class="muted">%</span></div>`).join("")}</div></div></section></div><aside><div class="load-sample"><h3>${t("Target load preview", "目标负载预览")}</h3>${chart(
      Array.from({ length: 25 }, (_, i) => ({
        second: (i * d.duration) / 24,
        rps:
          d.vus *
          (d.loadModel === "ramp"
            ? i < 6
              ? 0.25
              : i < 12
                ? 0.5
                : 1
            : d.loadModel === "spike"
              ? i < 9 || i > 18
                ? 0.2
                : 1
              : 1),
      })),
      { color: "#76a898" },
    )}<div class="detail-grid section-space"><div><dt>${t("Regions", "地域")}</dt><dd>${d.regions.length}</dd></div><div><dt>${t("Capacity", "容量")}</dt><dd>${fmt(
      items("resources")
        .filter((n) => n.groupId === d.groupId && n.status === "ready")
        .reduce((s, n) => s + n.capacity - n.allocated, 0),
    )} VU</dd></div></div></div>${button("preflight", icon("check") + t("Check resource plan", "预检资源计划"), "section-space", 'style="width:100%"')}</aside></div>`;
  }
  if (tab === "sla")
    html += `<section class="panel"><div class="panel-title"><h2>${t("Performance targets", "性能目标")}</h2>${button("add-sla", icon("plus") + t("Add rule", "添加规则"), "small")}</div><div class="panel-body">${d.sla
      .map(
        (rule, i) =>
          `<div data-sla-row data-id="${esc(rule.id)}" class="sla-row"><div class="form-grid three">${select(
            t("Metric", "指标"),
            "sla-metric-" + i,
            rule.metric,
            [
              ["p95", "P95 latency"],
              ["p99", "P99 latency"],
              ["mean", "Mean latency"],
              ["errorRate", "Request error rate"],
              ["checkFailureRate", "Check failure rate"],
              ["rps", "RPS"],
              ["requests", "Request count"],
            ],
            "data-metric",
          )}${select(
            t("Condition", "条件"),
            "sla-op-" + i,
            rule.operator,
            [
              ["gt", t("Greater than", "大于")],
              ["lt", t("Less than", "小于")],
            ],
            "data-op",
          )}${field(t("Threshold", "阈值"), "sla-threshold-" + i, rule.threshold, "number", 'data-threshold min="0"')}${field(t("Consecutive windows", "连续窗口数"), "sla-windows-" + i, rule.windows, "number", 'data-windows min="1" max="60"')}<label class="checkbox"><input type="checkbox" data-stop ${rule.stop ? "checked" : ""}>${t("Stop run", "停止运行")}</label><label class="checkbox"><input type="checkbox" data-notify ${rule.notify ? "checked" : ""}>${t("Send notification", "发送通知")}</label></div><div style="text-align:right;margin-top:10px">${button("remove-sla", icon("trash") + t("Remove", "移除"), "small ghost", `data-index="${i}"`)}</div></div>`,
      )
      .join(
        '<div style="border-top:1px solid var(--line);margin:20px 0"></div>',
      )}<div class="section-space">${select(
      t("Notification group", "通知联系人组"),
      "contactId",
      d.contactId,
      [
        ["", t("Workspace inbox", "工作空间收件箱")],
        ...items("contacts")
          .filter((c) => c.projectId === d.projectId)
          .map((c) => [c.id, c.name]),
      ],
    )}</div></div></section>`;
  if (tab === "advanced")
    html += `<section class="panel"><div class="panel-title"><h2>${t("Request settings", "请求设置")}</h2></div><div class="panel-body"><div class="form-grid three">${field(t("Request timeout (ms)", "请求超时（ms）"), "option-timeoutMs", d.options.timeoutMs, "number", 'min="1"')}${field(t("Maximum redirects", "最大重定向次数"), "option-maxRedirects", d.options.maxRedirects, "number", 'min="0"')}${field(t("Setup timeout (seconds)", "预处理超时（秒）"), "option-setupTimeout", d.options.setupTimeout, "number", 'min="1"')}${field(t("Teardown timeout (seconds)", "后处理超时（秒）"), "option-teardownTimeout", d.options.teardownTimeout, "number", 'min="1"')}${select(
      t("Target behaviour", "目标响应策略"),
      "profile",
      d.profile,
      [
        ["normal", t("Healthy", "正常")],
        ["latency", t("Elevated latency", "高时延")],
        ["errors", t("Intermittent errors", "间歇错误")],
      ],
    )}</div><div class="actions section-space">${checked(t("Keep connections alive", "复用连接"), "option-keepAlive", d.options.keepAlive)}${checked("HTTP/2", "option-http2", d.options.http2)}</div><div class="section-space">${area(
      t("DNS overrides (hostname IP per line)", "域名覆盖（每行：域名 IP）"),
      "dns-lines",
      Object.entries(d.options.dns || {})
        .map(([k, v]) => k + " " + v)
        .join("\n"),
      4,
    )}</div></div></section>`;
  html += "</form>";
  return html;
}
function checkRow(rule, i) {
  return `<div class="mini-row check-row" data-check-row>${field(t("Name", "名称"), "check-name-" + i, rule.name, "text", "data-name")}${select(
    t("Type", "类型"),
    "check-type-" + i,
    rule.type,
    [
      ["status", t("Status", "状态码")],
      ["json", "JSONPath"],
      ["contains", t("Body", "正文")],
      ["regex", t("Regex", "正则")],
      ["latency", t("Latency", "时延")],
    ],
    "data-type",
  )}${field(t("Path", "路径"), "check-path-" + i, rule.path || "", "text", "data-path")}${select(
    t("Condition", "条件"),
    "check-op-" + i,
    rule.operator || "eq",
    [
      ["eq", "="],
      ["ne", "≠"],
      ["gt", ">"],
      ["gte", "≥"],
      ["lt", "<"],
      ["contains", t("Contains", "包含")],
    ],
    "data-operator",
  )}${field(t("Expected", "预期值"), "check-expected-" + i, rule.expected, "text", "data-expected")}${button("remove-row", icon("close"), "ghost small")}</div>`;
}
export function entityForm(kind, o = {}) {
  const project =
    o.projectId || (S.project === "all" ? items("projects")[0]?.id : S.project);
  let form = field(
    t("Name", "名称"),
    "name",
    o.name || "",
    "text",
    'required maxlength="150"',
  );
  if (
    ["projects", "groups", "environments", "recordings", "contacts"].includes(
      kind,
    )
  )
    form += area(
      t("Description", "说明"),
      "description",
      o.description || "",
      2,
    );
  if (kind === "projects")
    form += field(
      t("Tags (comma separated)", "标签（用逗号分隔）"),
      "tags",
      (o.tags || []).join(", "),
    );
  if (kind === "groups")
    form += `<div class="form-grid">${field(t("Maximum workers", "最大节点数"), "maxNodes", o.maxNodes || 12, "number", 'min="1" max="100"')}${field(t("Capacity per worker (VU)", "单节点容量（VU）"), "nodeCapacity", o.nodeCapacity || 1000, "number", 'min="1"')}${field(t("Parallel test limit", "同时运行上限"), "maxParallel", o.maxParallel || 6, "number", 'min="1" max="20"')}${field(t("Regions (comma separated)", "地域（用逗号分隔）"), "regions", (o.regions || regions).join(", "))}</div>${checked(t("Scale workers automatically", "自动伸缩节点"), "autoscale", o.autoscale ?? true)}`;
  if (kind === "clusters")
    form +=
      field(
        t("API endpoint", "API 地址"),
        "endpoint",
        o.endpoint || "https://cluster.acme.internal",
      ) +
      field(
        t("Namespace", "命名空间"),
        "namespace",
        o.namespace || "perfman-runs",
      ) +
      select(
        t("Resource group", "资源组"),
        "groupId",
        o.groupId || items("groups")[0]?.id,
        items("groups").map((g) => [g.id, g.name]),
      );
  if (kind === "resources")
    form += `<div class="form-grid">${select(
      t("Resource group", "资源组"),
      "groupId",
      o.groupId || items("groups")[0]?.id,
      items("groups").map((g) => [g.id, g.name]),
    )}${select(t("Region", "地域"), "region", o.region || regions[0], regions) + select(t("Cluster", "集群"), "clusterId", o.clusterId || "", [["", t("No cluster", "不关联集群")], ...items("clusters").map((c) => [c.id, c.name])])}${field(t("Address", "连接地址"), "address", o.address || "10.24.0.20")}${field(t("Capacity (VU)", "容量（VU）"), "capacity", o.capacity || 1000, "number", 'min="1" max="100000"')}${select(t("Provider", "资源提供方"), "provider", o.provider || "simulator", [["simulator", "Managed simulator"]])}${field(t("Tags", "标签"), "tags", (o.tags || []).join(", "))}</div>`;
  if (kind === "environments")
    form += `<div class="section-label">${t("Variables", "环境变量")}</div><div id="env-variables">${(o.variables || [{ name: "BASE_URL", value: "https://api.acme.internal", secret: false }]).map((v, i) => `<div class="mini-row env-var-row">${field(t("Variable", "变量名"), "var-name-" + i, v.name, "text", "data-key")}${field(t("Value", "值"), "var-value-" + i, v.value, v.secret ? "password" : "text", "data-value")}<label class="checkbox"><input type="checkbox" data-secret ${v.secret ? "checked" : ""}>${t("Secret", "加密")}</label>${button("remove-row", icon("close"), "ghost small")}</div>`).join("")}</div>${button("add-env-var", icon("plus") + t("Add variable", "添加变量"), "small ghost")}`;
  if (kind === "files")
    form +=
      select(t("File type", "文件类型"), "type", o.type || "parameter", [
        ["parameter", t("Parameter data (CSV)", "参数文件（CSV）")],
        ["protocol", t("Protocol definition", "协议文件")],
        ["request", t("Request file", "请求文件")],
        ["module", t("JavaScript module", "JavaScript 模块")],
        ["jmeter", "JMeter test plan (JMX)"],
        ["plugin", t("Engine plugin", "引擎插件")],
      ]) +
      `<label class="field"><span>${t("Choose a file", "选择文件")}</span><input type="file" id="artifact-upload"></label>` +
      field(
        t("Module source URL (optional)", "模块源地址（可选）"),
        "sourceUrl",
        o.sourceUrl || "",
      ) +
      area(
        t("File contents", "文件内容"),
        "content",
        o.content || "",
        10,
        'class="mono" spellcheck="false"',
      );
  if (kind === "schedules")
    form +=
      select(
        t("Scenario", "关联场景"),
        "scenarioId",
        o.scenarioId || projectItems("scenarios")[0]?.id,
        projectItems("scenarios").map((s) => [s.id, s.name]),
      ) +
      `<div class="form-grid">${select(
        t("Frequency", "执行频率"),
        "frequency",
        o.frequency || "cron",
        [
          ["cron", t("Recurring (cron)", "周期（cron）")],
          ["once", t("One time", "仅一次")],
        ],
      )}${select(t("Timezone", "时区"), "timezone", o.timezone || "Asia/Shanghai", ["Asia/Shanghai", "UTC", "America/New_York", "Europe/London", "Asia/Singapore"])}</div>` +
      `<div data-schedule-mode="cron" ${o.frequency === "once" ? "hidden" : ""}>` +
      field(
        t("Cron expression", "Cron 表达式"),
        "cron",
        o.cron || "0 9 * * 1-5",
      ) +
      `</div><div data-schedule-mode="once" ${o.frequency === "once" ? "" : "hidden"}>` +
      field(
        t("Run at", "执行时间"),
        "nextAt",
        zonedInput(
          o.nextAt || new Date(Date.now() + 3600000).toISOString(),
          o.timezone || "Asia/Shanghai",
        ),
        "datetime-local",
      ) +
      `</div><div class="actions">${button("preview-schedule", t("Preview next 5 runs", "预览下 5 次执行"), "small")}</div><div id="schedule-preview" class="help"></div>`;
  if (kind === "recordings")
    form +=
      field(
        t("Starting URL", "起始地址"),
        "url",
        o.url || "https://shop.acme.internal",
      ) +
      field(
        t("URL filter", "URL 筛选"),
        "filter",
        o.filter || "api.acme.internal",
      ) +
      `<p class="help">${t("Managed capture records a checkout journey from the connected target provider. Import HAR to use traffic from your own browser.", "托管录制从已连接目标采集业务链路。也可导入浏览器 HAR 流量。")}</p>`;
  if (kind === "contacts")
    form +=
      `<div class="form-grid">${select(
        t("Notification channel", "通知渠道"),
        "channel",
        o.channel || "inbox",
        [
          ["inbox", t("Workspace inbox", "站内收件箱")],
          ["email", "Email"],
          ["webhook", "Webhook"],
        ],
      )}${field(t("Email address", "邮箱"), "email", o.email || "performance@acme.io", "email")}</div>` +
      field(
        t("Webhook endpoint", "Webhook 地址"),
        "endpoint",
        o.endpoint || "",
      );
  if (kind === "users")
    form +=
      field(t("Email", "邮箱"), "email", o.email || "", "email", "required") +
      `<div class="form-grid">${select(
        t("Role", "角色"),
        "role",
        o.role || "engineer",
        [
          ["admin", t("Administrator", "管理员")],
          ["engineer", t("Test engineer", "测试工程师")],
          ["operator", t("Resource operator", "资源运维")],
          ["viewer", t("Observer", "观察者")],
        ],
      )}${select(t("Status", "状态"), "status", o.status || "active", [
        ["active", t("Active", "有效")],
        ["suspended", t("Suspended", "已停用")],
      ])}</div>` +
      field(
        t(
          o.id ? "New password (optional)" : "Password",
          o.id ? "新密码（可选）" : "密码",
        ),
        "password",
        "",
        "password",
        o.id ? 'minlength="10"' : 'required minlength="10"',
      ) +
      `<div class="section-label">${t("Project access", "项目权限")}</div><div class="actions">${items(
        "projects",
      )
        .map(
          (p) =>
            `<label class="checkbox"><input type="checkbox" name="user-project" value="${p.id}" ${(o.projects || []).includes(p.id) ? "checked" : ""}>${esc(p.name)}</label>`,
        )
        .join("")}</div>`;
  if (kind === "policies")
    form +=
      select(t("Subject", "主体"), "subject", o.subject || "role:engineer", [
        ["role:engineer", t("Test engineers", "测试工程师")],
        ["role:operator", t("Resource operators", "资源运维")],
        ["role:viewer", t("Observers", "观察者")],
        ...items("users").map((u) => [u.id, u.name]),
      ]) +
      `<div class="form-grid">${select(
        t("Effect", "效果"),
        "effect",
        o.effect || "allow",
        [
          ["allow", t("Allow", "允许")],
          ["deny", t("Deny", "拒绝")],
        ],
      )}${field(t("Action pattern", "动作匹配"), "action", o.action || "scenarios.*")}</div>` +
      select(t("Project scope", "项目范围"), "projectId", o.projectId || "", [
        ["", t("All projects", "所有项目")],
        ...items("projects").map((p) => [p.id, p.name]),
      ]) +
      field(t("Required resource tag", "资源标签条件"), "tag", o.tag || "") +
      select(t("Status", "状态"), "status", o.status || "active", [
        ["active", t("Active", "生效")],
        ["disabled", t("Disabled", "停用")],
      ]);
  if (kind === "integrations")
    form +=
      select(t("Type", "类型"), "type", o.type || "prometheus", [
        "prometheus",
        "webhook",
        "inbox",
        "apm",
      ]) +
      field(
        t("Endpoint", "端点"),
        "endpoint",
        o.endpoint || "https://metrics.acme.internal/api/v1/write",
      );
  return `<form id="entity-form" data-kind="${kind}" data-id="${o.id || ""}">${form}${kind === "policies" ? "" : `<input type="hidden" name="projectId" value="${esc(project)}">`}<div class="form-error" id="form-error"></div><div class="dialog-footer">${button("close-overlay", t("Cancel", "取消"))}<button class="btn primary" type="submit">${t("Save changes", "保存")}</button></div></form>`;
}
export function collectEntity(form) {
  const kind = form.dataset.kind,
    old = find(kind, form.dataset.id),
    o = old ? structuredClone(old) : {};
  const f = new FormData(form);
  for (const [k, v] of f)
    if (!["user-project", "password"].includes(k) && !k.startsWith("var-"))
      o[k] = v;
  for (const k of ["capacity", "maxNodes", "nodeCapacity", "maxParallel"])
    if (f.has(k)) o[k] = Number(f.get(k));
  if (f.has("tags"))
    o.tags = String(f.get("tags"))
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  if (kind === "groups") {
    o.regions = String(f.get("regions"))
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    o.autoscale = f.has("autoscale");
    o.provider = "simulator";
    delete o.projectId;
  }
  if (
    kind === "projects" ||
    kind === "resources" ||
    kind === "tags" ||
    kind === "users" ||
    kind === "integrations" ||
    kind === "clusters"
  )
    delete o.projectId;
  if (kind === "environments")
    o.variables = [...form.querySelectorAll(".env-var-row")].map((row) => ({
      name: row.querySelector("[data-key]").value,
      value: row.querySelector("[data-value]").value,
      secret: row.querySelector("[data-secret]").checked,
    }));
  if (kind === "users") {
    o.projects = f.getAll("user-project");
    if (f.get("password")) o.password = f.get("password");
  }
  if (kind === "schedules") {
    o.status = o.status || "enabled";
    if (f.get("nextAt"))
      o.nextAt = zonedISO(String(f.get("nextAt")), String(f.get("timezone")));
  }
  if (kind === "recordings") {
    o.format = "browser";
    o.status = o.status || "pending";
    o.requests = o.requests || [];
  }
  return o;
}

function zonedInput(value, timezone) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
function zonedISO(value, timezone) {
  const [y, m, d, h, min] = value.split(/[-T:]/).map(Number);
  const desired = Date.UTC(y, m - 1, d, h, min);
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const local = zonedInput(new Date(guess).toISOString(), timezone);
    const [yy, mm, dd, hh, mi] = local.split(/[-T:]/).map(Number);
    guess += desired - Date.UTC(yy, mm - 1, dd, hh, mi);
  }
  if (zonedInput(new Date(guess).toISOString(), timezone) !== value)
    throw Error(
      t(
        "This local time does not exist in the selected timezone.",
        "此时间在所选时区不存在。",
      ),
    );
  return new Date(guess).toISOString();
}
