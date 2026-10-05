(() => {
  "use strict";

  const conversation = document.querySelector("#conversation");
  const composerForm = document.querySelector("form[data-chatgpt-composer]");
  const composer = composerForm.querySelector('[contenteditable="true"][data-composer-markdown]');
  const sendButton = composerForm.querySelector('button[aria-label="Send"]');
  const thinkingControls = document.querySelector("#thinking-controls");
  const routeLabel = document.querySelector('[data-mock-role="route"]');
  const eventLog = document.querySelector("#mock-event-log");
  const responseTextInput = document.querySelector('[data-mock-input="response-text"]');

  const timers = new Set();

  const state = {
    responses: [],
    defaultResponse: {
      type: "normal",
      text: "Mock response",
      startDelayMs: 20,
      finishDelayMs: 40
    },
    events: [],
    turnCounter: 0,
    newChatCounter: 0,
    activeGenerations: 0,
    navigationClearDelayMs: 0
  };

  function schedule(callback, delayMs = 0) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delayMs);
    timers.add(timer);
    return timer;
  }

  function clearTimers() {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
  }

  function normalize(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function record(type, details = {}) {
    const entry = {
      type,
      at: Date.now(),
      ...details
    };

    state.events.push(entry);
    if (state.events.length > 1000) {
      state.events.shift();
    }
    renderEventLog();
    return entry;
  }

  function renderEventLog() {
    if (!eventLog) {
      return;
    }

    eventLog.textContent = state.events
      .slice(-60)
      .map((entry) => {
        const { type, at, ...rest } = entry;
        return `${new Date(at).toISOString().slice(11, 23)} ${type} ${JSON.stringify(rest)}`;
      })
      .join("\n");
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  function syncRouteLabel() {
    if (routeLabel) {
      routeLabel.textContent = location.pathname;
    }
  }

  function dispatchComposerInput() {
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText"
    }));
  }

  function setComposerText(text) {
    composer.textContent = text || "";
    dispatchComposerInput();
  }

  function clearComposer() {
    composer.textContent = "";
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "deleteContentBackward"
    }));
  }

  function currentStopButton() {
    return thinkingControls.querySelector('button[aria-label="Stop"]');
  }

  function beginGeneration() {
    state.activeGenerations += 1;

    if (!currentStopButton()) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Stop");
      button.setAttribute("data-testid", "stop-button");
      button.textContent = "Stop";
      button.addEventListener("click", () => {
        record("stop-click");
        state.activeGenerations = 0;
        button.remove();
      });
      thinkingControls.appendChild(button);
    }

    record("generation-started", {
      activeGenerations: state.activeGenerations
    });
  }

  function endGeneration() {
    state.activeGenerations = Math.max(0, state.activeGenerations - 1);

    if (state.activeGenerations === 0) {
      currentStopButton()?.remove();
    }

    record("generation-ended", {
      activeGenerations: state.activeGenerations
    });
  }

  function resetGeneration() {
    state.activeGenerations = 0;
    currentStopButton()?.remove();
  }

  function createTurn(userText) {
    const turnKey = `mock-turn-${++state.turnCounter}`;
    const turn = document.createElement("article");
    turn.setAttribute("data-turn-key", turnKey);

    const user = document.createElement("div");
    user.setAttribute("data-user-message-bubble", "true");
    user.textContent = userText;
    turn.appendChild(user);

    conversation.appendChild(turn);
    conversation.scrollTop = conversation.scrollHeight;

    record("turn-created", {
      turnKey,
      userText
    });

    return turn;
  }

  function createAssistantBody(turn, wrapper = "markdown") {
    if (wrapper === "search-unit") {
      const unit = document.createElement("div");
      unit.setAttribute(
        "data-content-search-unit-key",
        `${turn.getAttribute("data-turn-key")}:assistant`
      );

      const selection = document.createElement("div");
      selection.setAttribute(
        "data-chatgpt-selection-message-id",
        `${turn.getAttribute("data-turn-key")}:assistant-message`
      );

      unit.appendChild(selection);
      turn.appendChild(unit);
      return selection;
    }

    const body = document.createElement("div");
    body.setAttribute("data-markdown-text-style", "assistant-message");
    turn.appendChild(body);
    return body;
  }

  function addRegenerate(turn) {
    let actions = turn.querySelector(".turn-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "turn-actions";
      turn.appendChild(actions);
    }

    if (!actions.querySelector('button[aria-label="Regenerate response"]')) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-label", "Regenerate response");
      button.textContent = "Regenerate response";
      actions.appendChild(button);
    }
  }

  function replaceTurnInDom(turn) {
    if (!turn.isConnected) {
      return turn;
    }

    const clone = turn.cloneNode(true);
    turn.replaceWith(clone);
    record("turn-replaced", {
      turnKey: clone.getAttribute("data-turn-key")
    });
    return clone;
  }

  function runNormalResponse(turn, response) {
    const showStop = response.showStop !== false;
    const startDelayMs = Number(response.startDelayMs ?? 20);
    const finishDelayMs = Number(response.finishDelayMs ?? 40);
    const chunkDelayMs = Number(response.chunkDelayMs ?? 25);

    if (response.replaceActiveGeneration === true) {
      resetGeneration();
      record("generation-replaced-by-latest-turn", {
        turnKey: turn.getAttribute("data-turn-key")
      });
    }

    if (showStop) {
      beginGeneration();
    }

    schedule(() => {
      const body = createAssistantBody(turn, response.wrapper || "markdown");
      const chunks = Array.isArray(response.chunks)
        ? response.chunks.map(String)
        : null;

      record("assistant-body-created", {
        turnKey: turn.getAttribute("data-turn-key"),
        wrapper: response.wrapper || "markdown"
      });

      const finish = () => {
        if (showStop) {
          endGeneration();
        }

        addRegenerate(turn);
        record("assistant-final-ui", {
          turnKey: turn.getAttribute("data-turn-key"),
          text: normalize(body.textContent)
        });

        if (response.tailText != null) {
          schedule(() => {
            body.textContent += String(response.tailText);
            record("assistant-tail-mutated", {
              turnKey: turn.getAttribute("data-turn-key"),
              text: normalize(body.textContent)
            });
          }, Number(response.tailDelayMs ?? 150));
        }

        if (response.replaceTurnAfterMs != null) {
          schedule(() => {
            turn = replaceTurnInDom(turn);
          }, Number(response.replaceTurnAfterMs));
        }
      };

      if (chunks && chunks.length > 0) {
        let index = 0;
        const writeNextChunk = () => {
          body.textContent += chunks[index];
          record("assistant-chunk", {
            turnKey: turn.getAttribute("data-turn-key"),
            index,
            text: normalize(body.textContent)
          });
          index += 1;

          if (index < chunks.length) {
            schedule(writeNextChunk, chunkDelayMs);
          } else {
            schedule(finish, finishDelayMs);
          }
        };

        writeNextChunk();
        return;
      }

      body.textContent = String(response.text ?? "Mock response");
      record("assistant-text", {
        turnKey: turn.getAttribute("data-turn-key"),
        text: normalize(body.textContent)
      });
      schedule(finish, finishDelayMs);
    }, startDelayMs);
  }

  function runStoppedThinking(turn, response) {
    beginGeneration();

    schedule(() => {
      endGeneration();
      const marker = document.createElement("span");
      marker.setAttribute("data-mock-terminal-marker", "true");
      marker.textContent = response.marker || "Stopped thinking";
      turn.appendChild(marker);
      record("terminal-marker", {
        turnKey: turn.getAttribute("data-turn-key"),
        marker: marker.textContent
      });
    }, Number(response.delayMs ?? 80));
  }

  function runHoldResponse(turn) {
    beginGeneration();
    record("assistant-hold", {
      turnKey: turn.getAttribute("data-turn-key")
    });
  }

  function runResponse(turn, response) {
    const selected = response || state.defaultResponse;

    if (selected.type === "stopped-thinking") {
      runStoppedThinking(turn, selected);
      return;
    }

    if (selected.type === "silent") {
      record("assistant-silent", {
        turnKey: turn.getAttribute("data-turn-key")
      });
      return;
    }

    if (selected.type === "hold") {
      runHoldResponse(turn, selected);
      return;
    }

    runNormalResponse(turn, selected);
  }

  function sendCurrentMessage() {
    const text = normalize(composer.innerText || composer.textContent || "");
    if (!text) {
      record("empty-send-ignored");
      return;
    }

    record("send", {
      text,
      stopVisible: !!currentStopButton()
    });

    clearComposer();
    const turn = createTurn(text);
    const response = state.responses.length
      ? state.responses.shift()
      : { ...state.defaultResponse };
    runResponse(turn, response);
  }

  function isProjectRoute() {
    return /^\/g\/g-p-[^/]+\/c\/[^/]+/.test(location.pathname);
  }

  function performNewChat(kind) {
    const project = kind === "project" || isProjectRoute();
    const newChatId = ++state.newChatCounter;
    const newPath = project
      ? `/g/g-p-mock/c/mock-chat-${newChatId}`
      : `/c/mock-chat-${newChatId}`;

    record("new-chat-click", {
      kind: project ? "project" : "regular",
      from: location.pathname,
      to: newPath
    });

    history.pushState({}, "", newPath);
    syncRouteLabel();

    schedule(() => {
      conversation.replaceChildren();
      clearComposer();
      resetGeneration();
      record("new-chat-ready", {
        path: location.pathname
      });
    }, Number(state.navigationClearDelayMs || 0));
  }

  function addStaleComposer(text = "") {
    const staleForm = document.createElement("form");
    staleForm.setAttribute("data-chatgpt-composer", "");
    staleForm.className = "stale-composer";

    const staleComposer = document.createElement("div");
    staleComposer.setAttribute("contenteditable", "true");
    staleComposer.setAttribute("data-composer-markdown", "");
    staleComposer.setAttribute("role", "textbox");
    staleComposer.textContent = text;

    const staleSend = document.createElement("button");
    staleSend.type = "button";
    staleSend.setAttribute("aria-label", "Send");
    staleSend.textContent = "↑";
    staleSend.addEventListener("click", () => {
      record("stale-send-click", {
        text: normalize(staleComposer.textContent)
      });
    });

    staleForm.append(staleComposer, staleSend);
    composerForm.parentElement.insertBefore(staleForm, composerForm);
    record("stale-composer-added", { text });
    return true;
  }

  function removeStaleComposers() {
    for (const stale of document.querySelectorAll("form.stale-composer")) {
      stale.remove();
    }
  }

  function reset(options = {}) {
    clearTimers();
    conversation.replaceChildren();
    removeStaleComposers();
    clearComposer();
    resetGeneration();

    state.responses = [];
    state.events = [];
    state.turnCounter = 0;
    state.newChatCounter = 0;
    state.navigationClearDelayMs = Number(options.navigationClearDelayMs || 0);
    state.defaultResponse = {
      type: "normal",
      text: "Mock response",
      startDelayMs: 20,
      finishDelayMs: 40,
      ...(options.defaultResponse || {})
    };

    renderEventLog();
    record("mock-reset");
  }

  const api = Object.freeze({
    reset,
    setScenario(config = {}) {
      if (Array.isArray(config.responses)) {
        state.responses = config.responses.map((response) => ({ ...response }));
      }
      if (config.defaultResponse) {
        state.defaultResponse = {
          ...state.defaultResponse,
          ...config.defaultResponse
        };
      }
      if (config.navigationClearDelayMs != null) {
        state.navigationClearDelayMs = Number(config.navigationClearDelayMs);
      }
      record("scenario-set", {
        queuedResponses: state.responses.length,
        navigationClearDelayMs: state.navigationClearDelayMs
      });
    },
    enqueueResponse(response) {
      state.responses.push({ ...response });
      record("response-enqueued", {
        type: response?.type || "normal"
      });
    },
    setComposerText,
    addStaleComposer,
    getEvents() {
      return state.events.map((entry) => ({ ...entry }));
    },
    getSentMessages() {
      return state.events
        .filter((entry) => entry.type === "send")
        .map((entry) => entry.text);
    },
    getState() {
      return {
        queuedResponses: state.responses.length,
        activeGenerations: state.activeGenerations,
        turnCount: conversation.querySelectorAll("[data-turn-key]").length,
        navigationClearDelayMs: state.navigationClearDelayMs,
        path: location.pathname,
        composerText: normalize(composer.innerText || composer.textContent || ""),
        staleComposerTexts: [...document.querySelectorAll("form.stale-composer [data-composer-markdown]")]
          .map((element) => normalize(element.textContent))
      };
    }
  });

  window.__mockChatGPT = api;

  composer.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (typeof text !== "string") {
      return;
    }

    event.preventDefault();
    composer.textContent = text;
    dispatchComposerInput();
    record("composer-paste", { length: text.length });
  });

  sendButton.addEventListener("click", sendCurrentMessage);
  composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendCurrentMessage();
  });

  document.querySelector('[data-mock-action="new-chat"]')
    ?.addEventListener("click", () => performNewChat("regular"));
  document.querySelector('[data-mock-action="project-new-chat"]')
    ?.addEventListener("click", () => performNewChat("project"));

  document.querySelector('[data-mock-action="enqueue-normal"]')
    ?.addEventListener("click", () => {
      api.enqueueResponse({
        type: "normal",
        text: responseTextInput?.value || "Mock response"
      });
    });

  document.querySelector('[data-mock-action="enqueue-stopped"]')
    ?.addEventListener("click", () => {
      api.enqueueResponse({ type: "stopped-thinking" });
    });

  document.querySelector('[data-mock-action="enqueue-hold"]')
    ?.addEventListener("click", () => {
      api.enqueueResponse({ type: "hold" });
    });

  document.querySelector('[data-mock-action="enqueue-handoff"]')
    ?.addEventListener("click", () => {
      api.enqueueResponse({
        type: "normal",
        text: [
          "Mock chat segment complete.",
          "סיימתי",
          "[[SEQUENCE_RUNNER_NEW_CHAT]]",
          "בשלב זה מומלץ לעבור לצ'אט חדש.",
          "[[NEXT_CHAT_PROMPT]]",
          responseTextInput?.value || "Continue mock task",
          "[[/NEXT_CHAT_PROMPT]]",
          "[[/SEQUENCE_RUNNER_NEW_CHAT]]"
        ].join("\n")
      });
    });

  document.querySelector('[data-mock-action="reset"]')
    ?.addEventListener("click", () => reset());

  window.addEventListener("popstate", syncRouteLabel);
  syncRouteLabel();
  record("mock-ready");
})();
