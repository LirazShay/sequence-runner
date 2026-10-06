from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

runner = Path("runner.js")
text = runner.read_text(encoding="utf-8")
text = replace_once(text, '    const VERSION = "3.28";', '    const VERSION = "3.29";', "version")

old_ui = '''        '<option value="existing">המשימה כבר ניתנה בצ׳אט</option>',
        '<option value="new">משימה חדשה — שלב אותה בהודעה הראשונה</option>',
        '</select>',
        '<label data-role="skip-first-message-row" style="display:flex;align-items:center;gap:7px;padding:1px 1px 7px;cursor:pointer">',
        '<input data-input="skip-first-message" type="checkbox" style="margin:0">',
        '<span>דלג על הודעה ראשונה</span>',
        '</label>','''
new_ui = '''        '<option value="existing">המשימה כבר ניתנה בצ׳אט</option>',
        '<option value="existing-ready">המשימה והודעת הפתיחה כבר נשלחו בצ׳אט</option>',
        '<option value="new">משימה חדשה — שלב אותה בהודעה הראשונה</option>',
        '</select>','''
text = replace_once(text, old_ui, new_ui, "start mode UI")

old_setup = '''        const skipFirstMessageInput = panel.querySelector(
            '[data-input="skip-first-message"]'
        );

        const workStyleSelect = panel.querySelector(
            '[data-input="work-style"]'
        );

        const decisionModeSelect = panel.querySelector(
            '[data-input="decision-mode"]'
        );

        const syncStartModeControls = function () {
            const isNewTask =
                taskModeSelect?.value === "new";

            if (taskTextArea) {
                taskTextArea.style.display =
                    isNewTask ? "" : "none";
            }

            if (skipFirstMessageInput) {
                skipFirstMessageInput.disabled =
                    isNewTask;

                if (isNewTask) {
                    skipFirstMessageInput.checked =
                        false;
                }
            }
        };'''
new_setup = '''        const workStyleSelect = panel.querySelector(
            '[data-input="work-style"]'
        );

        const decisionModeSelect = panel.querySelector(
            '[data-input="decision-mode"]'
        );

        const syncStartModeControls = function () {
            const isNewTask =
                taskModeSelect?.value === "new";

            if (taskTextArea) {
                taskTextArea.style.display =
                    isNewTask ? "" : "none";
            }
        };'''
text = replace_once(text, old_setup, new_setup, "setup controls")

old_click = '''            function () {
                beginRun(
                    taskModeSelect?.value || "existing",
                    taskTextArea?.value || "",
                    workStyleSelect?.value || "steady",
                    decisionModeSelect?.value || "autonomous",
                    !!skipFirstMessageInput?.checked
                ).catch(function (err) {'''
new_click = '''            function () {
                const startMode =
                    taskModeSelect?.value || "existing";

                beginRun(
                    startMode === "new"
                        ? "new"
                        : "existing",
                    taskTextArea?.value || "",
                    workStyleSelect?.value || "steady",
                    decisionModeSelect?.value || "autonomous",
                    startMode === "existing-ready"
                ).catch(function (err) {'''
text = replace_once(text, old_click, new_click, "start click")

old_reset = '''        const skipFirstMessage = panel.querySelector(
            '[data-input="skip-first-message"]'
        );

        const inputs = ['''
text = replace_once(text, old_reset, '        const inputs = [', "reset query")

old_reset_value = '''        if (skipFirstMessage) {
            skipFirstMessage.checked = false;
            skipFirstMessage.disabled = false;
        }

        if (taskText) {'''
text = replace_once(text, old_reset_value, '        if (taskText) {', "reset value")
runner.write_text(text, encoding="utf-8")

