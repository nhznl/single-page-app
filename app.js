const storageKey = "card-tracker-v1";
const historyKey = "card-tracker-history-v2";
const bucketStorageKey = "card-tracker-bucket-counts-v2";
const totalDecksStorageKey = "card-tracker-total-decks-v1";
const sessionDurationStorageKey = "card-tracker-session-duration-v3";
const bankerWagerKey = "card-tracker-banker-wager-v1";
const playerWagerKey = "card-tracker-player-wager-v1";
const mainBetFeeKey = "card-tracker-main-bet-fee-v1";
const totals = JSON.parse(localStorage.getItem(storageKey) || "{\"dragon\":0,\"panda\":0,\"deck\":0}");
const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
const bucketCounts = JSON.parse(localStorage.getItem(bucketStorageKey) || "{}");
let totalDecks = Number(localStorage.getItem(totalDecksStorageKey) || 8);
const storedSessionDuration = Number(localStorage.getItem(sessionDurationStorageKey) ?? 25);
let sessionDuration = Number.isFinite(storedSessionDuration) ? Math.min(120, Math.max(5, Math.round(storedSessionDuration))) : 25;
const sessionCardLimit = 6;
const cardSession = { active: false, cardCount: 0, expiresAt: 0, timerId: null, actions: [], researchId: null };
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

function detailedDragonTotal() {
  return Object.entries(cardRules).reduce((sum, [key, rule]) => sum + (bucketCounts[key] || 0) * rule.detailedTenths, 0) / 10;
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
    refreshMainBets();
    return;
  }
  const secondsRemaining = Math.max(0, Math.ceil((cardSession.expiresAt - Date.now()) / 1000));
  const minutes = String(Math.floor(secondsRemaining / 60)).padStart(2, "0");
  const seconds = String(secondsRemaining % 60).padStart(2, "0");
  status.textContent = `Session active · ${minutes}:${seconds} remaining · ${remaining} card${remaining === 1 ? "" : "s"} available`;
  refreshMainBets();
}

function endCardSession(message = "No active card session.", reason = "manual") {
  if (cardSession.active && cardSession.researchId) {
    BaccaratResearch.close(researchState, cardSession.researchId, reason, captureResearchSnapshot(true));
  }
  cardSession.researchId = null;
  clearInterval(cardSession.timerId);
  cardSession.timerId = null;
  cardSession.active = false;
  cardSession.cardCount = 0;
  cardSession.expiresAt = 0;
  cardSession.actions.length = 0;
  pendingTen = false;
  sessionStatusMessage = message;
  renderSessionControls();
  saveResearch();
  renderResearch();
}

function updateSessionCountdown() {
  if (!cardSession.active) return;
  if (Date.now() >= cardSession.expiresAt) {
    endCardSession("Session ended · ready for the next hand.", "timer");
    return;
  }
  renderSessionControls();
}

function startCardSession() {
  updateSessionCountdown();
  if (cardSession.active && cardSession.cardCount >= sessionCardLimit) return false;
  if (!cardSession.active) {
    cardSession.researchId = BaccaratResearch.begin(researchState, captureResearchSnapshot(true), sessionDuration);
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
  });
  document.querySelector("#total-decks").value = totalDecks;
  document.querySelector("#session-duration").value = sessionDuration;
  renderDeckStats();
  renderSessionControls();
  document.querySelector("#undo").disabled = history.length === 0;
  saveResearch();
  renderResearch();
}

