const POLLPULSE_SESSION_ID = "demo";
const POLLPULSE_PATH = `pollpulse/sessions/${POLLPULSE_SESSION_ID}`;
const VOTER_ID_KEY = "pollpulse-voter-id";

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
        type: "single",
        options: ["Speed", "Reliability", "Design polish"],
        votes: [0, 0, 0],
        voterSelections: {},
        status: "open",
        closesAt: null
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
      ? Math.max(0, Math.min(state.activeQuestionIndex, Math.max(questions.length - 1, 0)))
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
    type: question.type === "multi" ? "multi" : "single",
    options: options.length ? options : ["Option A", "Option B"],
    votes: options.map((_, index) => Math.max(0, Number(votes[index] || 0))),
    voterSelections: question.voterSelections && typeof question.voterSelections === "object"
      ? question.voterSelections
      : {},
    status: question.status === "closed" ? "closed" : "open",
    closesAt: question.closesAt || null
  };
}

function saveState(state) {
  return sessionRef.set({
    ...state,
    updatedAt: Date.now()
  });
}

function activeQuestion(state) {
  return state.questions[state.activeQuestionIndex] || null;
}

function currentVoteUrl() {
  const url = new URL("vote.html", window.location.href);
  url.searchParams.set("v", "9");
  url.searchParams.set("t", String(Date.now()));
  return url.href;
}

