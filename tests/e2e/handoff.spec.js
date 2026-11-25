import { test, expect } from "./fixture.js";

function handoffResponse(nextPrompt = "NEXT_TASK_POINTER") {
  return [
    "Current chat segment is complete.",
    "סיימתי",
    "[[SEQUENCE_RUNNER_NEW_CHAT]]",
    "בשלב זה מומלץ לעבור לצ'אט חדש.",
    "[[NEXT_CHAT_PROMPT]]",
    nextPrompt,
    "[[/NEXT_CHAT_PROMPT]]",
    "[[/SEQUENCE_RUNNER_NEW_CHAT]]"
  ].join("\n");
}

test("valid handoff opens a fresh regular chat and continues with a wrapped new-task prompt", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    navigationClearDelayMs: 250,
    responses: [
      { type: "normal", text: handoffResponse("CONTINUE_FROM_SOURCE_OF_TRUTH") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toContain("CONTINUE_FROM_SOURCE_OF_TRUTH");
  expect(sent[1]).toContain("זו המשימה שעליך לבצע כעת:");
  expect(sent[1]).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");
  expect(sent[0]).not.toContain("שם הצ'אט:");
  expect(sent[1]).toContain("שם הצ'אט:");
  expect(sent[1]).toContain("שם הצ'אט צריך להיות \"צ'אט N\"");
  expect(sent[1]).toContain("שם קצר ותיאורי שמסכם את מה שהצ'אט הזה מתוכנן לבצע");

  const state = await harness.runnerState();
  expect(state.handoffCount).toBe(1);

  const events = await harness.events();
  const click = events.find((event) => event.type === "new-chat-click");
  const ready = events.find((event) => event.type === "new-chat-ready");
  const sends = events.filter((event) => event.type === "send");

  expect(click?.kind).toBe("regular");
  expect(ready).toBeTruthy();
  expect(sends).toHaveLength(2);
  expect(ready.at).toBeGreaterThanOrEqual(click.at);
  expect(sends[1].at).toBeGreaterThanOrEqual(ready.at);
});

test("handoff forces Chat composer mode before sending in the fresh chat", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("CHAT_MODE_HANDOFF") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  const workButton = harness.page.getByRole("button", {
    name: "Work",
    exact: true
  });
  await workButton.click();
  await expect(workButton).toHaveAttribute("aria-pressed", "true");

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const events = await harness.events();
  const readyIndex = events.findIndex((event) => event.type === "new-chat-ready");
  const chatModeClickIndex = events.findIndex(
    (event) => event.type === "composer-mode-click" && event.mode === "chat"
  );
  const sendIndices = events
    .map((event, index) => event.type === "send" ? index : -1)
    .filter((index) => index >= 0);

  expect(readyIndex).toBeGreaterThanOrEqual(0);
  expect(chatModeClickIndex).toBeGreaterThan(readyIndex);
  expect(sendIndices).toHaveLength(2);
  expect(sendIndices[1]).toBeGreaterThan(chatModeClickIndex);
  expect(events[sendIndices[1]].composerMode).toBe("chat");

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerMode).toBe("chat");
});

