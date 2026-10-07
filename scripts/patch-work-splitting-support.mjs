import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

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

function replaceWithin(content, startMarker, endMarker, search, replacement, label) {
  const start = content.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`Range start not found: ${label}`);
  }
  const end = content.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    throw new Error(`Range end not found: ${label}`);
  }
  const section = content.slice(start, end);
  const patched = replaceOnce(section, search, replacement, label);
  return content.slice(0, start) + patched + content.slice(end);
}

{
  const path = "tests/e2e/diagnostic.spec.js";
  let source = read(path);
  source = source.replaceAll('toBe("3.36")', 'toBe("3.37")');
  if (!source.includes('toBe("3.37")')) {
    throw new Error("Diagnostic version assertions were not updated");
  }
  write(path, source);
}

{
  const path = "tests/e2e/wake.spec.js";
  let source = read(path);
  source = replaceWithin(
    source,
    'test("wake eligibility resets for the next tracked Assistant response"',
    'test("occupied composer defers the wake without overwriting user text"',
    `  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n`,
    `  await harness.page.selectOption('[data-input="split-after-minutes"]', "20");\n  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());\n`,
    "isolate wake-reset test from split escalation"
  );
  write(path, source);
}

{
  const path = "AGENTS.md";
  let source = read(path);

  source = replaceOnce(
    source,
    "- Both styles prefer a small number of meaningful segments over many tiny steps. Keep the continuation command and the concept of `שלב`; work style changes the intended amount of coherent work, not the runner state-machine protocol.",
    "- Both styles use one meaningful work segment per Assistant response. A segment may contain multiple technical operations, checks and fixes, but after reaching its verified checkpoint the assistant must stop and wait for the next continuation command instead of beginning another meaningful segment in the same response. If the chosen segment grows too large for one response, split it at a safe checkpoint. Keep the continuation command and the concept of `שלב`; work style changes the intended depth of that one coherent segment, not the runner state-machine protocol.",
    "AGENTS work segmentation rule"
  );

  source = replaceOnce(
    source,
    "There are two deliberate send-while-generating exceptions, and neither may click Stop: an explicit user-triggered immediate intermediate message, and the one-shot configurable long-running-response wake nudge. The wake delay is a per-run setting from 1–20 minutes (default 5), and the wake message is selected/editable per run. Both exceptions use the immediate composer/send path and safely supersede the currently tracked cycle when they send.",
    "There are three deliberate send-while-generating exceptions, and none may click Stop: an explicit user-triggered immediate intermediate message, the one-shot configurable long-running-response wake nudge, and the one-shot configurable long-work split escalation. The wake delay is a per-run setting from 1–20 minutes (default 5). The split delay is independently configurable from 1–20 minutes (default 10). Both automatic messages are editable per run. Automatic split timing belongs to the continuous long-work episode: an earlier automatic wake must not restart the split clock. All three exceptions use the immediate composer/send path and safely supersede the currently tracked cycle when they send.",
    "AGENTS send while generating exceptions"
  );

  source = replaceOnce(
    source,
    "The one explicit automatic long-wait exception is a one-shot wake nudge for the same continuously active tracked Assistant response. Its per-run delay must stay within 1–20 minutes and defaults to 5. Its default message is `לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.`, with `מה קורה?` available as a preset and arbitrary non-empty custom text allowed. When the configured delay elapses, immediately attempt to send the configured wake message once through the existing immediate composer/send path. Never wait for the active response to finish, never preflight on Send availability before inserting the wake text, never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer already contains user text, defer only to preserve that draft; otherwise insert the wake text immediately and let the immediate-send path wait briefly for Send to become available after insertion. Eligibility resets for the next tracked Assistant response.",
    "The first automatic long-wait action is a one-shot wake nudge for the same continuously active tracked Assistant response. Its per-run delay must stay within 1–20 minutes and defaults to 5. Its default message is `לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.`, with `מה קורה?` available as a preset and arbitrary non-empty custom text allowed. When the configured delay elapses, immediately attempt to send the configured wake message once through the existing immediate composer/send path. Never wait for the active response to finish, never preflight on Send availability before inserting the wake text, never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer already contains user text, defer only to preserve that draft; otherwise insert the wake text immediately and let the immediate-send path wait briefly for Send to become available after insertion. Eligibility resets for the next tracked Assistant response.\n\nThe second automatic long-wait action is a stronger one-shot work-splitting escalation. Its delay is independently configurable from 1–20 minutes and defaults to 10. Its default instruction tells the assistant to finish and verify only the current segment, split remaining work according to the plan, summarize the next segment, stop at a safe checkpoint and wait for `תמשיך לשלב הבא` rather than beginning the next segment in the same response. The split message is preset/editable per run. It follows the same no-Stop, no-overwrite and immediate-send safety rules as wake. Critically, split timing is attached to the continuous long-work episode rather than the replacement cycle created by an automatic wake: if wake is sent at minute 5, the default split escalation is still due at total minute 10, not minute 15. A user/manual message, ordinary Runner send, retry, completed generation or newly adopted unrelated work starts a new long-work episode.",
    "AGENTS long wait escalation"
  );

  source = replaceOnce(
    source,
    "- wake timing survives temporary loss/replacement of the tracked turn DOM",
    "- wake timing survives temporary loss/replacement of the tracked turn DOM\n- the configurable long-work split escalation can fire after its own threshold even when an earlier automatic wake replaced the tracked cycle, without clicking Stop or overwriting a user draft",
    "AGENTS split regression case"
  );

  write(path, source);
}

