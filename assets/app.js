const POLLPULSE_SESSION_ID = "demo";
const POLLPULSE_PATH = `pollpulse/sessions/${POLLPULSE_SESSION_ID}`;

const firebaseConfig = {
  apiKey: "AIzaSyDj5h4-1t5CzZ1JalkMhuUFWdWrIK3DUlo",
  authDomain: "poll-pulse-7eb98.firebaseapp.com",
  databaseURL: "https://poll-pulse-7eb98-default-rtdb.firebaseio.com/",
  projectId: "poll-pulse-7eb98",
  storageBucket: "poll-pulse-7eb98.firebasestorage.app",
  messagingSenderId: "1074866212603",
  appId: "1:1074866212603:web:8f113e61f5b508865eea5e"
};

firebase.initializeApp(firebaseConfig);

const database = firebase.database();
const sessionRef = database.ref(POLLPULSE_PATH);

function defaultState() {
  return {
    sessionName: "Product Team Check-in",
    activeQuestionIndex: 0,
    updatedAt: Date.now(),
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

function normalizeState(value) {
  const fallback = defaultState();
  const state = value && typeof value === "object" ? value : fallback;
  const questions = Array.isArray(state.questions)
    ? state.questions
    : Object.values(state.questions || {});

  return {
    sessionName: typeof state.sessionName === "string" && state.sessionName.trim()
      ? state.sessionName
      : fallback.sessionName,
    activeQuestionIndex: Number.isInteger(state.activeQuestionIndex)
      ? state.activeQuestionIndex
      : 0,
    updatedAt: Number(state.updatedAt || Date.now()),
    questions: questions.length ? questions.map(normalizeQuestion) : fallback.questions
  };
}

function normalizeQuestion(question) {
  const options = Array.isArray(question.options)
    ? question.options.map(String)
    : Object.values(question.options || {}).map(String);

  const votes = Array.isArray(question.votes)
    ? question.votes.map((vote) => Number(vote || 0))
    : Object.values(question.votes || {}).map((vote) => Number(vote || 0));

  return {
    text: String(question.text || "Untitled question"),
    options: options.length ? options : ["Option A", "Option B"],
    votes: options.map((_, index) => Number(votes[index] || 0)),
    status: question.status === "closed" ? "closed" : "open"
  };
}

function saveState(state) {
  const nextState = {
    ...state,
    updatedAt: Date.now()
  };

  return sessionRef.set(nextState);
}

function activeQuestion(state) {
  return state.questions[state.activeQuestionIndex] || null;
}

function setStatus(id, message) {
  const status = document.getElementById(id);

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.add("is-visible");

  window.clearTimeout(status._pollpulseTimer);
  status._pollpulseTimer = window.setTimeout(() => {
    status.textContent = "";
    status.classList.remove("is-visible");
  }, 2400);
}

async function ensureSession() {
  const snapshot = await sessionRef.get();

  if (!snapshot.exists()) {
    await saveState(defaultState());
    return defaultState();
  }

  return normalizeState(snapshot.val());
}

function onSessionChange(callback) {
  sessionRef.on("value", (snapshot) => {
    callback(normalizeState(snapshot.val()));
  });
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

  let state = defaultState();

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

  onSessionChange((nextState) => {
    state = nextState;

    if (document.activeElement !== sessionInput) {
      sessionInput.value = state.sessionName || "";
    }

    drawQuestions();
  });

  saveButton.addEventListener("click", async () => {
    const nextName = sessionInput.value.trim() || "Untitled Session";

    state.sessionName = nextName;
    await saveState(state);

    saveButton.textContent = "Saved";
    saveButton.disabled = true;
    setStatus("session-save-status", `Saved as "${nextName}".`);

    window.setTimeout(() => {
      saveButton.textContent = "Save Session";
      saveButton.disabled = false;
    }, 1200);
  });

  addButton.addEventListener("click", async () => {
    const text = questionText.value.trim();
    const options = questionOptions.value
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean);

    if (!text || options.length < 2) {
      setStatus("question-save-status", "Add a question and at least two options.");
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

    await saveState(state);

    addButton.textContent = "Added";
    addButton.disabled = true;
    setStatus("question-save-status", "Question added and made active.");

    window.setTimeout(() => {
      addButton.textContent = "Add Question";
      addButton.disabled = false;
    }, 1200);
  });

  questionList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === "activate") {
      state.activeQuestionIndex = index;
      setStatus("question-save-status", "Active question updated.");
    }

    if (action === "toggle") {
      state.questions[index].status = state.questions[index].status === "open" ? "closed" : "open";
      setStatus("question-save-status", `Voting is now ${state.questions[index].status}.`);
    }

    await saveState(state);
  });
}

function renderVoteView() {
  const sessionEl = document.getElementById("vote-session");
  const questionEl = document.getElementById("vote-question");
  const optionsEl = document.getElementById("vote-options");
  const messageEl = document.getElementById("vote-message");

  if (!sessionEl || !questionEl || !optionsEl) {
    return;
  }

  let state = defaultState();

  function draw(nextState) {
    state = nextState;
    const question = activeQuestion(state);

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

    messageEl.textContent = "";

    optionsEl.innerHTML = question.options.map((option, index) => `
      <button class="button secondary" data-vote-index="${index}" type="button">
        ${escapeHtml(option)}
      </button>
    `).join("");
  }

  onSessionChange(draw);

  optionsEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-vote-index]");
    if (!button) return;

    const voteIndex = Number(button.dataset.voteIndex);
    const snapshot = await sessionRef.get();
    state = normalizeState(snapshot.val());
    const question = activeQuestion(state);

    if (!question || question.status !== "open") {
      messageEl.textContent = "Voting is closed.";
      return;
    }

    question.votes[voteIndex] = Number(question.votes[voteIndex] || 0) + 1;
    await saveState(state);
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

  function draw(state) {
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

  onSessionChange(draw);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

ensureSession()
  .then(() => {
    renderMissionControl();
    renderVoteView();
    renderSlideView();
  })
  .catch((error) => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div style="background:#fee2e2;color:#7f1d1d;padding:12px 16px;font-weight:800;">Firebase error: ${escapeHtml(error.message)}</div>`
    );
  });
