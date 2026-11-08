import { t } from "./locales.js";
import { heading, table, badge, esc, icon } from "./ui.js";
export const diagnosticCodes = [
  [
    "REQUEST_TIMEOUT",
    "Engine",
    "The target did not respond before the request deadline.",
    "目标未在请求截止时间前返回。",
    "Inspect target latency, network reachability and the request timeout.",
    "检查目标时延、网络可达性和请求超时设置。",
  ],
  [
    "CONNECTION_FAILED",
    "Engine",
    "A network connection could not be established.",
    "无法建立网络连接。",
    "Check the endpoint, port, firewall and worker network.",
    "检查端点、端口、防火墙与节点网络。",
  ],
  [
    "MODULE_NOT_FOUND",
    "Script",
    "A script import could not be resolved.",
    "无法解析脚本依赖。",
    "Attach the module file and verify its import path.",
    "关联模块文件并检查导入路径。",
  ],
  [
    "SCRIPT_TIMEOUT",
    "Script",
    "A script exceeded its execution budget.",
    "脚本超过执行时限。",
    "Check loops and callbacks. Add a bounded exit condition.",
    "检查循环与回调，添加明确的退出条件。",
  ],
  [
    "PROTOCOL_DEPENDENCY_MISSING",
    "Protocol",
    "A protocol definition import is missing.",
    "协议定义的依赖不存在。",
    "Upload the referenced proto file or its directory archive.",
    "上传被引用的 proto 文件或目录压缩包。",
  ],
  [
    "CAPACITY_UNAVAILABLE",
    "Scheduler",
    "The selected resource group cannot satisfy the load plan.",
    "所选资源组无法满足负载计划。",
    "Add workers, enable autoscaling or reduce the requested load.",
    "增加节点、开启弹性伸缩或降低目标压力。",
  ],
  [
    "WORKER_LOST",
    "Scheduler",
    "A worker stopped reporting a valid heartbeat.",
    "节点停止上报有效心跳。",
    "Inspect the worker and Pod events. The run is marked partial.",
    "检查节点与 Pod 事件，任务将标记为部分完成。",
  ],
  [
    "SLA_TRIGGERED",
    "Quality",
    "A configured performance target was exceeded.",
    "超过了已配置的性能目标。",
    "Review the triggering metric, service details and check results.",
    "检查触发指标、服务明细和检查点结果。",
  ],
  [
    "401",
    "HTTP",
    "The target requires valid authentication.",
    "目标需要有效认证。",
    "Review the environment credentials and token extraction.",
    "检查环境凭据与令牌提取。",
  ],
  [
    "429",
    "HTTP",
    "The target rejected requests due to rate limits.",
    "目标因限速拒绝了请求。",
    "Review target rate limits and the test load profile.",
    "检查目标限速规则与施压模型。",
  ],
  [
    "500",
    "HTTP",
    "The target returned an internal server error.",
    "目标返回内部错误。",
    "Inspect target application logs and correlate failed samples.",
    "检查目标应用日志并关联失败采样。",
  ],
  [
    "503",
    "HTTP",
    "The target is temporarily unavailable or overloaded.",
    "目标暂时不可用或已过载。",
    "Review capacity, connection pools and upstream dependencies.",
    "检查容量、连接池与上游依赖。",
  ],
  [
    "4",
    "gRPC",
    "The RPC deadline was exceeded.",
    "RPC 超过截止时间。",
    "Inspect service latency and the RPC deadline.",
    "检查服务时延与 RPC 超时设置。",
  ],
  [
    "14",
    "gRPC",
    "The RPC service is unavailable.",
    "RPC 服务不可用。",
    "Check the endpoint, transport and service availability.",
    "检查端点、连接与服务可用性。",
  ],
];
export function diagnosticsView() {
  return (
    heading(
      t("Diagnostics", "错误诊断"),
      t(
        "Understand engine, protocol and scheduling failures.",
        "了解引擎、协议和调度错误。",
      ),
    ) +
    `<div class="toolbar"><div class="search-input">${icon("search")}<input id="list-search" placeholder="${t("Search error codes…", "搜索错误代码…")}"></div></div><section class="panel">${table(
      [
        t("Code", "代码"),
        t("Source", "来源"),
        t("Description", "说明"),
        t("Resolution", "处理建议"),
      ],
      diagnosticCodes.map(
        ([code, source, en, zh, resEn, resZh]) =>
          `<tr data-search="${esc((code + " " + source + " " + en).toLowerCase())}"><td><span class="mono">${code}</span></td><td><span class="tag">${source}</span></td><td>${t(en, zh)}</td><td>${t(resEn, resZh)}</td></tr>`,
      ),
    )}</section>`
  );
}
