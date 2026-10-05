from pathlib import Path


def replace_exact(text, old, new, label, count=1):
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f"{label}: expected {count} occurrence(s), found {actual}")
    return text.replace(old, new, count)


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


runner_path = Path("runner.js")
runner = runner_path.read_text(encoding="utf-8")

runner = replace_exact(
    runner,
    'const VERSION = "3.24";',
    'const VERSION = "3.25";',
    "version",
)

runner = replace_exact(
    runner,
    '''        '<select data-input="work-style" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="steady">Steady — התקדמות טבעית</option>',
        '<option value="deep">Deep — עבודה עמוקה ומקטעים משמעותיים</option>',
        '</select>',
        '<textarea data-input="task-text" rows="4" placeholder="כתוב כאן את המשימה..." style="display:none;width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px"></textarea>',
''',
    '''        '<select data-input="work-style" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="steady">Steady — התקדמות טבעית</option>',
        '<option value="deep">Deep — עבודה עמוקה ומקטעים משמעותיים</option>',
        '</select>',
        '<select data-input="decision-mode" style="width:100%;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px 7px;margin-bottom:6px">',
        '<option value="autonomous">Autonomous — קבל החלטות והמשך</option>',
        '<option value="collaborative">Collaborative — עצור בהחלטות מהותיות</option>',
        '</select>',
        '<textarea data-input="task-text" rows="4" placeholder="כתוב כאן את המשימה..." style="display:none;width:100%;box-sizing:border-box;resize:vertical;background:#0b1220;color:#fff;border:1px solid #374151;border-radius:6px;padding:7px;margin-bottom:6px"></textarea>',
''',
    "decision-mode select",
)

runner = replace_exact(
    runner,
    '''        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Steady מתקדם בקצב טבעי. Deep מבצע מקטע משמעותי בכל המשך ומעודד מעבר לצ׳אט חדש בנקודות עבודה טבעיות. במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה.</div>',
''',
    '''        '<div style="margin-top:6px;font-size:11px;color:#94a3b8">Steady ו־Deep עובדים במקטעים לפי מטרות ותוצאות; Deep דוחף למקטעים גדולים יותר. Autonomous מקבל החלטות סבירות וממשיך, Collaborative עוצר בהחלטות מהותיות. במצב “משימה חדשה” הטקסט משתלב בתוך הודעת הפתיחה.</div>',
''',
    "panel help",
)

runner = replace_exact(
    runner,
    '''    let selectedWorkStyle = "steady";
    let runnerStartedAt = null;
''',
    '''    let selectedWorkStyle = "steady";
    let selectedDecisionMode = "autonomous";
    let runnerStartedAt = null;
''',
    "decision state variable",
)

runner = replace_exact(
    runner,
    '''    function normalizeWorkStyle(value) {
        return value === "deep"
            ? "deep"
            : "steady";
    }

''',
    '''    function normalizeWorkStyle(value) {
        return value === "deep"
            ? "deep"
            : "steady";
    }

    function normalizeDecisionMode(value) {
        return value === "collaborative"
            ? "collaborative"
            : "autonomous";
    }

''',
    "decision normalizer",
)

