import fs from "node:fs";

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Missing expected ${label}: ${needle}`);
  }
}

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) {
    throw new Error(`Could not find ${label}`);
  }
  if (text.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Expected exactly one ${label}`);
  }
  return text.slice(0, first) + after + text.slice(first + before.length);
}

function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not locate ${label}`);
  }
  return text.slice(0, start) + replacement + text.slice(end);
}

let runner = fs.readFileSync("runner.js", "utf8");
assertIncludes(runner, 'const VERSION = "3.31";', "runner version");
runner = runner.replace('const VERSION = "3.31";', 'const VERSION = "3.32";');

const promptHelpers = `    function getWorkInstruction(workStyle) {
        return normalizeWorkStyle(workStyle) === "deep"
            ? "בכל פעם שאכתוב 'תמשיך לשלב הבא', התקדם שלב משמעותי אחד: בצע ברצף מקטע עבודה משמעותי, כולל תתי־שלבים, בדיקות ותיקונים נחוצים, עד יעד ברור ומאומת. חלק את העבודה למקטעים לפי מטרות ותוצאות, אל תעצור אחרי פעולה טכנית קטנה, והעדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים."
            : "בכל פעם שאכתוב 'תמשיך לשלב הבא', המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית. חלק את העבודה למקטעים לפי מטרות ותוצאות, השלם ואמת יעד ברור בכל מקטע; אל תכפה מקטע גדול כשאין צורך ואל תעצור אחרי פעולה טכנית קטנה, והעדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים.";
    }

    function getCheckpointInstruction() {
        return "סיים מקטע בנקודת checkpoint טבעית: לאחר תוצאה משמעותית שניתן לאמת, כשהשלב הבא הוא סוג עבודה שונה מהותית, או לפני פעולה בעלת סיכון משמעותי. החלטה משמעותית מחייבת עצירה למשתמש רק במצב Collaborative.";
    }

    function getDecisionInstruction(decisionMode) {
        return normalizeDecisionMode(decisionMode) === "collaborative"
            ? "במצב Collaborative, כשנדרשת החלטה משמעותית עם כמה חלופות סבירות שמשפיעות מהותית על ההמשך, עצור בנקודת checkpoint, הצג בקצרה אפשרויות והמלצה וחכה להכרעת המשתמש. אל תעצור על החלטות שגרתיות או כאלה שניתן להסיק בבטחה."
            : "במצב Autonomous, קבל בעצמך את ההחלטה הסבירה הטובה ביותר לפי המטרה והמידע והמשך; תעד בקצרה החלטות מהותיות כשמועיל. שאל רק אם חסר מידע חיוני שלא ניתן להסיק באופן סביר או נדרש אישור מפורש.";
    }

    function getHandoffPolicyInstruction(workStyle) {
        return normalizeWorkStyle(workStyle) === "deep"
            ? "במצב Deep, תכנן מקטעים משמעותיים שמתאימים לצ'אט אחד וקבע נקודות מעבר טבעיות: מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת. לאחר מקטע משמעותי העדף מעבר אם ההמשך הוא שלב חדש, נושא נפרד, או שצ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך."
            : "עבור לצ'אט חדש כשהמעבר תוכנן מראש או כשצ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך; אל תעבור רק משום שהסתיים שלב רגיל.";
    }

    function getRunnerControlLines(
        startInstruction,
        workStyle,
        decisionMode
    ) {
        return [
            getWorkInstruction(workStyle),
            "",
            getCheckpointInstruction(),
            "",
            getDecisionInstruction(decisionMode),
            "",
            "אל תכתוב 'סיימתי' בסוף שלב רגיל. אם כל המשימה הכוללת הסתיימה ואין עוד עבודה להמשך, סיים בשורה נפרדת:",
            "סיימתי",
            "",
            "אם העבודה בצ'אט הנוכחי הסתיימה אבל המשימה ממשיכה בצ'אט חדש, כתוב סיימתי ואז, כתוכן האחרון בתשובה:",
            CONFIG.HANDOFF_OUTER_START,
            "בשלב זה מומלץ לעבור לצ'אט חדש.",
            CONFIG.HANDOFF_PROMPT_START,
            "כאן כתוב את ההודעה הקצרה ביותר שמספיקה לצ'אט החדש כדי להמשיך נכון.",
            CONFIG.HANDOFF_PROMPT_END,
            CONFIG.HANDOFF_OUTER_END,
            "",
            getHandoffPolicyInstruction(workStyle),
            "",
            "בעת יצירת NEXT_CHAT_PROMPT, העדף מקור אמת חיצוני ומתועד: עדכן אותו לפני המעבר אם חסר בו מידע חשוב, ובפרומפט כלול רק מידע חיוני שלא ניתן לשחזר ממנו.",
            "בדיקת המפתח: האם צ'אט חדש שיקבל את NEXT_CHAT_PROMPT יוכל להגיע למצב העדכני ולהמשיך נכון בלי להכיר את היסטוריית הצ'אט הזה? אם לא, קודם נסה לתעד או לעדכן את המידע החסר במקור האמת; רק מה שלא ניתן לשמור או לשחזר משם ייכלל בפרומפט.",
            "",
            "אל תשתמש בסימוני המעבר ואל תזכיר אותם אלא כאשר באמת עוברים לצ'אט חדש.",
            "",
            startInstruction
        ];
    }

    function buildCompactExistingReadyPrompt(
        workStyle,
        decisionMode
    ) {
        const style = normalizeWorkStyle(workStyle);
        const decisions = normalizeDecisionMode(decisionMode);
        const workInstruction =
            style === "deep"
                ? "Deep: בצע שלב משמעותי שלם עד תוצאה ברורה ומאומתת, כולל בדיקות ותיקונים נחוצים."
                : "Steady: התקדם עד checkpoint טבעי עם תוצאה ברורה ומאומתת; אל תעצור אחרי פעולה טכנית קטנה.";
        const decisionInstruction =
            decisions === "collaborative"
                ? "Collaborative: בהחלטה משמעותית עם כמה חלופות סבירות עצור, הצג אפשרויות והמלצה וחכה להכרעת המשתמש."
                : "Autonomous: קבל החלטות סבירות והמשך; שאל רק אם חסר מידע חיוני שלא ניתן להסיק או נדרש אישור.";

        return [
            "תמשיך לשלב הבא.",
            workInstruction,
            decisionInstruction,
            "אל תכתוב 'סיימתי' בסוף שלב רגיל. אם כל המשימה הסתיימה ואין עוד עבודה, סיים בשורה נפרדת:",
            "סיימתי",
            "אם הצ'אט הזה הסתיים אבל המשימה ממשיכה בצ'אט חדש, כתוב סיימתי ואז בסוף:",
            CONFIG.HANDOFF_OUTER_START,
            "בשלב זה מומלץ לעבור לצ'אט חדש.",
            CONFIG.HANDOFF_PROMPT_START,
            "ההודעה הקצרה ביותר שמספיקה לצ'אט החדש להמשיך נכון.",
            CONFIG.HANDOFF_PROMPT_END,
            CONFIG.HANDOFF_OUTER_END,
            "השתמש במעבר רק כשבאמת צריך צ'אט חדש; הודעת הפתיחה הקודמת נשארת בתוקף."
        ].join("\n");
    }

    function buildFirstPrompt(
        mode,
        taskText,
        workStyle,
        decisionMode
    ) {
        const style = normalizeWorkStyle(workStyle);
        const decisions = normalizeDecisionMode(decisionMode);
        const startInstruction =
            mode === "new"
                ? "עכשיו, התחל לבצע את המשימה והתקדם לשלב הראשון."
                : "עכשיו, תמשיך לשלב הבא.";

        if (mode !== "new") {
            return getRunnerControlLines(
                startInstruction,
                style,
                decisions
            ).join("\n");
        }

        const task = normalizeText(taskText);

        if (!task) {
            throw new Error(
                "A task is required when starting in new-task mode."
            );
        }

        return [
            "זו המשימה שעליך לבצע כעת:",
            task,
            "",
            ...getRunnerControlLines(
                startInstruction,
                style,
                decisions
            )
        ].join("\n");
    }

    function buildHandoffPrompt(nextChatPrompt) {
        const prompt = normalizeText(nextChatPrompt);

        if (!prompt) {
            throw new Error(
                "The next-chat prompt cannot be empty."
            );
        }

        const chatTitleInstruction =
            "שם הצ'אט: אם מופיע במשימה מספר צ'אט ברור, שם הצ'אט צריך להיות \"צ'אט N\" לפי אותו מספר. אם אין מספר צ'אט ברור, תן לצ'אט שם קצר ותיאורי שמסכם את מה שהצ'אט הזה מתוכנן לבצע.";

        return buildFirstPrompt(
            "new",
            [
                prompt,
                "",
                chatTitleInstruction
            ].join("\n"),
            selectedWorkStyle,
            selectedDecisionMode
        );
    }

