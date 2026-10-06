from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

runner = Path("runner.js")
text = runner.read_text(encoding="utf-8")
text = replace_once(text, '    const VERSION = "3.29";', '    const VERSION = "3.30";', "version")

old = '''    function getAssistantMessage(turn) {
        if (!turn) {
            return null;
        }

        const primary = [
            ...turn.querySelectorAll(
                SELECTORS.assistantMessage
            )
        ].at(-1);

        if (primary) {
            return primary;
        }

        const assistantUnit = [
            ...turn.querySelectorAll(
                '[data-content-search-unit-key$=":assistant"],' +
                '[data-chatgpt-search-unit-key$=":assistant"]'
            )
        ].at(-1);

        if (assistantUnit) {
            const selectionMessage =
                assistantUnit.querySelector(
                    '[data-chatgpt-selection-message-id]'
                );

            if (selectionMessage) {
                return selectionMessage;
            }

            const nestedMarkdown =
                assistantUnit.querySelector(
                    '[data-markdown-text-style="assistant-message"]'
                );

            if (nestedMarkdown) {
                return nestedMarkdown;
            }
        }

        const assistantRole = [
            ...turn.querySelectorAll(
                'h4[data-conversation-role="assistant"]'
            )
        ].at(-1);

        if (assistantRole) {
            const roleContainer =
                assistantRole.parentElement;

            const roleSelection =
                roleContainer?.querySelector(
                    '[data-chatgpt-selection-message-id]'
                );

            if (roleSelection) {
                return roleSelection;
            }
        }

        return null;
    }'''

new = '''    function getAssistantMessage(turn) {
        if (!turn) {
            return null;
        }

        const assistantUnit = [
            ...turn.querySelectorAll(
                '[data-content-search-unit-key$=":assistant"],' +
                '[data-chatgpt-search-unit-key$=":assistant"]'
            )
        ].at(-1);

        if (assistantUnit) {
            const selectionMessage =
                assistantUnit.querySelector(
                    '[data-chatgpt-selection-message-id]'
                );

            if (selectionMessage) {
                return selectionMessage;
            }
        }

        const assistantRole = [
            ...turn.querySelectorAll(
                'h4[data-conversation-role="assistant"]'
            )
        ].at(-1);

        if (assistantRole) {
            const roleContainer =
                assistantRole.parentElement;

            const roleSelection =
                roleContainer?.querySelector(
                    '[data-chatgpt-selection-message-id]'
                );

            if (roleSelection) {
                return roleSelection;
            }
        }

        const primary = [
            ...turn.querySelectorAll(
                SELECTORS.assistantMessage
            )
        ].at(-1);

        if (primary) {
            return primary;
        }

        if (assistantUnit) {
            const nestedMarkdown = [
                ...assistantUnit.querySelectorAll(
                    '[data-markdown-text-style="assistant-message"]'
                )
            ].at(-1);

            if (nestedMarkdown) {
                return nestedMarkdown;
            }

            return assistantUnit;
        }

        return null;
    }'''
text = replace_once(text, old, new, "assistant message priority")
runner.write_text(text, encoding="utf-8")

mock = Path("tests/mock-chatgpt/mock-chatgpt.js")
mock_text = mock.read_text(encoding="utf-8")
anchor = '''      const finish = () => {
        if (showStop) {
          endGeneration();
        }

        addRegenerate(turn);'''
replacement = '''      const finish = () => {
        if (showStop) {
          endGeneration();
        }

        if (response.extraMarkdownText != null) {
          const extra = document.createElement("div");
          extra.setAttribute(
            "data-markdown-text-style",
            "assistant-message"
          );
          extra.textContent = String(response.extraMarkdownText);
          turn.appendChild(extra);
          record("assistant-extra-markdown", {
            turnKey: turn.getAttribute("data-turn-key"),
            text: normalize(extra.textContent)
          });
        }

        addRegenerate(turn);'''
mock_text = replace_once(mock_text, anchor, replacement, "mock extra markdown")
mock.write_text(mock_text, encoding="utf-8")

handoff = Path("tests/e2e/handoff.spec.js")
handoff_text = handoff.read_text(encoding="utf-8")
anchor = '''test("project handoff uses the exact project New Chat action and stays in the project route", async ({ harness }) => {'''
new_test = '''test("handoff reads the authoritative full assistant selection instead of a later markdown fragment", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "normal",
        wrapper: "search-unit",
        text: handoffResponse("FULL_SELECTION_HANDOFF"),
        extraMarkdownText: "Auxiliary markdown fragment"
      },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toContain("FULL_SELECTION_HANDOFF");
  expect(sent[1]).not.toBe("תמשיך לשלב הבא");

  const events = await harness.events();
  expect(events.some((event) => event.type === "assistant-extra-markdown")).toBeTruthy();
  expect(events.some((event) => event.type === "new-chat-click")).toBeTruthy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  const firstCompletion = log.find((entry) => entry.event === "response-complete");
  expect(firstCompletion?.handoffRequested).toBe(true);
  expect(firstCompletion?.handoffValid).toBe(true);
});

'''
if handoff_text.count(anchor) != 1:
    raise SystemExit("handoff test anchor mismatch")
handoff_text = handoff_text.replace(anchor, new_test + anchor, 1)
handoff.write_text(handoff_text, encoding="utf-8")

core = Path("tests/e2e/core.spec.js")
core_text = core.read_text(encoding="utf-8")
if core_text.count('version: "3.29"') != 1:
    raise SystemExit("core version assertion mismatch")
core.write_text(core_text.replace('version: "3.29"', 'version: "3.30"', 1), encoding="utf-8")

diag = Path("tests/e2e/diagnostic.spec.js")
diag_text = diag.read_text(encoding="utf-8")
if diag_text.count('"3.29"') != 2:
    raise SystemExit("diagnostic version assertions mismatch")
diag.write_text(diag_text.replace('"3.29"', '"3.30"'), encoding="utf-8")

agents = Path("AGENTS.md")
agents_text = agents.read_text(encoding="utf-8")
needle = '''Assistant-content detection must retain fallbacks for the assistant search-unit and selection-message containers, not only the preferred Markdown wrapper.'''
replacement = '''Assistant-content detection must retain fallbacks for the assistant search-unit and selection-message containers, not only the preferred Markdown wrapper. When a selection-message container is available, treat it as the authoritative full Assistant response before considering individual Markdown fragments; a later auxiliary Markdown fragment must never hide an earlier handoff block from evaluation.'''
agents_text = replace_once(agents_text, needle, replacement, "AGENTS response authority")
agents.write_text(agents_text, encoding="utf-8")