control_functions = '''    function getRunnerControlLines(
        startInstruction,
        workStyle,
        decisionMode
    ) {
        const style =
            normalizeWorkStyle(workStyle);

        const decisions =
            normalizeDecisionMode(decisionMode);

        const workInstruction =
            style === "deep"
                ? "בכל פעם שאכתוב 'תמשיך לשלב הבא', התקדם שלב משמעותי אחד. בתוך השלב בצע ברצף מקטע עבודה משמעותי, כולל כל תתי־השלבים, הבדיקות והתיקונים הקשורים שנחוצים כדי להשיג יעד ברור ולאמת אותו. אל תעצור אחרי פעולה טכנית קטנה בלבד."
                : "בכל פעם שאכתוב 'תמשיך לשלב הבא', המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית. אל תכפה מקטע גדול כשאין בכך צורך, אך גם אל תעצור אחרי פעולה טכנית קטנה אם עדיין לא הושג יעד ברור שניתן לאמת.";

        const segmentInstruction =
            "חלק את העבודה למקטעים לפי מטרות ותוצאות, לא לפי פעולות טכניות קטנות. בתוך כל מקטע השלם את כל העבודה הדרושה להשגת יעד ברור ואמת את התוצאה לפני עצירה. בדרך כלל העדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים.";

        const checkpointInstruction =
            "סיים מקטע בנקודת checkpoint טבעית: לאחר שהושגה תוצאה משמעותית שניתן לאמת, כאשר השלב הבא הוא סוג עבודה שונה מהותית, או לפני פעולה בעלת סיכון משמעותי. החלטה משמעותית מחייבת עצירה למשתמש רק כאשר מצב ההחלטות הוא Collaborative.";

        const decisionInstruction =
            decisions === "collaborative"
                ? "במצב Collaborative, כאשר נדרשת החלטה משמעותית שיש לה כמה חלופות סבירות והיא תשפיע מהותית על ההמשך, עצור בנקודת checkpoint, הצג בקצרה את האפשרויות ואת המלצתך, וחכה להכרעת המשתמש. אל תעצור על החלטות שגרתיות או פרטים טכניים שניתן להסיק בבטחה."
                : "במצב Autonomous, כאשר נדרשת החלטה משמעותית, קבל בעצמך את ההחלטה הסבירה הטובה ביותר לפי המטרה והמידע הקיים והמשך בעבודה. תעד בקצרה החלטות מהותיות כאשר הדבר מועיל. עצור לשאלה רק אם חסר מידע חיוני שאי אפשר להסיק באופן סביר או אם נדרש אישור מפורש מהמשתמש.";

        const handoffInstruction =
            style === "deep"
                ? "במצב Deep, תכנן את העבודה במקטעים משמעותיים שמתאימים לצ'אט אחד. קבע נקודות מעבר טבעיות: מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת. כאשר מקטע משמעותי הושלם והמשך העבודה עובר לשלב חדש, לנושא נפרד, או שצ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך — העדף לעבור לצ'אט חדש."
                : "עבור לצ'אט חדש כאשר המעבר תוכנן מראש, או כאשר צ'אט חדש ישפר משמעותית את הפוקוס או איכות ההמשך. אל תעבור רק משום שהסתיים שלב רגיל.";

        return [
            workInstruction,
            "",
            segmentInstruction,
            "",
            checkpointInstruction,
            "",
            decisionInstruction,
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

'''
runner = replace_between(
    runner,
    "    function getRunnerControlLines(",
    "    function buildFirstPrompt(",
    control_functions,
    "control lines function",
)

build_first = '''    function buildFirstPrompt(
        mode,
        taskText,
        workStyle,
        decisionMode
    ) {
        const style =
            normalizeWorkStyle(workStyle);

        const decisions =
            normalizeDecisionMode(decisionMode);

        const startInstruction =
            mode === "new"
                ? "עכשיו, התחל לבצע את המשימה והתקדם לשלב הראשון."
                : "עכשיו, תמשיך לשלב הבא.";

        if (mode !== "new") {
            return getRunnerControlLines(
                startInstruction,
                style,
                decisions
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
                style,
                decisions
            )
        ].join("\\n");
    }

'''
runner = replace_between(
    runner,
    "    function buildFirstPrompt(",
    "    function buildHandoffPrompt(",
    build_first,
    "build first prompt",
)

runner = replace_exact(
    runner,
    '''        return buildFirstPrompt(
            "new",
            prompt,
            selectedWorkStyle
        );
''',
    '''        return buildFirstPrompt(
            "new",
            prompt,
            selectedWorkStyle,
            selectedDecisionMode
        );
''',
    "handoff preserves decision mode",
)

runner = replace_exact(
    runner,
    '''                taskMode: selectedTaskMode,
                workStyle: selectedWorkStyle,
                currentCycle: diagnosticCycleSnapshot(currentCycle),
''',
    '''                taskMode: selectedTaskMode,
                workStyle: selectedWorkStyle,
                decisionMode: selectedDecisionMode,
                currentCycle: diagnosticCycleSnapshot(currentCycle),
''',
    "diagnostic decision mode",
)

runner = replace_exact(
    runner,
    '''        const workStyleSelect = panel.querySelector(
            '[data-input="work-style"]'
        );

        taskModeSelect?.addEventListener(
''',
    '''        const workStyleSelect = panel.querySelector(
            '[data-input="work-style"]'
        );

        const decisionModeSelect = panel.querySelector(
            '[data-input="decision-mode"]'
        );

        taskModeSelect?.addEventListener(
''',
    "setup decision selector",
)

runner = replace_exact(
    runner,
    '''                    taskModeSelect?.value || "existing",
                    taskTextArea?.value || "",
                    workStyleSelect?.value || "steady"
''',
    '''                    taskModeSelect?.value || "existing",
                    taskTextArea?.value || "",
                    workStyleSelect?.value || "steady",
                    decisionModeSelect?.value || "autonomous"
''',
    "start button decision mode",
)

runner = replace_exact(
    runner,
    '''        const workStyle = panel.querySelector(
            '[data-input="work-style"]'
        );

        const inputs = [
''',
    '''        const workStyle = panel.querySelector(
            '[data-input="work-style"]'
        );

        const decisionMode = panel.querySelector(
            '[data-input="decision-mode"]'
        );

        const inputs = [
''',
    "reset decision selector lookup",
)