`;

runner = replaceBetween(
  runner,
  "    function getRunnerControlLines(",
  "    function parseHandoff(",
  promptHelpers,
  "prompt helper block"
);

const oldFirstPrompt = `        const firstPrompt =
            shouldSkipFirstMessage
                ? CONFIG.REGULAR_PROMPT
                : buildFirstPrompt(
                      mode,
                      taskText,
                      style,
                      decisions
                  );`;
const newFirstPrompt = `        const firstPrompt =
            shouldSkipFirstMessage
                ? buildCompactExistingReadyPrompt(
                      style,
                      decisions
                  )
                : buildFirstPrompt(
                      mode,
                      taskText,
                      style,
                      decisions
                  );`;
runner = replaceOnce(runner, oldFirstPrompt, newFirstPrompt, "existing-ready first prompt selection");
fs.writeFileSync("runner.js", runner);

let core = fs.readFileSync("tests/e2e/core.spec.js", "utf8");
core = replaceOnce(
  core,
  "  expect(sent).toHaveLength(2);\n  expect(sent[0]).toContain(\"בכל פעם שאכתוב 'תמשיך לשלב הבא'\");",
  "  expect(sent).toHaveLength(2);\n  expect(sent[0].length).toBeLessThan(2300);\n  expect(sent[0]).toContain(\"בכל פעם שאכתוב 'תמשיך לשלב הבא'\");",
  "compact full-prompt length assertion"
);

const existingReadyStart = 'test("opening-message-already-sent is a distinct start mode"';
const existingReadyEnd = 'test("new-task mode embeds the task into the first runner prompt"';
const existingReadyReplacement = `test("opening-message-already-sent uses a compact safety contract", async ({ harness }) => {
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
  expect(sent[0]).toMatch(/^תמשיך לשלב הבא\./);
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
    expect(prompt, `missing semantic topic: ${topic}`).toContain(topic);
  }
});