function applyChanges(changes, buckets = [], sessionCards = 0, cardLabel = null) {
  changes.forEach(({ counter, change }) => { totals[counter] += change; });
  buckets.forEach((bucket) => { bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1; });
  const action = { changes, buckets, sessionCards };
  history.push(action);
  if (cardSession.active && sessionCards > 0) {
    const button = buckets.length ? document.querySelector(`[data-bucket="${buckets[0]}"]`) : null;
    const label = cardLabel ?? (button?.dataset.bucket === "panda-faces" ? "FACE" : button ? button.querySelector(".shared-ranks").textContent.replaceAll(" · ", "/") : `+${sessionCards}`);
    cardSession.actions.push({ action, label });
  }
  const pointValues = { ace: 1, two: 2, "panda-three": 3, four: 4, five: 5, six: 6, seven: 7, "common-8": 8, "common-9": 9, "panda-faces": 0 };
  const bucket = buckets[0] || null;
  const button = bucket ? document.querySelector(`[data-bucket="${bucket}"]`) : null;
  const label = cardLabel ?? (bucket === "panda-faces" ? "FACE" : button ? button.querySelector(".shared-ranks").textContent.replaceAll(" · ", "/") : `+${changes.find(item => item.counter === "deck").change}`);
  action.researchEntryId = BaccaratResearch.record(researchState, cardSession.active ? cardSession.researchId : null, {
    kind: bucket ? "card" : "unknown", label, bucket, pointValue: bucket ? pointValues[bucket] : null,
    count: bucket ? 1 : changes.find(item => item.counter === "deck").change,
    source: cardLabel ? "keyboard" : bucket ? "tap" : "quantity-shortcut", rank: bucket === "panda-faces" && !cardLabel ? null : bucket ? label : null
  }, captureResearchSnapshot(false));
  if (cardSession.active && cardSession.cardCount >= sessionCardLimit) {
    endCardSession("6 cards recorded · ready for the next hand.", "six-cards");
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
  lastAction.changes.forEach(({ counter, change }) => { totals[counter] -= change; });
  lastAction.buckets.forEach((bucket) => { bucketCounts[bucket] = Math.max(0, (bucketCounts[bucket] || 0) - 1); });
  if (cardSession.active && cardSession.actions.at(-1)?.action === lastAction) {
    cardSession.actions.pop();
    cardSession.cardCount = Math.max(0, cardSession.cardCount - lastAction.sessionCards);
  }
  BaccaratResearch.undo(researchState, lastAction.researchEntryId, captureResearchSnapshot(!cardSession.active));
  render();
}

document.querySelector("#undo").addEventListener("click", undoLastAction);

const keyboardCards = {
  A: "ace", "2": "two", "3": "panda-three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "common-8", "9": "common-9",
  J: "panda-faces", Q: "panda-faces", K: "panda-faces"
};

// Physical keyboard entry shares the card-tap session and undo behavior.
function handleCardKey(key) {
  key = key.toUpperCase();
  if (key === "ENTER") {
    if (cardSession.active) endCardSession("Session ended early · ready for the next hand.");
    return;
  }
  if (key === "BACKSPACE" || key === "DELETE") {
    updateSessionCountdown();
    if (pendingTen) {
      pendingTen = false;
      renderSessionCards();
      refreshMainBets();
    } else if (cardSession.active && cardSession.actions.at(-1)?.action === history.at(-1)) {
      undoLastAction();
    }
    return;
  }
  if (key === "1") {
    updateSessionCountdown();
    pendingTen = true;
    renderSessionCards();
    refreshMainBets();
    return;
  }
  if (key === "0") {
    updateSessionCountdown();
    if (pendingTen) recordCard("panda-faces", "10");
    return;
  }
  if (keyboardCards[key]) {
    recordCard(keyboardCards[key], key);
  } else if (key.length === 1 && pendingTen) {
    pendingTen = false;
    renderSessionCards();
    refreshMainBets();
  }
}

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat || document.querySelector("#tracker-panel").hidden) return;
  if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
  const key = event.key.toUpperCase();
  if (event.target.closest?.("[role=tab]") && ["ENTER", " "].includes(key)) return;
  if (keyboardCards[key] || ["1", "0", "ENTER", "BACKSPACE", "DELETE"].includes(key)) event.preventDefault();
  handleCardKey(key);
});

document.querySelector("#reset").addEventListener("click", () => {
  if (cardSession.active) endCardSession("Session reset.", "reset");
  const candidate = BaccaratResearch.freeze(researchState, captureResearchSnapshot(true), captureResearchSnapshot(true, true));
  if (!saveResearch(candidate)) return;
  researchState = candidate;
  document.querySelector("#research-shoe").value = "";
  Object.keys(totals).forEach((key) => { totals[key] = 0; });
  Object.keys(bucketCounts).forEach((key) => { bucketCounts[key] = 0; });
  history.length = 0;
  endCardSession("Session reset.");
  render();
});