test("handoff reads the authoritative full assistant selection instead of a later markdown fragment", async ({ harness }) => {
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

test("project handoff uses the exact project New Chat action and stays in the project route", async ({ harness }) => {
  await harness.load("http://mock.local/g/g-p-mock/c/start");
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("PROJECT_NEXT_TASK") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const events = await harness.events();
  const click = events.find((event) => event.type === "new-chat-click");
  expect(click?.kind).toBe("project");

  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.path).toMatch(/^\/g\/g-p-mock\/c\/mock-chat-/);
});

test("Project handoff resolves the current sidebar Project by route ID without a breadcrumb", async ({ harness }) => {
  await harness.load("http://mock.local/g/g-p-mock-market-flow-v2/c/start");
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("SIDEBAR_PROJECT_HANDOFF") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => {
    document.querySelector('nav[aria-label="Breadcrumb"]').remove();

    const sidebar = document.querySelector(".sidebar");
    const currentRow = document.createElement("div");
    currentRow.setAttribute("data-app-action-sidebar-project-id", "g-p-mock");
    currentRow.setAttribute("data-app-action-sidebar-project-label", "market-flow-v2");

    const correctButton = document.querySelector('[data-mock-action="project-new-chat"]');
    correctButton.setAttribute("aria-label", "New chat in market-flow-v2");
    currentRow.append(correctButton);

    // A button belonging to another Project with the same name must not be selected.
    const unrelatedRow = document.createElement("div");
    unrelatedRow.setAttribute("data-app-action-sidebar-project-id", "g-p-unrelated");
    unrelatedRow.setAttribute("data-app-action-sidebar-project-label", "market-flow-v2");
    const unrelatedButton = document.createElement("button");
    unrelatedButton.type = "button";
    unrelatedButton.textContent = "Wrong Project";
    unrelatedButton.setAttribute("aria-label", "New chat in market-flow-v2");
    unrelatedButton.addEventListener("click", () => {
      window.__wrongProjectClicked = true;
    });
    unrelatedRow.append(unrelatedButton);
    sidebar.prepend(unrelatedRow, currentRow);
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toContain("SIDEBAR_PROJECT_HANDOFF");

  const events = await harness.events();
  expect(events.find((event) => event.type === "new-chat-click")?.kind).toBe("project");

  const wrongProjectClicked = await harness.page.evaluate(() => !!window.__wrongProjectClicked);
  expect(wrongProjectClicked).toBe(false);
});

test("Project handoff refuses an unrelated sidebar Project instead of opening a regular chat", async ({ harness }) => {
  await harness.load("http://mock.local/g/g-p-mock/c/start");
  await harness.setScenario({
    responses: [{ type: "normal", text: handoffResponse("MUST_STAY_IN_PROJECT") }]
  });

  await harness.page.evaluate(() => {
    document.querySelector('nav[aria-label="Breadcrumb"]').remove();
    const unrelatedRow = document.createElement("div");
    unrelatedRow.setAttribute("data-app-action-sidebar-project-id", "g-p-unrelated");
    unrelatedRow.setAttribute("data-app-action-sidebar-project-label", "Mock Project");
    document.querySelector(".sidebar").append(unrelatedRow);
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  const events = await harness.events();
  expect(events.some((event) => event.type === "new-chat-click")).toBe(false);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.findLast((entry) => entry.event === "error")?.message)
    .toContain("no matching Project sidebar row or breadcrumb");
});

test("Deep work style and Collaborative decision mode persist across automatic handoff", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("DEEP_NEXT_TASK") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("deep", "collaborative"));
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);

  for (const prompt of sent) {
    expect(prompt).toContain("מקטע עבודה משמעותי אחד בלבד");
    expect(prompt).toContain("עצור וחכה להודעת ההמשך");
    expect(prompt).toContain("אל תעבור למקטע משמעותי נוסף באותה תשובה");
    expect(prompt).toContain("קבע נקודות מעבר טבעיות");
    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");
    expect(prompt).toContain("במצב Collaborative");
    expect(prompt).toContain("חכה להכרעת המשתמש");
  }

  expect(sent[1]).toContain("DEEP_NEXT_TASK");
  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
  expect(state.decisionMode).toBe("collaborative");
});

test("malformed handoff stops with an explicit error instead of silently continuing", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      {
        type: "normal",
        text: [
          "[[SEQUENCE_RUNNER_NEW_CHAT]]",
          "[[NEXT_CHAT_PROMPT]]",
          "BROKEN_HANDOFF",
          "[[/NEXT_CHAT_PROMPT]]"
        ].join("\n")
      }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR");

  const events = await harness.events();
  expect(events.some((event) => event.type === "new-chat-click")).toBeFalsy();

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  const error = log.findLast((entry) => entry.event === "error");
  expect(error?.message).toContain("Invalid new-chat handoff response");
});

test("a second handoff clears only a previously sent Runner prompt restored as a fresh-chat draft", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    secondChatDraft: "previous-handoff",
    responses: [
      { type: "normal", text: handoffResponse("FIRST_FRESH_CHAT") },
      { type: "normal", text: handoffResponse("SECOND_FRESH_CHAT") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[1]).toContain("FIRST_FRESH_CHAT");
  expect(sent[2]).toContain("SECOND_FRESH_CHAT");

  const events = await harness.events();
  expect(events.filter((event) => event.type === "new-chat-click")).toHaveLength(2);
  expect(events.filter((event) => event.type === "new-chat-draft-restored")).toHaveLength(1);
  expect(events.filter((event) => event.type === "send")).toHaveLength(3);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "handoff-restored-sent-draft-detected")).toHaveLength(1);
  expect(log.filter((entry) => entry.event === "handoff-restored-sent-draft-cleared")).toHaveLength(1);
  expect(log.some((entry) => entry.event === "error")).toBeFalsy();
});