`;
core = replaceBetween(core, existingReadyStart, existingReadyEnd, existingReadyReplacement, "existing-ready regression tests");
fs.writeFileSync("tests/e2e/core.spec.js", core);

for (const file of fs.readdirSync("tests/e2e")) {
  if (!file.endsWith(".js")) continue;
  const path = `tests/e2e/${file}`;
  const text = fs.readFileSync(path, "utf8");
  if (text.includes('"3.31"')) {
    fs.writeFileSync(path, text.replaceAll('"3.31"', '"3.32"'));
  }
}

let readme = fs.readFileSync("README.md", "utf8");
readme = replaceOnce(
  readme,
  "- **Existing task + opening message already sent** — assumes the full opening contract is already present in the conversation and sends only `תמשיך לשלב הבא` as the first runner send.",
  "- **Existing task + opening message already sent** — assumes the full opening contract is already present, but still sends a very short first safety contract. It starts with `תמשיך לשלב הבא`, preserves the selected work/decision mode, reinforces `סיימתי` and handoff semantics, and then returns to the plain continuation prompt on later cycles.",
  "README existing-ready description"
);
readme = replaceOnce(
  readme,
  "The opening-message-already-sent choice is a start mode, not a separate checkbox. It affects only run startup; automatic handoff behavior is unchanged. Programmatic callers may still request the same behavior through the third argument to `startExistingContext(workStyle, decisionMode, skipFirstMessage)`.",
  "The opening-message-already-sent choice is a start mode, not a separate checkbox. Its first runner message is intentionally compact rather than only `תמשיך לשלב הבא`: this prevents a completed task from omitting `סיימתי` and preserves handoff plus the selected work/decision semantics. Later cycles still use only `תמשיך לשלב הבא`. Programmatic callers may request the same compact startup through the third argument to `startExistingContext(workStyle, decisionMode, skipFirstMessage)`.",
  "README compact startup semantics"
);
readme = replaceOnce(
  readme,
  "- Initial instruction: a multi-step continuation contract.",
  "- Initial instruction: a compact continuation/completion/handoff contract that preserves the full original semantics without repeated prose; existing-ready uses an even shorter safety contract.",
  "README initial instruction summary"
);
fs.writeFileSync("README.md", readme);

let agents = fs.readFileSync("AGENTS.md", "utf8");
agents = replaceOnce(
  agents,
  "- existing-ready mode, shown to the user as `המשימה והודעת הפתיחה כבר נשלחו בצ׳אט`; this is a peer start mode, not a checkbox, and sends only `תמשיך לשלב הבא` as the first runner send",
  "- existing-ready mode, shown to the user as `המשימה והודעת הפתיחה כבר נשלחו בצ׳אט`; this is a peer start mode, not a checkbox, and sends a compact first safety contract that starts with `תמשיך לשלב הבא`, reinforces completion/handoff semantics and preserves the selected work/decision mode; later cycles use the plain continuation prompt",
  "AGENTS existing-ready rule"
);
agents = replaceOnce(
  agents,
  "The first runner prompt installs a machine-readable handoff contract.",
  "The first runner prompt installs a machine-readable handoff contract. Keep the full opening contract concise by removing repetition, never by dropping a semantic topic. Regression coverage must protect the original work-style, segmentation, checkpoint, decision, completion, handoff, rollover and durable-source/NEXT_CHAT_PROMPT rules. The existing-ready mode may use a smaller first safety contract because the full opening already exists in chat, but it must still reinforce completion and handoff semantics.",
  "AGENTS semantic-parity rule"
);
fs.writeFileSync("AGENTS.md", agents);

console.log("Applied compact opening-contract patch with semantic parity checks.");
