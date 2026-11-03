const storageKey = "card-tracker-v1";
const historyKey = "card-tracker-history-v2";
const bucketStorageKey = "card-tracker-bucket-counts-v2";
const totalDecksStorageKey = "card-tracker-total-decks-v1";
const sessionDurationStorageKey = "card-tracker-session-duration-v3";
const totals = JSON.parse(localStorage.getItem(storageKey) || "{\"dragon\":0,\"panda\":0,\"deck\":0}");
const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
const bucketCounts = JSON.parse(localStorage.getItem(bucketStorageKey) || "{\"common-45\":0,\"common-67\":0,\"common-8\":0,\"common-9\":0,\"panda-plus-one\":0,\"panda-three\":0}");
let totalDecks = Number(localStorage.getItem(totalDecksStorageKey) || 8);
const storedSessionDuration = Number(localStorage.getItem(sessionDurationStorageKey) ?? 25);
let sessionDuration = Number.isFinite(storedSessionDuration) ? Math.min(120, Math.max(5, Math.round(storedSessionDuration))) : 25;
const sessionCardLimit = 6;
const cardSession = { active: false, cardCount: 0, expiresAt: 0, timerId: null, actions: [] };
let sessionStatusMessage = "No active card session.";
let pendingTen = false;
const betTriggers = { dragon: 4, dragonDetailed: 10, panda: 11 };

// Detailed Dragon values use tenths to avoid accumulating floating-point error.
// Published System 1: https://wizardofodds.com/games/baccarat/dragon-bet/
const cardRules = {
  "ace": { dragon: 0, panda: 1, detailedTenths: 5 },
  "two": { dragon: 0, panda: 1, detailedTenths: -9 },
  "panda-three": { dragon: 0, panda: -2, detailedTenths: -11 },
  "four": { dragon: -1, panda: -2, detailedTenths: -27 },
  "five": { dragon: -1, panda: -2, detailedTenths: -27 },
  "six": { dragon: -1, panda: -1, detailedTenths: -33 },
  "seven": { dragon: -1, panda: -1, detailedTenths: -36 },
  "common-8": { dragon: 2, panda: -2, detailedTenths: 54 },
  "common-9": { dragon: 2, panda: 4, detailedTenths: 48 },
  "panda-faces": { dragon: 0, panda: 1, detailedTenths: 9 }
};

function hasUnsplitCards() {
  return ["panda-plus-one", "panda-a2", "common-67"].some(key => (bucketCounts[key] || 0) > 0);
}

function detailedDragonTotal() {
  if (hasUnsplitCards()) return null;
  return Object.entries(cardRules).reduce((sum, [key, rule]) => sum + (bucketCounts[key] || 0) * rule.detailedTenths, -(bucketCounts["common-45"] || 0) * 27) / 10;
}

