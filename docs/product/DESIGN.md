# PerfMan Studio design notes

The primary object is a business load test. The most prominent visual is its time series, rather than an infrastructure inventory or a marketing hero. Navigation follows the work: scenario → debug → run → compare.

## Visual tokens

- Canvas `#f5f7fb`, paper `#ffffff`, ink `#202d45`, muted `#718098`.
- Cobalt `#304cbd`: primary actions and throughput. Teal `#1b9f91`: latency. Amber: protective stop; red: failed quality gates.
- Avenir Next for Latin text with PingFang SC / Microsoft YaHei fallbacks; system monospace only for script bodies and identifiers.
- Main title 27px, section title 17px, body 14px, supporting metadata 11–12px. Dense tables are reserved for parallel records.
- 224px sidebar, 70px app bar, 36px workspace margins. One large chart and a narrow action rail lead the workspace. Editors use a request sequence and a sticky configuration rail.

## Review against the brief

An early generic KPI-dashboard arrangement was constrained to the four metrics that a test actually produces. No decorative fleet maps, fake CPU meters or fabricated region activity were added. The empty local workspace asks the user to run a scenario instead of filling charts with invented results.

The sidebar remains familiar enough for performance engineers; the distinguishing element is the full-width, labelled, dual-axis load chart with its actual sampling and source. Engine and distributed architecture details are on dedicated resource/design pages, while routine user paths describe requests, load and results.

## Interaction and accessibility

Controls use native buttons/inputs/selects, visible focus, labels and explicit empty/error states. Status and verdict carry text as well as color. Mobile navigation is user-triggered; tables scroll inside their container. Reduced motion is respected. The report comparison includes a print layout.

Local data is measured. The hosted showcase uses an explicit runtime selection and a persistent banner stating that data is synthetic and no load traffic is generated. An API failure never silently changes a local instance into showcase mode.
