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

function patchRunner() {
  const path = "runner.js";
  let source = read(path);

  source = replaceOnce(
    source,
    `    function getWorkInstruction(workStyle) {\n        return normalizeWorkStyle(workStyle) === "deep"\n            ? "בכל פעם שאכתוב 'תמשיך לשלב הבא', התקדם שלב משמעותי אחד: בצע ברצף מקטע עבודה משמעותי, כולל תתי־שלבים, בדיקות ותיקונים נחוצים, עד יעד ברור ומאומת. חלק את העבודה למקטעים לפי מטרות ותוצאות, אל תעצור אחרי פעולה טכנית קטנה, והעדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים."\n            : "בכל פעם שאכתוב 'תמשיך לשלב הבא', המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית. חלק את העבודה למקטעים לפי מטרות ותוצאות, השלם ואמת יעד ברור בכל מקטע; אל תכפה מקטע גדול כשאין צורך ואל תעצור אחרי פעולה טכנית קטנה, והעדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים.";\n    }\n\n    function getCheckpointInstruction() {\n        return "סיים מקטע בנקודת checkpoint טבעית: לאחר תוצאה משמעותית שניתן לאמת, כשהשלב הבא הוא סוג עבודה שונה מהותית, או לפני פעולה בעלת סיכון משמעותי. החלטה משמעותית מחייבת עצירה למשתמש רק במצב Collaborative.";\n    }`,
    `    function getWorkInstruction(workStyle) {\n        return normalizeWorkStyle(workStyle) === "deep"\n            ? "בכל פעם שאכתוב 'תמשיך לשלב הבא', בצע מקטע עבודה משמעותי אחד בלבד ואז עצור וחכה להודעת ההמשך. תכנן את המשימה למקטעים משמעותיים לפי מטרות ותוצאות; בתוך המקטע הנוכחי בצע תתי־שלבים, בדיקות ותיקונים נחוצים עד יעד ברור ומאומת, אך אל תעבור למקטע משמעותי נוסף באותה תשובה. אם המקטע מתרחב מעבר למה שמתאים לתשובה אחת, פצל אותו בנקודת checkpoint בטוחה והמשך את השאר רק לאחר 'תמשיך לשלב הבא'."\n            : "בכל פעם שאכתוב 'תמשיך לשלב הבא', בצע מקטע עבודה אחד בלבד ואז עצור וחכה להודעת ההמשך. אם המשימה גדולה, חלק אותה מראש למקטעים לפי מטרות ותוצאות; בכל תשובה בחר רק את המקטע הבא, השלם ואמת אותו, ואל תמשיך אוטומטית למקטע שאחריו. אל תעצור אחרי פעולה טכנית קטנה כשעדיין לא הושג יעד שימושי, אבל גם אל תאחד כמה יעדים גדולים לתשובה אחת. אם במהלך העבודה מתברר שהמקטע גדול מהצפוי, פצל אותו בנקודת checkpoint בטוחה והמשך את השאר רק לאחר 'תמשיך לשלב הבא'.";\n    }\n\n    function getCheckpointInstruction() {\n        return "סיים כל תשובה בנקודת checkpoint טבעית: לאחר תוצאה משמעותית שניתן לאמת, כשהשלב הבא הוא סוג עבודה שונה מהותית, לפני פעולה בעלת סיכון משמעותי, או כשהמקטע הנוכחי התברר כגדול מהצפוי. אחרי שהגעת ל-checkpoint, עצור ואל תתחיל את המקטע הבא באותה תשובה. החלטה משמעותית מחייבת עצירה למשתמש רק במצב Collaborative.";\n    }`,
    "full work/checkpoint instructions"
  );

  source = replaceOnce(
    source,
    `        const workInstruction =\n            style === "deep"\n                ? "Deep: בצע שלב משמעותי שלם עד תוצאה ברורה ומאומתת, כולל בדיקות ותיקונים נחוצים."\n                : "Steady: התקדם עד checkpoint טבעי עם תוצאה ברורה ומאומתת; אל תעצור אחרי פעולה טכנית קטנה.";`,
    `        const workInstruction =\n            style === "deep"\n                ? "Deep: תשובה אחת = מקטע משמעותי אחד. השלם אותו לעומק עד תוצאה ברורה ומאומתת, כולל בדיקות ותיקונים נחוצים, ואז עצור וחכה להמשך; אם הוא גדול מדי, פצל אותו ב-checkpoint בטוח."\n                : "Steady: תשובה אחת = מקטע אחד. השלם יעד ברור ומאומת ואז עצור וחכה להמשך; אל תעצור אחרי פעולה טכנית קטנה, ואם המקטע גדול מדי פצל אותו ב-checkpoint בטוח.";`,
    "compact existing-ready work instruction"
  );

  write(path, source);
}

function patchCoreTests() {
  const path = "tests/e2e/core.spec.js";
  let source = read(path);

  source = replaceOnce(
    source,
    `  expect(sent[0]).toContain("המשך להתקדם בעבודה באופן טבעי עד נקודת עצירה הגיונית.");\n  expect(sent[0]).toContain("חלק את העבודה למקטעים לפי מטרות ותוצאות");\n  expect(sent[0]).toContain("העדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים");\n  expect(sent[0]).toContain("במצב Autonomous");\n  expect(sent[0]).not.toContain("תתקדם שלב אחד בלבד");`,
    `  expect(sent[0]).toContain("בצע מקטע עבודה אחד בלבד ואז עצור וחכה להודעת ההמשך");\n  expect(sent[0]).toContain("חלק אותה מראש למקטעים לפי מטרות ותוצאות");\n  expect(sent[0]).toContain("אל תמשיך אוטומטית למקטע שאחריו");\n  expect(sent[0]).toContain("פצל אותו בנקודת checkpoint בטוחה");\n  expect(sent[0]).toContain("אחרי שהגעת ל-checkpoint, עצור ואל תתחיל את המקטע הבא באותה תשובה");\n  expect(sent[0]).toContain("במצב Autonomous");`,
    "steady prompt assertions"
  );

  source = replaceOnce(
    source,
    `  expect(sent[0]).toContain("הודעת הפתיחה הקודמת נשארת בתוקף");\n  expect(sent[0].length).toBeLessThan(900);`,
    `  expect(sent[0]).toContain("תשובה אחת = מקטע אחד");\n  expect(sent[0]).toContain("הודעת הפתיחה הקודמת נשארת בתוקף");\n  expect(sent[0].length).toBeLessThan(1100);`,
    "existing-ready compact prompt assertions"
  );

  source = replaceOnce(
    source,
    `    "התקדם שלב משמעותי אחד",\n    "מקטע עבודה משמעותי",\n    "תתי־שלבים",\n    "בדיקות ותיקונים",\n    "חלק את העבודה למקטעים לפי מטרות ותוצאות",\n    "העדף מספר קטן של מקטעים משמעותיים",\n    "נקודת checkpoint טבעית",`,
    `    "מקטע עבודה משמעותי אחד בלבד",\n    "עצור וחכה להודעת ההמשך",\n    "תתי־שלבים",\n    "בדיקות ותיקונים",\n    "תכנן את המשימה למקטעים משמעותיים לפי מטרות ותוצאות",\n    "אל תעבור למקטע משמעותי נוסף באותה תשובה",\n    "פצל אותו בנקודת checkpoint בטוחה",\n    "סיים כל תשובה בנקודת checkpoint טבעית",\n    "אל תתחיל את המקטע הבא באותה תשובה",`,
    "deep semantic topic assertions"
  );

  write(path, source);
}

patchRunner();
patchCoreTests();
console.log("Patched work segmentation prompt semantics.");