runner = replace_exact(
    runner,
    '''        if (workStyle) {
            workStyle.value = "steady";
        }

        if (taskText) {
''',
    '''        if (workStyle) {
            workStyle.value = "steady";
        }

        if (decisionMode) {
            decisionMode.value = "autonomous";
        }

        if (taskText) {
''',
    "reset decision selector value",
)

runner = replace_exact(
    runner,
    '''        selectedTaskText = "";
        selectedWorkStyle = "steady";
        runnerStartedAt = null;
''',
    '''        selectedTaskText = "";
        selectedWorkStyle = "steady";
        selectedDecisionMode = "autonomous";
        runnerStartedAt = null;
''',
    "restart decision mode state",
)

runner = replace_exact(
    runner,
    '''    async function beginRun(
        mode,
        taskText,
        workStyle
    ) {
''',
    '''    async function beginRun(
        mode,
        taskText,
        workStyle,
        decisionMode
    ) {
''',
    "beginRun signature",
)

runner = replace_exact(
    runner,
    '''        const style =
            normalizeWorkStyle(workStyle);

        const firstPrompt =
            buildFirstPrompt(
                mode,
                taskText,
                style
            );
''',
    '''        const style =
            normalizeWorkStyle(workStyle);

        const decisions =
            normalizeDecisionMode(decisionMode);

        const firstPrompt =
            buildFirstPrompt(
                mode,
                taskText,
                style,
                decisions
            );
''',
    "beginRun prompt config",
)

runner = replace_exact(
    runner,
    '''        selectedWorkStyle = style;

        runStarted = true;
''',
    '''        selectedWorkStyle = style;
        selectedDecisionMode = decisions;

        runStarted = true;
''',
    "store decision mode",
)

runner = replace_exact(
    runner,
    '''            taskMode: selectedTaskMode,
            workStyle: selectedWorkStyle,
            hasTaskText:
''',
    '''            taskMode: selectedTaskMode,
            workStyle: selectedWorkStyle,
            decisionMode: selectedDecisionMode,
            hasTaskText:
''',
    "run-started decision log",
)

runner = replace_exact(
    runner,
    '''                taskMode: selectedTaskMode,
                workStyle: selectedWorkStyle,
                queuedIntermediateMessages:
''',
    '''                taskMode: selectedTaskMode,
                workStyle: selectedWorkStyle,
                decisionMode: selectedDecisionMode,
                queuedIntermediateMessages:
''',
    "public state decision mode",
)

runner = replace_exact(
    runner,
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
    '''        startExistingContext: function (
            workStyle,
            decisionMode
        ) {
            return beginRun(
                "existing",
                "",
                workStyle,
                decisionMode
            );
        },
        startWithTask: function (
            taskText,
            workStyle,
            decisionMode
        ) {
            return beginRun(
                "new",
                taskText,
                workStyle,
                decisionMode
            );
        },
''',
    "public start APIs",
)

runner_path.write_text(runner, encoding="utf-8")

