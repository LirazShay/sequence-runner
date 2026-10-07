import fs from "node:fs";

const path = "tests/e2e/diagnostic.spec.js";
let source = fs.readFileSync(path, "utf8");
const matches = source.match(/"3\.35"/g) || [];
if (matches.length !== 2) {
  throw new Error(`Expected exactly 2 diagnostic v3.35 assertions, found ${matches.length}`);
}
source = source.replaceAll('"3.35"', '"3.36"');
fs.writeFileSync(path, source);
console.log("Aligned diagnostic regression version with v3.36.");
