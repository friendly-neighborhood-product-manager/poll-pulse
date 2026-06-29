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

  function drawQuestions() {
    questionList.innerHTML = state.questions.map((question, index) => `
      <div class="card" style="margin-top: 12px;">
        <strong>${index + 1}. ${escapeHtml(question.text)}</strong>
        <span>${question.options.map(escapeHtml).join(", ")}</span>
        <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="button secondary" data-action="activate" data-index="${index}" type="button">Make Active</button>
          <button class="button secondary" data-action="toggle" data-index="${index}" type="button">
            ${question.status === "open" ? "Close Voting" : "Open Voting"}
          </button>
        </div>
      </div>
    `).join("");
  }

  saveButton.addEventListener("click", () => {
    state.sessionName = sessionInput.value.trim() || "Untitled Session";
    saveState(state);
    drawQuestions();
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
  });

  questionList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === "activate") {
      state.activeQuestionIndex = index;
    }

    if (action === "toggle") {
      state.questions[index].status = state.questions[index].status === "open" ? "closed" : "open";
    }

    saveState(state);
    drawQuestions();
  });

  drawQuestions();
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
