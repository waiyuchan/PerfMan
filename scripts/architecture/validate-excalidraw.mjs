#!/usr/bin/env node

import fs from "node:fs";

function usage() {
  console.error(
    "Usage: node validate-excalidraw.mjs <diagram.excalidraw> [contract.json]",
  );
  process.exit(2);
}

const [, , diagramPath, contractPath] = process.argv;
if (!diagramPath) usage();

function loadJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`${label} could not be parsed: ${error.message}`);
    process.exit(2);
  }
}

const doc = loadJson(diagramPath, "diagram");
const contract = contractPath ? loadJson(contractPath, "contract") : {};
const errors = [];
const warnings = [];

function error(code, message, context = {}) {
  errors.push({ code, message, ...context });
}

function warning(code, message, context = {}) {
  warnings.push({ code, message, ...context });
}

if (doc.type !== "excalidraw" || !Array.isArray(doc.elements)) {
  error("STRUCTURE", "document must be an Excalidraw object with an elements array");
}

const elements = Array.isArray(doc.elements) ? doc.elements.filter((e) => !e.isDeleted) : [];
const ids = new Set();
for (const element of elements) {
  if (!element.id) {
    error("MISSING_ID", "element has no id", { type: element.type });
    continue;
  }
  if (ids.has(element.id)) {
    error("DUPLICATE_ID", `duplicate element id: ${element.id}`);
  }
  ids.add(element.id);
}

const texts = elements.filter((element) => element.type === "text");
const rects = elements.filter((element) => element.type === "rectangle");
const arrows = elements.filter((element) => element.type === "arrow");
const byId = new Map(elements.map((element) => [element.id, element]));

for (const text of texts) {
  if (!String(text.text ?? "").trim()) {
    error("EMPTY_TEXT", `empty text element: ${text.id}`, { id: text.id });
  }
}

for (const arrow of arrows) {
  for (const side of ["startBinding", "endBinding"]) {
    const targetId = arrow[side]?.elementId;
    if (targetId && !ids.has(targetId)) {
      error("INVALID_BINDING", `${arrow.id}.${side} points to missing ${targetId}`, {
        id: arrow.id,
        targetId,
      });
    }
  }
  if (contract.requireBoundArrows && (!arrow.startBinding || !arrow.endBinding)) {
    error("UNBOUND_ARROW", `${arrow.id} must bind both endpoints`, { id: arrow.id });
  } else if (!arrow.startBinding || !arrow.endBinding) {
    warning("UNBOUND_ARROW", `${arrow.id} has an unbound endpoint`, { id: arrow.id });
  }
}

function textByLabel(label) {
  return texts.find((element) => element.text === label);
}

function rectByLabel(label) {
  const labelElement = textByLabel(label);
  if (!labelElement) return null;
  const groups = new Set(labelElement.groupIds ?? []);
  const candidates = rects.filter((rect) =>
    (rect.groupIds ?? []).some((groupId) => groups.has(groupId)),
  );
  return candidates.sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;
}

for (const label of contract.requiredLabels ?? []) {
  if (!textByLabel(label)) {
    error("MISSING_LABEL", `required label is absent: ${label}`, { label });
  }
}

for (const label of contract.forbiddenLabels ?? []) {
  if (texts.some((element) => String(element.text).includes(label))) {
    error("FORBIDDEN_LABEL", `forbidden label is present: ${label}`, { label });
  }
}

for (const rule of contract.styleRules ?? []) {
  const rect = rectByLabel(rule.label);
  if (!rect) {
    error("STYLE_TARGET_MISSING", `style target is absent: ${rule.label}`, {
      label: rule.label,
    });
    continue;
  }
  for (const property of [
    "strokeColor",
    "backgroundColor",
    "strokeStyle",
    "strokeWidth",
  ]) {
    if (rule[property] !== undefined && rect[property] !== rule[property]) {
      error(
        "STYLE_MISMATCH",
        `${rule.label}.${property}: expected ${rule[property]}, got ${rect[property]}`,
        { label: rule.label, property },
      );
    }
  }
}

for (const relation of contract.requiredRelations ?? []) {
  const from = rectByLabel(relation.from);
  const to = rectByLabel(relation.to);
  if (!from || !to) {
    error(
      "RELATION_TARGET_MISSING",
      `relation target missing: ${relation.from} -> ${relation.to}`,
      relation,
    );
    continue;
  }
  const found = arrows.some(
    (arrow) =>
      arrow.startBinding?.elementId === from.id &&
      arrow.endBinding?.elementId === to.id,
  );
  if (!found) {
    error(
      "RELATION_MISSING",
      `required relation is absent: ${relation.from} -> ${relation.to}`,
      relation,
    );
  }
}

function intersects(a, b) {
  return (
    Math.max(a.x, b.x) < Math.min(a.x + a.width, b.x + b.width) &&
    Math.max(a.y, b.y) < Math.min(a.y + a.height, b.y + b.height)
  );
}

for (const labels of contract.overlapSets ?? []) {
  const peers = labels
    .map((label) => ({ label, rect: rectByLabel(label) }))
    .filter((entry) => entry.rect);
  for (let i = 0; i < peers.length; i += 1) {
    for (let j = i + 1; j < peers.length; j += 1) {
      if (intersects(peers[i].rect, peers[j].rect)) {
        error(
          "OVERLAP",
          `peer nodes overlap: ${peers[i].label} and ${peers[j].label}`,
          { labels: [peers[i].label, peers[j].label] },
        );
      }
    }
  }
}

if (Array.isArray(contract.palette)) {
  const palette = new Set(contract.palette);
  for (const element of elements) {
    for (const property of ["strokeColor", "backgroundColor"]) {
      const value = element[property];
      if (value !== undefined && !palette.has(value)) {
        error(
          "PALETTE",
          `${element.id}.${property} uses undeclared color ${value}`,
          { id: element.id, property, value },
        );
      }
    }
  }
}

if (contract.canvas) {
  const { width, height, strictBounds = false } = contract.canvas;
  for (const element of elements) {
    const outside =
      element.x < 0 ||
      element.y < 0 ||
      element.x + element.width > width ||
      element.y + element.height > height;
    if (outside) {
      const message = `${element.id} exceeds ${width}x${height} canvas`;
      if (strictBounds) error("CANVAS_BOUNDS", message, { id: element.id });
      else warning("CANVAS_BOUNDS", message, { id: element.id });
    }
  }
}

if (contract.checkTextBounds) {
  for (const text of texts) {
    const groups = new Set(text.groupIds ?? []);
    const parent = rects
      .filter((rect) => (rect.groupIds ?? []).some((groupId) => groups.has(groupId)))
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (!parent) continue;
    const inside =
      text.x >= parent.x &&
      text.y >= parent.y &&
      text.x + text.width <= parent.x + parent.width &&
      text.y + text.height <= parent.y + parent.height;
    if (!inside) {
      error("TEXT_BOUNDS", `${text.id} exceeds its grouped rectangle`, {
        id: text.id,
        parentId: parent.id,
      });
    }
  }
}

for (const element of elements) {
  for (const bound of element.boundElements ?? []) {
    if (!byId.has(bound.id)) {
      error("INVALID_BOUND_ELEMENT", `${element.id} references missing ${bound.id}`, {
        id: element.id,
        targetId: bound.id,
      });
    }
  }
}

const report = {
  ok: errors.length === 0,
  diagram: diagramPath,
  contract: contractPath ?? null,
  counts: {
    elements: elements.length,
    rectangles: rects.length,
    arrows: arrows.length,
    texts: texts.length,
  },
  errors,
  warnings,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