function getVoterId() {
  let voterId = sessionStorage.getItem(VOTER_ID_KEY);

  if (!voterId) {
    voterId = `voter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(VOTER_ID_KEY, voterId);
  }

  return voterId;
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

function closeExpiredQuestion(state) {
  const question = activeQuestion(state);

  if (!question || question.status !== "open" || !question.closesAt) {
    return false;
  }

  if (Date.now() < Number(question.closesAt)) {
    return false;
  }

  question.status = "closed";
  question.closesAt = null;
  saveState(state);
  return true;
}

function recalculateVotes(question) {
  question.votes = question.options.map(() => 0);

  Object.values(question.voterSelections || {}).forEach((selection) => {
    const selectedIndexes = Array.isArray(selection) ? selection : [selection];

    selectedIndexes.forEach((index) => {
      const voteIndex = Number(index);
      if (Number.isInteger(voteIndex) && voteIndex >= 0 && voteIndex < question.votes.length) {
        question.votes[voteIndex] += 1;
      }
    });
  });
}

function selectedIndexesFor(question, voterId) {
  const selected = question.voterSelections[voterId] || [];
  return Array.isArray(selected) ? selected.map(Number) : [Number(selected)];
}

function totalVotesFor(question) {
  return question.votes.reduce((sum, vote) => sum + Number(vote || 0), 0);
}

function renderMissionControl() {
  const sessionInput = document.getElementById("session-name");
  const questionFormTitle = document.getElementById("question-form-title");
  const editingQuestionIndex = document.getElementById("editing-question-index");
  const questionType = document.getElementById("question-type");
  const questionText = document.getElementById("question-text");
  const questionOptions = document.getElementById("question-options");
  const questionList = document.getElementById("question-list");
  const saveButton = document.getElementById("save-session");
  const addButton = document.getElementById("add-question");
  const cancelEditButton = document.getElementById("cancel-edit");

  if (!sessionInput || !questionList) {
    return;
  }

  let state = defaultState();

  function resetQuestionForm() {
    editingQuestionIndex.value = "";
    questionFormTitle.textContent = "Add Question";
    addButton.textContent = "Add Question";
    cancelEditButton.hidden = true;
    questionText.value = "";
    questionOptions.value = "";
    questionType.value = "single";
  }

  function drawQuestions() {
    questionList.innerHTML = state.questions.map((question, index) => {
      const voteTotal = totalVotesFor(question);
      const typeLabel = question.type === "multi" ? "multi-select" : "single-select";

      return `
        <div class="card" style="margin-top: 12px; border-color: ${index === state.activeQuestionIndex ? "#2563eb" : "var(--border)"};">
          <strong>${index + 1}. ${escapeHtml(question.text)}</strong>
          <span>${typeLabel} · ${question.options.map(escapeHtml).join(", ")} · ${voteTotal} votes · ${question.status}</span>
          <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="button secondary" data-action="activate" data-index="${index}" type="button">Make Active</button>
            <button class="button secondary" data-action="toggle" data-index="${index}" type="button">
              ${question.status === "open" ? "Close Voting" : "Open Voting"}
            </button>
            <button class="button secondary" data-action="edit" data-index="${index}" type="button">Edit</button>
            <button class="button danger" data-action="delete" data-index="${index}" type="button">Delete</button>
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
    const editIndex = editingQuestionIndex.value === "" ? -1 : Number(editingQuestionIndex.value);

    if (!text || options.length < 2) {
      setStatus("question-save-status", "Add a question and at least two options.");
      return;
    }

    const nextQuestion = {
      text,
      type: questionType && questionType.value === "multi" ? "multi" : "single",
      options,
      votes: options.map(() => 0),
      voterSelections: {},
      status: "open",
      closesAt: null
    };

    if (editIndex >= 0 && state.questions[editIndex]) {
      state.questions[editIndex] = nextQuestion;
      state.activeQuestionIndex = editIndex;
      setStatus("question-save-status", "Question updated and votes reset.");
    } else {
      state.questions.push(nextQuestion);
      state.activeQuestionIndex = state.questions.length - 1;
      setStatus("question-save-status", "Question added and made active.");
    }

    resetQuestionForm();
    await saveState(state);

    addButton.textContent = "Saved";
    addButton.disabled = true;

    window.setTimeout(() => {
      addButton.textContent = "Add Question";
      addButton.disabled = false;
    }, 900);
  });

  cancelEditButton.addEventListener("click", resetQuestionForm);

  questionList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (action === "activate") {
      state.activeQuestionIndex = index;
      setStatus("question-save-status", "Active question updated.");
      await saveState(state);
    }

    if (action === "toggle") {
      state.questions[index].status = state.questions[index].status === "open" ? "closed" : "open";
      state.questions[index].closesAt = null;
      setStatus("question-save-status", `Voting is now ${state.questions[index].status}.`);
      await saveState(state);
    }

    if (action === "edit") {
      const question = state.questions[index];

      editingQuestionIndex.value = String(index);
      questionFormTitle.textContent = "Edit Question";
      addButton.textContent = "Save Question";
      cancelEditButton.hidden = false;
      questionText.value = question.text;
      questionType.value = question.type;
      questionOptions.value = question.options.join("\n");
      questionText.focus();
      setStatus("question-save-status", "Editing question. Saving will reset votes.");
    }

    if (action === "delete") {
      if (!window.confirm("Delete this question? This cannot be undone.")) {
        return;
      }

      state.questions.splice(index, 1);

      if (!state.questions.length) {
        state.questions = defaultState().questions;
      }

      state.activeQuestionIndex = Math.max(0, Math.min(state.activeQuestionIndex, state.questions.length - 1));

      if (state.activeQuestionIndex >= index) {
        state.activeQuestionIndex = Math.max(0, state.activeQuestionIndex - 1);
      }

      resetQuestionForm();
      setStatus("question-save-status", "Question deleted.");
      await saveState(state);
    }
  });
}

