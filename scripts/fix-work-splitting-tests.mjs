import fs from "node:fs";

function replaceOnce(content, search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  return content.slice(0, index) + replacement + content.slice(index + search.length);
}

{
  const path = "tests/e2e/core.spec.js";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    '    version: "3.36",',
    '    version: "3.37",',
    "bookmarklet runtime version"
  );
  fs.writeFileSync(path, source);
}

{
  const path = "tests/e2e/wake.spec.js";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    `  await harness.page.selectOption('[data-input="split-after-minutes"]', "20");\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n`,
    `  await harness.page.evaluate(() =>\n    window.__sequenceRunner.startExistingContext(\n      "steady",\n      "autonomous",\n      false,\n      5,\n      undefined,\n      20\n    )\n  );\n`,
    "wake-reset split isolation"
  );
  fs.writeFileSync(path, source);
}

console.log("Fixed split regression expectations.");