core = Path("tests/e2e/core.spec.js")
tests = core.read_text(encoding="utf-8")
old_tests = '''test("skip-first-message option sends only the regular continuation prompt", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי" }]
  });

  const row = harness.page.locator('[data-role="skip-first-message-row"]');
  const skipFirstMessage = harness.page.locator('[data-input="skip-first-message"]');
  await expect(row).toContainText("דלג על הודעה ראשונה");
  await expect(skipFirstMessage).toBeEnabled();
  await expect(skipFirstMessage).not.toBeChecked();
  await skipFirstMessage.check();

  await harness.page.locator('[data-action="start-run"]').click();
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toEqual(["תמשיך לשלב הבא"]);
  const state = await harness.runnerState();
  expect(state.skipFirstMessage).toBe(true);
});

test("new-task mode disables and clears skip-first-message", async ({ harness }) => {
  await harness.load();

  const taskMode = harness.page.locator('[data-input="task-mode"]');
  const skipFirstMessage = harness.page.locator('[data-input="skip-first-message"]');

  await skipFirstMessage.check();
  await taskMode.selectOption("new");

  await expect(skipFirstMessage).toBeDisabled();
  await expect(skipFirstMessage).not.toBeChecked();
});
'''
new_tests = '''test("opening-message-already-sent is a distinct start mode", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי" }]
  });

  const taskMode = harness.page.locator('[data-input="task-mode"]');
  await expect(taskMode.locator("option")).toHaveText([
    "המשימה כבר ניתנה בצ׳אט",
    "המשימה והודעת הפתיחה כבר נשלחו בצ׳אט",
    "משימה חדשה — שלב אותה בהודעה הראשונה"
  ]);
  await expect(harness.page.locator('[data-input="skip-first-message"]')).toHaveCount(0);

  await taskMode.selectOption("existing-ready");
  await harness.page.locator('[data-action="start-run"]').click();
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toEqual(["תמשיך לשלב הבא"]);
  const state = await harness.runnerState();
  expect(state.taskMode).toBe("existing");
  expect(state.skipFirstMessage).toBe(true);
});
'''
tests = replace_once(tests, old_tests, new_tests, "core tests")
tests = tests.replace('version: "3.28"', 'version: "3.29"')
core.write_text(tests, encoding="utf-8")

diag = Path("tests/e2e/diagnostic.spec.js")
diag_text = diag.read_text(encoding="utf-8")
if diag_text.count('"3.28"') != 2:
    raise SystemExit("diagnostic version assertions mismatch")
diag.write_text(diag_text.replace('"3.28"', '"3.29"'), encoding="utf-8")

readme = Path("README.md")
readme_text = readme.read_text(encoding="utf-8")
old_readme = '''The control panel offers two start modes:

- **Existing task/context** — preserves the original behavior. The first runner prompt installs the step-by-step continuation, completion and new-chat handoff contract and asks the assistant to continue.
- **New task** — the user enters free-form task text in the panel. The runner embeds that task in the first prompt together with the continuation, completion and handoff contract, then asks the assistant to begin the first step.

The existing-context start screen also exposes **דלג על הודעה ראשונה**. When checked, the runner assumes the full opening contract is already present in the conversation and sends only `תמשיך לשלב הבא` as its first send. The option is disabled and cleared in new-task mode, and it affects only run startup; automatic handoff behavior is unchanged. Programmatic callers may pass the same choice as the third argument to `startExistingContext(workStyle, decisionMode, skipFirstMessage)`.
'''
new_readme = '''The control panel offers three start modes:

- **Existing task/context** — preserves the original behavior. The first runner prompt installs the step-by-step continuation, completion and new-chat handoff contract and asks the assistant to continue.
- **Existing task + opening message already sent** — assumes the full opening contract is already present in the conversation and sends only `תמשיך לשלב הבא` as the first runner send.
- **New task** — the user enters free-form task text in the panel. The runner embeds that task in the first prompt together with the continuation, completion and handoff contract, then asks the assistant to begin the first step.

The opening-message-already-sent choice is a start mode, not a separate checkbox. It affects only run startup; automatic handoff behavior is unchanged. Programmatic callers may still request the same behavior through the third argument to `startExistingContext(workStyle, decisionMode, skipFirstMessage)`.
'''
readme_text = replace_once(readme_text, old_readme, new_readme, "README")
readme.write_text(readme_text, encoding="utf-8")

agents = Path("AGENTS.md")
agents_text = agents.read_text(encoding="utf-8")
old_agents = '''- existing-context mode, which preserves the original continuation behavior
- new-task mode, which embeds user-supplied free-form task text into the first runner prompt
- an explicit `דלג על הודעה ראשונה` option for existing-context mode; when selected, assume the full opening contract already exists and send only `תמשיך לשלב הבא` as the first runner send. Do not apply this option to new-task mode and do not let it alter automatic handoff behavior.
'''
new_agents = '''- existing-context mode, which preserves the original continuation behavior
- existing-ready mode, shown to the user as `המשימה והודעת הפתיחה כבר נשלחו בצ׳אט`; this is a peer start mode, not a checkbox, and sends only `תמשיך לשלב הבא` as the first runner send
- new-task mode, which embeds user-supplied free-form task text into the first runner prompt

Do not let the existing-ready start mode alter automatic handoff behavior.
'''
agents_text = replace_once(agents_text, old_agents, new_agents, "AGENTS")
agents.write_text(agents_text, encoding="utf-8")
