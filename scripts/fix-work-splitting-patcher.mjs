import fs from "node:fs";

const path = "scripts/patch-work-splitting-nudge.mjs";
let source = fs.readFileSync(path, "utf8");
const before = '  "    function stop(reason, completed) {",';
const after = '  "    function stop(reason, success) {",';

if (!source.includes(before)) {
  throw new Error("Expected restart patch end-marker not found");
}

source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log("Fixed restart split-state patch anchor.");
