import { test, expect } from "./fixture.js";

test("canonical runner completes a normal multi-step sequence", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Step one complete." },
      { type: "normal", text: "All work complete.\nסיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[0].length).toBeLessThan(2300);
  expect(sent[0]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");
  expect(sent[0]).toContain("המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית.");
  expect(sent[0]).toContain("חלק את העבודה למקטעים לפי מטרות ותוצאות");
  expect(sent[0]).toContain("העדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים");
  expect(sent[0]).toContain("במצב Autonomous");
  expect(sent[0]).not.toContain("תתקדם שלב אחד בלבד");
  expect(sent[1]).toBe("תמשיך לשלב הבא");
});

test("completion marker is accepted only when it is the final non-empty line", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "סיימתי\nאבל זה לא סוף התשובה" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe("תמשיך לשלב הבא");
});

test("negative wording does not count as completion", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "עדיין לא סיימתי" },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext());
  await harness.waitForState("DONE");

  expect(await harness.sentMessages()).toHaveLength(2);
});

test("opening-message-already-sent uses a compact safety contract", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: "Checkpoint complete." },
      { type: "normal", text: "סיימתי" }
    ]
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

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatch(/^תמשיך לשלב הבא./);
  expect(sent[0]).toContain("אם כל המשימה הסתיימה ואין עוד עבודה");
  expect(sent[0]).toContain("סיימתי");
  expect(sent[0]).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");
  expect(sent[0]).toContain("[[NEXT_CHAT_PROMPT]]");
  expect(sent[0]).toContain("הודעת הפתיחה הקודמת נשארת בתוקף");
  expect(sent[0].length).toBeLessThan(900);
  expect(sent[1]).toBe("תמשיך לשלב הבא");

  const state = await harness.runnerState();
  expect(state.taskMode).toBe("existing");
  expect(state.skipFirstMessage).toBe(true);
});

test("compact existing-ready contract preserves work style and decision mode", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });

  await harness.page.locator('[data-input="task-mode"]').selectOption("existing-ready");
  await harness.page.locator('[data-input="work-style"]').selectOption("deep");
  await harness.page.locator('[data-input="decision-mode"]').selectOption("collaborative");
  await harness.page.locator('[data-action="start-run"]').click();
  await harness.waitForState("DONE");

  const [firstPrompt] = await harness.sentMessages();
  expect(firstPrompt).toContain("Deep:");
  expect(firstPrompt).toContain("Collaborative:");
  expect(firstPrompt).toContain("סיימתי");
  expect(firstPrompt).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");

  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
  expect(state.decisionMode).toBe("collaborative");
});

test("compact full contract preserves every original semantic topic", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({ responses: [{ type: "normal", text: "סיימתי" }] });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("deep", "collaborative"));
  await harness.waitForState("DONE");

  const [prompt] = await harness.sentMessages();
  const requiredTopics = [
    "תמשיך לשלב הבא",
    "התקדם שלב משמעותי אחד",
    "מקטע עבודה משמעותי",
    "תתי־שלבים",
    "בדיקות ותיקונים",
    "חלק את העבודה למקטעים לפי מטרות ותוצאות",
    "העדף מספר קטן של מקטעים משמעותיים",
    "נקודת checkpoint טבעית",
    "תוצאה משמעותית שניתן לאמת",
    "סוג עבודה שונה מהותית",
    "פעולה בעלת סיכון משמעותי",
    "במצב Collaborative",
    "כמה חלופות סבירות",
    "הצג בקצרה אפשרויות והמלצה",
    "חכה להכרעת המשתמש",
    "אל תעצור על החלטות שגרתיות",
    "אל תכתוב 'סיימתי' בסוף שלב רגיל",
    "אם כל המשימה הכוללת הסתיימה",
    "אם העבודה בצ'אט הנוכחי הסתיימה אבל המשימה ממשיכה בצ'אט חדש",
    "[[SEQUENCE_RUNNER_NEW_CHAT]]",
    "[[NEXT_CHAT_PROMPT]]",
    "[[/NEXT_CHAT_PROMPT]]",
    "[[/SEQUENCE_RUNNER_NEW_CHAT]]",
    "כתוכן האחרון בתשובה",
    "קבע נקודות מעבר טבעיות",
    "מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת",
    "שלב חדש, נושא נפרד",
    "ישפר משמעותית את הפוקוס או איכות ההמשך",
    "מקור אמת חיצוני ומתועד",
    "עדכן אותו לפני המעבר",
    "רק מידע חיוני שלא ניתן לשחזר ממנו",
    "בדיקת המפתח",
    "בלי להכיר את היסטוריית הצ'אט הזה",
    "רק מה שלא ניתן לשמור או לשחזר משם",
    "אל תשתמש בסימוני המעבר ואל תזכיר אותם אלא כאשר באמת עוברים לצ'אט חדש"
  ];

  for (const topic of requiredTopics) {
    expect(prompt, "missing semantic topic: " + topic).toContain(topic);
  }
});