document.querySelector("#total-decks").addEventListener("input", (event) => {
  const updatedTotal = Number(event.target.value);
  if (!Number.isFinite(updatedTotal) || updatedTotal < 1) {
    refreshMainBets();
    return;
  }
  totalDecks = updatedTotal;
  localStorage.setItem(totalDecksStorageKey, String(totalDecks));
  renderDeckStats();
  refreshMainBets();
  researchState.current.lastSnapshot = captureResearchSnapshot(!cardSession.active);
  saveResearch();
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

let mainBetWorker = null;
let mainBetRequestId = 0;
let mainBetInputKey = null;
let mainBetView = { phase: "unavailable", result: null, reason: "" };

function mainBetTerms() {
  const value = selector => {
    const text = document.querySelector(selector).value;
    return text === "" ? NaN : Number(text);
  };
  return { bankerWager: value("#banker-wager"), playerWager: value("#player-wager"), fee: value("#main-bet-fee") };
}

for (const [selector, key, fallback] of [["#banker-wager", bankerWagerKey, "20"], ["#player-wager", playerWagerKey, "10"], ["#main-bet-fee", mainBetFeeKey, "1"]]) {
  const input = document.querySelector(selector);
  input.value = localStorage.getItem(key) ?? fallback;
  input.addEventListener("input", event => {
    localStorage.setItem(key, event.target.value);
    refreshMainBets();
  });
}

function showMainBetView(phase, result = null, reason = "") {
  if (phase === "ready") {
    const { bankerWager, playerWager, fee } = mainBetTerms();
    result = BaccaratMainBets.afterFees(result, bankerWager, playerWager, fee);
    if (!result) { phase = "unavailable"; reason = "Enter both bet amounts and the collection fee to calculate EV."; }
  }
  const names = { unavailable: "Insufficient data", calculating: "Calculating…", entering: "Hand in progress", pending: "Finish typing 10", error: "Unavailable", "sit-out": "SIT OUT", banker: "BANKER", player: "PLAYER" };
  const state = phase === "ready" ? result.recommendation : phase;
  const choice = names[state];
  const panel = document.querySelector("#main-bets");
  panel.dataset.state = state;
  setOutput("#main-bet-choice", choice);
  for (const side of ["banker", "player"]) {
    setOutput(`#${side}-ev`, result ? (Math.abs(result[side]) <= 1e-12 ? "0.000%" : `${signed(result[side] * 100, 3)}%`) : "—");
    document.querySelector(`#${side}-ev-stat`).classList.toggle("positive-edge", Boolean(result && result[side] > 1e-12));
  }
  const explanation = result ? (state === "sit-out" ? "Neither main bet has a positive return after the fee." : "Positive return after the fee; no guaranteed win.") : reason;
  document.querySelector("#main-bet-reason").textContent = explanation;
  document.querySelector("#main-bet-reason").hidden = !explanation;
  const status = document.querySelector("#session-status");
  status.hidden = !cardSession.active;
  status.dataset.mainBetState = state;
  if (!cardSession.active) {
    status.textContent = result ? `Main bets: ${choice}${state === "sit-out" ? " · No positive edge" : " · Positive edge"}` : `Main bets: ${choice}`;
  }
}

function refreshMainBets() {
  if (cardSession.active || pendingTen) {
    mainBetInputKey = null;
    showMainBetView(cardSession.active ? "entering" : "pending", null, "Finish entering this hand before comparing the next bets.");
    return;
  }
  const input = BaccaratMainBets.remainingShoe({ decks: Number(document.querySelector("#total-decks").value), dealt: totals.deck, counts: bucketCounts });
  if (!input.cards) {
    mainBetInputKey = null;
    showMainBetView("unavailable", null, input.reason || "");
    return;
  }
  const key = JSON.stringify(input.cards);
  if (key === mainBetInputKey) {
    showMainBetView(mainBetView.phase, mainBetView.result, mainBetView.reason);
    return;
  }
  mainBetInputKey = key;
  const id = ++mainBetRequestId;
  mainBetView = { phase: "calculating", result: null, reason: "Calculating next-hand returns from the remaining card values." };
  showMainBetView(mainBetView.phase, null, mainBetView.reason);
  try {
    if (!mainBetWorker) {
      mainBetWorker = new Worker("main-bets-worker.js?v=44");
      mainBetWorker.onmessage = ({ data }) => {
        if (data.id !== mainBetRequestId || mainBetInputKey === null || cardSession.active || pendingTen) return;
        mainBetView = data.error ? { phase: "error", result: null, reason: data.error } : { phase: "ready", result: data.result, reason: "" };
        showMainBetView(mainBetView.phase, mainBetView.result, mainBetView.reason);
      };
      mainBetWorker.onerror = (event) => {
        event.preventDefault();
        mainBetWorker.terminate();
        mainBetWorker = null;
        mainBetView = { phase: "error", result: null, reason: "Calculation unavailable. Reload to try again." };
        if (mainBetInputKey !== null && !cardSession.active && !pendingTen) showMainBetView("error", null, mainBetView.reason);
      };
    }
    mainBetWorker.postMessage({ id, cards: input.cards });
  } catch {
    mainBetView = { phase: "error", result: null, reason: "Calculation unavailable. Reload to try again." };
    showMainBetView("error", null, mainBetView.reason);
  }
}

const researchStorageKey = "card-tracker-research-v1";
let researchWritable = true;
let researchReadBackup = null;

function captureResearchSnapshot(withMainBet = false, empty = false) {
  const savedTotals = empty ? { dragon: 0, panda: 0, deck: 0 } : { ...totals };
  const savedBuckets = empty ? {} : { ...bucketCounts };
  const decksRemaining = Math.max(0, totalDecks - savedTotals.deck / 52);
  const detailed = empty ? 0 : detailedDragonTotal();
  let mainBet = { state: "not-calculated-during-entry" };
  if (withMainBet) {
    const input = BaccaratMainBets.remainingShoe({ decks: totalDecks, dealt: savedTotals.deck, counts: savedBuckets });
    if (input.cards) {
      const { bankerWager, playerWager, fee } = mainBetTerms();
      const calculated = BaccaratMainBets.afterFees(BaccaratMainBets.calculate(input.cards), bankerWager, playerWager, fee);
      mainBet = calculated ? { state: "calculated", ...calculated } : { state: "wager-required", rulesVersion: "standard-ez-v1" };
    } else mainBet = { state: input.code || "unavailable", reason: input.reason || null, rulesVersion: "standard-ez-v1" };
  }
  return {
    recordedAt: new Date().toISOString(), totalDecks, sessionDurationSeconds: sessionDuration, totals: savedTotals, bucketCounts: savedBuckets, decksRemaining,
    runningCounts: { dragon: savedTotals.dragon, dragonDetailed: detailed, panda: savedTotals.panda },
    trueCounts: { dragon: decksRemaining ? savedTotals.dragon / decksRemaining : null, dragonDetailed: decksRemaining && detailed !== null ? detailed / decksRemaining : null, panda: decksRemaining ? savedTotals.panda / decksRemaining : null },
    mainBet
  };
}

function researchFingerprint(snapshot) {
  return JSON.stringify([snapshot.totalDecks, snapshot.totals, Object.entries(snapshot.bucketCounts).filter(([, count]) => count !== 0).sort(([a], [b]) => a.localeCompare(b))]);
}

let researchState;
try {
  const raw = localStorage.getItem(researchStorageKey);
  researchReadBackup = raw;
  researchState = raw ? BaccaratResearch.validate(JSON.parse(raw)) : BaccaratResearch.create(captureResearchSnapshot(true));
  if (raw && researchFingerprint(researchState.current.lastSnapshot) !== researchFingerprint(captureResearchSnapshot(false))) {
    researchState.current.qualityNotes.push(`Tracker state differed from the last saved research snapshot on ${new Date().toISOString()}. Earlier research records were preserved.`);
  }
  BaccaratResearch.recover(researchState, captureResearchSnapshot(true));
} catch {
  researchWritable = false;
  researchState = BaccaratResearch.create(captureResearchSnapshot(true));
  showResearchError("Saved research history could not be read. Export a backup before resetting; existing stored history has been preserved.");
}

function showResearchError(message) {
  const output = document.querySelector("#research-error");
  output.textContent = message;
  output.hidden = !message;
}

function saveResearch(candidate = researchState) {
  try {
    // Save current tracker values before the journal, so a reload can audit coverage.
    localStorage.setItem(storageKey, JSON.stringify(totals));
    localStorage.setItem(historyKey, JSON.stringify(history));
    localStorage.setItem(bucketStorageKey, JSON.stringify(bucketCounts));
    localStorage.setItem(totalDecksStorageKey, String(totalDecks));
    localStorage.setItem(sessionDurationStorageKey, String(sessionDuration));
    if (!researchWritable) return false;
    localStorage.setItem(researchStorageKey, JSON.stringify(candidate));
    showResearchError("");
    return true;
  } catch {
    showResearchError("Research history could not be saved. Export JSON now. Reset is blocked until history can be saved; no frozen lists are discarded.");
    return false;
  }
}

function researchTime(iso) { return new Date(iso).toLocaleString(); }
function appendResearchText(parent, tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}

function renderResearch() {
  if (document.querySelector("#research-panel").hidden) return;
  const picker = document.querySelector("#research-shoe");
  const previous = picker.value;
  const shoes = [researchState.current, ...researchState.frozen.slice().reverse()];
  picker.replaceChildren();
  shoes.forEach((shoe) => {
    const option = document.createElement("option");
    option.value = shoe.id;
    option.textContent = `${shoe.frozenAt ? "Frozen" : "Current"} · ${researchTime(shoe.startedAt)} · ${shoe.sessions.length} session${shoe.sessions.length === 1 ? "" : "s"}`;
    picker.append(option);
  });
  picker.value = shoes.some(shoe => shoe.id === previous) ? previous : researchState.current.id;
  const shoe = shoes.find(item => item.id === picker.value);
  const summary = document.querySelector("#research-summary");
  summary.textContent = `${shoe.frozenAt ? `Frozen ${researchTime(shoe.frozenAt)}` : "Current list · recording"} · ${shoe.sessions.length} session${shoe.sessions.length === 1 ? "" : "s"}`;
  const list = document.querySelector("#research-sessions");
  list.replaceChildren();
  if (!shoe.sessions.length) appendResearchText(list, "li", "No sessions recorded in this list yet.", "research-empty");
  shoe.sessions.forEach((session, index) => {
    const row = appendResearchText(list, "li", "", "research-session");
    const entries = session.entries.filter(entry => !entry.undoneAt);
    const count = entries.reduce((total, entry) => total + entry.count, 0);
    appendResearchText(row, "h3", `Session ${index + 1} · ${count} cards`);
    appendResearchText(row, "p", `${researchTime(session.startedAt)} · ${session.endedAt ? ({ manual: "Ended manually", timer: "Timer ended", "six-cards": "6 cards recorded", reset: "Ended on reset", "reload-interrupted": "Interrupted by reload" }[session.endReason] || session.endReason) : "In progress"}${session.corrections.length ? " · corrected" : ""}`, "research-meta");
    const cards = appendResearchText(row, "div", "", "research-cards");
    session.entries.forEach(entry => {
      const card = appendResearchText(cards, entry.undoneAt ? "s" : "span", entry.label, "research-card");
      card.title = `${entry.source}${entry.undoneAt ? ` · undone ${researchTime(entry.undoneAt)}` : ""}`;
    });
    if (!session.entries.length) appendResearchText(cards, "span", "No retained entries");
    const details = appendResearchText(row, "details", "");
    appendResearchText(details, "summary", "True counts and recommendation");
    const before = session.beforeSession;
    const after = session.latestAfter || session.afterSession;
    function describe(snapshot) {
      const tc = snapshot.trueCounts;
      const value = n => n === null ? "—" : n.toFixed(2);
      const mainBet = snapshot.mainBet.state === "calculated"
        ? { banker: "BANKER", player: "PLAYER", "sit-out": "SIT OUT" }[snapshot.mainBet.recommendation]
        : snapshot.mainBet.state === "not-calculated-during-entry" ? "Hand in progress" : "Unavailable";
      return `D ${value(tc.dragon)} · D detailed ${value(tc.dragonDetailed)} · P ${value(tc.panda)} · recorded main bet ${mainBet}`;
    }
    appendResearchText(details, "p", `Before session: ${describe(before)}`);
    if (after) appendResearchText(details, "p", `After session: ${describe(after)}`);
  });
  if (shoe.outsideSession.length) {
    const row = appendResearchText(list, "li", "", "research-session");
    appendResearchText(row, "h3", "Outside-session changes");
    shoe.outsideSession.forEach(entry => appendResearchText(row, "p", `${researchTime(entry.recordedAt)} · ${entry.label || "Earlier action undone"}${entry.undoneAt ? " · undone" : ""}`));
  }
  shoe.qualityNotes.forEach(note => appendResearchText(list, "li", note, "research-meta"));
}

function selectView(research) {
  document.querySelector("#tracker-panel").hidden = research;
  document.querySelector("#research-panel").hidden = !research;
  document.querySelector("#tracker-tab").setAttribute("aria-selected", String(!research));
  document.querySelector("#tracker-tab").tabIndex = research ? -1 : 0;
  document.querySelector("#research-tab").tabIndex = research ? 0 : -1;
  document.querySelector("#research-tab").setAttribute("aria-selected", String(research));
  renderResearch();
}
document.querySelector("#tracker-tab").addEventListener("click", () => selectView(false));
document.querySelector("#research-tab").addEventListener("click", () => selectView(true));
document.querySelector(".view-tabs").addEventListener("keydown", event => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const research = event.key === "End" || (event.key !== "Home" && document.querySelector("#research-panel").hidden);
  selectView(research);
  document.querySelector(research ? "#research-tab" : "#tracker-tab").focus();
});
document.querySelector("#research-shoe").addEventListener("change", renderResearch);
document.querySelector("#export-research").addEventListener("click", () => {
  const payload = { exportedAt: new Date().toISOString(), ...researchState };
  if (!researchWritable) payload.unreadableStoredBackup = researchReadBackup;
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `card-tracker-research-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