function renderVoteView() {
  const sessionEl = document.getElementById("vote-session");
  const statusEl = document.getElementById("vote-status");
  const countdownEl = document.getElementById("vote-countdown");
  const typeEl = document.getElementById("vote-type");
  const questionEl = document.getElementById("vote-question");
  const optionsEl = document.getElementById("vote-options");
  const messageEl = document.getElementById("vote-message");

  if (!sessionEl || !questionEl || !optionsEl) {
    return;
  }

  let state = defaultState();
  let countdownTimer = null;

  function updateVoteCountdown(question) {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }

    if (!countdownEl) {
      return;
    }

    if (!question || question.status !== "open" || !question.closesAt) {
      countdownEl.textContent = "";
      return;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((Number(question.closesAt) - Date.now()) / 1000));
      countdownEl.textContent = `Closes in ${remaining}s`;

      if (remaining <= 0) {
        question.status = "closed";
        question.closesAt = null;
        saveState(state);
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }

    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  function renderVoteOptions(question, selectedIndexes) {
    const total = totalVotesFor(question);
    const isClosed = question.status !== "open";

    optionsEl.innerHTML = question.options.map((option, index) => {
      const isSelected = selectedIndexes.includes(index);
      const count = Number(question.votes[index] || 0);
      const percent = total ? Math.round((count / total) * 100) : 0;

      if (isClosed) {
        return `
          <button class="vote-option is-closed ${isSelected ? "is-selected" : ""}" data-vote-index="${index}" type="button" disabled>
            <span>${escapeHtml(option)}${isSelected ? " ✓" : ""}</span>
            <span class="vote-result">
              <span class="vote-result-line">
                <small>${count} votes</small>
                <small>${percent}%</small>
              </span>
              <span class="vote-result-track">
                <span class="vote-result-fill" style="width: ${percent}%"></span>
              </span>
            </span>
          </button>
        `;
      }

      return `
        <button class="vote-option ${isSelected ? "is-selected" : ""}" data-vote-index="${index}" type="button">
          <span>${escapeHtml(option)}${isSelected ? " ✓" : ""}</span>
        </button>
      `;
    }).join("");
  }

  function draw(nextState) {
    state = nextState;
    closeExpiredQuestion(state);

    const question = activeQuestion(state);
    const voterId = getVoterId();

    sessionEl.textContent = state.sessionName || "PollPulse Session";

    if (!question) {
      questionEl.textContent = "No active question yet.";
      optionsEl.innerHTML = "";
      if (statusEl) statusEl.textContent = "";
      updateVoteCountdown(null);
      return;
    }

    const selectedIndexes = selectedIndexesFor(question, voterId).filter(Number.isInteger);
    const isClosed = question.status !== "open";

    questionEl.textContent = question.text;
    typeEl.textContent = question.type === "multi"
      ? "Tap one or more options. Your choices can change until voting closes."
      : "Tap one option. Tapping another option changes your vote.";

    if (statusEl) {
      statusEl.textContent = isClosed ? "Closed" : "Open";
      statusEl.classList.toggle("is-closed", isClosed);
    }

    renderVoteOptions(question, selectedIndexes);
    updateVoteCountdown(question);

    if (isClosed) {
      messageEl.textContent = selectedIndexes.length
        ? "Voting is closed. Your selected option is highlighted."
        : "Voting is closed. Results are shown below.";
    } else {
      messageEl.textContent = selectedIndexes.length ? "Your current vote is saved." : "";
    }
  }

  onSessionChange(draw);

  optionsEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-vote-index]");
    if (!button || button.disabled) return;

    const voteIndex = Number(button.dataset.voteIndex);
    const snapshot = await sessionRef.get();
    state = normalizeState(snapshot.val());
    closeExpiredQuestion(state);
    const question = activeQuestion(state);
    const voterId = getVoterId();

    if (!question || question.status !== "open") {
      messageEl.textContent = "Voting is closed.";
      return;
    }

    const currentSelection = question.voterSelections[voterId] || [];
    let nextSelection = Array.isArray(currentSelection)
      ? currentSelection.map(Number)
      : [Number(currentSelection)];

    if (question.type === "single") {
      nextSelection = [voteIndex];
    } else if (nextSelection.includes(voteIndex)) {
      nextSelection = nextSelection.filter((index) => index !== voteIndex);
    } else {
      nextSelection.push(voteIndex);
    }

    question.voterSelections[voterId] = nextSelection;
    recalculateVotes(question);

    await saveState(state);
    messageEl.textContent = question.type === "multi"
      ? "Selection updated."
      : "Vote updated.";
  });
}