{
  const path = "README.md";
  let source = read(path);

  source = replaceOnce(
    source,
    "The key product principle is that normal automatic runner traffic preserves one sent instruction per newly completed assistant turn. Two deliberate exceptions may send while ChatGPT is still responding without clicking Stop: an explicit user-triggered **Send now** action, and the one-shot configurable long-running-response wake nudge. The wake delay is selectable from 1–20 minutes (default 5), and its message can be chosen from presets or edited freely per run.",
    "The key product principle is that normal automatic runner traffic preserves one sent instruction per newly completed assistant turn. Three deliberate exceptions may send while ChatGPT is still responding without clicking Stop: an explicit user-triggered **Send now** action, the one-shot configurable long-running-response wake nudge, and the one-shot configurable long-work split escalation. Wake defaults to 5 minutes and split defaults to 10 minutes; both delays are independently selectable from 1–20 minutes and both messages can be chosen from presets or edited freely per run. An automatic wake does not restart the split clock.",
    "README product principle"
  );

  source = replaceOnce(
    source,
    "Both styles use the same core rule: one segment should pursue one clear goal, do the work needed to achieve it, verify the result, and then reach a checkpoint. In general, prefer a small number of meaningful segments over many tiny steps.",
    "Both styles use the same core rule: one Assistant response should execute one meaningful segment, pursue one clear goal, do the work needed to achieve it, verify the result, and then stop at a checkpoint until the next `תמשיך לשלב הבא`. A segment may contain multiple technical operations; the rule is not to stop after every small action. Conversely, do not begin a second meaningful segment in the same response. If the segment grows too large, split it at a safe checkpoint and leave the remainder for a later response.",
    "README response segmentation"
  );

  source = replaceOnce(
    source,
    "Unknown or omitted work-style/decision values safely fall back to `steady` and `autonomous`. The wake settings can optionally be supplied programmatically as trailing arguments: `startExistingContext(workStyle, decisionMode, skipFirstMessage, wakeAfterMinutes, wakeMessage)` and `startWithTask(taskText, workStyle, decisionMode, wakeAfterMinutes, wakeMessage)`. Omitted wake values use the 5-minute default and default wake message.",
    "Unknown or omitted work-style/decision values safely fall back to `steady` and `autonomous`. Wake and split settings can optionally be supplied programmatically as trailing arguments: `startExistingContext(workStyle, decisionMode, skipFirstMessage, wakeAfterMinutes, wakeMessage, splitAfterMinutes, splitMessage)` and `startWithTask(taskText, workStyle, decisionMode, wakeAfterMinutes, wakeMessage, splitAfterMinutes, splitMessage)`. Omitted wake values use the 5-minute default; omitted split values use the 10-minute default.",
    "README programmatic args"
  );

  source = replaceOnce(
    source,
    "- For each run, the start panel lets the user configure the long-running-response wake delay from 1–20 minutes and choose or edit the wake message. The default is 5 minutes with `לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.`; `מה קורה?` is also available as a preset, and custom text is supported. When the exact same tracked Assistant response remains actively generating past the configured delay, the runner immediately attempts that one wake message through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.",
    "- For each run, the start panel lets the user configure the long-running-response wake delay from 1–20 minutes and choose or edit the wake message. The default is 5 minutes with `לוקח לך הרבה זמן, הכל בסדר? אם העבודה גדולה מדי, אתה יכול לחלק אותה ולהמשיך בהודעה נוספת.`; `מה קורה?` is also available as a preset, and custom text is supported. When the exact same tracked Assistant response remains actively generating past the configured delay, the runner immediately attempts that one wake message through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.\n- A second independently configurable long-work split escalation defaults to 10 minutes (range 1–20). Its editable default instruction tells the assistant to complete and verify the current segment, split remaining work, summarize the next segment and stop at a safe checkpoint until `תמשיך לשלב הבא`. It uses the same immediate-send safety path, never clicks Stop, never overwrites a user draft and is one-shot for the continuous long-work episode. If the 5-minute wake already fired, the split timer keeps the original episode start time, so the default split instruction is still due at total minute 10 rather than 10 minutes after the wake.",
    "README long wait split"
  );

  source = replaceOnce(
    source,
    "Panel sections are ordered by practical usefulness rather than implementation history: start configuration and live metrics stay high, intermediate-message controls remain prominent, run limits follow, the long-running-response test/wake configuration sits near the bottom, and diagnostics are last.",
    "Panel sections are ordered by practical usefulness rather than implementation history: start configuration and live metrics stay high, intermediate-message controls remain prominent, run limits follow, the long-running-response wake/split configuration sits near the bottom, and diagnostics are last.",
    "README panel ordering"
  );

  write(path, source);
}

console.log("Patched work splitting tests and documentation.");
