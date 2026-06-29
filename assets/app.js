const POLLPULSE_KEY = "pollpulse-demo-state";

function defaultState() {
  return {
    sessionName: "Product Team Check-in",
    activeQuestionIndex: 0,
    questions: [
      {
        text: "What should we prioritize next?",
        options: ["Speed", "Reliability", "Design polish"],
        votes: [0, 0, 0],
        status: "open"
      }
    ]
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(POLLPULSE_KEY)) || defaultState();
  } catch (error) {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(POLLPULSE_KEY, JSON.stringify(state));
}

function activeQuestion(state) {
  return state.questions[state.activeQuestionIndex] || null;
}

function renderMissionControl() {
  const sessionInput = document.getElementById("session-name");
  const questionText = document.getElementById("question-text");
  const questionOptions = document.getElementById("question-options");
  const questionList = document.getElementById("question-list");
  const saveButton = document.getElementById("save-session");
  const addButton = document.getElementById("add-question");

  if (!sessionInput || !questionList) {
    return;
  }

  let state = loadState();
  sessionInput.value = state.sessionName || "";

  function showFeedback(anchor, messageText) {
    const existingMessage = document.getElementById("pollpulse-feedback");
    if (existingMessage) {
      existingMessage.remove();
    }

    const message = document.createElement("span");
    message.id = "pollpulse-feedback";
    message.textContent = messageText;
    message.style.color = "#2563eb";
    message.style.fontWeight = "800";
    message.style.marginLeft = "12px";

    anchor.insertAdjacentElement("afterend", message);

    window.setTimeout(() => {
      message.remove();
    }, 2200);
  }

  function drawQuestions() {
    questionList.innerHTML = state.questions.map((question, index) => {
      const voteTotal = question.votes.reduce((sum, vote) => sum + Number(vote || 0), 0);

      return `
        <div class="card" style="margin-top: 12px; border-color: ${index === state.activeQuestionIndex ? "#2563eb" : "var(--border)"};">
          <strong>${index + 1}. ${escapeHtml(question.text)}</strong>
          <span>${question.options.map(escapeHtml).join(", ")} · ${voteTotal} votes · ${question.status}</span>
          <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="button secondary" data-action="activate" data-index="${index}" type="button">Make Active</button>
            <button class="button secondary" data-action="toggle" data-index="${index}" type="button">
              ${question.status === "open" ? "Close Voting" : "Open Voting"}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  saveButton.addEventListener("click", () => {
    const nextName = sessionInput.value.trim() || "Untitled Session";

    state.sessionName = nextName;
    saveState(state);
    drawQuestions();

    saveButton.textContent = "Saved";
    saveButton.disabled = true;
    showFeedback(saveButton, `Session saved as "${nextName}".`);

    window.setTimeout(() => {
      saveButton.textContent = "Save Session";
      saveButton.disabled = false;
    }, 1800);
  });

  addButton.addEventListener("click", () => {
    const text = questionText.value.trim();
    const options = questionOptions.value
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean);

    if (!text || options.length < 2) {
      alert("Add a question and at least two options.");
      return;
    }

    state.questions.push({
      text,
      options,
      votes: options.map(() => 0),
      status: "open"
    });

    state.activeQuestionIndex = state.questions.length - 1;
    questionText.value = "";
    questionOptions.value = "";
    saveState(state);
    drawQuestions();

    addButton.textContent = "Added";
    addButton.disabled = true;
    showFeedback(addButton, "Question added and made active.");

    window.setTimeout(() => {
      addButton.textContent = "Add Question";
      addButton.disabled = false;
    }, 1800);
  });

  questionList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === "activate") {
      state.activeQuestionIndex = index;
      showFeedback(button, "Active question updated.");
    }

    if (action === "toggle") {
      state.questions[index].status = state.questions[index].status === "open" ? "closed" : "open";
      showFeedback(button, `Voting is now ${state.questions[index].status}.`);
    }

    saveState(state);
    drawQuestions();
  });

  drawQuestions();
}

function renderVoteView() {
  const sessionEl = document.getElementById("vote-session");
  const questionEl = document.getElementById("vote-question");
  const optionsEl = document.getElementById("vote-options");
  const messageEl = document.getElementById("vote-message");

  if (!sessionEl || !questionEl || !optionsEl) {
    return;
  }

  let state = loadState();
  let question = activeQuestion(state);

  sessionEl.textContent = state.sessionName || "PollPulse Session";

  if (!question) {
    questionEl.textContent = "No active question yet.";
    optionsEl.innerHTML = "";
    return;
  }

  questionEl.textContent = question.text;

  if (question.status !== "open") {
    optionsEl.innerHTML = "";
    messageEl.textContent = "Voting is closed for this question.";
    return;
  }

  optionsEl.innerHTML = question.options.map((option, index) => `
    <button class="button secondary" data-vote-index="${index}" type="button">
      ${escapeHtml(option)}
    </button>
  `).join("");

  optionsEl.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-vote-index]");
    if (!button) return;

    const voteIndex = Number(button.dataset.voteIndex);
    state = loadState();
    question = activeQuestion(state);

    if (!question || question.status !== "open") {
      messageEl.textContent = "Voting is closed.";
      return;
    }

    question.votes[voteIndex] = Number(question.votes[voteIndex] || 0) + 1;
    saveState(state);
    messageEl.textContent = "Vote submitted. Thank you.";
  });
}

function renderSlideView() {
  const sessionEl = document.getElementById("slide-session");
  const questionEl = document.getElementById("slide-question");
  const statusEl = document.getElementById("slide-status");
  const resultsEl = document.getElementById("slide-results");

  if (!sessionEl || !questionEl || !resultsEl) {
    return;
  }

  function draw() {
    const state = loadState();
    const question = activeQuestion(state);

    sessionEl.textContent = state.sessionName || "PollPulse Session";

    if (!question) {
      questionEl.textContent = "No active question yet.";
      statusEl.textContent = "";
      resultsEl.innerHTML = "";
      return;
    }

    const total = question.votes.reduce((sum, vote) => sum + Number(vote || 0), 0);

    questionEl.textContent = question.text;
    statusEl.textContent = `${question.status.toUpperCase()} · ${total} votes`;

    resultsEl.innerHTML = question.options.map((option, index) => {
      const count = Number(question.votes[index] || 0);
      const percent = total ? Math.round((count / total) * 100) : 0;

      return `
        <div class="card" style="margin-top: 14px;">
          <strong>${escapeHtml(option)}</strong>
          <span>${count} votes · ${percent}%</span>
          <div style="height: 14px; background: #e5e7eb; border-radius: 999px; margin-top: 10px; overflow: hidden;">
            <div style="height: 100%; width: ${percent}%; background: #2563eb;"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  draw();
  setInterval(draw, 1000);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderMissionControl();
renderVoteView();
renderSlideView();
