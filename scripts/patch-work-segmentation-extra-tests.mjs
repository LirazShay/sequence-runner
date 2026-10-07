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

{
  const path = "tests/e2e/core.spec.js";
  let source = read(path);
  source = replaceOnce(
    source,
    `  expect(firstPrompt).toContain("התקדם שלב משמעותי אחד");\n  expect(firstPrompt).toContain("מקטע עבודה משמעותי");\n  expect(firstPrompt).toContain("חלק את העבודה למקטעים לפי מטרות ותוצאות");\n  expect(firstPrompt).toContain("העדף מספר קטן של מקטעים משמעותיים על פני הרבה צעדים קטנים");\n  expect(firstPrompt).toContain("קבע נקודות מעבר טבעיות");\n  expect(firstPrompt).not.toContain("תתקדם שלב אחד בלבד");`,
    `  expect(firstPrompt).toContain("מקטע עבודה משמעותי אחד בלבד");\n  expect(firstPrompt).toContain("עצור וחכה להודעת ההמשך");\n  expect(firstPrompt).toContain("תכנן את המשימה למקטעים משמעותיים לפי מטרות ותוצאות");\n  expect(firstPrompt).toContain("אל תעבור למקטע משמעותי נוסף באותה תשובה");\n  expect(firstPrompt).toContain("פצל אותו בנקודת checkpoint בטוחה");\n  expect(firstPrompt).toContain("קבע נקודות מעבר טבעיות");`,
    "deep selector prompt assertions"
  );
  write(path, source);
}

{
  const path = "tests/e2e/handoff.spec.js";
  let source = read(path);
  source = replaceOnce(
    source,
    `  for (const prompt of sent) {\n    expect(prompt).toContain("התקדם שלב משמעותי אחד");\n    expect(prompt).toContain("קבע נקודות מעבר טבעיות");\n    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");\n    expect(prompt).toContain("במצב Collaborative");\n    expect(prompt).toContain("חכה להכרעת המשתמש");\n  }`,
    `  for (const prompt of sent) {\n    expect(prompt).toContain("מקטע עבודה משמעותי אחד בלבד");\n    expect(prompt).toContain("עצור וחכה להודעת ההמשך");\n    expect(prompt).toContain("אל תעבור למקטע משמעותי נוסף באותה תשובה");\n    expect(prompt).toContain("קבע נקודות מעבר טבעיות");\n    expect(prompt).toContain("מה הצ'אט הנוכחי צריך לסיים ומה הצ'אט הבא אמור לקחת");\n    expect(prompt).toContain("במצב Collaborative");\n    expect(prompt).toContain("חכה להכרעת המשתמש");\n  }`,
    "handoff deep prompt assertions"
  );
  write(path, source);
}

console.log("Patched remaining work segmentation regression assertions.");
