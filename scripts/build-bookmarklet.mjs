import assert from "node:assert/strict";
import fs from "node:fs";
import { minify } from "terser";

const CHECK_ONLY = process.argv.includes("--check");
const PREFIX = "javascript:";

const source = fs.readFileSync("runner.js", "utf8");
const result = await minify(source, {
  compress: true,
  mangle: true
});

if (!result.code) {
  throw new Error("Terser returned an empty payload.");
}

const payload = result.code.trimEnd();
assert(payload.length > 0, "Minified payload is empty.");
assert(!payload.includes("\n") && !payload.includes("\r"), "Minified payload must be exactly one physical line.");

new Function(payload);

const bookmarklet = PREFIX + payload.replaceAll("%", "%25");
const decoded = decodeURIComponent(bookmarklet.slice(PREFIX.length));

assert.equal(decoded, payload, "A single URL decode must reproduce the minified JavaScript byte-for-byte.");
new Function(decoded);

if (CHECK_ONLY) {
  const committed = fs.readFileSync("runner.min.js", "utf8");
  assert.equal(committed, bookmarklet, "runner.min.js is not the exact bookmarklet generated from runner.js.");
  console.log("Bookmarklet check passed.");
  process.exit(0);
}

fs.writeFileSync("runner.min.js", bookmarklet, "utf8");
console.log("Generated runner.min.js from runner.js.");
