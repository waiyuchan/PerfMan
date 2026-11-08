# PerfMan documentation

Start with the [project README](../README.md) ([中文](../README.zh.md)) for installation, accounts, workflows, diagrams and screenshots. The active entry point is `studio/cmd/perfman`; its console lives in `studio/console`.

## Product and experience

| Document | Purpose |
| --- | --- |
| [Functional and workflow design](design/README.md) | Nine product domains, twelve-step business flow and run lifecycle |
| [Functional map](design/feature-map.svg) | Authoring, orchestration, quality and operations capability groups |
| [Business flow](design/business-flow.svg) | Sign-in → authoring → admission → execution → results |
| [Screenshot gallery](showcase/README.md) | Four workflow boards, individual screens, mobile/Chinese views and capture provenance |
| [Implementation matrix](product/IMPLEMENTATION.md) | Current feature behavior, simulator boundaries and extension points |
| [Workspace API](product/API.md) | Session, authoring, execution, operations and metrics endpoints |
| [Verification record](product/VALIDATION.md) | Automated checks and observed browser flows |

## Architecture and editable assets

| View | Preview | Editable source | Evidence / contract |
| --- | --- | --- | --- |
| Implemented runtime | [SVG](architecture/saas-runtime.svg) · [PNG](architecture/saas-runtime.png) | [Excalidraw](architecture/saas-runtime.excalidraw) | [Model](architecture/saas-runtime-model.json) · [Contract](architecture/saas-runtime-contract.json) |
| Functional design | [SVG](design/feature-map.svg) · [PNG](design/feature-map.png) | [Excalidraw](design/feature-map.excalidraw) | [Model](design/feature-map-model.json) · [Contract](design/feature-map-contract.json) |
| Business flow | [SVG](design/business-flow.svg) · [PNG](design/business-flow.png) | [Excalidraw](design/business-flow.excalidraw) | [Model](design/business-flow-model.json) · [Contract](design/business-flow-contract.json) |

The runtime diagram is the source for deployment claims. It shows one Go controller with managed in-process workers and SQLite. Functional groups and business steps are separate views, with the same execution boundary.

[Documentation maintenance](../scripts/docs/README.md) covers diagram regeneration, screenshot layout and local asset checks. All README images use repository-relative paths so they work after GitHub submission.

## Research, proposals and history

| Document | Status |
| --- | --- |
| [PTS feature review](research/PTS_REVIEW_2026-11-08.zh.md) | Reference research across 53 official documentation pages |
| [PTS source inventory](research/pts-sources.json) | Source links and review evidence |
| [Expanded solution specification](product/SOLUTION_SPEC.zh.md) | Requirements and target design, not a completion checklist |
| [Future target architecture](architecture/solution-target.svg) | Proposal for separate agents, external providers and storage |
| [Earlier UI wireframes](design/solution-wireframes.svg) | Design exploration; use actual screenshots for current UI |
| [Original Java instructions](legacy/README.md) · [中文](legacy/README.zh.md) | Archived Spring Cloud setup for migration reference |

The older `DEMO`, `REDESIGN`, `studio-runtime` and `distributed-target` artifacts describe the earlier HTTP-only scope. They remain as historical records. No standalone hosted showcase is deployed; screenshots come from the local Go application.
