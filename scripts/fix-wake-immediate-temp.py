from pathlib import Path


def replace_once(path, old, new, label):
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "runner.js",
    'const VERSION = "3.21";',
    'const VERSION = "3.22";',
    "runner version",
)

replace_once(
    "runner.js",
    '''        let deferredReason = null;\n\n        if (getComposerText()) {\n            deferredReason = "composer-occupied";\n        } else {\n            const sendButton = getSendButton();\n\n            if (!sendButton || sendButton.disabled) {\n                deferredReason = "send-unavailable";\n            }\n        }\n''',
    '''        const deferredReason =\n            getComposerText()\n                ? "composer-occupied"\n                : null;\n''',
    "remove wake send preflight",
)

replace_once(
    "runner.js",
    '''            setState(\n                "GENERATING",\n                deferredReason === "composer-occupied"\n                    ? "⏰ עברו 10 דקות; ממתין שתיבת ההודעה תתפנה לפני שליחת ‘מה קורה?’."\n                    : "⏰ עברו 10 דקות; ממתין שכפתור השליחה יהיה זמין לפני שליחת ‘מה קורה?’." ,\n                "#b45309"\n            );\n''',
    '''            setState(\n                "GENERATING",\n                "⏰ עברו 10 דקות; יש טקסט בתיבת ההודעה ולכן ממתין רק כדי לא לדרוס אותו לפני שליחת ‘מה קורה?’.",\n                "#b45309"\n            );\n''',
    "wake deferred status",
)

replace_once(
    "README.md",
    "The key product principle is that automatic runner traffic preserves one sent instruction per newly completed assistant turn. The only exception is an explicit user-triggered **Send now** action, which may supersede the currently tracked cycle and send another message while ChatGPT is still responding.",
    "The key product principle is that normal automatic runner traffic preserves one sent instruction per newly completed assistant turn. Two deliberate exceptions may send while ChatGPT is still responding without clicking Stop: an explicit user-triggered **Send now** action, and the one-shot 10-minute long-running-response wake nudge.",
    "README invariant",
)

replace_once(
    "README.md",
    "- If the exact same tracked Assistant response remains actively generating for 10 minutes, the runner sends one `מה קורה?` wake nudge through the normal composer/send path, without clicking Stop or resending the original runner prompt. The nudge is one-shot per response and defers rather than overwriting occupied composer text.",
    "- If the exact same tracked Assistant response remains actively generating for 10 minutes, the runner immediately attempts one `מה קורה?` wake nudge through the same immediate composer/send path used by **Send now**, without clicking Stop or resending the original runner prompt. It does not wait for the active response to finish and does not require Send to be available before inserting the wake text; after insertion the immediate-send path waits briefly for Send to become available. The nudge is one-shot per response and defers only when the composer already contains user text, so that text is never overwritten.",
    "README wake behavior",
)

replace_once(
    "AGENTS.md",
    "> Automatic runner sends must preserve one sent prompt per newly completed assistant turn.\n\nThe sole intentional exception is an explicit user-triggered immediate intermediate message. That action may supersede the current tracked cycle and send through the composer while ChatGPT is still responding. It must never click Stop.",
    "> Normal automatic runner sends must preserve one sent prompt per newly completed assistant turn.\n\nThere are two deliberate send-while-generating exceptions, and neither may click Stop: an explicit user-triggered immediate intermediate message, and the one-shot 10-minute long-running-response wake nudge. Both use the immediate composer/send path and safely supersede the currently tracked cycle when they send.",
    "AGENTS invariant",
)

replace_once(
    "AGENTS.md",
    "The one explicit automatic long-wait exception is a one-shot wake nudge for the same continuously active tracked Assistant response: after 10 minutes of active generation, send `מה קורה?` once through the existing immediate composer/send path. Never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer or Send control is not safe, defer the nudge while that same response remains active. Eligibility resets for the next tracked Assistant response.",
    "The one explicit automatic long-wait exception is a one-shot wake nudge for the same continuously active tracked Assistant response: after 10 minutes of active generation, immediately attempt to send `מה קורה?` once through the existing immediate composer/send path. Never wait for the active response to finish, never preflight on Send availability before inserting the wake text, never click Stop, never resend the interrupted runner prompt, never overwrite user composer text, and never send the nudge more than once for the same tracked response. If the composer already contains user text, defer only to preserve that draft; otherwise insert the wake text immediately and let the immediate-send path wait briefly for Send to become available after insertion. Eligibility resets for the next tracked Assistant response.",
    "AGENTS wake rule",
)

replace_once(
    "tests/e2e/core.spec.js",
    '    version: "3.21",',
    '    version: "3.22",',
    "core version expectation",
)

diagnostic_path = Path("tests/e2e/diagnostic.spec.js")
diagnostic_text = diagnostic_path.read_text(encoding="utf-8")
diagnostic_count = diagnostic_text.count('"3.21"')
if diagnostic_count != 2:
    raise SystemExit(
        f"diagnostic version expectations: expected 2 matches, found {diagnostic_count}"
    )
diagnostic_path.write_text(
    diagnostic_text.replace('"3.21"', '"3.22"'),
    encoding="utf-8",
)

backlog = Path("backlog/004-wake-long-running-response.md")
backlog_text = backlog.read_text(encoding="utf-8")
marker = "Status: Done\n"
if marker not in backlog_text:
    raise SystemExit("backlog 004 status marker not found")
if "v3.22 live-UI regression fix" not in backlog_text:
    backlog_text = backlog_text.replace(
        marker,
        marker
        + "\n## Post-completion regression fix\n\n"
        + "`v3.22 live-UI regression fix`: the wake path must not require the Send button to be available before inserting `מה קורה?`. In the live ChatGPT UI, Send may remain unavailable while generation is active until composer text is inserted. At the 10-minute threshold, an empty composer therefore enters the existing immediate-send path immediately; that path inserts the text first and then waits briefly for Send. Only an occupied user composer may defer the wake. A regression test simulates Send being unavailable until composer input occurs.\n",
        1,
    )
    backlog.write_text(backlog_text, encoding="utf-8")

replace_once(
    "backlog/README.md",
    "| 004 | [Wake Long-Running Response](004-wake-long-running-response.md) | `v3.20` sends one safe `מה קורה?` nudge after 10 minutes of continuous generation for the same response, without Stop, overwrite, or duplicate continuation. | P1 | Done |",
    "| 004 | [Wake Long-Running Response](004-wake-long-running-response.md) | `v3.20` added the one-shot 10-minute `מה קורה?` nudge; `v3.22` fixes live-UI behavior so it inserts immediately during generation instead of pre-waiting for Send availability, while still preserving user composer text. | P1 | Done |",
    "backlog index wake summary",
)
