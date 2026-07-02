const POLLPULSE_VERSION = "11";
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
  const adminAction = document.getElementById("session-admin-action");
  const existingSessionField = document.getElementById("existing-session-field");
  const existingSessionSelect = document.getElementById("existing-session-select");
  const deleteSessionField = document.getElementById("delete-session-field");
  const deleteSessionSelect = document.getElementById("delete-session-select");
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
  const deleteButton = document.getElementById("delete-session");
  const addButton = document.getElementById("add-question");
  const cancelEditButton = document.getElementById("cancel-edit");

  if (!adminAction || !sessionInput || !questionList) {
    return;
  }

  let state = null;
  let sessions = [];
  let selectedSessionId = localStorage.getItem(CURRENT_SESSION_KEY) || "";
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

  function renderActiveSessionSummary() {
    if (!state) {
      activeSessionSummary.textContent = "Create or select a session to start.";
      updateSessionLinks(selectedSessionId || DEFAULT_SESSION_ID);
      return;
    }

    const questionCount = state.questions.length;
    const createdDate = state.createdAt ? new Date(state.createdAt).toLocaleString() : "Unknown";
    activeSessionSummary.textContent = `${state.sessionName} · ${questionCount} question${questionCount === 1 ? "" : "s"} · created ${createdDate}`;
    updateSessionLinks(state.sessionId);
  }

  function drawQuestions() {
    if (!state) {
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

    renderActiveSessionSummary();
  }

  function renderSessionOptions() {
    if (!sessions.length) {
      existingSessionSelect.innerHTML = `<option value="">No saved sessions yet</option>`;
      existingSessionSelect.disabled = true;
      if (deleteSessionSelect) {
        deleteSessionSelect.innerHTML = `<option value="">No saved sessions yet</option>`;
        deleteSessionSelect.disabled = true;
      }
      return;
    }

    existingSessionSelect.disabled = false;
    if (deleteSessionSelect) {
      deleteSessionSelect.disabled = false;
    }

    const optionsHtml = sessions.map((session) => {
      const questionCount = session.questions.length;
      return `
        <option value="${escapeHtml(session.sessionId)}">
          ${escapeHtml(session.sessionName)} (${questionCount} question${questionCount === 1 ? "" : "s"})
        </option>
      `;
    }).join("");

    existingSessionSelect.innerHTML = optionsHtml;
    if (deleteSessionSelect) {
      deleteSessionSelect.innerHTML = optionsHtml;
    }

    if (!sessions.some((session) => session.sessionId === selectedSessionId)) {
      selectedSessionId = sessions[0].sessionId;
    }

    existingSessionSelect.value = selectedSessionId;
    if (deleteSessionSelect) {
      deleteSessionSelect.value = selectedSessionId;
    }
  }

  function detachSelectedSessionListener() {
    if (selectedSessionListenerRef) {
      selectedSessionListenerRef.off();
      selectedSessionListenerRef = null;
    }
  }

  function attachSelectedSession(sessionId) {
    detachSelectedSessionListener();
    selectedSessionId = cleanSessionId(sessionId);

    if (!selectedSessionId) {
      state = null;
      sessionInput.value = "";
      setQuestionPanelsEnabled(false);
      drawQuestions();
      return;
    }

    setActiveSession(selectedSessionId);
    selectedSessionListenerRef = sessionRefFor(selectedSessionId);
    selectedSessionListenerRef.on("value", (snapshot) => {
      state = snapshot.exists() ? normalizeState(snapshot.val(), selectedSessionId) : null;

      if (state && document.activeElement !== sessionInput) {
        sessionInput.value = state.sessionName || "";
      }

      setQuestionPanelsEnabled(Boolean(state) && adminAction.value !== "delete");
      drawQuestions();
    });
  }

  function applyAdminMode() {
    const mode = adminAction.value;
    const hasSessions = sessions.length > 0;

    existingSessionField.hidden = mode !== "edit";
    if (deleteSessionField) {
      deleteSessionField.hidden = mode !== "delete";
    }
    deleteButton.hidden = mode !== "delete";
    saveButton.hidden = mode === "delete";
    saveButton.textContent = mode === "create" ? "Create Session" : "Save Session";
    sessionInput.disabled = mode === "delete";

    if (mode === "create") {
      detachSelectedSessionListener();
      state = null;
      sessionInput.value = "";
      sessionInput.disabled = false;
      setQuestionPanelsEnabled(false);
      activeSessionSummary.textContent = "Name your new session, then create it. New sessions start with no questions.";
      questionList.innerHTML = "";
      updateSessionLinks(activeSessionId);
      return;
    }

    if (!hasSessions) {
      state = null;
      sessionInput.value = "";
      setQuestionPanelsEnabled(false);
      activeSessionSummary.textContent = "No saved sessions yet. Choose create to start one.";
      questionList.innerHTML = "";
      return;
    }

    attachSelectedSession(existingSessionSelect.value || selectedSessionId || sessions[0].sessionId);
  }

  sessionsRef.on("value", (snapshot) => {
    sessions = normalizeSessionsForList(snapshot.val());
    renderSessionOptions();
    applyAdminMode();
  });

  adminAction.addEventListener("change", applyAdminMode);

  existingSessionSelect.addEventListener("change", () => {
    attachSelectedSession(existingSessionSelect.value);
  });

  if (deleteSessionSelect) {
    deleteSessionSelect.addEventListener("change", () => {
      selectedSessionId = deleteSessionSelect.value;
      const session = sessions.find((item) => item.sessionId === selectedSessionId);
      sessionInput.value = session ? session.sessionName : "";
      activeSessionSummary.textContent = session
        ? `Ready to delete "${session.sessionName}" and its ${session.questions.length} question${session.questions.length === 1 ? "" : "s"}.`
        : "Choose a session to delete.";
    });
  }

  saveButton.addEventListener("click", async () => {
    const mode = adminAction.value;
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
      adminAction.value = "edit";
      existingSessionSelect.value = newSessionId;
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

  deleteButton.addEventListener("click", async () => {
    const sessionToDelete = deleteSessionSelect ? deleteSessionSelect.value : existingSessionSelect.value;
    const session = sessions.find((item) => item.sessionId === sessionToDelete);

    if (!sessionToDelete || !session) {
      setStatus("session-save-status", "Choose a session to delete.");
      return;
    }

    if (!window.confirm(`Delete "${session.sessionName}" and all of its questions? This cannot be undone.`)) {
      return;
    }

    deleteButton.disabled = true;
    await deleteSession(sessionToDelete);

    if (activeSessionId === sessionToDelete) {
      localStorage.removeItem(CURRENT_SESSION_KEY);
      activeSessionId = DEFAULT_SESSION_ID;
      sessionRef = sessionRefFor(activeSessionId);
    }

    state = null;
    resetQuestionForm();
    setQuestionPanelsEnabled(false);
    setStatus("session-save-status", `Deleted "${session.sessionName}".`);
    deleteButton.disabled = false;
  });

  addButton.addEventListener("click", async () => {
    if (!state) {
      setStatus("question-save-status", "Create or select a session first.");
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
    if (!button || !state) return;

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

  adminAction.value = "create";
  setQuestionPanelsEnabled(false);
  updateSessionLinks(activeSessionId);
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

if (document.getElementById("session-admin-action")) {
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
