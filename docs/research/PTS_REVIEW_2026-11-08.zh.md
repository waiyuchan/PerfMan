# PTS 逐项核查与 PerfMan 功能设计

2026-11-08。本文依据用户给出的控制台文档目录逐项核查，覆盖原生场景、脚本协议与工具、JMeter、项目、场景、录制、配置、定时任务、报告、访问、告警、标签及错误诊断。

**这是调研和目标设计，不是实现完成清单。** 当前仓库 `studio/` 只实现了较早的单机 HTTP 原型。它不足以代表用户要求的整套 solution。扩大后的正式范围见 [解决方案设计](../product/SOLUTION_SPEC.zh.md)。

## 核查方法与证据边界

- 已读取相应官方功能文档正文；来源清单保存在 `pts-sources.json`，包含具体 URL、标题与核查主题。
- 已在浏览器查看文档所附的简单模式、脚本编辑器、JMeter 文件区、施压/RPS 调整、报告、文件管理、环境管理、定时任务和告警联系人截图。
- 未登录腾讯云账号，未实操付费控制台，未创建云端资源。因此“官方 UI”指公开文档与截图所显示的交互，不包括未公开的实时控件、后台实现或账号权限差异。
- PTS 功能描述不等于兼容性承诺；本方案定义 PerfMan 自己的接口与适配层，不照搬腾讯云私有 `pts/*` API 后声称兼容。
- 底层 SSM/Spring Cloud 替换为 Go；JMeter 执行器本身仍然依赖 JVM，Go 控制端不能消除 JMeter 的 Java 运行时。

## 一、简单模式与脚本模式

