import fs from "node:fs";

export const COLORS = Object.freeze({
  ink: "#1f2937",
  muted: "#64748b",
  existing: "#1971c2",
  existingFill: "#e7f5ff",
  added: "#2f9e44",
  addedFill: "#ebfbee",
  bridge: "#e67700",
  bridgeFill: "#fff4e6",
  read: "#868e96",
  danger: "#c92a2a",
  dangerFill: "#fff5f5",
  anchor: "#b7791f",
  anchorFill: "#fff3bf",
  neutral: "#495057",
  neutralFill: "#f8f9fa",
  white: "#ffffff",
});

export const NODE_STYLES = Object.freeze({
  existing: {
    strokeColor: COLORS.existing,
    backgroundColor: COLORS.existingFill,
    strokeStyle: "solid",
  },
  added: {
    strokeColor: COLORS.added,
    backgroundColor: COLORS.addedFill,
    strokeStyle: "dashed",
  },
  bridge: {
    strokeColor: COLORS.bridge,
    backgroundColor: COLORS.bridgeFill,
    strokeStyle: "dashed",
  },
  anchor: {
    strokeColor: COLORS.anchor,
    backgroundColor: COLORS.anchorFill,
    strokeStyle: "solid",
  },
  risk: {
    strokeColor: COLORS.danger,
    backgroundColor: COLORS.dangerFill,
    strokeStyle: "dashed",
  },
  neutral: {
    strokeColor: COLORS.neutral,
    backgroundColor: COLORS.neutralFill,
    strokeStyle: "solid",
  },
});

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dash(style) {
  if (style === "dashed") return ` stroke-dasharray="10 7"`;
  if (style === "dotted") return ` stroke-dasharray="3 7"`;
  return "";
}

export class ExcalidrawDiagram {
  constructor({ width = 1920, height = 1080, backgroundColor = COLORS.white } = {}) {
    this.width = width;
    this.height = height;
    this.backgroundColor = backgroundColor;
    this.serial = 0;
    this.elements = [];
    this.byId = new Map();
  }

  nextId(prefix) {
    this.serial += 1;
    return `${prefix}-${String(this.serial).padStart(4, "0")}`;
  }

  base(elementId, type, x, y, width, height, options = {}) {
    return {
      id: elementId,
      type,
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: options.strokeColor ?? COLORS.ink,
      backgroundColor: options.backgroundColor ?? "transparent",
      fillStyle: options.fillStyle ?? "solid",
      strokeWidth: options.strokeWidth ?? 1,
      strokeStyle: options.strokeStyle ?? "solid",
      roughness: options.roughness ?? 0,
      opacity: options.opacity ?? 100,
      groupIds: options.groupIds ?? [],
      frameId: null,
      index: null,
      roundness: options.roundness === false ? null : (options.roundness ?? { type: 3 }),
      seed: 1000 + this.serial * 37,
      version: 1,
      versionNonce: 2000 + this.serial * 53,
      isDeleted: false,
      boundElements: [],
      updated: 1,
      link: null,
      locked: options.locked ?? false,
    };
  }

  rect({ x, y, width, height, id, ...options }) {
    const elementId = id ?? this.nextId("rect");
    const element = this.base(elementId, "rectangle", x, y, width, height, options);
    this.elements.push(element);
    this.byId.set(elementId, element);
    return elementId;
  }

  text({ x, y, width, height, value, id, color, ...options }) {
    const elementId = id ?? this.nextId("text");
    const element = {
      ...this.base(elementId, "text", x, y, width, height, {
        ...options,
        strokeColor: color ?? COLORS.ink,
        backgroundColor: "transparent",
        roughness: 0,
        roundness: false,
      }),
      fontSize: options.fontSize ?? 16,
      fontFamily: options.fontFamily ?? 1,
      text: value,
      originalText: value,
      rawText: value,
      textAlign: options.textAlign ?? "left",
      verticalAlign: options.verticalAlign ?? "top",
      containerId: null,
      autoResize: true,
      lineHeight: options.lineHeight ?? 1.25,
    };
    this.elements.push(element);
    this.byId.set(elementId, element);
    return elementId;
  }