test("new-task mode embeds the task into the first runner prompt", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי" }]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startWithTask("TASK_ALPHA_123"));
  await harness.waitForState("DONE");

  const [firstPrompt] = await harness.sentMessages();
  expect(firstPrompt).toContain("זו המשימה שעליך לבצע כעת:");
  expect(firstPrompt).toContain("TASK_ALPHA_123");
  expect(firstPrompt).toContain("[[SEQUENCE_RUNNER_NEW_CHAT]]");
});

test("work-style selector can start a Deep run", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי" }]
  });

  const workStyle = harness.page.locator('[data-input="work-style"]');
  await expect(workStyle).toHaveValue("steady");
  await workStyle.selectOption("deep");
  await harness.page.locator('[data-action="start-run"]').click();
  await harness.waitForState("DONE");

  const [firstPrompt] = await harness.sentMessages();
  expect(firstPrompt).toContain("התקדם שלב משמעותי אחד");
  expect(firstPrompt).toContain("מקטע עבודה משמעותי");
  expect(firstPrompt).toContain("חלק את העבודה למקטעים לפי מטרות ותוצאות");
  expect(firstPrompt).toContain("העדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים");
  expect(firstPrompt).toContain("קבע נקודות מעבר טבעיות");
  expect(firstPrompt).not.toContain("תתקדם שלב אחד בלבד");

  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
  expect(state.decisionMode).toBe("autonomous");
});

test("decision-mode selector can request Collaborative checkpoints", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [{ type: "normal", text: "סיימתי" }]
  });

  const decisionMode = harness.page.locator('[data-input="decision-mode"]');
  await expect(decisionMode).toHaveValue("autonomous");
  await decisionMode.selectOption("collaborative");
  await harness.page.locator('[data-action="start-run"]').click();
  await harness.waitForState("DONE");

  const [firstPrompt] = await harness.sentMessages();
  expect(firstPrompt).toContain("במצב Collaborative");
  expect(firstPrompt).toContain("עצור בנקודת checkpoint");
  expect(firstPrompt).toContain("חכה להכרעת המשתמש");
  expect(firstPrompt).not.toContain("קבל בעצמך את ההחלטה הסבירה הטובה ביותר");

  const state = await harness.runnerState();
  expect(state.decisionMode).toBe("collaborative");
});

test("committed bookmarklet artifact boots the same runner in a browser", async ({ harness }) => {
  await harness.loadBookmarklet();

  const result = await harness.page.evaluate(() => ({
    version: window.__sequenceRunner.version,
    state: window.__sequenceRunner.getState().state,
    panel: !!document.querySelector("#sequence-runner-panel")
  }));

  expect(result).toEqual({
    version: "3.32",
    state: "READY_TO_START",
    panel: true
  });
});