test("a second handoff recognizes previously sent content after blank lines were collapsed", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    secondChatDraft: "previous-handoff-collapsed-lines",
    responses: [
      { type: "normal", text: handoffResponse("FIRST_FRESH_CHAT") },
      { type: "normal", text: handoffResponse("SECOND_FRESH_CHAT") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[2]).toContain("SECOND_FRESH_CHAT");

  const events = await harness.events();
  expect(events.filter((event) => event.type === "new-chat-draft-restored")).toHaveLength(1);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.some((entry) => entry.event === "handoff-restored-sent-draft-cleared")).toBeTruthy();
});

test("handoff clears a restored ordinary sent message from the old chat", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    secondChatDraft: "תמשיך לשלב הבא",
    secondChatDraftDelayMs: 80,
    responses: [
      { type: "normal", text: handoffResponse("FIRST_FRESH_CHAT") },
      { type: "normal", text: "MORE_WORK" },
      { type: "normal", text: handoffResponse("SECOND_FRESH_CHAT") },
      { type: "normal", text: "סיימתי" }
    ]
  });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(4);
  expect(sent[2]).toBe("תמשיך לשלב הבא");
  expect(sent[3]).toContain("SECOND_FRESH_CHAT");
  const events = await harness.events();
  const restored = events.find(event => event.type === "new-chat-draft-restored");
  expect(restored).toBeTruthy();
  expect(events.filter(event => event.type === "send")[3].at).toBeGreaterThan(restored.at);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter(event => event.event === "handoff-restored-sent-draft-cleared")
    .map(event => event.source)).toEqual(["old-chat-user-message"]);
});

test("a different draft in the new composer is preserved and blocks handoff", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    secondChatDraft: "USER_DRAFT_IN_FRESH_CHAT",
    responses: [
      { type: "normal", text: handoffResponse("FIRST_FRESH_CHAT") },
      { type: "normal", text: handoffResponse("SECOND_FRESH_CHAT") }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);

  const mock = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mock.composerText).toBe("USER_DRAFT_IN_FRESH_CHAT");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  const error = log.findLast((entry) => entry.event === "error");
  expect(error?.message).toContain("unrecognized draft");
  expect(log.some((entry) => entry.event === "handoff-restored-sent-draft-cleared")).toBeFalsy();
});

test("a late restored previous handoff draft is recognized before sending the next prompt", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    secondChatDraft: "previous-handoff-collapsed-lines",
    secondChatDraftDelayMs: 80,
    responses: [
      { type: "normal", text: handoffResponse("FIRST_FRESH_CHAT") },
      { type: "normal", text: handoffResponse("SECOND_FRESH_CHAT") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 5000);

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(3);
  expect(sent[2]).toContain("SECOND_FRESH_CHAT");

  const events = await harness.events();
  const restored = events.find((entry) => entry.type === "new-chat-draft-restored");
  const sends = events.filter((entry) => entry.type === "send");
  expect(restored).toBeTruthy();
  expect(sends[2].at).toBeGreaterThan(restored.at);

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter((entry) => entry.event === "handoff-composer-settled")).toHaveLength(2);
  expect(log.some((entry) => entry.event === "handoff-restored-sent-draft-cleared")).toBeTruthy();
  expect(log.some((entry) => entry.event === "error")).toBeFalsy();
});

test("a late unknown draft is not overwritten while the new-chat composer settles", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    secondChatDraft: "USER_DRAFT_AFTER_NAVIGATION",
    secondChatDraftDelayMs: 80,
    responses: [
      { type: "normal", text: handoffResponse("FIRST_FRESH_CHAT") },
      { type: "normal", text: handoffResponse("SECOND_FRESH_CHAT") }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR", 5000);

  expect(await harness.sentMessages()).toHaveLength(2);
  const mockState = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mockState.composerText).toBe("USER_DRAFT_AFTER_NAVIGATION");

  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  const error = log.findLast((entry) => entry.event === "error");
  expect(error?.message).toContain("unrecognized draft");
  expect(log.some((entry) => entry.event === "handoff-restored-sent-draft-cleared")).toBeFalsy();
});

const headerProjectId = "g-p-6ab84322612881918af6c8e3c0d1fc5b";
const headerProjectHome = "/g/" + headerProjectId + "/project";

