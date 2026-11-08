# Verification record

2026-11-08. Applies to the active Go Workspace (`studio/cmd/perfman`, `studio/console`) unless marked historical.

## Automated checks passed

- `go test -race ./...`: 23 top-level tests, including all seeded protocol scenario subtests. The nine earlier HTTP engine tests are retained alongside fourteen workspace tests.
- Workspace checks cover login/project isolation, roles and policies, secret masking/redaction, JavaScript assertions/timeouts/lifecycle, frozen dependencies, independent worker contexts, 70/30 script weights, regional capacity conservation/release, histogram aggregation, SLA protection, worker loss, terminal/audit, CSV/HAR, persistence, cron occurrence idempotence, JMX/WebSocket parsing and throughput caps.
- Added fixture invariants: historical point, endpoint and shard totals reconcile; standalone checks and iteration counts do not multiply by worker count.
- Stateful SQL mutations and Redis list/set behavior execute; SQL fixture rejects host database attachment. ZIP protocol uploads reject relative traversal and absolute paths.
- `go vet ./...` passed. Browser modules pass Node syntax checks.
- Actual runtime architecture passes structural validation: required modules/relations, valid bound arrows, styles and non-overlapping peer nodes. SVG/PNG was rendered and inspected.

## Observed browser workflows

At `http://127.0.0.1:8099`, signed in as Alex Morgan:

- Visited overview, scenario list/editor, run list/detail, all six resource tabs, projects, configuration, recording, schedules, alerts, comparison reports, settings and diagnostics at 1440px. No page JavaScript exceptions or document-level horizontal overflow during this sweep.
- Added `atlas-lab-01`, saved its address and invoked its resource probe through the console.
- Changed a scenario draft name, switched language and confirmed the draft survived. Switched private-network configuration to another editor tab and back; VPC input was preserved. Saved and started the scenario from the editor.
- English/Chinese navigation, page titles, buttons and run tabs switched correctly. Business names and script/engine output remain English by design.
- Latest measured management-flow example: `run_fd43f5ff82d87d`, Checkout journey, 120 logical VUs across three managed workers with targets 60/36/24. Completed/passed, 19,485 modeled requests, P95 82ms, zero request errors. Per-shard totals 9,742 + 5,846 + 3,897 = 19,485. Resource allocation returned to zero. Values vary between runs and are simulation results.
- Reran the scenario, opened a live Pod terminal, executed `cat run.json`, observed the frozen scenario, ended the session and verified `terminal.command` / `terminals.close` audit entries.
- Native workspace validation sent three actual loopback requests (200/200/201), all checks passed, and samples carried measured provenance and total timing.
- Created a named cron schedule, previewed the next five weekday executions in UTC, and paused it after saving.
- Authenticated Prometheus endpoint includes per-run totals, checks, latency statistics, shard counts and worker allocation metrics.
- At 390px, checked overview, scenarios/editor, run detail, resources/groups/nodes, configuration, settings and reports. Document width stayed 390px; wide tables scroll in their own containers.

Screenshots are in `docs/showcase/02-*` through `08-*`. The runtime diagram is in `docs/architecture/saas-runtime.*`.

## Limits of this validation

No remote agent, Kubernetes API, SSH server, external SQL/Redis/gRPC target, external email/webhook delivery, JVM/JMeter binary or million-connection benchmark was exercised. Default workers and protocol traffic are managed simulations. The native loopback HTTP path is covered by HTTP engine tests and workspace checks; these do not establish cloud load-generator capacity.

Dockerfile and Compose were added, but container startup was not verified because the local Docker daemon is not running. Native Go startup was verified and the local console is left running for inspection. No hosted site was published. Original Java services were not built or started.


## Documentation package

The submission README is available in English and Chinese. It embeds the implemented runtime, functional map and business-flow diagrams, with editable Excalidraw sources, SVG/PNG previews and evidence/validation contracts. Four workflow boards group actual application captures; raw screens, mobile/Chinese variants, a capture manifest and editable HTML layout are included.

Documentation checks validate active local links with filename case, PNG assets and all three diagram contracts. The visual package does not change application behavior or claim new external integrations.


## Go-only repository cleanup

Removed the fourteen retired Spring service directories, root Maven build, old SQL schemas, branding assets and Java setup guides. The current Go workspace remains independently runnable. Process settings are documented in the root `.env.example`; a separate configuration repository is not needed. Historical source is recoverable from Git history.

GitHub language statistics exclude documentation tools, generated visual material and the unused HTTP prototype UI. Actual Go and console sources remain classified under their real languages. Java source and Maven manifests are absent from the current repository tree. Documentation links and Git ignore rules were rechecked after cleanup.
