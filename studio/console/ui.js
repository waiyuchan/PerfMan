import { t, language, stateLabel } from "./locales.js";
export const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  menu: "M4 6h16 M4 12h16 M4 18h16",
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  scenarios: "M4 4h6v6H4z M14 14h6v6h-6z M7 10v7h7 M10 7h7v7",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  runs: "M8 4H4v16h16V4h-4 M8 3h8v4H8z M8 11h8 M8 15h5",
  reports: "M5 3h10l4 4v14H5z M9 11h6 M9 15h6",
  resources: "M3 4h18v6H3z M3 14h18v6H3z M7 7h.01 M7 17h.01 M11 7h6 M11 17h6",
  projects: "M3 6h7l2 3h9v11H3z M3 6V4h7l2 2",
  files: "M5 3h10l4 4v14H5z M14 3v5h5",
  environment: "M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5",
  schedules: "M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  alerts: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  plus: "M12 5v14 M5 12h14",
  play: "M8 5l12 7-12 7z",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  down: "M7 10l5 5 5-5",
  close: "M6 6l12 12 M6 18L18 6",
  terminal: "M4 5h16v14H4z M7 9l3 3-3 3 M13 15h4",
  check: "M5 12l4 4L20 5",
  copy: "M8 8h12v13H8z M4 16V3h12",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  stop: "M6 6h12v12H6z",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 6 5 12 0 18 M12 3c-5 6-5 12 0 18",
  recordings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  logout: "M9 4H4v16h5 M10 12h11 M16 7l5 5-5 5",
  edit: "M4 20l4-1L20 7l-3-3L5 16z",
  trash: "M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
  filter: "M3 4h18l-7 8v7l-4 2v-9z",
  code: "M8 6l-6 6 6 6 M16 6l6 6-6 6",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z",
  external: "M14 3h7v7 M10 14L21 3 M10 4H4v16h16v-6",
  refresh: "M20 7V3l-4 4 M20 7a8 8 0 1 0 1 8",
  chart: "M4 3v18h17 M8 16v-5 M13 16V6 M18 16v-8",
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.activity}"/></svg>`;
export const button = (a, label, style = "", attrs = "") =>
  `<button type="button" class="btn ${style}" data-action="${a}" ${attrs}>${label}</button>`;
export const badge = (value, style = "") =>
  `<span class="badge ${style || (["ready", "passed", "completed", "connected", "delivered", "active", "enabled"].includes(value) ? "success" : ["failed", "error", "offline", "suspended"].includes(value) ? "danger" : ["running", "provisioning", "creating", "queued"].includes(value) ? "progress" : ["protected", "partial", "open"].includes(value) ? "warning" : "")}"><i></i>${esc(stateLabel(value))}</span>`;
export const fmt = (n, d = 0) =>
  Number.isFinite(Number(n))
    ? Number(n).toLocaleString(language === "en" ? "en-US" : "zh-CN", {
        maximumFractionDigits: d,
      })
    : "—";