| 功能 / 官方依据 | 官方交互与关键语义 | PerfMan 页面及实现设计 | 可验收结果 |
| --- | --- | --- | --- |
| [简单模式](https://cloud.tencent.com/document/product/248/87316) | 左侧有序请求列表，右侧请求详情；参数、认证、头、检查点、变量分区；提供脚本视图 | “新建场景”选择简单模式。支持 GET/POST/PUT/PATCH/DELETE/HEAD；请求体、query、认证、提取/断言分开编辑。Go 编译为执行计划 | 登录提取 token，后续请求引用；拖动顺序影响执行；不合法变量阻止启动 |
| [脚本结构](https://cloud.tencent.com/document/product/248/87318) | 代码编辑器、脚本标签、模板侧栏，保存/调试/运行；global/setup/default/teardown 生命周期不同 | 真正的 JS 编辑器与文件树。Go 管理脚本 bundle；原生脚本引擎有独立受限运行环境，按 adapter 声明生命周期。简单模式先生成只读脚本；转换后创建新版本 | 代码修改会影响执行；语法错误有行列；setup/default/teardown 日志有阶段；不再拿 JSON 表单当脚本模式 |
| [脚本示例/基础语法](https://cloud.tencent.com/document/product/248/126071) | 变量、函数、条件、循环、错误处理、数组逻辑 | 协议与业务模板库，插入模板后可编辑；运行时设置 CPU/时间/内存上限 | 条件分支能改变请求路径；死循环可中止；错误落到脚本日志 |
| [HTTP](https://cloud.tencent.com/document/product/248/87324) / [选项](https://cloud.tencent.com/document/product/248/87325) | URL、query、body、头、Basic Auth、超时等 | 简单模式表单和脚本 API 共用 HTTP adapter；连接复用/超时来自冻结选项；采集 DNS、连接、TLS、发送、等待、接收耗时 | 请求参数实际到达被测服务；超时与断言错误分开；采样有分阶段耗时 |
| [gRPC](https://cloud.tencent.com/document/product/248/87326) | 上传 proto；load/connect/invoke/close；服务/方法与消息结构有依赖 | 模板 + proto 依赖树 + service/method 选择 + JSON 消息。Go gRPC adapter 动态加载描述符，区分 gRPC status 与 HTTP status | 正确方法返回消息；未知方法、缺协议、超时分别可诊断 |
| [Protobuf](https://cloud.tencent.com/document/product/248/87327) | 是序列化能力，依赖 proto/import；不等于一种网络传输 | 协议资产管理、message 类型选择、编码/解码工具；可组合 HTTP/TCP/gRPC | marshal/unmarshal 往返一致；缺少 import 启动失败；保留文件路径结构 |
| [WebSocket](https://cloud.tencent.com/document/product/248/87328) | 连接存活、事件监听、发消息、ping/pong、关闭；不是普通 HTTP 迭代 | 脚本模板和连接配置；独立 connection/message 指标，不将消息数混同 HTTP 请求数 | 连接→收发→ping→关闭能完整执行；有连接数、消息速率、消息时延和错误 |
| [多脚本](https://cloud.tencent.com/document/product/248/87332) | 多入口按权重分配，0 权重作为禁用/公共模块，脚本间上下文独立 | 左侧文件树带权重；总权重校验；最大余数法分配整数负载，保证总量守恒；公共模块不施压 | 70/20/10 的负载分配可见；100 VU 不因四舍五入变多；全部权重 0 拒绝运行 |
| [SQL](https://cloud.tencent.com/document/product/248/108702) | 数据库连接、query/exec、绑定参数、VU 内连接复用 | 数据库连接引用环境 secret，展示结果行/影响行；Go `database/sql` adapter 控制连接池并明确事务边界 | 合成库上 SELECT/INSERT/UPDATE 可验证；影响行数可断言；连接和查询错误可区分 |
| [Socket.IO](https://cloud.tencent.com/document/product/248/93015) | 事件、ack、namespace、polling/websocket；不能用裸 WS 冒充 | 独立 Socket.IO adapter，模板配置 transport、namespace、event、ack 超时 | 事件与 ack 往返成立；protocol/transport 标签可见；可模拟断线重连 |
| [TCP/UDP](https://cloud.tencent.com/document/product/248/93016) | 原始连接、字节发送/接收；TCP 需消息边界，UDP 不保证交付 | 连接、编码、读长度/分隔符、deadline、消息校验配置。Go `net` adapter | TCP 分片不造成错误拼包；UDP 超时/丢包独立统计；展示收发字节 |
| [Redis](https://cloud.tencent.com/document/product/248/116986) | 客户端与 KV/list/hash/set 命令，连接复用 | Redis adapter + 环境认证引用 + 命令模板；按 command 分组统计 | SET/GET/DEL 返回值可检查；连接超时和命令错误分开 |
| [检查点](https://cloud.tencent.com/document/product/248/87329) | 可独立于请求；一请求多检查点；200 也可检查失败 | 检查点 builder：状态/JSONPath/regex/包含/数值比较；单独 CheckResult 与指标，关联 sampleId 可选 | 请求失败率与检查点失败率分别显示；业务断言错误不会伪装成网络错误 |
| [三方包](https://cloud.tencent.com/document/product/248/87330) | 远程 JS 模块是受限制能力，不等于 Node/npm，也不保证任意包兼容 | bundle 构建阶段解析依赖、校验哈希、锁定版本；可模拟 registry，真实适配明确允许的模块与兼容语法 | 引用包真实参与脚本计算；缺模块/不兼容提前失败；执行时不临时依赖公网下载 |
| [全局 Options](https://cloud.tencent.com/document/product/248/87331) | HTTP/WS/TLS 参数、setup/teardown timeout | “高级配置”与脚本 option 一致；显示值来源与优先级；adapter 不支持的配置拒绝而非忽略 | 改 timeout 产生可观测效果；TLS/连接复用配置进入运行快照 |
| [运行时元数据](https://cloud.tencent.com/document/product/248/111746) | 用户、场景、任务、地域等引擎上下文 | Go 注入 org/project/scenario/version/run/shard/region/worker/VU/iteration | 日志、采样、指标可按上下文关联；跨 VU 变量不串用 |

## 二、JMeter 模式

| 功能 / 官方依据 | 官方交互与关键语义 | PerfMan 页面及实现设计 | 可验收结果 |
| --- | --- | --- | --- |
| [JMeter 模式](https://cloud.tencent.com/document/product/248/87334) | 以文件管理为主，JMX 必选，CSV/JAR/properties 等可选，设置入口后运行 | 独立 JMeter 模式：文件列表、主 JMX、解析摘要、引擎/JDK 版本、插件清单。Go 拉起隔离容器，不在控制端解释任意 JMX 为伪 HTTP | 可导入/解析 JMX；缺入口或依赖启动失败；报告显示 JMeter 引擎来源 |
| [RPS 限制](https://cloud.tencent.com/document/product/248/87335) | Constant Throughput Timer 使用每分钟单位；分布式全局与单机限速不同 | UI 显示目标 req/s、换算 req/min、作用域；预览各 shard/group 的预算与 JMX 覆盖策略 | 1 req/s 对应 60/min；拆分后总预算不倍增；资源不够时报告欠压 |
| [CSV 参数](https://cloud.tencent.com/document/product/248/87336) | 表头/显式变量名，JMX 本地文件路径映射到上传文件；多引擎可切分 | CSV 预览、变量名、编码、循环/耗尽行为、split 开关、分片预览 | `${name}` 实际变化；切分不重用其他分片行；路径映射可核对 |
| [多线程组](https://cloud.tencent.com/document/product/248/87337) | 并行/串行语义不同；串行需循环退出；setUp/tearDown 不应被主负载覆盖 | 线程组表：原值/覆盖值、比例、顺序、循环次数；总负载预览与 group 明细 | 串行组能轮转；并行总负载守恒；展示每组执行结果 |
| [WebSocket 插件](https://cloud.tencent.com/document/product/248/103800) | 需要适配的 WebSocket sampler 插件与指标埋点；官方文档有特定版本说明 | 插件依赖版本管理与采样映射，不声明任意 JAR 即兼容；模拟 provider 输出相应 sampler 事件 | 缺插件明确失败；open/read/write/close 事件和指标可查看 |
| [请求与断言日志](https://cloud.tencent.com/document/product/248/107649) | 请求可在 PostProcessor 获取，断言结果要在 Listener 阶段；高日志量影响性能 | 请求日志/检查点日志分源、分级、采样；解析 JTL 或监听器输出；脱敏与截断 | 请求成功但断言失败可解释；日志丢弃量可见；不因高日志量拖死控制端 |

注意：JMeter 是一个执行器生态。完整 Go 化是管理/调度/采集与适配层改为 Go，不意味着重写全部 JMeter 或移除 JVM。

## 三、项目、场景、配置与运行

| 功能 / 官方依据 | 官方交互与关键语义 | PerfMan 页面及实现设计 | 可验收结果 |
| --- | --- | --- | --- |
| [项目创建](https://cloud.tencent.com/document/product/248/87351) / [编辑删除](https://cloud.tencent.com/document/product/248/87352) | 项目名、描述、标签，项目下管理场景；删除涉及子资源 | 项目列表/详情、成员、标签；归属由服务端校验；软删除加依赖与运行检查 | 不能跨项目猜 ID；运行中项目不可静默删除；审计记录保留 |
| [场景概述](https://cloud.tencent.com/document/product/248/87313) | 简单/脚本/JMeter 三入口，共享负载与报告 | 场景列表、搜索、模式、环境、最近运行、调试状态；模式类型持久化 | 三入口进入不同编辑器；同一场景历史版本可查 |
| [负载](https://cloud.tencent.com/document/product/248/87314) | VU 阶梯、RPS 起始/最大值、持续时间、实时调 RPS | 独立 LoadSpec，曲线编辑，run override 有版本事件；RPS 模型记录目标/实际/欠压 | 调压变更传播到分片；超最大值拒绝；VU 不冒充 RPS |
| [多地域/网络](https://cloud.tencent.com/document/product/248/87314) | 地域百分比、公网/VPC/子网与资源容量约束 | 地域分配表，公共/私有网络字段，资源组引用与可达性检查；每区域有 shard | 比例合计 100%，整数分配守恒；不可用区域资源不足有诊断 |
| [弹性资源](https://cloud.tencent.com/document/product/248/87309) | 按负载申请资源、准备后启动、运行后回收 | 容量计划→Pod 申请→Ready barrier→任务执行→清理/保留策略；provider 可模拟 | 增压可扩 Pod；失败和取消会释放配额；清理失败进入可重试状态 |
| [CSV 参数文件](https://cloud.tencent.com/document/product/248/87340) | 表头/指定列名；每迭代取行；多文件组合；分片/循环/耗尽 | 项目文件库 + 场景文件绑定与数据策略，冻结文件 hash；预览每分片切片 | 列名冲突拒绝；多文件按约定组合；耗尽可停止，不静默空值 |
| [请求文件](https://cloud.tencent.com/document/product/248/87341) | 上传内容、证书等，按路径读取文本或二进制 | 文件类型、内容 hash、大小限制、关联场景、执行 bundle 读取 | 上传的内容真的进入请求；证书与正文不随报告泄露 |
| [协议文件](https://cloud.tencent.com/document/product/248/87342) | proto/jce 与依赖目录；压缩包展开需保留 import | 目录树/依赖校验/文件版本；ZIP 解压大小、路径与深度有约束 | 缺依赖启动前失败；无路径穿越；历史 run 引用固定版本 |
| [SLA](https://cloud.tencent.com/document/product/248/87348) | 多指标、聚合、比较、阈值、接口范围；可停止与通知 | SLA 规则表支持 request/check/latency/RPS；作用域、窗口/连续次数、stop/notify 分开 | 只告警不停压成立；指定接口能独立越限；触发值/规则/动作结果可查 |
| [DNS](https://cloud.tencent.com/document/product/248/87344) | 自定义域名解析 | 高级网络配置 hosts 表；作用域仅当前任务，保留 TLS SNI/Host 语义 | 解析覆盖可追溯；不修改宿主 hosts；DNS 失败可诊断 |
| [指标导出](https://cloud.tencent.com/document/product/248/87346) / [指标契约](https://cloud.tencent.com/document/product/248/87347) | Prometheus 目标与连通性检查、Grafana、多维标签/指标 | 集成配置、真实/模拟探测、/metrics、remote-write adapter/outbox；导出失败不抹去内部报告 | 测试连接与投递分别记录；region/run/step/check 可查询；丢弃/重试可观测 |
| [响应提取](https://cloud.tencent.com/document/product/248/87315) | JSONPath、regex，调试时可试表达式，供检查和后续变量 | 提取工具面板，原始响应→表达式→结果/错误；有明确 fallback 与缺值策略 | 支持嵌套与数组路径；提取失败明确；不再局限顶层字段 |
| [复制场景](https://cloud.tencent.com/document/product/248/87349) | 同项目复制完整配置后修改名称 | 克隆场景配置与文件引用，生成新 ID/version，保留来源 | 参数/SLA/脚本均复制；历史不迁移成新场景运行 |
| [调试](https://cloud.tencent.com/document/product/248/87354) | 请求/响应、耗时瀑布、提取器工具、日志、脚本快照 | 独立 Debug drawer/modal，单次低负载执行，不占正式性能基线 | UI 展示真实/模拟来源；可定位哪一步/检查失败；退出能取消 |
| [文件管理](https://cloud.tencent.com/document/product/248/136041) | 项目级文件库，参数/协议/请求三类，关联、预览、下载、解除引用后删除 | 文件中心与场景引用表，软删除+固定 hash；JMeter 额外入口/插件资产 | 引用中禁止删除；跨项目不可引用；可预览 CSV 与验证主文件 |
| [环境管理](https://cloud.tencent.com/document/product/248/102280) | 项目级多环境、变量、加密值保存后不展示明文 | 环境表 + SecretStore；修改加密变量时留空代表不改；启动时注入且日志脱敏 | test/prod 切换实际改变变量；只读用户读不到密钥；run 只保存摘要与 secret version |

## 四、录制、计划、报告与治理

| 功能 / 官方依据 | 官方交互与关键语义 | PerfMan 页面及实现设计 | 可验收结果 |
| --- | --- | --- | --- |
| [浏览器录制](https://cloud.tencent.com/document/product/248/87366) | 起始页、URL/类型过滤，插件录制后筛选并生成场景 | 录制会话列表；内置合成业务录制、HAR 导入、可选浏览器扩展；过滤/排除敏感头后生成场景 | 一次浏览→选请求→生成场景→调试→运行；普通网页不能假装监听其他标签页 |
| [GoReplay 实践](https://cloud.tencent.com/document/product/248/104709) | 官方示例通过 GoReplay 将请求转换为 CSV，再由 PTS 回放 | 作为可选录制导入 adapter，明确接受格式与回放时序；不混同 HAR | 导入失败可定位行；过滤后数量与回放量可核对 |
| [定时压测](https://cloud.tencent.com/document/product/248/87367) | 场景、一次/日/周/cron、未来执行时间预览、联系人；官方有场景编辑限制 | 计划表、IANA 时区、最近/未来执行、启停、立即执行、历史；固定不可变场景版本，避免锁住整个场景 | 预览 5 次；服务重启不重复触发；错过/重叠策略可见；结果链接正确 |
| [报告](https://cloud.tencent.com/document/product/248/87355) | 概览/服务/检查点/脚本/多维分析/施压机/采样，实时与历史同一对象 | Run 详情七个 tab，指标筛选/聚合/图表增删、维度对比，保存个人布局 | 七视图都有数据与联动；不是只有一张 RPS 折线图 |
| [下载报告](https://cloud.tencent.com/document/product/248/93116) | 完成后从历史报告下载 | PDF 打印/导出、CSV、JSON bundle；包含上下文、质量与缺失分片说明 | 离线结果可读；文件不包含密钥；未完成不能伪装完整报告 |
| 性能基线与对比 | 官方概述提出历史基线与多指标对比 | 基线标记、环境/引擎/脚本/负载签名、并列趋势和差异，支持相同条件重复运行 | 环境不同/零基线/缺失数据提示；不会把参数差异直接判成回归 |
| [访问概述](https://cloud.tencent.com/document/product/248/87357) / [授予](https://cloud.tencent.com/document/product/248/87358) / [语法](https://cloud.tencent.com/document/product/248/87359) | 用户/组/角色、默认读写/只读、自定义资源和标签策略，默认拒绝 | PerfMan 原生用户/角色/项目成员 + action/resource/tag 策略；服务端统一鉴权，不伪接 CAM | 观察者不能执行；运维可 SSH 而不能管理用户；标签/项目权限对 API 生效 |
| [联系人](https://cloud.tencent.com/document/product/248/93118) | 项目联系人组、渠道、企业消息机器人/Webhook | 联系人组、邮箱/Webhook/站内渠道、连接测试、投递队列与模拟收件箱 | SLA/计划开始结束生成通知；失败可重试；模拟发送与实际发送分别标识 |
| [告警历史](https://cloud.tencent.com/document/product/248/93119) | 场景/任务/触发时间/规则/当前值/停止动作/通知结果可筛选 | 告警列表与详情，关联 run/SLA/recipient；动作执行与消息投递分别追踪 | 用户能看“为何停、停了吗、谁收到、发送失败怎么处理” |
| [标签](https://cloud.tencent.com/document/product/248/87361) / [绑定](https://cloud.tencent.com/document/product/248/87363) / [过滤](https://cloud.tencent.com/document/product/248/87364) | 键值分类，可筛选并用于策略 | 标签定义、项目/场景/资源绑定、筛选 chips、策略匹配 | 绑定后能筛选；访问约束服务端生效；大小写规则明确 |
| [错误诊断](https://cloud.tencent.com/document/product/248/87368) | 引擎错误与 HTTP/gRPC 原生码分开，需看详情 | 错误码浏览器 + 请求详情链接，显示 phase/protocol/engineCode/nativeCode/message/retryable | DNS/超时/连接重置/断言/调度容量错误都有具体上下文 |

## 五、用户新增的资源管理与运维范围

以下是用户指定的 PerfMan 能力，不假称腾讯云公开目录里已有相同页面。

| 功能 | 页面与状态 | Go 实现边界 | 验收 |
| --- | --- | --- | --- |
| 登录与首次初始化 | 登录、初始管理员、语言选择、会话、退出、密码重置 | 哈希凭据、可撤销会话、权限过滤、审计；模拟账户也通过相同 API | 未登录不能读取状态；撤销会话立即失效 |
| 资源接入 | 添加资源：名称/provider/地域/地址/认证引用/容量/标签；探测与接入结果分别显示 | ResourceProvider；模拟资源接受/拒绝/离线可配置；真实 provider 独立探测 | 添加资源能经历 pending→probing→ready/error，不是点完永远成功 |
| 资源组 | 节点成员、容量、地域、引擎标签、弹性 min/max、调度策略 | 配额/排空/保留/租约；调度依赖组的有效容量与匹配标签 | 下线成员不再接新任务；活跃任务按策略完成或受控中止 |
| 集群与 Pod | 集群/namespace/节点；Pod 列表、事件、状态、重启、日志 | Provider CRUD、Job/Pod 生命周期与清理；模拟 provider 也保存对象和版本 | 运行时创建的 Pod 能查到；结束后清理；故障导致 run partial/failed |
| 调度总览 | 队列、run→region→shard→worker→pod 的拓扑、时间线、资源组负载 | 单一调度事实；lease/epoch/heartbeat/barrier/幂等状态转移 | 同一分片不被两个 owner 当作有效终结；任务失败原因可追溯 |
| 组监控 | 组/节点/Pod/任务维度、CPU/内存/网络、目标与实际压力、等待/失败/活跃任务 | 实际采集与合成 provider 时序分来源；非真实监控不得标实测 | 模拟负载变化能驱动 Pod/容量/指标；不是随机数字卡片 |
| SSH / 容器终端 | 资源详情→终端；会话身份/节点/过期时间/连接状态、命令历史与审计 | TerminalGateway；模拟命令在虚拟文件系统和资源模型执行，不调用宿主 shell；真实 SSH/K8s exec 独立 adapter | 可在虚拟 Pod 内查看 hostname/ps/logs/config；无法执行的命令明确反馈；退出/超时回收 |
| 中英文 | 登录和全局选择、用户偏好、日期/时区/数字 | 稳定 i18n key，API 返回 code+params；资源名/用户脚本不自动翻译 | 所有系统页面与空/错态可切换；报告可选语言；切换不丢编辑内容 |

## 六、哪些设计必须纠正

1. “有菜单”不算实现：每项都要有输入→服务端校验→持久状态→执行/模拟副作用→可见结果→失败路径。
2. 脚本与 JMeter 不能退化成一个 JSON textarea；协议不能只有一个下拉选项。
3. 检查点与请求结果、目标压力与实际压力、停止请求与已停止流量、运行完成与性能通过必须分别记录。
4. 模拟必须位于 provider/engine/transport 边界；登录、权限、项目、文件、计划、调度、报告和审计都是后端真实状态。
5. SSH 入口不是宿主机任意命令执行按钮；模拟终端也要有节点上下文、虚拟文件系统、命令效果和会话审计。
6. 百万并发可作为逻辑计划模拟，不得创建百万 goroutine 或冒充本机实际发出了百万连接。
7. 真实扩展保持 Go 服务端与领域模型，替换 provider/adapter 即可；静态网页 localStorage 模拟不能代表整套 solution。

## 七、实施状态

| 范围 | 本轮状态 |
| --- | --- |
| 官方目录与关键子项调研 | 已完成本文所列公开文档核查 |
| 典型官方 UI 核查 | 已查看上述九类文档附图；未登录控制台 |
| 完整目标 UI、领域、调度与模拟边界设计 | 配套 SOLUTION_SPEC 与架构图 |
| 原型工作台 | 早期 HTTP 版本可运行，不能用来宣称全功能完成 |
| 登录/多语言/多协议/资源组/终端等完整实现 | 待按新设计实现与验收 |

用户要求先逐项研究再确定实现，因此本轮不把尚未完成的功能包装成已交付。正式交付的完成标准以 [SOLUTION_SPEC](../product/SOLUTION_SPEC.zh.md) 的端到端路径和能力清单为准。
