(function (root) {
  "use strict";
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  function shuffleDeck(randomIndex) {
    const deck = suits.flatMap(suit => ranks.map(rank => ({ rank, suit })));
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
  function impact(rank) {
    return ["4", "5", "6", "7"].includes(rank) ? -1 : ["8", "9"].includes(rank) ? 2 : 0;
  }
  function counts(deck, shown) {
    const running = deck.slice(0, shown).reduce((sum, card) => sum + impact(card.rank), 0);
    const remaining = deck.length - shown;
    return { shown, remaining, running, trueCount: remaining ? running * 52 / remaining : null };
  }
  function valid(state) {
    if (!state || !Array.isArray(state.deck) || state.deck.length !== 52 || !Number.isInteger(state.shown) || state.shown < 0 || state.shown > 52) return false;
    const cards = new Set(state.deck.map(card => `${card.rank}${card.suit}`));
    return cards.size === 52 && state.deck.every(card => ranks.includes(card.rank) && suits.includes(card.suit));
  }
  const api = { shuffleDeck, impact, counts, valid };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  const storageKey = "card-tracker-practice-v1";
  const byId = id => document.getElementById(id);
  function randomIndex(limit) {
    const max = 0x100000000, cutoff = max - max % limit, values = new Uint32Array(1);
    do { root.crypto.getRandomValues(values); } while (values[0] >= cutoff);
    return values[0] % limit;
  }
  function newDeck() { return { deck: shuffleDeck(randomIndex), shown: 0 }; }
  let state;
  try { const saved = JSON.parse(localStorage.getItem(storageKey)); state = valid(saved) ? saved : newDeck(); }
  catch { state = newDeck(); }
  let revealed = false;
  const signed = value => `${value > 0 ? "+" : ""}${value}`;
  function render() {
    const card = state.shown ? state.deck[state.shown - 1] : null;
    const display = byId("practice-card");
    display.classList.toggle("red-suit", Boolean(card && ["♥", "♦"].includes(card.suit)));
    byId("practice-rank").textContent = card ? card.rank : "?";
    byId("practice-suit").textContent = card ? card.suit : "";
    display.setAttribute("aria-label", card ? `${card.rank} of ${{"♠":"spades", "♥":"hearts", "♦":"diamonds", "♣":"clubs"}[card.suit]}` : "No card dealt");
    byId("practice-next").disabled = state.shown === 52;
    byId("practice-next").textContent = state.shown === 52 ? "Deck complete" : "Next card";
    byId("practice-details").hidden = !revealed;
    byId("practice-reveal").textContent = revealed ? "Hide counts" : "Reveal counts";
    byId("practice-reveal").setAttribute("aria-expanded", String(revealed));
    if (revealed) {
      const score = counts(state.deck, state.shown);
      byId("practice-shown").textContent = `${score.shown} / 52`;
      byId("practice-running").textContent = signed(score.running);
      byId("practice-true").textContent = score.trueCount === null ? "—" : signed(Number(score.trueCount.toFixed(2)));
      byId("practice-indicator").textContent = score.remaining === 0 ? "Deck complete" : score.trueCount >= 4 ? "Dragon ≥ +4" : "Below +4";
      byId("practice-cards").textContent = state.deck.slice(0, state.shown).map(item => `${item.rank}${item.suit}`).join(" · ") || "None yet";
    }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); byId("practice-save-error").hidden = true; }
    catch { byId("practice-save-error").hidden = false; }
  }
  byId("practice-next").addEventListener("click", () => { if (state.shown < 52) { state.shown++; save(); render(); } });
  byId("practice-reset").addEventListener("click", () => { state = newDeck(); revealed = false; save(); render(); });
  byId("practice-reveal").addEventListener("click", () => { revealed = !revealed; render(); });
  render();
})(globalThis);
