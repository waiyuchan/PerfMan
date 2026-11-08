import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const directory = path.join(root, "docs/showcase");
const manifest = JSON.parse(
  fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const boards = manifest.boards
  .map(
    (b) => `<article class="board" id="${escape(b.id)}">
<header><div class="brand">PerfMan <span>/ Product showcase</span></div><div class="number">${escape(b.number)}</div><h1>${escape(b.title)}</h1><p>${escape(b.description)}</p></header>
<div class="grid">${b.screens.map((s) => `<section><h2>${escape(s.title)}</h2><p>${escape(s.caption)}</p><div class="screen"><img src="${escape(s.image)}" alt="${escape(s.title)}" loading="eager"></div></section>`).join("\n")}</div>
<footer><span>Go workspace · English / 简体中文</span><span>Actual application screens · Synthetic workspace data</span></footer>
</article>`,
  )
  .join("\n");
fs.writeFileSync(
  path.join(directory, "gallery.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PerfMan product showcase</title><style>
*{box-sizing:border-box}html{scrollbar-width:none}::-webkit-scrollbar{display:none}body{margin:0;background:#dde4e9;color:#24343c;font-family:"Helvetica Neue",Arial,"PingFang SC",sans-serif}.board{width:3200px;padding:70px 80px 56px;background:#f0f3f5;margin:0 0 64px}header{position:relative;padding-bottom:60px}.brand{font-size:32px;font-weight:700;letter-spacing:-.5px}.brand span{font-weight:400;color:#7a8991;margin-left:16px}.number{position:absolute;right:0;top:0;font-size:95px;line-height:1;color:#c3d2d7;font-weight:500}h1{font-size:68px;letter-spacing:-2px;line-height:1.15;margin:24px 0 16px;font-weight:600}header p{font-size:29px;color:#667881;margin:0;line-height:1.4}.grid{display:grid;grid-template-columns:1fr 1fr;gap:58px 64px}h2{font-size:33px;line-height:1.2;margin:0 0 10px;font-weight:600;letter-spacing:-.4px}section p{font-size:25px;line-height:1.35;color:#6e7e87;margin:0 0 22px}.screen{width:100%;aspect-ratio:8/5;border:1px solid #cdd8dd;overflow:hidden;border-radius:16px;background:white;box-shadow:0 8px 26px #304a5d0a}.screen img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}footer{display:flex;justify-content:space-between;font-size:22px;color:#809097;padding-top:45px;margin-top:38px;border-top:1px solid #d5dfe4}@media print{body{background:white}.board{break-after:page;margin:0}}
</style></head><body>${boards}</body></html>\n`,
);
console.log(
  "Built docs/showcase/gallery.html from " +
    manifest.boards.length +
    " boards.",
);