  node({
    x,
    y,
    width,
    height,
    title,
    subtitle = "",
    kind = "added",
    id,
    fontSize = 16,
    subtitleSize = 10,
    style = {},
  }) {
    const groupId = this.nextId("group");
    const defaults = NODE_STYLES[kind] ?? NODE_STYLES.neutral;
    const nodeId = this.rect({
      x,
      y,
      width,
      height,
      id,
      ...defaults,
      ...style,
      strokeWidth: style.strokeWidth ?? (kind === "anchor" ? 3 : 2),
      groupIds: [groupId],
    });
    this.text({
      x: x + 8,
      y: y + (subtitle ? 9 : 6),
      width: width - 16,
      height: subtitle ? 24 : height - 12,
      value: title,
      fontSize,
      textAlign: "center",
      verticalAlign: subtitle ? "top" : "middle",
      groupIds: [groupId],
    });
    if (subtitle) {
      this.text({
        x: x + 8,
        y: y + 36,
        width: width - 16,
        height: height - 42,
        value: subtitle,
        fontSize: subtitleSize,
        fontFamily: 3,
        textAlign: "center",
        color: COLORS.muted,
        groupIds: [groupId],
        lineHeight: 1.16,
      });
    }
    return nodeId;
  }

  table({ x, y, width, height, name, lifecycle = "new", id, fontSize = 10 }) {
    return this.node({
      x,
      y,
      width,
      height,
      title: name,
      kind: lifecycle === "existing" ? "existing" : "added",
      id,
      fontSize,
    });
  }

  boundary({
    x,
    y,
    width,
    height,
    title,
    subtitle = "",
    lifecycle = "new",
    id,
  }) {
    const groupId = this.nextId("boundary-group");
    const existing = lifecycle === "existing";
    const color = existing ? COLORS.existing : COLORS.added;
    const boundaryId = this.rect({
      x,
      y,
      width,
      height,
      id,
      strokeColor: color,
      backgroundColor: existing ? "#f3f8ff" : "#f4fbf5",
      strokeStyle: existing ? "solid" : "dashed",
      strokeWidth: 2,
      opacity: 68,
      groupIds: [groupId],
      locked: true,
    });
    this.text({
      x: x + 18,
      y: y + 14,
      width: width - 36,
      height: 30,
      value: title,
      fontSize: 22,
      color,
      groupIds: [groupId],
    });
    if (subtitle) {
      this.text({
        x: x + 18,
        y: y + 47,
        width: width - 36,
        height: 22,
        value: subtitle,
        fontSize: 11,
        fontFamily: 3,
        color: COLORS.muted,
        groupIds: [groupId],
      });
    }
    return boundaryId;
  }

  arrow({
    points,
    startId = null,
    endId = null,
    id,
    label = "",
    labelAt = 0.5,
    labelDx = 8,
    labelDy = -22,
    labelWidth = 180,
    labelSize = 11,
    labelColor,
    strokeColor = COLORS.ink,
    strokeStyle = "solid",
    strokeWidth = 2,
    opacity = 100,
  }) {
    if (!Array.isArray(points) || points.length < 2) {
      throw new Error("arrow points must contain at least two absolute [x, y] points");
    }
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const relative = points.map(([x, y]) => [x - minX, y - minY]);
    const elementId = id ?? this.nextId("arrow");
    const element = {
      ...this.base(
        elementId,
        "arrow",
        minX,
        minY,
        Math.max(...xs) - minX,
        Math.max(...ys) - minY,
        {
          strokeColor,
          strokeStyle,
          strokeWidth,
          backgroundColor: "transparent",
          opacity,
          roundness: { type: 2 },
        },
      ),
      points: relative,
      lastCommittedPoint: null,
      startBinding: startId ? { elementId: startId, focus: 0, gap: 6 } : null,
      endBinding: endId ? { elementId: endId, focus: 0, gap: 6 } : null,
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
    };
    this.elements.push(element);
    this.byId.set(elementId, element);
    for (const targetId of [startId, endId].filter(Boolean)) {
      const target = this.byId.get(targetId);
      if (!target) throw new Error(`arrow binding target does not exist: ${targetId}`);
      target.boundElements.push({ id: elementId, type: "arrow" });
    }
    if (label) {
      const segmentIndex = Math.min(
        points.length - 2,
        Math.max(0, Math.floor((points.length - 1) * labelAt)),
      );
      const [x1, y1] = points[segmentIndex];
      const [x2, y2] = points[segmentIndex + 1];
      this.text({
        x: (x1 + x2) / 2 + labelDx,
        y: (y1 + y2) / 2 + labelDy,
        width: labelWidth,
        height: 22,
        value: label,
        fontSize: labelSize,
        fontFamily: 3,
        color: labelColor ?? strokeColor,
      });
    }
    return elementId;
  }

