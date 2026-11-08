export let language = localStorage.getItem("perfman.language") || "en";
export const t = (en, zh) => (language === "zh" ? zh || en : en);
export function setLanguage(value) {
  language = value;
  localStorage.setItem("perfman.language", value);
  document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
}
export const errors = {
  authentication_required: ["Please sign in to continue.", "请登录后继续。"],
  invalid_credentials: [
    "The email or password is incorrect.",
    "邮箱或密码不正确。",
  ],
  permission_denied: [
    "You do not have permission for this action.",
    "你没有执行此操作的权限。",
  ],
  name_required: ["Enter a name.", "请填写名称。"],
  version_conflict: [
    "This item changed. Reload it before saving.",
    "此记录已更新，请重新打开后保存。",
  ],
  invalid_load: [
    "Check the duration and virtual user limits.",
    "请检查时长和并发数。",
  ],
  invalid_regions: [
    "Select available regions with unique entries.",
    "请选择可用且不重复的地域。",
  ],
  region_total_required: [
    "Traffic distribution must add up to 100%.",
    "地域流量比例合计必须为 100%。",
  ],
  file_not_found: ["A referenced file is missing.", "引用的文件不存在。"],
  invalid_csv: [
    "Upload a CSV with a header and at least one data row.",
    "CSV 需要表头和至少一行数据。",
  ],
  duplicate_csv_column: [
    "CSV columns must be non-empty and unique.",
    "CSV 列名不能为空或重复。",
  ],
  jmx_required: [
    "Select a JMX file for this scenario.",
    "请为此场景选择 JMX 文件。",
  ],
  invalid_jmx: ["The JMX file is not valid XML.", "JMX 不是有效的 XML 文件。"],
  entity_in_use: [
    "Remove active references before deleting.",
    "请先解除引用后再删除。",
  ],
  resource_in_use: [
    "Drain the resource and wait for its tasks to finish.",
    "请先排空资源，等待任务结束。",
  ],
  group_has_resources: [
    "Move or remove the group’s resources first.",
    "请先移出或删除组内资源。",
  ],
  project_has_scenarios: [
    "Remove the project’s scenarios first.",
    "请先删除项目下的场景。",
  ],
  native_engine_limit: [
    "The local HTTP engine supports up to 20 VUs and HTTP requests.",
    "本地 HTTP 引擎支持最多 20 VU 和 HTTP 请求。",
  ],
  session_expired: [
    "The terminal session has expired. Reconnect to continue.",
    "终端会话已过期，请重新连接。",
  ],
  resource_unavailable: [
    "This resource is not ready for a terminal connection.",
    "此资源尚未就绪，无法连接终端。",
  ],
  password_too_short: [
    "Use a password with at least 10 characters.",
    "密码至少需要 10 个字符。",
  ],
  invalid_schedule: [
    "Check the schedule, timezone and next execution time.",
    "请检查计划、时区和执行时间。",
  ],
  last_admin_required: [
    "Keep at least one active administrator.",
    "至少需要保留一名有效管理员。",
  ],
  too_many_attempts: [
    "Too many attempts. Try again in one minute.",
    "尝试次数过多，请一分钟后重试。",
  ],
  cannot_delete_self: [
    "You cannot remove your own account.",
    "不能删除当前登录账户。",
  ],
  invalid_rps: [
    "The maximum RPS must be at least the initial RPS.",
    "最大 RPS 不能小于起始 RPS。",
  ],
  script_weight_required: [
    "At least one entry script must have a positive weight.",
    "至少一个入口脚本的权重必须大于零。",
  ],
  storage_failed: [
    "Changes could not be saved. Try again.",
    "保存失败，请重试。",
  ],
};
export function errorMessage(code) {
  return errors[code] ? t(...errors[code]) : code.replaceAll("_", " ");
}
export const stateLabel = (s) =>
  ({
    ready: t("Ready", "就绪"),
    pending: t("Pending", "待处理"),
    queued: t("Queued", "排队中"),
    provisioning: t("Preparing", "准备中"),
    creating: t("Creating", "创建中"),
    running: t("Running", "运行中"),
    completed: t("Completed", "已完成"),
    protected: t("Protected", "保护停止"),
    cancelled: t("Cancelled", "已取消"),
    failed: t("Failed", "失败"),
    partial: t("Partial", "部分完成"),
    interrupted: t("Interrupted", "已中断"),
    passed: t("Passed", "通过"),
    inconclusive: t("Inconclusive", "结果不完整"),
    draining: t("Draining", "排空中"),
    offline: t("Offline", "离线"),
    terminated: t("Terminated", "已终止"),
    active: t("Active", "有效"),
    suspended: t("Suspended", "已停用"),
    enabled: t("Enabled", "已启用"),
    paused: t("Paused", "已暂停"),
    delivered: t("Delivered", "已送达"),
    simulated: t("Processed", "已处理"),
    open: t("Open", "待处理"),
    acknowledged: t("Acknowledged", "已确认"),
    connected: t("Connected", "已连接"),
    captured: t("Captured", "已采集"),
    closed: t("Closed", "已关闭"),
    error: t("Error", "异常"),
  })[s] || s;
