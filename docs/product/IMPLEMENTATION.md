# Go workspace implementation

The running entry point is `studio/cmd/perfman`, serving `studio/console`. The earlier HTTP-only implementation under `studio/web` is retained as a reference and its tests still run. This document describes the active application, rather than the earlier proposed end state.

| Area | Implemented behavior | Runtime boundary |
| --- | --- | --- |
| Identity / tenancy | Password login, persistent cookie sessions, four roles, project members, allow/deny policies scoped by projects and tags, audit | One organization/workspace per database; no OIDC, billing or cross-organization SaaS tenancy |
| Projects / configuration | Versioned CRUD, dependency checks, encrypted environment secrets, CSV/module/request/protocol/JMX/plugin file management | SQLite JSON entities; files are stored in entity payloads; no object store |
| Simple tests | Chained requests, headers/body, variables, JSONPath/regex extraction and checks | Native HTTP is restricted to bundled loopback target; default protocol traffic is simulated |
| Script tests | Goja JavaScript runtime; bundled ES modules; weighted entries; setup/default/teardown; timeout interruption; CSV partitioning; runtime metadata; logs and assertions | Isolated context per allocated worker and entry; bounded representative iterations, not one VM per VU |
| Protocol scenarios | HTTP, gRPC, WebSocket, Socket.IO, Protobuf, SQL, Redis, TCP, UDP | Managed fixtures; SQL runs actual statements in in-memory SQLite; Redis/socket state mutates; no external protocol connectivity; Protobuf codec is a JSON round trip |
| JMeter | JMX parsing; HTTP/TCP/WebSocket sampler plan; thread groups; CSV bindings; loop caps; ConstantThroughputTimer caps; response assertions; log switches | Supported subset, not JMeter compatibility certification; plugins are dependencies/metadata and are not executed; BeanShell/JSR223 rejected |
| Recording | HAR parsing, request filtering, managed checkout capture and conversion into an editable scenario | Managed capture invokes bundled target; no browser extension or remote traffic interception |
| Distributed scheduling | Per-region largest-remainder allocation, node capacity, group parallelism, queued admission, simulated scale-out, shards, leases/epochs, Pod lifecycle, start barrier, cancellation and resource release | Workers are independent managed contexts inside one Go process; no external agent protocol, cloud provisioning or Kubernetes calls |
| Resilience | Missing worker causes partial/inconclusive result; restart interrupts unfinished runs and releases allocations; immutable scene/file/environment bundles; idempotent run keys and schedule occurrences | Single controller; no leader election, replicated database, durable metric ingestion queue or transparent retry of side-effecting workloads |
| Monitoring / reports | Request/check totals, weighted histogram quantiles, window series, services/scripts/regions, samples, timing, logs, custom chart layout, baselines, JSON/CSV and print/PDF | Logical simulation metrics retain provenance; native timing is measured as a total; system CPU/memory figures are modeled |
| SLA / notifications | Consecutive-window rules, separate stop/notify flags, notification inbox, contacts, delivery attempts/retry, acknowledgements | External email/webhook channels are simulated; no outbound messages are sent |
| Schedules | Once/cron, IANA timezone, next-five preview, pause/resume, pinned scenario version, occurrence history and manual execution | Controller polls once per second while running; no catch-up of all missed occurrences after downtime |
| Operations / terminal | Groups/nodes/clusters/Pods, probe/drain/offline, capacity monitoring; terminal sessions, ownership, expiry, virtual filesystem and audited commands | Backend-owned simulator; no host shell, SSH, Kubernetes exec or arbitrary command execution |
| Localization | English default; Chinese switch; status/error/form/navigation translations; persisted language preference | Business fixture names, user-entered content, script logs and technical identifiers remain in their original language |

## Source map

- `workspace.go`: persistence, sessions, authorization, CRUD and API dispatch.
- `workspace_policy.go`: scoped allow/deny policy evaluation, CSV and cluster initialization.
- `workspace_scheduler.go`: schedules, allocation, run state machine, SLA, notifications and terminal.
- `workspace_engine.go`: request fixtures, extraction/checks, modules, lifecycle and native HTTP adapter.
- `workspace_protocols.go`, `workspace_jmeter.go`, `workspace_assets.go`: stateful fixtures, JMX and protocol bundles.
- `workspace_series.go`, `workspace_metrics.go`: per-worker collection, series and scoped metrics export.
- `console/`: business pages, editors, localization and interaction state.

## Architecture choices

A modular Go monolith keeps authoring, scheduling and reporting transactional and locally reproducible. SQLite holds entities and sessions. The encryption key is a separate filesystem artifact. Runs freeze scenario, files and encrypted environment values at admission; report reads cannot expose private bundles.

The scheduler reserves capacity before creating Pods and releases a start barrier after readiness. A worker has its own script context and CSV partition. Request counts are split as integer budgets and histogram buckets are combined before quantiles. Losing a shard cannot silently produce a passed report. Completed allocations are returned to their group.

This is a working single-controller solution for exploring and demonstrating the complete management flow. To run real distributed load, first extract an explicit worker command/result contract from the managed allocation and collection boundaries, then add authenticated agents with durable ingestion and cancellation acknowledgements. A real Kubernetes/SSH/JMeter provider must be implemented before advertising those execution capabilities. The earlier `solution-target` diagram records that broader proposal; `saas-runtime` records the implemented runtime.

The former Spring Cloud configuration repository was used as migration context. Discovery and Spring Config are unnecessary for this single-process deployment. Environment variables configure the process; environments/files/policies are versioned domain entities. The sibling configuration repository includes a Go environment example without changing its legacy Spring settings.
