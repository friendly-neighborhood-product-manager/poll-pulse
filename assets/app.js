const POLLPULSE_VERSION = "12";
const POLLPULSE_SESSIONS_PATH = "pollpulse/sessions";
const DEFAULT_SESSION_ID = "demo";
const CURRENT_SESSION_KEY = "pollpulse-current-session-id";
const VOTER_ID_PREFIX = "pollpulse-voter-id";

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
const sessionsRef = database.ref(POLLPULSE_SESSIONS_PATH);

let activeSessionId = sessionIdFromUrl() || localStorage.getItem(CURRENT_SESSION_KEY) || DEFAULT_SESSION_ID;
let sessionRef = sessionRefFor(activeSessionId);

function blankState(sessionId = activeSessionId, sessionName = "Untitled Session") {
  const now = Date.now();

  return {
    sessionId,
    sessionName,
    activeQuestionIndex: 0,
    createdAt: now,
    updatedAt: now,
    questions: []
  };
}

function sessionIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return cleanSessionId(params.get("session"));
}

function cleanSessionId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function slugify(value) {
  const slug = String(value || "session")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return slug || "session";
}

function createSessionId(sessionName) {
  return `${slugify(sessionName)}-${Date.now().toString(36)}`;
}

function sessionRefFor(sessionId) {
  return database.ref(`${POLLPULSE_SESSIONS_PATH}/${cleanSessionId(sessionId) || DEFAULT_SESSION_ID}`);
}

function setActiveSession(sessionId) {
  activeSessionId = cleanSessionId(sessionId) || DEFAULT_SESSION_ID;
  localStorage.setItem(CURRENT_SESSION_KEY, activeSessionId);
  sessionRef = sessionRefFor(activeSessionId);
}

function encodeQuestions(questions) {
  return questions.length ? questions : { _empty: true };
}

function decodeQuestions(rawQuestions) {
  if (Array.isArray(rawQuestions)) {
    return rawQuestions
      .filter((question) => question && typeof question === "object")
      .map(normalizeQuestion);
  }

  if (rawQuestions && typeof rawQuestions === "object") {
    return Object.entries(rawQuestions)
      .filter(([key, question]) => !String(key).startsWith("_") && question && typeof question === "object")
      .sort(([aKey, aQuestion], [bKey, bQuestion]) => {
        const aOrder = Number(aQuestion.order ?? aKey);
        const bOrder = Number(bQuestion.order ?? bKey);
        return Number.isFinite(aOrder) && Number.isFinite(bOrder)
          ? aOrder - bOrder
          : String(aKey).localeCompare(String(bKey));
      })
      .map(([, question]) => normalizeQuestion(question));
  }

  return [];
}