function renderSlideView() {
  const sessionEl = document.getElementById("slide-session");
  const questionEl = document.getElementById("slide-question");
  const statusEl = document.getElementById("slide-status");
  const resultsEl = document.getElementById("slide-results");
  const countdownEl = document.getElementById("slide-countdown");
  const qrEl = document.getElementById("slide-qr");
  const voteLinkEl = document.getElementById("slide-vote-link");
  const startButton = document.getElementById("start-voting");
  const stopButton = document.getElementById("stop-voting");
  const clearVotesButton = document.getElementById("clear-votes");
  const firstButton = document.getElementById("first-question");
  const previousButton = document.getElementById("previous-question");
  const nextButton = document.getElementById("next-question");
  const lastButton = document.getElementById("last-question");
  const timerButtons = Array.from(document.querySelectorAll("[data-timer]"));

  if (!sessionEl || !questionEl || !resultsEl) {
    return;
  }

  let state = defaultState();
  let countdownTimer = null;

  function renderQr() {
    const voteUrl = currentVoteUrl();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(voteUrl)}`;

    if (voteLinkEl) {
      voteLinkEl.href = voteUrl;
      voteLinkEl.textContent = voteUrl;
    }

    if (qrEl) {
      qrEl.innerHTML = `<img src="${qrUrl}" width="180" height="180" alt="QR code for PollPulse vote page">`;
    }
  }

  function updateCountdown(question) {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }

    if (!countdownEl) {
      return;
    }

    if (!question || question.status !== "open" || !question.closesAt) {
      countdownEl.textContent = "";
      return;
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((Number(question.closesAt) - Date.now()) / 1000));
      countdownEl.textContent = `Voting closes in ${remaining}s`;

      if (remaining <= 0) {
        question.status = "closed";
        question.closesAt = null;
        saveState(state);
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }

    tick();
    countdownTimer = window.setInterval(tick, 1000);
  }

  function draw(nextState) {
    state = nextState;
    closeExpiredQuestion(state);

    const question = activeQuestion(state);

    sessionEl.textContent = state.sessionName || "PollPulse Session";

    if (!question) {
      questionEl.textContent = "No active question yet.";
      statusEl.textContent = "";
      resultsEl.innerHTML = "";
      updateCountdown(null);
      return;
    }

    const total = totalVotesFor(question);
    const typeLabel = question.type === "multi" ? "MULTI-SELECT" : "SINGLE-SELECT";

    questionEl.textContent = question.text;
    statusEl.textContent = `${typeLabel} · ${question.status.toUpperCase()} · ${total} votes`;

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

    firstButton.disabled = state.activeQuestionIndex <= 0;
    previousButton.disabled = state.activeQuestionIndex <= 0;
    nextButton.disabled = state.activeQuestionIndex >= state.questions.length - 1;
    lastButton.disabled = state.activeQuestionIndex >= state.questions.length - 1;

    updateCountdown(question);
  }

  async function setActiveQuestion(index) {
    state.activeQuestionIndex = Math.max(0, Math.min(state.questions.length - 1, index));
    await saveState(state);
  }

  async function updateActiveQuestion(mutator) {
    const snapshot = await sessionRef.get();
    state = normalizeState(snapshot.val());
    const question = activeQuestion(state);

    if (!question) {
      return;
    }

    mutator(question);
    await saveState(state);
  }

  startButton.addEventListener("click", () => {
    updateActiveQuestion((question) => {
      question.status = "open";
      question.closesAt = null;
    });
  });

  stopButton.addEventListener("click", () => {
    updateActiveQuestion((question) => {
      question.status = "closed";
      question.closesAt = null;
    });
  });

  clearVotesButton.addEventListener("click", () => {
    if (!window.confirm("Clear all votes for this question?")) {
      return;
    }

    updateActiveQuestion((question) => {
      question.votes = question.options.map(() => 0);
      question.voterSelections = {};
    });
  });

  timerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const seconds = Number(button.dataset.timer || 30);

      updateActiveQuestion((question) => {
        question.status = "open";
        question.closesAt = Date.now() + seconds * 1000;
      });
    });
  });

  firstButton.addEventListener("click", () => setActiveQuestion(0));
  previousButton.addEventListener("click", () => setActiveQuestion(state.activeQuestionIndex - 1));
  nextButton.addEventListener("click", () => setActiveQuestion(state.activeQuestionIndex + 1));
  lastButton.addEventListener("click", () => setActiveQuestion(state.questions.length - 1));

  renderQr();
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