function signed(value, decimals = 0) {
  return `${value > 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

function setOutput(selector, value) {
  const output = document.querySelector(selector);
  output.value = value;
  output.textContent = value;
}

function renderDeckStats() {
  const decksRemaining = Math.max(0, totalDecks - totals.deck / 52);
  const decksRemainingText = decksRemaining.toFixed(2);
  const dTrueCountValue = decksRemaining === 0 ? null : totals.dragon / decksRemaining;
  const detailedTotal = detailedDragonTotal();
  const detailedTrueCount = decksRemaining === 0 || detailedTotal === null ? null : detailedTotal / decksRemaining;
  setOutput("#dragon-detailed-true-count", detailedTrueCount === null ? "—" : detailedTrueCount.toFixed(2));
  document.querySelector("#dragon-detailed-true-count-stat").classList.toggle("trigger-reached", detailedTrueCount !== null && detailedTrueCount >= betTriggers.dragonDetailed);
  const pTrueCountValue = decksRemaining === 0 ? null : totals.panda / decksRemaining;
  const dTrueCount = dTrueCountValue === null ? "—" : dTrueCountValue.toFixed(2);
  const pTrueCount = pTrueCountValue === null ? "—" : pTrueCountValue.toFixed(2);

  setOutput("#decks-remaining", decksRemainingText);
  setOutput("#dragon-true-count", dTrueCount);
  setOutput("#panda-true-count", pTrueCount);
  document.querySelector("#dragon-true-count-stat").classList.toggle("trigger-reached", dTrueCountValue !== null && dTrueCountValue >= betTriggers.dragon);
  document.querySelector("#panda-true-count-stat").classList.toggle("trigger-reached", pTrueCountValue !== null && pTrueCountValue >= betTriggers.panda);
}

function renderSessionCards() {
  const list = document.querySelector("#session-cards");
  const labels = cardSession.active ? cardSession.actions.map(({ label }) => label) : [];
  if (pendingTen) labels.push("1…");
  if (Array.from(list.children, card => card.textContent).join("|") === labels.join("|")) return;
  list.replaceChildren();
  labels.forEach((label) => {
    const card = document.createElement("span");
    card.className = label === "1…" ? "session-card pending-card" : "session-card";
    if (label === "1…") card.title = "Type 0 to record 10; 1 alone does not count.";
    card.textContent = label;
    list.append(card);
  });
}

function renderSessionControls() {
  renderSessionCards();
  const remaining = Math.max(0, sessionCardLimit - cardSession.cardCount);
  document.querySelector("#end-session").disabled = !cardSession.active;
  document.querySelectorAll(".deck .score-button").forEach((button) => {
    button.disabled = cardSession.active && Number(button.dataset.change) > remaining;
  });
  document.querySelectorAll(".card-inputs .score-button").forEach((button) => {
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
  cardSession.actions.length = 0;
  pendingTen = false;
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
  updateSessionCountdown();
  if (cardSession.active && cardSession.cardCount >= sessionCardLimit) return false;
  if (!cardSession.active) {
    cardSession.active = true;
    cardSession.cardCount = 0;
    cardSession.actions.length = 0;
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
  setOutput("#deck-total", totals.deck);
  document.querySelectorAll("[data-bucket]").forEach((button) => {
    const count = bucketCounts[button.dataset.bucket] || 0;
    const rule = cardRules[button.dataset.bucket];
    button.querySelector(".current-impact").textContent = `${rule.dragon === 0 ? "" : `D ${signed(rule.dragon)} · `}P ${signed(rule.panda)}`;
    button.querySelector(".detailed-impact").textContent = `D+ ${signed(rule.detailedTenths / 10, 1)}`;
    button.querySelector(".bucket-count").textContent = String(count);
    button.querySelector(".current-contribution").hidden = rule.dragon === 0;
    button.querySelector(".current-contribution").textContent = `D ${signed(count * rule.dragon)}`;
    button.querySelector(".detailed-contribution").textContent = `D+ ${signed(count * rule.detailedTenths / 10, 1)}`;
  });
  const legacyNote = document.querySelector("#legacy-count");
  legacyNote.hidden = !hasUnsplitCards();
  legacyNote.textContent = "Earlier grouped A/2 or 6/7 cards cannot be separated. Current D/P totals are preserved; detailed D is unavailable until you reset all totals for a new shoe.";
  const legacy45 = bucketCounts["common-45"] || 0;
  const legacy45Note = document.querySelector("#legacy-45-count");
  legacy45Note.hidden = legacy45 === 0;
  legacy45Note.textContent = `Earlier 4/5 combined: ${legacy45}. Included in D/P and detailed D totals; separate 4/5 counts start from this update.`;
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

function applyChanges(changes, buckets = [], sessionCards = 0, cardLabel = null) {
  changes.forEach(({ counter, change }) => { totals[counter] += change; });
  buckets.forEach((bucket) => { bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1; });
  const action = { changes, buckets, sessionCards };
  history.push(action);
  if (cardSession.active && sessionCards > 0) {
    const button = buckets.length ? document.querySelector(`[data-bucket="${buckets[0]}"]`) : null;
    const label = cardLabel ?? (button ? button.querySelector(".shared-ranks").textContent.replaceAll(" · ", "/") : `+${sessionCards}`);
    cardSession.actions.push({ action, label });
  }
  if (cardSession.active && cardSession.cardCount >= sessionCardLimit) {
    endCardSession("6 cards recorded · ready for the next hand.");
  }
  render();
}

function applyPointCard(changes, buckets = [], cardLabel = null) {
  if (!startCardSession()) return false;
  applyChanges([...changes, { counter: "deck", change: 1 }], buckets, 1, cardLabel);
  return true;
}

document.querySelectorAll("[data-counter=deck]").forEach((button) => {
  button.addEventListener("click", () => {
    const change = Number(button.dataset.change);
    if (recordDeckShortcut(change)) {
      pendingTen = false;
      applyChanges([{ counter: "deck", change }], [], cardSession.active ? change : 0);
    }
  });
});

function recordCard(bucket, label = null) {
  pendingTen = false;
  const rule = cardRules[bucket];
  return applyPointCard([{ counter: "dragon", change: rule.dragon }, { counter: "panda", change: rule.panda }], [bucket], label);
}

document.querySelectorAll("[data-card]").forEach((button) => {
  button.addEventListener("click", () => recordCard(button.dataset.bucket));
});

function undoLastAction() {
  pendingTen = false;
  const lastAction = history.pop();
  if (!lastAction) return;
  const changes = lastAction.changes || [{ counter: lastAction.counter, change: lastAction.change }];
  changes.forEach(({ counter, change }) => { totals[counter] -= change; });
  (lastAction.buckets || []).forEach((bucket) => { bucketCounts[bucket] = Math.max(0, (bucketCounts[bucket] || 0) - 1); });
  if (cardSession.active && cardSession.actions.at(-1)?.action === lastAction) {
    cardSession.actions.pop();
    cardSession.cardCount = Math.max(0, cardSession.cardCount - lastAction.sessionCards);
  }
  render();
}

document.querySelector("#undo").addEventListener("click", undoLastAction);

const keyboardCards = {
  A: "ace", "2": "two", "3": "panda-three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "common-8", "9": "common-9",
  J: "panda-faces", Q: "panda-faces", K: "panda-faces"
};

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
  if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const key = event.key.toUpperCase();
  if (key === "BACKSPACE" || key === "DELETE") {
    event.preventDefault();
    updateSessionCountdown();
    if (pendingTen) {
      pendingTen = false;
      renderSessionCards();
    } else if (cardSession.active && cardSession.actions.at(-1)?.action === history.at(-1)) {
      undoLastAction();
    }
    return;
  }
  if (key === "1") {
    event.preventDefault();
    updateSessionCountdown();
    pendingTen = true;
    renderSessionCards();
    return;
  }
  if (key === "0") {
    event.preventDefault();
    updateSessionCountdown();
    if (pendingTen) recordCard("panda-faces", "10");
    return;
  }
  if (keyboardCards[key]) {
    event.preventDefault();
    recordCard(keyboardCards[key], key);
  } else if (key.length === 1 && pendingTen) {
    pendingTen = false;
    renderSessionCards();
  }
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
  sessionDuration = Math.min(120, Math.max(5, Math.round(Number(event.target.value) || 25)));
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