async function installProjectHeader(harness, options = {}) {
  await harness.page.evaluate(({ home, options }) => {
    function appendLink(href, destination, hidden = false) {
      const link = document.createElement("a");
      link.className = "button-toolbar button-link";
      link.setAttribute("aria-label", "Mock Project");
      link.setAttribute("data-discover", "true");
      link.href = href;
      link.textContent = "Project";
      if (hidden) link.style.display = "none";
      link.addEventListener("click", event => {
        event.preventDefault();
        window.__mockChatGPT.openProjectHome(destination);
      });
      document.querySelector(".chat-header").append(link);
    }
    // An equally named Project and a hidden duplicate must never be used.
    appendLink("/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/project", "/g/g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/project");
    appendLink(home, "/g/g-p-hidden/project", true);
    if (!options.wrongOnly) {
      appendLink(home, options.destination || home);
    }
    if (options.noSidebar) document.querySelector(".sidebar").style.display = "none";
  }, { home: headerProjectHome, options });
}

test("Project toolbar handoff works in a narrow layout without the sidebar and across repeated fresh chats", async ({ harness }) => {
  await harness.page.setViewportSize({ width: 600, height: 800 });
  await harness.load("http://mock.local/g/" + headerProjectId + "-descriptive-slug/c/start");
  await installProjectHeader(harness, { noSidebar: true });
  await harness.setScenario({
    navigationClearDelayMs: 250,
    secondChatDraft: "previous-handoff-collapsed-lines",
    secondChatDraftDelayMs: 80,
    responses: [
      { type: "normal", text: handoffResponse("HEADER_FIRST") },
      { type: "normal", text: handoffResponse("HEADER_SECOND") },
      { type: "normal", text: "סיימתי" }
    ]
  });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 8000);

  const events = await harness.events();
  const clicks = events.filter(event => event.type === "new-chat-click");
  const ready = events.filter(event => event.type === "new-chat-ready");
  const sends = events.filter(event => event.type === "send");
  expect(clicks).toHaveLength(2);
  expect(clicks.map(event => event.to)).toEqual([headerProjectHome, headerProjectHome]);
  expect(sends).toHaveLength(3);
  expect(sends[1].path).toBe(headerProjectHome);
  expect(sends[2].path).toBe(headerProjectHome);
  expect(sends[1].text).toContain("HEADER_FIRST");
  expect(sends[2].text).toContain("HEADER_SECOND");
  expect(sends[1].at).toBeGreaterThanOrEqual(ready[0].at);
  expect(sends[2].at).toBeGreaterThanOrEqual(ready[1].at);
  expect((await harness.runnerState()).handoffCount).toBe(2);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.filter(event => event.event === "handoff-navigation-complete").map(event => event.strategy))
    .toEqual(["project-header-home", "project-header-home"]);
  expect(log.some(event => event.event === "handoff-restored-sent-draft-cleared")).toBe(true);
  const mock = await harness.page.evaluate(() => window.__mockChatGPT.getState());
  expect(mock.path).toBe("/g/" + headerProjectId + "/c/mock-chat-2");
});

test("Project toolbar link takes precedence over a visible sidebar action", async ({ harness }) => {
  await harness.load("http://mock.local/g/" + headerProjectId + "/c/start");
  await installProjectHeader(harness);
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("HEADER_PREFERRED") },
      { type: "normal", text: "סיימתי" }
    ]
  });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE", 4000);
  expect((await harness.events()).find(event => event.type === "new-chat-click")?.to).toBe(headerProjectHome);
});

test("Project toolbar handoff never sends after navigation reaches another Project", async ({ harness }) => {
  await harness.load("http://mock.local/g/" + headerProjectId + "/c/start");
  await installProjectHeader(harness, { noSidebar: true, destination: "/g/g-p-wrong/project" });
  await harness.setScenario({ responses: [{ type: "normal", text: handoffResponse("DO_NOT_SEND") }] });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR", 4000);
  expect(await harness.sentMessages()).toHaveLength(1);
  const log = await harness.page.evaluate(() => window.__sequenceRunner.getLog());
  expect(log.findLast(event => event.event === "error")?.message).toContain("expected Project");
});

test("Project toolbar handoff ignores unrelated and hidden links when the sidebar is unavailable", async ({ harness }) => {
  await harness.load("http://mock.local/g/" + headerProjectId + "/c/start");
  await installProjectHeader(harness, { noSidebar: true, wrongOnly: true });
  await harness.page.evaluate(() => document.querySelector('nav[aria-label="Breadcrumb"]')?.remove());
  await harness.setScenario({ responses: [{ type: "normal", text: handoffResponse("DO_NOT_SEND") }] });
  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("ERROR", 4000);
  expect(await harness.sentMessages()).toHaveLength(1);
  expect((await harness.events()).some(event => event.type === "new-chat-click")).toBe(false);
});
