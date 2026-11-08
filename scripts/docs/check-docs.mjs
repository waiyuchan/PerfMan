import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const documents = [
  "README.md",
  "README.zh.md",
  "docs/README.md",
  "docs/design/README.md",
  "docs/showcase/README.md",
  "docs/product/IMPLEMENTATION.md",
  "docs/product/API.md",
  "docs/product/VALIDATION.md",
  "scripts/docs/README.md",
];
const errors = [];
let links = 0;
function checkRelative(base, target, label) {
  if (/^(?:[a-z][\w+.-]*:|#)/i.test(target)) return;
  const relative = decodeURIComponent(target.split("#")[0]);
  if (!relative) return;
  if (path.isAbsolute(relative)) {
    errors.push(label + ": absolute path " + target);
    return;
  }
  const full = path.resolve(base, relative);
  if (!full.startsWith(root + path.sep)) {
    errors.push(label + ": path leaves repository " + target);
    return;
  }
  let current = root;
  for (const segment of path.relative(root, full).split(path.sep)) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
      errors.push(label + ": missing " + target);
      return;
    }
    const entries = fs.readdirSync(current);
    if (!entries.includes(segment)) {
      errors.push(label + ": missing or incorrectly cased " + target);
      return;
    }
    current = path.join(current, segment);
  }
  links++;
}
for (const file of documents) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    errors.push("Missing document " + file);
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  if (text.includes("/Users/") || text.includes("/var/folders/"))
    errors.push(file + ": contains machine-specific path");
  for (const match of text.matchAll(/\]\(([^\s)]+)\)/g))
    checkRelative(path.dirname(full), match[1], file);
}
const showcase = path.join(root, "docs/showcase");
const manifest = JSON.parse(
  fs.readFileSync(path.join(showcase, "manifest.json"), "utf8"),
);
const images = new Set();
for (const board of manifest.boards) {
  images.add(board.file);
  for (const screen of board.screens) images.add(screen.image);
}
for (const screen of manifest.additionalScreens) images.add(screen.image);
for (const file of images) {
  checkRelative(showcase, file, "Screenshot manifest");
  const full = path.join(showcase, file);
  if (!fs.existsSync(full)) continue;
  const bytes = fs.readFileSync(full);
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    errors.push(file + ": invalid PNG header");
    continue;
  }
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  if (width < 300 || height < 300)
    errors.push(file + ": screenshot is too small");
  if (manifest.boards.some((b) => b.file === file) && width !== 3200)
    errors.push(file + ": expected 3200px board width");
}
for (const stem of [
  "docs/architecture/saas-runtime",
  "docs/design/feature-map",
  "docs/design/business-flow",
]) {
  for (const suffix of [
    ".svg",
    ".png",
    ".excalidraw",
    "-model.json",
    "-contract.json",
  ])
    if (!fs.existsSync(path.join(root, stem + suffix)))
      errors.push("Missing diagram artifact " + stem + suffix);
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/architecture/validate-excalidraw.mjs",
        stem + ".excalidraw",
        stem + "-contract.json",
      ],
      { cwd: root, stdio: "pipe" },
    );
  } catch (error) {
    errors.push(
      stem +
        ": diagram validation failed\n" +
        String(error.stdout || error.message),
    );
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Documentation passed: ${documents.length} documents, ${links} local references, ${images.size} PNG assets, 3 editable diagram contracts.`,
);
