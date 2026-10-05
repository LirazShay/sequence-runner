from pathlib import Path

path = Path('tests/e2e/diagnostic.spec.js')
text = path.read_text(encoding='utf-8')

old = r'''test("diagnostic snapshot flags a visible tracked turn when Assistant selectors miss", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "stopped-thinking", delayMs: 80 }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  const result = await harness.page.evaluate(() => {
    const snapshot = window.__sequenceRunner.createDiagnosticSnapshot();
    return {
      currentTurnText: snapshot.currentTurn?.visibleText || "",
      observations: snapshot.diagnosis.observations.map((entry) => entry.code),
      assistantMatches: snapshot.currentTurn?.assistantMatches || []
    };
  });

  expect(result.currentTurnText).toContain("Stopped thinking");
  expect(result.observations).toContain("VISIBLE_TURN_TEXT_BUT_ASSISTANT_SELECTOR_MISS");
  expect(result.assistantMatches.every((entry) => entry.count === 0)).toBeTruthy();
});'''

new = r'''test("diagnostic snapshot flags visible text when the Assistant wrapper selector drifts", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "hold" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await waitForTrackedGeneration(harness);

  const result = await harness.page.evaluate(() => {
    const turnKey = window.__sequenceRunner.getState().currentCycle?.turnKey;
    const turn = [...document.querySelectorAll('[data-turn-key]')]
      .find((node) => node.getAttribute('data-turn-key') === turnKey);

    if (!turn) {
      throw new Error("Tracked mock turn not found");
    }

    turn.querySelectorAll('[data-markdown-text-style="assistant-message"]').forEach((node) => {
      node.removeAttribute('data-markdown-text-style');
    });
    turn.querySelectorAll('[data-content-search-unit-key$=":assistant"]').forEach((node) => {
      node.removeAttribute('data-content-search-unit-key');
    });
    turn.querySelectorAll('[data-chatgpt-search-unit-key$=":assistant"]').forEach((node) => {
      node.removeAttribute('data-chatgpt-search-unit-key');
    });
    turn.querySelectorAll('[data-chatgpt-selection-message-id]').forEach((node) => {
      node.removeAttribute('data-chatgpt-selection-message-id');
    });
    turn.querySelectorAll('h4[data-conversation-role="assistant"]').forEach((node) => {
      node.removeAttribute('data-conversation-role');
    });

    const drifted = document.createElement("div");
    drifted.setAttribute("data-mock-drifted-assistant", "true");
    drifted.textContent = "VISIBLE_ASSISTANT_WITH_CHANGED_WRAPPER";
    turn.appendChild(drifted);

    const snapshot = window.__sequenceRunner.createDiagnosticSnapshot();
    return {
      currentTurnText: snapshot.currentTurn?.visibleText || "",
      observations: snapshot.diagnosis.observations.map((entry) => entry.code),
      assistantMatches: snapshot.currentTurn?.assistantMatches || []
    };
  });

  expect(result.currentTurnText).toContain("VISIBLE_ASSISTANT_WITH_CHANGED_WRAPPER");
  expect(result.observations).toContain("VISIBLE_TURN_TEXT_BUT_ASSISTANT_SELECTOR_MISS");
  expect(result.assistantMatches.every((entry) => entry.count === 0)).toBeTruthy();

  await harness.page.evaluate(() => window.__sequenceRunner.stop("test-cleanup"));
});'''

if text.count(old) != 1:
    raise SystemExit(f'old diagnostic test block: expected 1 match, found {text.count(old)}')

path.write_text(text.replace(old, new, 1), encoding='utf-8')
