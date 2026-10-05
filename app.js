const storageKey = "card-tracker-v1";
const historyKey = "card-tracker-history-v2";
const bucketStorageKey = "card-tracker-bucket-counts-v2";
const totalDecksStorageKey = "card-tracker-total-decks-v1";
const sessionDurationStorageKey = "card-tracker-session-duration-v2";
const totals = JSON.parse(localStorage.getItem(storageKey) || "{\"dragon\":0,\"panda\":0,\"deck\":0}");
const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
const bucketCounts = JSON.parse(localStorage.getItem(bucketStorageKey) || "{\"common-45\":0,\"common-67\":0,\"common-8\":0,\"common-9\":0,\"panda-plus-one\":0,\"panda-three\":0}");
let totalDecks = Number(localStorage.getItem(totalDecksStorageKey) || 8);
const storedSessionDuration = Number(localStorage.getItem(sessionDurationStorageKey));
let sessionDuration = Number.isFinite(storedSessionDuration) ? Math.min(120, Math.max(5, Math.round(storedSessionDuration))) : 20;
const sessionCardLimit = 6;
const cardSession = { active: false, cardCount: 0, expiresAt: 0, timerId: null };
let sessionStatusMessage = "No active card session.";
const betTriggers = { dragon: 4, panda: 11 };

const commonRules = {
  "common-45": [{ counter: "dragon", change: -1 }, { counter: "panda", change: -2 }],
  "common-67": [{ counter: "dragon", change: -1 }, { counter: "panda", change: -1 }],
  "common-8": [{ counter: "dragon", change: 2 }, { counter: "panda", change: -2 }],
  "common-9": [{ counter: "dragon", change: 2 }, { counter: "panda", change: 4 }]
};

function setOutput(selector, value) {
  const output = document.querySelector(selector);
  output.value = value;
  output.textContent = value;
}

function renderDeckStats() {
  const decksRemaining = Math.max(0, totalDecks - totals.deck / 52);
  const decksRemainingText = decksRemaining.toFixed(2);
  const dTrueCountValue = decksRemaining === 0 ? null : totals.dragon / decksRemaining;
  const pTrueCountValue = decksRemaining === 0 ? null : totals.panda / decksRemaining;
  const dTrueCount = dTrueCountValue === null ? "—" : dTrueCountValue.toFixed(2);
  const pTrueCount = pTrueCountValue === null ? "—" : pTrueCountValue.toFixed(2);

  setOutput("#decks-remaining", decksRemainingText);
  setOutput("#dragon-true-count", dTrueCount);
  setOutput("#panda-true-count", pTrueCount);
  document.querySelector("#dragon-true-count-stat").classList.toggle("trigger-reached", dTrueCountValue !== null && dTrueCountValue >= betTriggers.dragon);
  document.querySelector("#panda-true-count-stat").classList.toggle("trigger-reached", pTrueCountValue !== null && pTrueCountValue >= betTriggers.panda);
}

function renderSessionControls() {
  const remaining = Math.max(0, sessionCardLimit - cardSession.cardCount);
  document.querySelector("#end-session").disabled = !cardSession.active;
  document.querySelectorAll(".deck .score-button").forEach((button) => {
    button.disabled = cardSession.active && Number(button.dataset.change) > remaining;
  });
  document.querySelectorAll(".common-controls .score-button, .panda .score-button").forEach((button) => {
    button.disabled = cardSession.active && remaining === 0;
  });

  const status = document.querySelector("#session-status");
  if (!status) return;
  if (!cardSession.active) {
    status.textContent = sessionStatusMessage;
    return;
  }
  const secondsRemaining = Math.max(0, Math.ceil((cardSession.expiresAt - Date.now()) / 1000));
  const minutes = String(Math.floor(secondsRemaining / 60)).padStart(2, "0");
  const seconds = String(secondsRemaining % 60).padStart(2, "0");
  status.textContent = `Session active · ${minutes}:${seconds} remaining · ${remaining} card${remaining === 1 ? "" : "s"} available`;
}

function endCardSession(message = "No active card session.") {
  clearInterval(cardSession.timerId);
  cardSession.timerId = null;
  cardSession.active = false;
  cardSession.cardCount = 0;
  cardSession.expiresAt = 0;
  sessionStatusMessage = message;
  renderSessionControls();
}

function updateSessionCountdown() {
  if (!cardSession.active) return;
  if (Date.now() >= cardSession.expiresAt) {
    endCardSession("Session ended · ready for the next hand.");
    return;
  }
  renderSessionControls();
}