# Documentation
agents_path = Path("AGENTS.md")
agents = agents_path.read_text(encoding="utf-8")
start = agents.index("Work style is a per-run prompt contract:")
end = agents.index("The longer-term product direction", start)
agents_block = '''Work style and decision mode are independent per-run prompt contracts:

- `steady` is the default work style. It progresses naturally, but still groups work by goals/results rather than tiny technical operations. A segment should reach a clear, verifiable outcome before stopping when practical.
- `deep` uses the same goal/result segmentation rule but pushes harder toward a substantial coherent stage, including related sub-steps, checks and fixes, before stopping.
- Both styles prefer a small number of meaningful segments over many tiny steps. Keep the continuation command and the concept of `שלב`; work style changes the intended amount of coherent work, not the runner state-machine protocol.
- `autonomous` is the default decision mode. For significant choices, select the best reasonable option from the goal and available evidence and continue. Ask only when essential information cannot reasonably be inferred or explicit user approval is required.
- `collaborative` turns significant ambiguous choices into checkpoints: present the options and recommendation and wait for the user. Routine or safely inferable technical decisions should still proceed without interruption.
- Preserve both the selected work style and decision mode across automatic handoff so the fresh chat receives the same execution contract.
- Chat-rollover policy is a separate concern. Do not expand or reinterpret rollover rules merely because checkpoint/decision wording changes.

'''
agents = agents[:start] + agents_block + agents[end:]
agents_path.write_text(agents, encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
start = readme.index("## Work style")
end = readme.index("## Technical design", start)
readme_block = '''## Work style and decision mode

The start panel exposes two independent per-run controls.

**Work Style** controls how much coherent work the assistant is encouraged to complete before a checkpoint:

- **Steady** (default) — progress naturally, but organize work by goals and verifiable outcomes rather than tiny technical operations. It does not force a large block when one is unnecessary.
- **Deep** — use the same goal/result segmentation, but push toward a substantial coherent stage that can include multiple related sub-steps, checks and fixes before stopping.

Both styles use the same core rule: one segment should pursue one clear goal, do the work needed to achieve it, verify the result, and then reach a checkpoint. In general, prefer a small number of meaningful segments over many tiny steps.

**Decision Mode** controls whether significant choices interrupt the run:

- **Autonomous** (default) — choose the best reasonable option from the goal and available evidence and continue. Ask only when essential information cannot reasonably be inferred or explicit user approval is required.
- **Collaborative** — when a significant choice has multiple reasonable alternatives and materially affects the next work, stop at a checkpoint, show the options plus a recommendation, and wait for the user. Routine or safely inferable technical choices should not cause a stop.

Checkpoint structure and chat rollover remain separate concerns. This change does not attempt to define a new formula for when to open a fresh chat; the existing rollover contract remains in force.

The word `שלב` and the continuation command `תמשיך לשלב הבא` remain part of the protocol. Both the selected work style and decision mode are preserved automatically across an automatic handoff.

Programmatic starts accept the same optional settings:

```js
__sequenceRunner.startExistingContext("deep", "autonomous")
__sequenceRunner.startWithTask("TASK_TEXT", "steady", "collaborative")
```

Unknown or omitted values safely fall back to `steady` and `autonomous`.

'''
readme = readme[:start] + readme_block + readme[end:]
readme_path.write_text(readme, encoding="utf-8")

# Core E2E coverage
core_path = Path("tests/e2e/core.spec.js")
core = core_path.read_text(encoding="utf-8")
core = replace_exact(
    core,
    '''  expect(sent[0]).toContain("המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית.");
  expect(sent[0]).not.toContain("תתקדם שלב אחד בלבד");
''',
    '''  expect(sent[0]).toContain("המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית.");
  expect(sent[0]).toContain("חלק את העבודה למקטעים לפי מטרות ותוצאות");
  expect(sent[0]).toContain("העדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים");
  expect(sent[0]).toContain("במצב Autonomous");
  expect(sent[0]).not.toContain("תתקדם שלב אחד בלבד");
''',
    "steady prompt assertions",
)
core = replace_exact(
    core,
    '''  expect(firstPrompt).toContain("התקדם שלב משמעותי אחד");
  expect(firstPrompt).toContain("אל תעצור אחרי פעולה טכנית קטנה בלבד");
  expect(firstPrompt).toContain("קבע נקודות מעבר טבעיות");
  expect(firstPrompt).not.toContain("תתקדם שלב אחד בלבד");

  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
});

''',
    '''  expect(firstPrompt).toContain("התקדם שלב משמעותי אחד");
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

''',
    "deep and collaborative coverage",
)
core = replace_exact(core, 'version: "3.24",', 'version: "3.25",', "core version")
core_path.write_text(core, encoding="utf-8")

handoff_path = Path("tests/e2e/handoff.spec.js")
handoff = handoff_path.read_text(encoding="utf-8")
handoff = replace_exact(
    handoff,
    'test("Deep work style persists across automatic handoff", async ({ harness }) => {',
    'test("Deep work style and Collaborative decision mode persist across automatic handoff", async ({ harness }) => {',
    "handoff test title",
)
handoff = replace_exact(
    handoff,
    '  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("deep"));',
    '  await harness.page.evaluate(() => window.__sequenceRunner.startExistingContext("deep", "collaborative"));',
    "handoff start config",
)
handoff = replace_exact(
    handoff,
    '''    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");
  }

  expect(sent[1]).toContain("DEEP_NEXT_TASK");
  expect((await harness.runnerState()).workStyle).toBe("deep");
});
''',
    '''    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");
    expect(prompt).toContain("במצב Collaborative");
    expect(prompt).toContain("חכה להכרעת המשתמש");
  }

  expect(sent[1]).toContain("DEEP_NEXT_TASK");
  const state = await harness.runnerState();
  expect(state.workStyle).toBe("deep");
  expect(state.decisionMode).toBe("collaborative");
});
''',
    "handoff decision persistence assertions",
)
handoff_path.write_text(handoff, encoding="utf-8")

diag_path = Path("tests/e2e/diagnostic.spec.js")
diag = diag_path.read_text(encoding="utf-8")
diag = diag.replace('"3.24"', '"3.25"')
diag_path.write_text(diag, encoding="utf-8")