export const date = (s) =>
  s
    ? new Date(s).toLocaleString(language === "en" ? "en-US" : "zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";
export const relative = (s) => {
  const seconds = (Date.now() - Date.parse(s)) / 1000;
  if (seconds < 60) return t("Just now", "刚刚");
  if (seconds < 3600)
    return t(
      `${Math.floor(seconds / 60)}m ago`,
      `${Math.floor(seconds / 60)} 分钟前`,
    );
  if (seconds < 86400)
    return t(
      `${Math.floor(seconds / 3600)}h ago`,
      `${Math.floor(seconds / 3600)} 小时前`,
    );
  return t(
    `${Math.floor(seconds / 86400)}d ago`,
    `${Math.floor(seconds / 86400)} 天前`,
  );
};
export const avatar = (name, cls = "") =>
  `<span class="avatar ${cls}">${esc(
    (name || "PM")
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join(""),
  )}</span>`;
export const heading = (title, sub, actions = "") =>
  `<header class="page-title"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="actions">${actions}</div></header>`;
export const tabs = (items, selected, action = "tab") =>
  `<div class="tabs">${items.map(([key, label]) => button(action, label, key === selected ? "selected" : "", `data-tab="${key}"`)).join("")}</div>`;
export const empty = (title, sub, action = "") =>
  `<div class="empty"><span class="empty-icon">${icon("scenarios")}</span><h3>${title}</h3><p>${sub}</p>${action}</div>`;
export function table(headers, rows, cls = "") {
  return `<div class="table-wrap ${cls}"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
export const cell = (title, sub = "", iconName = "") =>
  `<div class="name-cell">${iconName ? `<span class="item-icon">${icon(iconName)}</span>` : ""}<div><strong>${title}</strong>${sub ? `<small>${sub}</small>` : ""}</div></div>`;
export const field = (label, name, value, type = "text", attrs = "") =>
  `<label class="field"><span>${label}</span><input type="${type}" name="${name}" value="${esc(value)}" ${attrs}></label>`;
export const select = (label, name, value, items, attrs = "") =>
  `<label class="field"><span>${label}</span><select name="${name}" ${attrs}>${items
    .map((v) => {
      const [key, title] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(title)}</option>`;
    })
    .join("")}</select></label>`;
export const area = (label, name, value, rows = 4, attrs = "") =>
  `<label class="field"><span>${label}</span><textarea name="${name}" rows="${rows}" ${attrs}>${esc(value)}</textarea></label>`;
export const checked = (label, name, on) =>
  `<label class="checkbox"><input type="checkbox" name="${name}" ${on ? "checked" : ""}><span>${label}</span></label>`;
export const protocolIcon = (p) =>
  `<span class="protocol ${p === "HTTP" ? "http" : p === "gRPC" ? "grpc" : p === "WebSocket" ? "ws" : ""}">${esc(p === "WebSocket" ? "WS" : p === "Socket.IO" ? "S.IO" : p === "Protobuf" ? "PB" : p || "HTTP")}</span>`;
export function chart(points, options = {}) {
  const key = options.metric || "rps";
  const color = options.color || "#8171dc";
  const width = 800,
    height = options.small ? 120 : 230,
    left = 40,
    right = 18,
    top = 15,
    bottom = 27,
    pw = width - left - right,
    ph = height - top - bottom;
  const max = Math.max(1, ...points.map((p) => Number(p[key]) || 0)) * 1.16;
  const maxT = Math.max(1, ...points.map((p) => Number(p.second) || 0));
  const y = (v) => top + ph - (v / max) * ph;
  const x = (p) => left + (p.second / maxT) * pw;
  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(p).toFixed(2)},${y(Number(p[key]) || 0).toFixed(2)}`,
    )
    .join(" ");
  let areaPath = points.length
    ? line + ` L${x(points.at(-1))},${top + ph} L${x(points[0])},${top + ph}Z`
    : "";
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label || key)}">${[0, 0.25, 0.5, 0.75, 1].map((v) => `<path d="M${left},${top + ph * v}H${width - right}" stroke="#edf0f2"/><text x="${left - 9}" y="${top + ph * v + 3}" text-anchor="end">${fmt(max * (1 - v))}</text>`).join("")}${[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => `<text x="${left + pw * v}" y="${height - 5}" text-anchor="middle">${fmt(maxT * v)}s</text>`).join("")}${areaPath ? `<path d="${areaPath}" fill="${color}" fill-opacity=".07"/><path d="${line}" stroke="${color}" stroke-width="2.2" fill="none"/>` : ""}${points.length ? `<circle cx="${x(points.at(-1))}" cy="${y(points.at(-1)[key] || 0)}" r="3" fill="${color}"/>` : ""}</svg>`;
}
export function sparkline(points, color = "#789b91") {
  const vals = points.map(Number);
  const max = Math.max(1, ...vals),
    min = Math.min(0, ...vals);
  return `<svg class="sparkline" viewBox="0 0 110 28" aria-hidden="true"><path d="${vals.map((v, i) => `${i ? "L" : "M"}${(i / Math.max(1, vals.length - 1)) * 110},${26 - ((v - min) / (max - min)) * 23}`).join(" ")}" fill="none" stroke="${color}" stroke-width="1.8"/></svg>`;
}
export const active = (r) =>
  r &&
  ![
    "completed",
    "failed",
    "cancelled",
    "protected",
    "partial",
    "interrupted",
  ].includes(r.status);