  toExcalidraw() {
    return {
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: this.elements,
      appState: {
        gridSize: 20,
        gridStep: 5,
        gridModeEnabled: false,
        viewBackgroundColor: this.backgroundColor,
        currentItemFontFamily: 1,
        currentItemStrokeColor: COLORS.ink,
        currentItemBackgroundColor: "transparent",
        currentItemFillStyle: "solid",
        currentItemStrokeWidth: 1,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 0,
        currentItemOpacity: 100,
        currentItemRoundness: "round",
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
      },
      files: {},
    };
  }

  toSvg() {
    const svg = [];
    svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    svg.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">`,
    );
    svg.push("<defs>");
    for (const [name, color] of Object.entries({
      ink: COLORS.ink,
      blue: COLORS.existing,
      green: COLORS.added,
      orange: COLORS.bridge,
      gray: COLORS.read,
      red: COLORS.danger,
    })) {
      svg.push(
        `<marker id="arrow-${name}" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${color}"/></marker>`,
      );
    }
    svg.push(
      `<style>.sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}.mono{font-family:"SFMono-Regular",Consolas,"Liberation Mono","PingFang SC",monospace}</style>`,
    );
    svg.push(`</defs><rect width="${this.width}" height="${this.height}" fill="${this.backgroundColor}"/>`);

    for (const element of this.elements.filter((entry) => entry.type === "rectangle")) {
      svg.push(
        `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.roundness ? 12 : 0}" fill="${element.backgroundColor === "transparent" ? "none" : element.backgroundColor}" fill-opacity="${element.opacity / 100}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"${dash(element.strokeStyle)}/>`
      );
    }

    for (const element of this.elements.filter((entry) => entry.type === "arrow")) {
      const points = element.points
        .map(([x, y]) => `${element.x + x},${element.y + y}`)
        .join(" ");
      const markerName =
        element.strokeColor === COLORS.existing
          ? "blue"
          : element.strokeColor === COLORS.added
            ? "green"
            : element.strokeColor === COLORS.bridge
              ? "orange"
              : element.strokeColor === COLORS.read
                ? "gray"
                : element.strokeColor === COLORS.danger
                  ? "red"
                  : "ink";
      svg.push(
        `<polyline points="${points}" fill="none" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash(element.strokeStyle)} marker-end="url(#arrow-${markerName})" opacity="${element.opacity / 100}"/>`,
      );
    }

    for (const element of this.elements.filter((entry) => entry.type === "text")) {
      const lines = element.text.split("\n");
      const x = element.textAlign === "center" ? element.x + element.width / 2 : element.x;
      const anchor = element.textAlign === "center" ? "middle" : "start";
      const className = element.fontFamily === 3 ? "mono" : "sans";
      const step = element.fontSize * element.lineHeight;
      let firstY = element.y + element.fontSize;
      if (element.verticalAlign === "middle") {
        firstY =
          element.y +
          element.height / 2 -
          ((lines.length - 1) * step) / 2 +
          element.fontSize * 0.35;
      }
      svg.push(
        `<text x="${x}" y="${firstY}" text-anchor="${anchor}" class="${className}" font-size="${element.fontSize}" fill="${element.strokeColor}">`,
      );
      lines.forEach((line, index) => {
        svg.push(
          `<tspan x="${x}" dy="${index === 0 ? 0 : step}">${xml(line)}</tspan>`,
        );
      });
      svg.push("</text>");
    }

    svg.push("</svg>");
    return `${svg.join("\n")}\n`;
  }

  write({ excalidrawPath, svgPath }) {
    fs.writeFileSync(excalidrawPath, `${JSON.stringify(this.toExcalidraw(), null, 2)}\n`);
    fs.writeFileSync(svgPath, this.toSvg());
    return { excalidrawPath, svgPath };
  }
}
