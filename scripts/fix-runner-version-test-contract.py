from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{path}: expected one match, found {count}: {old[:120]!r}"
        )
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# RCA: version assertions were duplicated as literals in several tests. Derive the
# expected runner version from the canonical source once so future version bumps do
# not require unrelated test edits.
replace_once(
    "tests/e2e/fixture.js",
    '''const canonicalRunnerSource = fs.readFileSync(runnerPath, "utf8");

function replaceSingleTiming(source, from, to) {''',
    '''const canonicalRunnerSource = fs.readFileSync(runnerPath, "utf8");
const runnerVersionMatch = canonicalRunnerSource.match(/\\bconst VERSION = "([^"]+)";/);
if (!runnerVersionMatch) {
  throw new Error("Could not read the Sequence Runner version from runner.js");
}
export const expectedRunnerVersion = runnerVersionMatch[1];

function replaceSingleTiming(source, from, to) {'''
)

replace_once(
    "tests/e2e/core.spec.js",
    'import { test, expect } from "./fixture.js";',
    'import { test, expect, expectedRunnerVersion } from "./fixture.js";'
)
replace_once(
    "tests/e2e/core.spec.js",
    '    version: "3.39",',
    '    version: expectedRunnerVersion,'
)

replace_once(
    "tests/e2e/diagnostic.spec.js",
    'import { test, expect } from "./fixture.js";',
    'import { test, expect, expectedRunnerVersion } from "./fixture.js";'
)

p = Path("tests/e2e/diagnostic.spec.js")
text = p.read_text(encoding="utf-8")
old = '.toBe("3.39")'
count = text.count(old)
if count != 2:
    raise SystemExit(
        f"tests/e2e/diagnostic.spec.js: expected two stale version assertions, found {count}"
    )
p.write_text(text.replace(old, ".toBe(expectedRunnerVersion)"), encoding="utf-8")

# Search the same product/test surfaces for any similar stale literal before CI.
stale = []
paths = [Path("runner.js"), Path("README.md"), Path("AGENTS.md")]
paths.extend(Path("tests").rglob("*"))
for path in paths:
    if not path.is_file():
        continue
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    if "3.39" in content:
        stale.append(str(path))

if stale:
    raise SystemExit(
        "Stale runner version 3.39 remains in: " + ", ".join(sorted(stale))
    )
