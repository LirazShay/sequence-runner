import fs from "node:fs";

function replaceExact(source, from, to, label, expected = 1) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(from, offset);
    if (index < 0) break;
    count++;
    offset = index + from.length;
  }
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  }
  return source.split(from).join(to);
}

function insertBeforeExact(source, marker, insertion, label) {
  const index = source.indexOf(marker);
  if (index < 0 || source.indexOf(marker, index + marker.length) >= 0) {
    throw new Error(`${label}: marker must exist exactly once`);
  }
  return source.slice(0, index) + insertion + source.slice(index);
}

let runner = fs.readFileSync("runner.js", "utf8");
runner = replaceExact(
  runner,
  '    const VERSION = "3.33";',
  '    const VERSION = "3.34";',
  "version"
);

const wakeStartMarker =
  '        \'<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">\',\n' +
  '        \'<div style="font-weight:700;margin-bottom:7px">בדיקת תשובה ארוכה</div>\',';
const wakeStart = runner.indexOf(wakeStartMarker);
if (wakeStart < 0 || runner.indexOf(wakeStartMarker, wakeStart + 1) >= 0) {
  throw new Error("wake block start marker must exist exactly once");
}

const wakeEndMarker =
  '        \'</div>\',\n' +
  '        \'</div>\',\n' +
  '        \'<div data-role="metrics"';
const wakeEndAnchor = runner.indexOf(wakeEndMarker, wakeStart);
if (wakeEndAnchor < 0) {
  throw new Error("wake block end marker not found");
}
const wakeClosingLine = '        \'</div>\',\n';
const wakeEnd = wakeEndAnchor + wakeClosingLine.length;
let wakeBlock = runner.slice(wakeStart, wakeEnd);
wakeBlock = replaceExact(
  wakeBlock,
  '<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',
  '<div data-role="long-wait-wake" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">',
  "wake section role"
);
runner = runner.slice(0, wakeStart) + runner.slice(wakeEnd);

runner = replaceExact(
  runner,
  '        \'<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-bottom:10px">\',\n        \'<div style="font-weight:700;margin-bottom:7px">הודעת ביניים</div>\',',
  '        \'<div data-role="intermediate" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-bottom:10px">\',\n        \'<div style="font-weight:700;margin-bottom:7px">הודעת ביניים</div>\',',
  "intermediate section role"
);
runner = replaceExact(
  runner,
  '        \'<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px">\',\n        \'<div style="font-weight:700;margin-bottom:7px">גבול ריצה</div>\',',
  '        \'<div data-role="run-limit" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px">\',\n        \'<div style="font-weight:700;margin-bottom:7px">גבול ריצה</div>\',',
  "run limit section role"
);
runner = replaceExact(
  runner,
  '        \'<div style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">\',\n        \'<div style="font-weight:700;margin-bottom:7px">אבחון תקלה</div>\',',
  '        \'<div data-role="diagnostic" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">\',\n        \'<div style="font-weight:700;margin-bottom:7px">אבחון תקלה</div>\',',
  "diagnostic section role"
);
runner = insertBeforeExact(
  runner,
  '        \'<div data-role="diagnostic" style="border-top:1px solid rgba(255,255,255,.12);padding-top:9px;margin-top:10px">\',',
  wakeBlock,
  "insert wake before diagnostic"
);

fs.writeFileSync("runner.js", runner);

let agents = fs.readFileSync("AGENTS.md", "utf8");
agents = replaceExact(
  agents,
  "The panel reports operational chat/run metrics and allows a safe step limit to be configured either as an absolute runner-response number or as N additional responses from the current point.\n",
  "The panel reports operational chat/run metrics and allows a safe step limit to be configured either as an absolute runner-response number or as N additional responses from the current point.\n\nBefore adding or repositioning any management-panel control, explicitly choose its location by user utility and expected frequency of use. Keep high-value operational information and frequent actions near the top; place occasional configuration lower; place exceptional/testing controls near the bottom; keep diagnostics last unless there is a stronger concrete usability reason. Do not insert a new control near the top merely because that is the easiest code location. Preserve the current practical hierarchy: start configuration, live metrics, intermediate-message controls, run limits, long-running-response test/wake configuration, then diagnostics.\n",
  "AGENTS panel information architecture"
);
agents = replaceExact(
  agents,
  "- a due intermediate message takes precedence over the ordinary completion marker\n",
  "- a due intermediate message takes precedence over the ordinary completion marker\n- management-panel sections preserve the intended utility order, with metrics and intermediate messages above occasional/test controls and diagnostics last\n",
  "AGENTS testing philosophy"
);
fs.writeFileSync("AGENTS.md", agents);

let readme = fs.readFileSync("README.md", "utf8");
readme = replaceExact(
  readme,
  "The default panel size is intentionally compact so it does not cover most of the conversation. The header remains outside the scrolling body, while the controls and metrics scroll inside the panel when needed.\n",
  "The default panel size is intentionally compact so it does not cover most of the conversation. The header remains outside the scrolling body, while the controls and metrics scroll inside the panel when needed. Panel sections are ordered by practical usefulness rather than implementation history: start configuration and live metrics stay high, intermediate-message controls remain prominent, run limits follow, the long-running-response test/wake configuration sits near the bottom, and diagnostics are last.\n",
  "README panel order"
);
fs.writeFileSync("README.md", readme);

for (const path of ["tests/e2e/core.spec.js", "tests/e2e/diagnostic.spec.js"]) {
  let text = fs.readFileSync(path, "utf8");
  text = replaceExact(text, '"3.33"', '"3.34"', `${path} version`);
  fs.writeFileSync(path, text);
}

const panelTest = `import { test, expect } from "./fixture.js";\n\ntest("management panel keeps frequent controls above test and diagnostic sections", async ({ harness }) => {\n  await harness.load();\n\n  const sequence = await harness.page.evaluate(() => {\n    const body = document.querySelector('#sequence-runner-panel [data-role="body"] > div:last-child');\n    if (!body) {\n      throw new Error("Panel content container not found");\n    }\n\n    return [...body.children]\n      .map((node) => node.getAttribute("data-role"))\n      .filter(Boolean);\n  });\n\n  expect(sequence).toEqual([\n    "start-config",\n    "metrics",\n    "intermediate",\n    "run-limit",\n    "long-wait-wake",\n    "diagnostic"\n  ]);\n});\n`;
fs.writeFileSync("tests/e2e/panel-order.spec.js", panelTest);

console.log("Applied panel utility ordering patch");
