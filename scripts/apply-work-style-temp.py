from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, content):
    Path(path).write_text(content, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_all_exact(text, old, new, expected, label):
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


runner = read("runner.js")
runner = replace_once(
    runner,
    '    const VERSION = "3.23";',
    '    const VERSION = "3.24";',
    "version bump",
)

runner = replace_once(
    runner,
    '''        '<option value="new">משימה חדשה — שלב אותה בהודעה הראשונה</option>',
        '</select>',
        '<textarea data-input="task-text" rows="4" placeholder="כתוב כאן את המשימה..." style="display:none;width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px"></textarea>',
        '<button type="button" data-action="start-run" style="width:100%;border:0;background:#15803d;color:#fff;border-radius:6px;padding:7px;cursor:pointer;font-weight:700">התחל ריצה</button>',
        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה יחד עם כללי ההמשך והסיום.</div>',
''',
    '''        '<option value="new">משימה חדשה — שלב אותה בהודעה הראשונה</option>',
        '</select>',
        '<select data-input="work-style" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="steady">Steady — התקדמות טבעית</option>',
        '<option value="deep">Deep — עבודה עמוקה ומקטעים משמעותיים</option>',
        '</select>',
        '<textarea data-input="task-text" rows="4" placeholder="כתוב כאן את המשימה..." style="display:none;width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px"></textarea>',
        '<button type="button" data-action="start-run" style="width:100%;border:0;background:#15803d;color:#fff;border-radius:6px;padding:7px;cursor:pointer;font-weight:700">התחל ריצה</button>',
        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Steady מתקדם בקצב טבעי. Deep מבצע מקטע משמעותי בכל המשך ומעודד מעבר לצ׳אט חדש בנקודות עבודה טבעיות. במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה.</div>',
''',
    "panel work-style selector",
)

runner = replace_once(
    runner,
    '''    let selectedTaskMode = "existing";
    let selectedTaskText = "";
    let runnerStartedAt = null;
''',
    '''    let selectedTaskMode = "existing";
    let selectedTaskText = "";
    let selectedWorkStyle = "steady";
    let runnerStartedAt = null;
''',
    "work-style state",
)

runner = replace_once(
    runner,
    r'''    function normalizeText(value) {
        return String(value == null ? "" : value)
            .replace(/\u00a0/g, " ")
            .replace(/\r\n/g, "\n")
            .trim();
    }

    function isDone(text) {
''',
    r'''    function normalizeText(value) {
        return String(value == null ? "" : value)
            .replace(/\u00a0/g, " ")
            .replace(/\r\n/g, "\n")
            .trim();
    }

    function normalizeWorkStyle(value) {
        return value === "deep"
            ? "deep"
            : "steady";
    }

    function isDone(text) {
''',
    "normalize work style",
)

old_prompt_block = '''    function getRunnerControlLines(startInstruction) {
        return [
            "בכל פעם שאכתוב 'תמשיך לשלב הבא', תתקדם שלב אחד בלבד.",
            "",
            "אל תכתוב 'סיימתי' בסוף שלב רגיל.",
            "",
            "אם כל המשימה הכוללת הסתיימה ואין עוד עבודה להמשך, סיים את התשובה בשורה:",
            "סיימתי",
            "",
            "אם העבודה בצ'אט הנוכחי הסתיימה אבל המשימה צריכה להמשיך בצ'אט חדש, כתוב:",
            "סיימתי",
            "ומיד אחריו:",
            "",
            CONFIG.HANDOFF_OUTER_START,
            "בשלב זה מומלץ לעבור לצ'אט חדש.",
            CONFIG.HANDOFF_PROMPT_START,
            "כאן כתוב את ההודעה הקצרה ביותר שמספיקה לצ'אט החדש כדי להמשיך נכון.",
            CONFIG.HANDOFF_PROMPT_END,
            CONFIG.HANDOFF_OUTER_END,
            "",
            "עבור לצ'אט חדש כאשר המעבר תוכנן מראש, או כאשר צ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך. אל תעבור רק משום שהסתיים שלב רגיל.",
            "",
            "בעת יצירת NEXT_CHAT_PROMPT, העדף שמירת כל מידע מתמשך במקור אמת חיצוני ומתועד, ועדכן אותו לפני המעבר אם חסר בו מידע חשוב. בפרומפט עצמו כלול רק מידע חיוני שלא ניתן לשחזר משם.",
            "",
            "בדיקת המפתח: האם צ'אט חדש שיקבל את NEXT_CHAT_PROMPT ויפעל לפיו יוכל להגיע למצב העדכני ולהמשיך נכון בלי להכיר את היסטוריית הצ'אט הזה?",
            "",
            "אם לא — קודם נסה לתעד או לעדכן את המידע החסר במקור האמת. רק מידע שלא ניתן לשמור או לשחזר משם צריך להיכלל בפרומפט.",
            "",
            "אל תשתמש בסימוני המעבר ואל תזכיר אותם אלא כאשר באמת עוברים לצ'אט חדש.",
            "",
            startInstruction
        ];
    }

    function buildFirstPrompt(mode, taskText) {
        const startInstruction =
            mode === "new"
                ? "עכשיו, התחל לבצע את המשימה והתקדם לשלב הראשון."
                : "עכשיו, תמשיך לשלב הבא.";

        if (mode !== "new") {
            return getRunnerControlLines(
                startInstruction
            ).join("\\n");
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
                startInstruction
            )
        ].join("\\n");
    }
'''

new_prompt_block = '''    function getRunnerControlLines(
        startInstruction,
        workStyle
    ) {
        const style =
            normalizeWorkStyle(workStyle);

        const workInstruction =
            style === "deep"
                ? "בכל פעם שאכתוב 'תמשיך לשלב הבא', התקדם שלב משמעותי אחד, ובתוכו בצע ברצף את כל תתי־השלבים, הבדיקות והתיקונים הנחוצים כדי להגיע לנקודת עצירה טבעית. אל תעצור אחרי פעולה טכנית קטנה בלבד."
                : "בכל פעם שאכתוב 'תמשיך לשלב הבא', המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית.";

        const handoffInstruction =
            style === "deep"
                ? "במצב Deep, תכנן את העבודה במקטעים משמעותיים שמתאימים לצ'אט אחד. קבע נקודות מעבר טבעיות: מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת. כאשר מקטע משמעותי הושלם והמשך העבודה עובר לשלב חדש, לנושא נפרד, או שצ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך — העדף לעבור לצ'אט חדש."
                : "עבור לצ'אט חדש כאשר המעבר תוכנן מראש, או כאשר צ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך. אל תעבור רק משום שהסתיים שלב רגיל.";

        return [
            workInstruction,
            "",
            "אל תכתוב 'סיימתי' בסוף שלב רגיל.",
            "",
            "אם כל המשימה הכוללת הסתיימה ואין עוד עבודה להמשך, סיים את התשובה בשורה:",
            "סיימתי",
            "",
            "אם העבודה בצ'אט הנוכחי הסתיימה אבל המשימה צריכה להמשיך בצ'אט חדש, כתוב:",
            "סיימתי",
            "ומיד אחריו:",
            "",
            CONFIG.HANDOFF_OUTER_START,
            "בשלב זה מומלץ לעבור לצ'אט חדש.",
            CONFIG.HANDOFF_PROMPT_START,
            "כאן כתוב את ההודעה הקצרה ביותר שמספיקה לצ'אט החדש כדי להמשיך נכון.",
            CONFIG.HANDOFF_PROMPT_END,
            CONFIG.HANDOFF_OUTER_END,
            "",
            handoffInstruction,
            "",
            "בעת יצירת NEXT_CHAT_PROMPT, העדף שמירת כל מידע מתמשך במקור אמת חיצוני ומתועד, ועדכן אותו לפני המעבר אם חסר בו מידע חשוב. בפרומפט עצמו כלול רק מידע חיוני שלא ניתן לשחזר משם.",
            "",
            "בדיקת המפתח: האם צ'אט חדש שיקבל את NEXT_CHAT_PROMPT ויפעל לפיו יוכל להגיע למצב העדכני ולהמשיך נכון בלי להכיר את היסטוריית הצ'אט הזה?",
            "",
            "אם לא — קודם נסה לתעד או לעדכן את המידע החסר במקור האמת. רק מידע שלא ניתן לשמור או לשחזר משם צריך להיכלל בפרומפט.",
            "",
            "אל תשתמש בסימוני המעבר ואל תזכיר אותם אלא כאשר באמת עוברים לצ'אט חדש.",
            "",
            startInstruction
        ];
    }

    function buildFirstPrompt(
        mode,
        taskText,
        workStyle
    ) {
        const style =
            normalizeWorkStyle(workStyle);

        const startInstruction =
            mode === "new"
                ? "עכשיו, התחל לבצע את המשימה והתקדם לשלב הראשון."
                : "עכשיו, תמשיך לשלב הבא.";

        if (mode !== "new") {
            return getRunnerControlLines(
                startInstruction,
                style
            ).join("\\n");
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
                style
            )
        ].join("\\n");
    }
'''
runner = replace_once(
    runner,
    old_prompt_block,
    new_prompt_block,
    "work-style prompt block",
)

runner = replace_once(
    runner,
    '''        return buildFirstPrompt(
            "new",
            prompt
        );
''',
    '''        return buildFirstPrompt(
            "new",
            prompt,
            selectedWorkStyle
        );
''',
    "handoff preserves work style",
)

runner = replace_once(
    runner,
    '''        const taskTextArea = panel.querySelector(
            '[data-input="task-text"]'
        );

        taskModeSelect?.addEventListener(
''',
    '''        const taskTextArea = panel.querySelector(
            '[data-input="task-text"]'
        );

        const workStyleSelect = panel.querySelector(
            '[data-input="work-style"]'
        );

        taskModeSelect?.addEventListener(
''',
    "panel work-style binding",
)

runner = replace_once(
    runner,
    '''                beginRun(
                    taskModeSelect?.value || "existing",
                    taskTextArea?.value || ""
                ).catch(function (err) {
''',
    '''                beginRun(
                    taskModeSelect?.value || "existing",
                    taskTextArea?.value || "",
                    workStyleSelect?.value || "steady"
                ).catch(function (err) {
''',
    "panel starts selected work style",
)

runner = replace_once(
    runner,
    '''        const taskText = panel.querySelector(
            '[data-input="task-text"]'
        );

        const inputs = [
''',
    '''        const taskText = panel.querySelector(
            '[data-input="task-text"]'
        );

        const workStyle = panel.querySelector(
            '[data-input="work-style"]'
        );

        const inputs = [
''',
    "reset queries work style",
)

runner = replace_once(
    runner,
    '''        if (taskMode) {
            taskMode.value = "existing";
        }

        if (taskText) {
''',
    '''        if (taskMode) {
            taskMode.value = "existing";
        }

        if (workStyle) {
            workStyle.value = "steady";
        }

        if (taskText) {
''',
    "reset work style selection",
)

runner = replace_once(
    runner,
    '''        selectedTaskMode = "existing";
        selectedTaskText = "";
        runnerStartedAt = null;
''',
    '''        selectedTaskMode = "existing";
        selectedTaskText = "";
        selectedWorkStyle = "steady";
        runnerStartedAt = null;
''',
    "restart resets work style",
)

runner = replace_once(
    runner,
    '''    async function beginRun(mode, taskText) {
''',
    '''    async function beginRun(
        mode,
        taskText,
        workStyle
    ) {
''',
    "beginRun signature",
)

runner = replace_once(
    runner,
    '''        const firstPrompt =
            buildFirstPrompt(mode, taskText);

        selectedTaskMode =
''',
    '''        const style =
            normalizeWorkStyle(workStyle);

        const firstPrompt =
            buildFirstPrompt(
                mode,
                taskText,
                style
            );

        selectedTaskMode =
''',
    "beginRun builds selected style prompt",
)

runner = replace_once(
    runner,
    '''        selectedTaskText =
            selectedTaskMode === "new"
                ? normalizeText(taskText)
                : "";

        runStarted = true;
''',
    '''        selectedTaskText =
            selectedTaskMode === "new"
                ? normalizeText(taskText)
                : "";

        selectedWorkStyle = style;

        runStarted = true;
''',
    "beginRun stores work style",
)

runner = replace_all_exact(
    runner,
    '''                taskMode: selectedTaskMode,
''',
    '''                taskMode: selectedTaskMode,
                workStyle: selectedWorkStyle,
''',
    2,
    "diagnostic/public work-style state",
)

runner = replace_once(
    runner,
    '''            taskMode: selectedTaskMode,
            hasTaskText:
''',
    '''            taskMode: selectedTaskMode,
            workStyle: selectedWorkStyle,
            hasTaskText:
''',
    "run-started work style",
)

runner = replace_once(
    runner,
    '''        startExistingContext: function () {
            return beginRun(
                "existing",
                ""
            );
        },
        startWithTask: function (taskText) {
            return beginRun(
                "new",
                taskText
            );
        },
''',
    '''        startExistingContext: function (workStyle) {
            return beginRun(
                "existing",
                "",
                workStyle
            );
        },
        startWithTask: function (taskText, workStyle) {
            return beginRun(
                "new",
                taskText,
                workStyle
            );
        },
''',
    "public start APIs accept work style",
)

write("runner.js", runner)

core = read("tests/e2e/core.spec.js")
core = core.replace('version: "3.23"', 'version: "3.24"')
core = replace_once(
    core,
    '''  expect(sent[0]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");
  expect(sent[1]).toBe("תמשיך לשלב הבא");
''',
    '''  expect(sent[0]).toContain("בכל פעם שאכתוב 'תמשיך לשלב הבא'");
  expect(sent[0]).toContain("המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית.");
  expect(sent[0]).not.toContain("תתקדם שלב אחד בלבד");
  expect(sent[1]).toBe("תמשיך לשלב הבא");
''',
    "steady default regression",
)

deep_ui_test = '''\ntest("work-style selector can start a Deep run", async ({ harness }) => {
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
  expect(firstPrompt).toContain("אל תעצור אחרי פעולה טכנית קטנה בלבד");
  expect(firstPrompt).toContain("קבע נקודות מעבר טבעיות");
  expect(firstPrompt).not.toContain("תתקדם שלב אחד בלבד");

  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
});
'''
core = replace_once(
    core,
    '\ntest("committed bookmarklet artifact boots the same runner in a browser", async ({ harness }) => {',
    deep_ui_test + '\ntest("committed bookmarklet artifact boots the same runner in a browser", async ({ harness }) => {',
    "deep panel regression",
)
write("tests/e2e/core.spec.js", core)

diagnostic = read("tests/e2e/diagnostic.spec.js")
diagnostic = replace_all_exact(
    diagnostic,
    '"3.23"',
    '"3.24"',
    2,
    "diagnostic version expectations",
)
write("tests/e2e/diagnostic.spec.js", diagnostic)

handoff = read("tests/e2e/handoff.spec.js")
deep_handoff_test = '''\ntest("Deep work style persists across automatic handoff", async ({ harness }) => {
  await harness.load();
  await harness.setScenario({
    responses: [
      { type: "normal", text: handoffResponse("DEEP_NEXT_TASK") },
      { type: "normal", text: "סיימתי" }
    ]
  });

  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("deep"));
  await harness.waitForState("DONE");

  const sent = await harness.sentMessages();
  expect(sent).toHaveLength(2);

  for (const prompt of sent) {
    expect(prompt).toContain("התקדם שלב משמעותי אחד");
    expect(prompt).toContain("קבע נקודות מעבר טבעיות");
    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");
  }

  expect(sent[1]).toContain("DEEP_NEXT_TASK");
  expect((await harness.runnerState()).workStyle).toBe("deep");
});
'''
handoff = replace_once(
    handoff,
    '\ntest("malformed handoff stops with an explicit error instead of silently continuing", async ({ harness }) => {',
    deep_handoff_test + '\ntest("malformed handoff stops with an explicit error instead of silently continuing", async ({ harness }) => {',
    "deep handoff regression",
)
write("tests/e2e/handoff.spec.js", handoff)

readme = read("README.md")
work_style_docs = '''## Work style\n\nThe start panel exposes a per-run **Work Style** configuration with two deliberately simple flavours:\n\n- **Steady** (default) — tells the assistant to keep progressing naturally until a sensible stopping point. It removes the old `one step only` pressure without forcing a large work block.\n- **Deep** — tells the assistant to complete a substantial stage, including related sub-steps, checks and fixes, before stopping. It also strengthens chat-rollover planning: define natural boundaries, finish the current chat's work segment, decide what the next chat should own, persist durable state, and prefer a fresh chat when the next segment benefits from clean context.\n\nThe word `שלב` and the continuation command `תמשיך לשלב הבא` remain part of the protocol; the style changes how much coherent work the assistant is encouraged to complete for that continuation. A selected style is preserved automatically across an automatic chat handoff.\n\nProgrammatic starts accept the same optional style (`"steady"` or `"deep"`):\n\n```js\n__sequenceRunner.startExistingContext("deep")\n__sequenceRunner.startWithTask("TASK_TEXT", "deep")\n```\n\nUnknown or omitted style values safely fall back to `steady`.\n\n'''
readme = replace_once(
    readme,
    "## Technical design\n",
    work_style_docs + "## Technical design\n",
    "README work-style docs",
)
write("README.md", readme)

agents = read("AGENTS.md")
agent_anchor = '''- When the current chat is complete but work must continue in a new chat, the assistant is instructed to write `סיימתי` and then the valid handoff block. Because the handoff block is the final content, the runner continues instead of treating that local chat completion as global completion.\n\nThe longer-term product direction is a generic sequence/workflow runner, not a script hard-coded forever to one Hebrew prompt.\n'''
agent_replacement = '''- When the current chat is complete but work must continue in a new chat, the assistant is instructed to write `סיימתי` and then the valid handoff block. Because the handoff block is the final content, the runner continues instead of treating that local chat completion as global completion.\n\nWork style is a per-run prompt contract:\n\n- `steady` is the default. It asks the assistant to progress naturally to a sensible stopping point and must not reintroduce the old `תתקדם שלב אחד בלבד` wording.\n- `deep` asks for a substantial stage of work, including related sub-steps, checks and fixes, before stopping. It also strengthens rollover planning: define natural chat boundaries, close the current work segment, decide what the next chat should own, persist durable state, and prefer a fresh chat when that improves focus.\n- Keep the continuation command and the concept of `שלב`; work style changes the intended amount of coherent work, not the runner state-machine protocol.\n- Preserve the selected work style across automatic handoff so the fresh chat receives the same work-depth contract.\n\nThe longer-term product direction is a generic sequence/workflow runner, not a script hard-coded forever to one Hebrew prompt.\n'''
agents = replace_once(
    agents,
    agent_anchor,
    agent_replacement,
    "AGENTS work-style contract",
)
write("AGENTS.md", agents)

print("Work-style implementation applied successfully.")