function normalizeState(value, fallbackSessionId = activeSessionId) {
  const sessionId = cleanSessionId(value && value.sessionId) || cleanSessionId(fallbackSessionId) || DEFAULT_SESSION_ID;
  const fallback = blankState(sessionId);
  const state = value && typeof value === "object" ? value : fallback;
  const questions = decodeQuestions(state.questions);

  return {
    sessionId,
    sessionName: typeof state.sessionName === "string" && state.sessionName.trim()
      ? state.sessionName
      : fallback.sessionName,
    activeQuestionIndex: Number.isInteger(state.activeQuestionIndex) && questions.length
      ? Math.max(0, Math.min(state.activeQuestionIndex, questions.length - 1))
      : 0,
    createdAt: Number(state.createdAt || state.updatedAt || Date.now()),
    updatedAt: Number(state.updatedAt || Date.now()),
    questions
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

function serializeState(state) {
  const normalized = normalizeState(state, state.sessionId);

  return {
    ...normalized,
    questions: encodeQuestions(normalized.questions),
    updatedAt: Date.now()
  };
}

function saveState(state) {
  const nextState = serializeState(state);
  return sessionRefFor(nextState.sessionId).set(nextState);
}

function deleteSession(sessionId) {
  return sessionRefFor(sessionId).remove();
}

async function loadState(sessionId = activeSessionId) {
  const cleanId = cleanSessionId(sessionId) || DEFAULT_SESSION_ID;
  const snapshot = await sessionRefFor(cleanId).get();
  return normalizeState(snapshot.val(), cleanId);
}

async function ensureActiveSession() {
  const snapshot = await sessionRef.get();

  if (!snapshot.exists()) {
    const state = blankState(activeSessionId, "Untitled Session");
    await saveState(state);
    return state;
  }

  return normalizeState(snapshot.val(), activeSessionId);
}

function onActiveSessionChange(callback) {
  sessionRef.on("value", (snapshot) => {
    callback(normalizeState(snapshot.val(), activeSessionId));
  });
}

function activeQuestion(state) {
  return state.questions[state.activeQuestionIndex] || null;
}

function sessionUrl(pageName, sessionId = activeSessionId, includeTimestamp = false) {
  const url = new URL(pageName, window.location.href);
  url.searchParams.set("session", sessionId);
  url.searchParams.set("v", POLLPULSE_VERSION);

  if (includeTimestamp) {
    url.searchParams.set("t", String(Date.now()));
  }

  return url.href;
}

function currentVoteUrl() {
  return sessionUrl("vote.html", activeSessionId, false);
}

function currentSlideUrl() {
  return sessionUrl("slide.html", activeSessionId, false);
}

function getVoterId() {
  const key = `${VOTER_ID_PREFIX}:${activeSessionId}`;
  let voterId = sessionStorage.getItem(key);

  if (!voterId) {
    voterId = `voter_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(key, voterId);
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
  }, 2600);
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

function normalizeSessionsForList(value) {
  return Object.entries(value || {})
    .filter(([, session]) => session && typeof session === "object")
    .map(([sessionId, session]) => normalizeState(session, sessionId))
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function updateSessionLinks(sessionId) {
  const links = [
    ["mission-vote-link", sessionUrl("vote.html", sessionId, false)],
    ["mission-slide-link", sessionUrl("slide.html", sessionId, false)],
    ["active-vote-link", sessionUrl("vote.html", sessionId, false)],
    ["active-slide-link", sessionUrl("slide.html", sessionId, false)]
  ];

  links.forEach(([id, href]) => {
    const link = document.getElementById(id);
    if (link) {
      link.href = href;
    }
  });
}

function renderMissionControl() {
  const modeButtons = Array.from(document.querySelectorAll("[data-session-mode]"));
  const sessionListPanel = document.getElementById("session-list-panel");
  const sessionListTitle = document.getElementById("session-list-title");
  const sessionListHelp = document.getElementById("session-list-help");
  const sessionCardList = document.getElementById("session-card-list");
  const sessionNameField = document.getElementById("session-name-field");
  const sessionInput = document.getElementById("session-name");
  const activeSessionSummary = document.getElementById("active-session-summary");
  const questionEditorPanel = document.getElementById("question-editor-panel");
  const questionHistoryPanel = document.getElementById("question-history-panel");
  const questionFormTitle = document.getElementById("question-form-title");
  const editingQuestionIndex = document.getElementById("editing-question-index");
  const questionType = document.getElementById("question-type");
  const questionText = document.getElementById("question-text");
  const questionOptions = document.getElementById("question-options");
  const questionList = document.getElementById("question-list");
  const saveButton = document.getElementById("save-session");
  const addButton = document.getElementById("add-question");
  const cancelEditButton = document.getElementById("cancel-edit");

  if (!modeButtons.length || !sessionInput || !questionList) {
    return;
  }

  let mode = "create";
  let state = null;
  let sessions = [];
  let selectedSessionId = "";
  let selectedSessionListenerRef = null;

  function resetQuestionForm() {
    editingQuestionIndex.value = "";
    questionFormTitle.textContent = "Add Question";
    addButton.textContent = "Add Question";
    cancelEditButton.hidden = true;
    questionText.value = "";
    questionOptions.value = "";
    questionType.value = "single";
  }

  function setQuestionPanelsEnabled(enabled) {
    questionEditorPanel.hidden = !enabled;
    questionHistoryPanel.hidden = !enabled;
  }

  function detachSelectedSessionListener() {
    if (selectedSessionListenerRef) {
      selectedSessionListenerRef.off();
      selectedSessionListenerRef = null;
    }
  }

  function renderModeButtons() {
    modeButtons.forEach((button) => {
      const isActive = button.dataset.sessionMode === mode;
      button.classList.toggle("is-active", isActive);
      button.classList.toggle("secondary", !isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function renderActiveSessionSummary() {
    if (!state) {
      if (mode === "create") {
        activeSessionSummary.textContent = "Name your new session, then create it. New sessions start with no questions.";
      } else if (mode === "edit") {
        activeSessionSummary.textContent = "Choose a saved session to edit.";
      } else {
        activeSessionSummary.textContent = "Choose a saved session to delete.";
      }

      updateSessionLinks(activeSessionId);
      return;
    }

    const questionCount = state.questions.length;
    const createdDate = state.createdAt ? new Date(state.createdAt).toLocaleString() : "Unknown";

    if (mode === "delete") {
      activeSessionSummary.textContent = `Ready to delete "${state.sessionName}" and its ${questionCount} question${questionCount === 1 ? "" : "s"}.`;
      updateSessionLinks(activeSessionId);
      return;
    }

    activeSessionSummary.textContent = `${state.sessionName} | ${questionCount} question${questionCount === 1 ? "" : "s"} | created ${createdDate}`;
    updateSessionLinks(state.sessionId);
  }

  function drawQuestions() {
    if (!state || mode !== "edit") {
      questionList.innerHTML = "";
      renderActiveSessionSummary();
      return;
    }

    if (!state.questions.length) {
      questionList.innerHTML = `
        <div class="card" style="margin-top: 12px;">
          <strong>No questions yet.</strong>
          <span>Add the first question for this session when you are ready.</span>
        </div>
      `;
      renderActiveSessionSummary();
      return;
    }

    questionList.innerHTML = state.questions.map((question, index) => {
      const voteTotal = totalVotesFor(question);
      const typeLabel = question.type === "multi" ? "multi-select" : "single-select";

      return `
        <div class="card" style="margin-top: 12px; border-color: ${index === state.activeQuestionIndex ? "#2563eb" : "var(--border)"};">
          <strong>${index + 1}. ${escapeHtml(question.text)}</strong>
          <span>${typeLabel} | ${question.options.map(escapeHtml).join(", ")} | ${voteTotal} votes | ${question.status}</span>
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

    renderActiveSessionSummary();
  }

  function renderSessionCards() {
    if (mode === "create") {
      sessionListPanel.hidden = true;
      sessionCardList.innerHTML = "";
      return;
    }

    sessionListPanel.hidden = false;
    sessionListTitle.textContent = mode === "edit" ? "Select a session to edit" : "Select a session to delete";
    sessionListHelp.textContent = mode === "edit"
      ? "Pick a saved session to rename it, add questions, or manage voting."
      : "Pick a saved session to permanently remove it and its questions.";

    if (!sessions.length) {
      sessionCardList.innerHTML = `
        <div class="card session-empty-card">
          <strong>No saved sessions yet.</strong>
          <span>Create a new session first.</span>
        </div>
      `;
      return;
    }

    sessionCardList.innerHTML = sessions.map((session) => {
      const questionCount = session.questions.length;
      const updatedDate = session.updatedAt ? new Date(session.updatedAt).toLocaleString() : "Unknown";
      const isSelected = session.sessionId === selectedSessionId;

      return `
        <button class="session-card-button ${isSelected ? "is-selected" : ""}" data-session-id="${escapeHtml(session.sessionId)}" type="button">
          <strong>${escapeHtml(session.sessionName)}</strong>
          <span>${questionCount} question${questionCount === 1 ? "" : "s"} | updated ${escapeHtml(updatedDate)}</span>
        </button>
      `;
    }).join("");
  }

  function updateView() {
    renderModeButtons();
    renderSessionCards();

    const hasSelectedSession = Boolean(state && selectedSessionId);
    sessionNameField.hidden = mode === "delete" || (mode === "edit" && !hasSelectedSession);
    sessionInput.disabled = mode === "delete";
    setQuestionPanelsEnabled(mode === "edit" && hasSelectedSession);

    saveButton.hidden = mode !== "create" && !hasSelectedSession;
    saveButton.textContent = mode === "create"
      ? "Create Session"
      : mode === "delete"
        ? "Delete Session"
        : "Save Session";
    saveButton.classList.toggle("danger", mode === "delete");

    if (mode === "create") {
      questionList.innerHTML = "";
      renderActiveSessionSummary();
      return;
    }

    if (mode === "delete") {
      questionList.innerHTML = "";
      renderActiveSessionSummary();
      return;
    }

    drawQuestions();
  }

  function setMode(nextMode, options = {}) {
    mode = nextMode;

    if (!options.keepSelection) {
      detachSelectedSessionListener();
      selectedSessionId = "";
      state = null;
      resetQuestionForm();
    }

    if (mode === "create") {
      sessionInput.value = "";
      sessionInput.focus();
    }

    updateView();
  }

  function attachSelectedSession(sessionId) {
    detachSelectedSessionListener();
    selectedSessionId = cleanSessionId(sessionId);

    if (!selectedSessionId) {
      state = null;
      sessionInput.value = "";
      updateView();
      return;
    }

    setActiveSession(selectedSessionId);
    selectedSessionListenerRef = sessionRefFor(selectedSessionId);
    selectedSessionListenerRef.on("value", (snapshot) => {
      state = snapshot.exists() ? normalizeState(snapshot.val(), selectedSessionId) : null;

      if (state && document.activeElement !== sessionInput) {
        sessionInput.value = state.sessionName || "";
      }

      updateView();
    });
  }

  function selectSession(sessionId) {
    selectedSessionId = cleanSessionId(sessionId);

    if (mode === "edit") {
      attachSelectedSession(selectedSessionId);
      return;
    }

    detachSelectedSessionListener();
    state = sessions.find((session) => session.sessionId === selectedSessionId) || null;
    updateView();
  }

  sessionsRef.on("value", (snapshot) => {
    sessions = normalizeSessionsForList(snapshot.val());

    if (selectedSessionId && !sessions.some((session) => session.sessionId === selectedSessionId)) {
      selectedSessionId = "";
      state = null;
      detachSelectedSessionListener();
    } else if (mode === "delete" && selectedSessionId) {
      state = sessions.find((session) => session.sessionId === selectedSessionId) || state;
    }

    updateView();
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.sessionMode || "create");
    });
  });

  sessionCardList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-session-id]");
    if (!button) return;
    selectSession(button.dataset.sessionId);
  });

  saveButton.addEventListener("click", async () => {
    if (mode === "delete") {
      if (!state || !selectedSessionId) {
        setStatus("session-save-status", "Choose a session to delete.");
        return;
      }

      if (!window.confirm(`Delete "${state.sessionName}" and all of its questions? This cannot be undone.`)) {
        return;
      }

      saveButton.disabled = true;
      const deletedName = state.sessionName;
      await deleteSession(selectedSessionId);

      if (activeSessionId === selectedSessionId) {
        localStorage.removeItem(CURRENT_SESSION_KEY);
        activeSessionId = DEFAULT_SESSION_ID;
        sessionRef = sessionRefFor(activeSessionId);
      }

      selectedSessionId = "";
      state = null;
      resetQuestionForm();
      updateView();
      setStatus("session-save-status", `Deleted "${deletedName}".`);
      saveButton.disabled = false;
      return;
    }

    const nextName = sessionInput.value.trim();

    if (!nextName) {
      setStatus("session-save-status", "Add a session name first.");
      sessionInput.focus();
      return;
    }

    saveButton.disabled = true;

    if (mode === "create") {
      const newSessionId = createSessionId(nextName);
      const newState = blankState(newSessionId, nextName);
      await saveState(newState);
      setActiveSession(newSessionId);
      selectedSessionId = newSessionId;
      mode = "edit";
      setStatus("session-save-status", `Created "${nextName}". Add questions when ready.`);
      resetQuestionForm();
      attachSelectedSession(newSessionId);

      window.setTimeout(() => {
        questionEditorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        questionText.focus();
      }, 350);
    } else if (state) {
      state.sessionName = nextName;
      await saveState(state);
      setStatus("session-save-status", `Saved "${nextName}".`);
    }

    saveButton.disabled = false;
  });

  addButton.addEventListener("click", async () => {
    if (!state || mode !== "edit") {
      setStatus("question-save-status", "Choose a session to edit first.");
      return;
    }

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
    if (!button || !state || mode !== "edit") return;

    const index = Number(button.dataset.index);
    const action = button.dataset.action;

    if (!state.questions[index]) {
      return;
    }

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
        state.activeQuestionIndex = 0;
      } else if (state.activeQuestionIndex >= index) {
        state.activeQuestionIndex = Math.max(0, state.activeQuestionIndex - 1);
      } else {
        state.activeQuestionIndex = Math.max(0, Math.min(state.activeQuestionIndex, state.questions.length - 1));
      }

      resetQuestionForm();
      setStatus("question-save-status", "Question deleted.");
      await saveState(state);
    }
  });

  setMode("create", { keepSelection: false });
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

  let state = blankState();
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
            <span>${escapeHtml(option)}${isSelected ? " (selected)" : ""}</span>
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
          <span>${escapeHtml(option)}${isSelected ? " (selected)" : ""}</span>
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
      typeEl.textContent = "Waiting for the presenter to add a question.";
      optionsEl.innerHTML = "";
      messageEl.textContent = "";
      if (statusEl) statusEl.textContent = "Waiting";
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

  onActiveSessionChange(draw);

  optionsEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-vote-index]");
    if (!button || button.disabled) return;

    const voteIndex = Number(button.dataset.voteIndex);
    state = await loadState(activeSessionId);
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

  let state = blankState();
  let countdownTimer = null;

  function renderQr() {
    const voteUrl = currentVoteUrl();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(voteUrl)}`;

    if (voteLinkEl) {
      voteLinkEl.href = voteUrl;
      voteLinkEl.textContent = voteUrl;
    }

    if (qrEl) {
      if (qrEl.dataset.qrUrl !== qrUrl) {
        qrEl.dataset.qrUrl = qrUrl;
        qrEl.innerHTML = `<img src="${qrUrl}" width="180" height="180" alt="QR code for PollPulse vote page">`;
      }
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

  function setControlsEnabled(enabled) {
    [
      startButton,
      stopButton,
      clearVotesButton,
      firstButton,
      previousButton,
      nextButton,
      lastButton,
      ...timerButtons
    ].forEach((button) => {
      if (button) {
        button.disabled = !enabled;
      }
    });
  }

  function draw(nextState) {
    state = nextState;
    closeExpiredQuestion(state);
    renderQr();

    const question = activeQuestion(state);

    sessionEl.textContent = state.sessionName || "PollPulse Session";

    if (!question) {
      questionEl.textContent = "No active question yet.";
      statusEl.textContent = "Waiting for a question";
      resultsEl.innerHTML = `
        <div class="card" style="margin-top: 14px;">
          <strong>This session has no questions yet.</strong>
          <span>Add questions from Mission Control.</span>
        </div>
      `;
      updateCountdown(null);
      setControlsEnabled(false);
      return;
    }

    setControlsEnabled(true);

    const total = totalVotesFor(question);
    const typeLabel = question.type === "multi" ? "MULTI-SELECT" : "SINGLE-SELECT";

    questionEl.textContent = question.text;
    statusEl.textContent = `${typeLabel} | ${question.status.toUpperCase()} | ${total} votes`;

    resultsEl.innerHTML = question.options.map((option, index) => {
      const count = Number(question.votes[index] || 0);
      const percent = total ? Math.round((count / total) * 100) : 0;

      return `
        <div class="card" style="margin-top: 14px;">
          <strong>${escapeHtml(option)}</strong>
          <span>${count} votes | ${percent}%</span>
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
    state = await loadState(activeSessionId);
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
  onActiveSessionChange(draw);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showFirebaseError(error) {
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="background:#fee2e2;color:#7f1d1d;padding:12px 16px;font-weight:800;">Firebase error: ${escapeHtml(error.message)}</div>`
  );
}

if (document.getElementById("session-card-list")) {
  renderMissionControl();
}

if (document.getElementById("vote-question")) {
  ensureActiveSession()
    .then(renderVoteView)
    .catch(showFirebaseError);
}

if (document.getElementById("slide-question")) {
  ensureActiveSession()
    .then(renderSlideView)
    .catch(showFirebaseError);
}
