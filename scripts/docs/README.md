# Documentation maintenance

The root READMEs follow a shared structure: quick start, role-based workflows, functional design, business flow, implemented architecture, screenshot boards, execution boundaries, storage and validation. English and Chinese reference the same visual assets.

## Validate before submission

From the repository root, with Node.js installed:

```sh
node scripts/docs/check-docs.mjs
git diff --check
```

The checker verifies active Markdown links, repository-relative paths with exact filename case, screenshot manifest entries, PNG dimensions and the three editable diagram contracts. It does not check remote URL availability or re-run application tests. Research documents are historical and are not part of this active-link check.

Generated SQLite databases, WAL files and `workspace.key` belong under ignored `studio/data/`; include source, tests, documentation and generated visual assets in a submission. The root `.dockerignore` also excludes runtime data from the image build context.

## Rebuild diagrams

Each diagram has an Excalidraw source, SVG, PNG, evidence model and validation contract. Node.js is sufficient for editable/vector generation. PNG rendering uses `rsvg-convert` from librsvg.

```sh
node scripts/architecture/generate-runtime.mjs
node scripts/architecture/generate-product.mjs
rsvg-convert docs/architecture/saas-runtime.svg -o docs/architecture/saas-runtime.png
rsvg-convert docs/design/feature-map.svg -o docs/design/feature-map.png
rsvg-convert docs/design/business-flow.svg -o docs/design/business-flow.png
node scripts/docs/check-docs.mjs
```

Inspect the rendered previews after structural validation. The implemented runtime is an as-is view. `solution-target` remains a separate proposal and must not be substituted for it in the root README.

## Refresh screenshots

The [capture manifest](../../docs/showcase/manifest.json) records routes and viewports, and the [gallery notes](../../docs/showcase/README.md#provenance-and-regeneration) describe capture and image provenance. Capture real pages after authentication; use synthetic records and keep environment secrets masked. A draft editor can be captured without saving a new record.

Rebuild the editable board layout from its manifest:

```sh
node scripts/docs/build-gallery.mjs
python3 -m http.server 8055 --bind 127.0.0.1 --directory docs/showcase
```

Open `http://127.0.0.1:8055/gallery.html` in a browser. Capture each board element at 3200 CSS pixels wide and device scale 1:

| Element ID | Output |
| --- | --- |
| `authoring` | `docs/showcase/01-authoring.png` |
| `execution` | `docs/showcase/02-execution.png` |
| `quality` | `docs/showcase/03-quality.png` |
| `operations` | `docs/showcase/04-operations.png` |

Wait for images and fonts to load before capturing. The layout is standalone HTML/CSS; no application code or frontend build is involved. Preserve raw captures in `docs/showcase/screens/` so full screens remain accessible when the board crops excess bottom content.

## Submission contents

- Root English/Chinese READMEs and the documentation index.
- Go workspace source, tests, module files, Dockerfile and Compose configuration.
- Implemented runtime, functional map and business-flow diagrams in all five formats.
- Four PNG boards, source screenshots, manifest, HTML layout and generators.
- API, implementation boundaries and the validation record.

No companion configuration repository is required. Process settings are documented in the root `.env.example`; workspace configuration lives in SQLite. The retired Spring configuration repository can remain untouched as a historical record.

## GitHub presentation

The root `.gitattributes` excludes documentation, diagram tools and the superseded HTTP prototype UI from language statistics. Actual Go sources and the bilingual console remain counted under their real languages. Generated diagram files are marked generated to keep code review focused on their generators. No JavaScript is reclassified as Go.

The classification rules follow [GitHub Linguist attribute overrides](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md). GitHub recalculates the language breakdown after processing the default-branch commit.
