import fs from "node:fs";

function replaceExactlyOnce(path, before, after) {
  const original = fs.readFileSync(path, "utf8");
  const first = original.indexOf(before);
  const last = original.lastIndexOf(before);

  if (first < 0) {
    throw new Error(`Expected text was not found in ${path}`);
  }

  if (first !== last) {
    throw new Error(`Expected text appears more than once in ${path}`);
  }

  fs.writeFileSync(
    path,
    original.slice(0, first) + after + original.slice(first + before.length),
    "utf8"
  );
}

replaceExactlyOnce(
  "AGENTS.md",
  "If an automatic send is blocked because the composer contains user text or ChatGPT is busy with external/manual activity, do not fail the runner. Preserve the pending automatic send, enter a recoverable waiting state, and resume only after the composer is empty and ChatGPT is idle. Never overwrite user text.",
  "If an automatic continuation is blocked because the composer contains user text or ChatGPT is busy with external/manual activity, do not fail the runner. Preserve the pending automatic send and the original pre-continuation turn snapshot. Before retrying, check whether a newer user-created turn appeared after that snapshot. If it did, that newer turn supersedes the stale continuation: cancel the pending continuation and evaluate the newer assistant response first. If no newer turn exists, resume only after the composer is empty and ChatGPT is idle. Preserve the same snapshot across repeated deferrals. Never overwrite user text."
);

replaceExactlyOnce(
  "README.md",
  "The runner automatically retries when the composer is empty and ChatGPT is idle. The panel also exposes **Continue automation** as a manual recovery action.\n\nThis means a user can type or send a message manually while the runner is active without permanently killing the sequence.",
  "Before retrying a pending continuation, the runner compares the current turns with the snapshot captured when that continuation became due. If a newer user-created turn appeared in the meantime, that turn supersedes the stale continuation: the pending continuation is discarded and the newer assistant response is tracked and evaluated first. The same snapshot is preserved across repeated deferrals, so a manual turn cannot be lost simply because the composer or ChatGPT remains busy for another retry cycle. This also covers a manual send that lands during the short continuation delay before the automatic send begins.\n\nIf no newer turn exists, the runner automatically retries when the composer is empty and ChatGPT is idle. The panel also exposes **Continue automation** as a manual recovery action.\n\nThis means a user can type or send a message manually while the runner is active without permanently killing the sequence or allowing an obsolete continuation to run afterward."
);

console.log("Updated documentation for stale-continuation recovery.");