function startCardSession() {
  if (cardSession.active && cardSession.cardCount >= sessionCardLimit) return false;
  if (!cardSession.active) {
    cardSession.active = true;
    cardSession.cardCount = 0;
    cardSession.expiresAt = Date.now() + sessionDuration * 1000;
    sessionStatusMessage = "";
    clearInterval(cardSession.timerId);
    cardSession.timerId = setInterval(updateSessionCountdown, 1000);
  }
  cardSession.cardCount += 1;
  renderSessionControls();
  return true;
}

function recordDeckShortcut(change) {
  if (!cardSession.active) return true;
  const remaining = sessionCardLimit - cardSession.cardCount;
  if (change > remaining) return false;
  cardSession.cardCount += change;
  renderSessionControls();
  return true;
}

function render() {
  for (const [counter, total] of Object.entries(totals)) {
    document.querySelector(`#${counter}-total`).value = total;
    document.querySelector(`#${counter}-total`).textContent = total;
  }
  document.querySelectorAll("[data-bucket]").forEach((button) => {
    button.querySelector(".bucket-count").textContent = bucketCounts[button.dataset.bucket] || 0;
  });
  localStorage.setItem(storageKey, JSON.stringify(totals));
  localStorage.setItem(historyKey, JSON.stringify(history));
  localStorage.setItem(bucketStorageKey, JSON.stringify(bucketCounts));
  localStorage.setItem(totalDecksStorageKey, String(totalDecks));
  localStorage.setItem(sessionDurationStorageKey, String(sessionDuration));
  document.querySelector("#total-decks").value = totalDecks;
  document.querySelector("#session-duration").value = sessionDuration;
  renderDeckStats();
  renderSessionControls();
  document.querySelector("#undo").disabled = history.length === 0;
}

function applyChanges(changes, buckets = [], sessionCards = 0) {
  changes.forEach(({ counter, change }) => { totals[counter] += change; });
  buckets.forEach((bucket) => { bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1; });
  history.push({ changes, buckets, sessionCards });
  render();
}

function applyPointCard(changes, buckets = []) {
  if (!startCardSession()) return false;
  applyChanges([...changes, { counter: "deck", change: 1 }], buckets, 1);
  return true;
}

document.querySelectorAll("[data-counter]").forEach((button) => {
  button.addEventListener("click", () => {
    const change = Number(button.dataset.change);
    const buckets = button.dataset.bucket ? [button.dataset.bucket] : [];
    if (button.dataset.counter === "deck") {
      if (recordDeckShortcut(change)) applyChanges([{ counter: "deck", change }], buckets, cardSession.active ? change : 0);
    }
    else applyPointCard([{ counter: button.dataset.counter, change }], buckets);
  });
});

document.querySelectorAll("[data-rule]").forEach((button) => {
  button.addEventListener("click", () => {
    applyPointCard(commonRules[button.dataset.rule], [button.dataset.bucket]);
  });
});

document.querySelector("#undo").addEventListener("click", () => {
  const lastAction = history.pop();
  if (!lastAction) return;
  const changes = lastAction.changes || [{ counter: lastAction.counter, change: lastAction.change }];
  changes.forEach(({ counter, change }) => { totals[counter] -= change; });
  (lastAction.buckets || []).forEach((bucket) => { bucketCounts[bucket] = Math.max(0, (bucketCounts[bucket] || 0) - 1); });
  if (cardSession.active && lastAction.sessionCards) {
    cardSession.cardCount = Math.max(0, cardSession.cardCount - lastAction.sessionCards);
  }
  render();
});

document.querySelector("#reset").addEventListener("click", () => {
  Object.keys(totals).forEach((key) => { totals[key] = 0; });
  Object.keys(bucketCounts).forEach((key) => { bucketCounts[key] = 0; });
  history.length = 0;
  endCardSession("Session reset.");
  render();
});

document.querySelector("#total-decks").addEventListener("input", (event) => {
  const updatedTotal = Number(event.target.value);
  if (!Number.isFinite(updatedTotal) || updatedTotal < 1) return;
  totalDecks = updatedTotal;
  localStorage.setItem(totalDecksStorageKey, String(totalDecks));
  renderDeckStats();
});

document.querySelector("#session-duration").addEventListener("change", (event) => {
  sessionDuration = Math.min(120, Math.max(5, Math.round(Number(event.target.value) || 20)));
  event.target.value = sessionDuration;
  if (cardSession.active) cardSession.expiresAt = Date.now() + sessionDuration * 1000;
  localStorage.setItem(sessionDurationStorageKey, String(sessionDuration));
  renderSessionControls();
});

document.querySelector("#end-session").addEventListener("click", () => {
  endCardSession("Session ended early · ready for the next hand.");
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
