import fs from "node:fs";

function replaceOnce(source, before, after, label) {
    const first = source.indexOf(before);
    const last = source.lastIndexOf(before);

    if (first < 0) {
        throw new Error(`Missing patch anchor: ${label}`);
    }

    if (first !== last) {
        throw new Error(`Patch anchor is not unique: ${label}`);
    }

    return source.slice(0, first) + after + source.slice(first + before.length);
}

let source = fs.readFileSync("runner.js", "utf8");

source = replaceOnce(
    source,
    '    const VERSION = "3.17";',
    '    const VERSION = "3.18";',
    "version"
);

const assistantTextAnchor = `    function getAssistantText(turn) {
        const assistant =
            getAssistantMessage(turn);

        if (!assistant) {
            return "";
        }

        return normalizeText(
            assistant.innerText ||
            assistant.textContent ||
            ""
        );
    }

    function sleep(ms) {`;

const assistantTextReplacement = `    function getAssistantText(turn) {
        const assistant =
            getAssistantMessage(turn);

        if (!assistant) {
            return "";
        }

        return normalizeText(
            assistant.innerText ||
            assistant.textContent ||
            ""
        );
    }

    function getTerminalResponseMarker(turn) {
        if (!turn) {
            return null;
        }

        const terminalTexts = new Set([
            "Stopped thinking",
            "Stopped generating"
        ]);

        const candidates = [
            ...turn.querySelectorAll("span,div")
        ];

        for (const candidate of candidates) {
            if (
                candidate.children.length > 0 ||
                candidate.closest(SELECTORS.userMessage)
            ) {
                continue;
            }

            const text = normalizeText(
                candidate.innerText ||
                candidate.textContent ||
                ""
            );

            if (terminalTexts.has(text)) {
                return text;
            }
        }

        return null;
    }

    function sleep(ms) {`;

source = replaceOnce(
    source,
    assistantTextAnchor,
    assistantTextReplacement,
    "terminal response marker helper"
);

const completeCycleAnchor = `    function completeCycle(cycle, text) {`;

const completeCycleReplacement = `    function handleTerminalResponseWithoutAssistant(
        cycle,
        marker
    ) {
        if (
            stopped ||
            currentCycle !== cycle ||
            cycle.processed
        ) {
            return;
        }

        cycle.processed = true;
        processedTurnKeys.add(cycle.turnKey);
        sendLocked = false;

        record(
            "response-terminated-without-assistant",
            {
                id: cycle.id,
                turnKey: cycle.turnKey,
                marker,
                queuedIntermediateMessages:
                    injectionQueue.length
            }
        );

        const dueInjection =
            takeDueInjection();

        if (!dueInjection) {
            fail(
                "ChatGPT stopped the response before producing an assistant message. Automatic resend was not attempted."
            );
            return;
        }

        record(
            "terminal-response-recovered-by-injection",
            {
                id: cycle.id,
                injectionId: dueInjection.id,
                marker
            }
        );

        setState(
            "READY_TO_INJECT",
            "📝 התגובה נעצרה; שולח את הודעת הביניים הממתינה...",
            "#7c3aed"
        );

        const terminatedCycle = cycle;

        setTimeout(function () {
            if (
                stopped ||
                currentCycle !== terminatedCycle
            ) {
                return;
            }

            currentCycle = null;

            sendPrompt(
                dueInjection.text,
                "injection"
            ).catch(function (err) {
                fail(err.message, err);
            });
        }, CONFIG.CONTINUE_DELAY_MS);
    }

    function completeCycle(cycle, text) {`;

source = replaceOnce(
    source,
    completeCycleAnchor,
    completeCycleReplacement,
    "terminal response handler"
);

const evaluateAnchor = `        const text =
            getAssistantText(turn);

        if (
            !stopButton &&
            finalUiSeen &&
            text
        ) {`;

const evaluateReplacement = `        const text =
            getAssistantText(turn);

        const terminalMarker =
            !stopButton && !text
                ? getTerminalResponseMarker(turn)
                : null;

        if (terminalMarker) {
            handleTerminalResponseWithoutAssistant(
                cycle,
                terminalMarker
            );
            return;
        }

        if (
            !stopButton &&
            finalUiSeen &&
            text
        ) {`;

source = replaceOnce(
    source,
    evaluateAnchor,
    evaluateReplacement,
    "evaluate terminal response branch"
);

fs.writeFileSync("runner.js", source);

const readmePath = "README.md";
let readme = fs.readFileSync(readmePath, "utf8");
const readmeAnchor = "A completed turn must never remain indefinitely in `WAITING_FOR_RESPONSE` merely because one preferred assistant wrapper was not found.";
const readmeAddition = `${readmeAnchor}\n\nIf the tracked turn explicitly ends with terminal UI such as \`Stopped thinking\` while no Stop button is active and no Assistant body exists, the runner must not wait forever. A due queued intermediate message may take over at that safe boundary. Otherwise the run stops with a clear error instead of automatically resending the interrupted prompt.`;
readme = replaceOnce(
    readme,
    readmeAnchor,
    readmeAddition,
    "README stopped-response rule"
);
fs.writeFileSync(readmePath, readme);

const agentsPath = "AGENTS.md";
let agents = fs.readFileSync(agentsPath, "utf8");
const agentsAnchor = "Do not leave a turn in `WAITING_FOR_RESPONSE` when its final response UI is already present; use `WAITING_FOR_STABLE_RESPONSE` only while the final text is settling.";
const agentsAddition = `${agentsAnchor}\n\nIf the tracked turn explicitly terminates with UI such as \`Stopped thinking\` and has no Assistant body, do not wait indefinitely and do not automatically resend the interrupted prompt. Treat generation as terminated. If a queued intermediate message is already due, it may safely supersede that terminated cycle; otherwise stop with a clear diagnosable error.`;
agents = replaceOnce(
    agents,
    agentsAnchor,
    agentsAddition,
    "AGENTS stopped-response rule"
);
fs.writeFileSync(agentsPath, agents);

console.log("Applied Sequence Runner v3.18 stopped-thinking hotfix.");
