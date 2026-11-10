(function (root) {
  "use strict";
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  const totalCards = 416;
  function shuffleShoe(randomIndex) {
    const shoe = Array.from({ length: 8 }, () => suits.flatMap(suit => ranks.map(rank => ({ rank, suit })))).flat();
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    return shoe;
  }
  function value(rank) { return rank === "A" ? 1 : ["10", "J", "Q", "K"].includes(rank) ? 0 : Number(rank); }
  function total(cards) { return cards.reduce((sum, card) => sum + value(card.rank), 0) % 10; }
  function bankerDraws(bankerTotal, playerThird) {
    if (playerThird === null) return bankerTotal <= 5;
    return bankerTotal <= 2 || (bankerTotal === 3 && playerThird !== 8) ||
      (bankerTotal === 4 && playerThird >= 2 && playerThird <= 7) ||
      (bankerTotal === 5 && playerThird >= 4 && playerThird <= 7) ||
      (bankerTotal === 6 && (playerThird === 6 || playerThird === 7));
  }
  function dealHand(shoe, shown) {
    if (shoe.length - shown < 6) return null;
    let cursor = shown;
    const player = [shoe[cursor++]];
    const banker = [shoe[cursor++]];
    player.push(shoe[cursor++]);
    banker.push(shoe[cursor++]);
    const playerTotal = total(player), bankerTotal = total(banker);
    if (playerTotal < 8 && bankerTotal < 8) {
      const third = playerTotal <= 5 ? shoe[cursor++] : null;
      if (third) player.push(third);
      if (bankerDraws(bankerTotal, third ? value(third.rank) : null)) banker.push(shoe[cursor++]);
    }
    return { player, banker, shown: cursor };
  }
  function impact(rank) {
    return ["4", "5", "6", "7"].includes(rank) ? -1 : ["8", "9"].includes(rank) ? 2 : 0;
  }
  function counts(shoe, shown) {
    const running = shoe.slice(0, shown).reduce((sum, card) => sum + impact(card.rank), 0);
    const remaining = shoe.length - shown;
    return { shown, remaining, running, trueCount: remaining ? running * 52 / remaining : null };
  }
  function valid(state) {
    if (!state || !Array.isArray(state.shoe) || state.shoe.length !== totalCards || !Number.isInteger(state.shown) || state.shown < 0 || state.shown > totalCards) return false;
    const frequency = new Map();
    for (const card of state.shoe) {
      if (!card || !ranks.includes(card.rank) || !suits.includes(card.suit)) return false;
      const key = card.rank + card.suit;
      frequency.set(key, (frequency.get(key) || 0) + 1);
    }
    if (frequency.size !== 52 || [...frequency.values()].some(count => count !== 8)) return false;
    if (state.shown === 0) return state.lastHand === null;
    return state.lastHand && Array.isArray(state.lastHand.player) && Array.isArray(state.lastHand.banker) && state.lastHand.shown === state.shown;
  }
  const api = { shuffleShoe, impact, counts, valid, value, total, bankerDraws, dealHand };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  const storageKey = "card-tracker-practice-shoe-v1";
  const byId = id => document.getElementById(id);
  function randomIndex(limit) {
    const max = 0x100000000, cutoff = max - max % limit, values = new Uint32Array(1);
    do { root.crypto.getRandomValues(values); } while (values[0] >= cutoff);
    return values[0] % limit;
  }
  function newShoe() { return { shoe: shuffleShoe(randomIndex), shown: 0, lastHand: null }; }
  let state;
  try { const saved = JSON.parse(localStorage.getItem(storageKey)); state = valid(saved) ? saved : newShoe(); }
  catch { state = newShoe(); }
  let revealed = false;
  const signed = number => `${number > 0 ? "+" : ""}${number}`;
  function renderCards(id, cards) {
    const row = byId(id);
    row.replaceChildren();
    if (!cards) { row.textContent = "Ready to deal"; return; }
    for (const card of cards) {
      const item = document.createElement("span");
      item.className = `practice-card${["♥", "♦"].includes(card.suit) ? " red-suit" : ""}`;
      item.textContent = `${card.rank}${card.suit}`;
      item.setAttribute("aria-label", `${card.rank} of ${{"♠":"spades", "♥":"hearts", "♦":"diamonds", "♣":"clubs"}[card.suit]}`);
      row.append(item);
    }
  }
  function render() {
    renderCards("practice-player", state.lastHand?.player);
    renderCards("practice-banker", state.lastHand?.banker);
    const complete = state.shoe.length - state.shown < 6;
    byId("practice-next").disabled = complete;
    byId("practice-next").textContent = complete ? "Shoe complete" : "Next hand";
    byId("practice-details").hidden = !revealed;
    byId("practice-reveal").textContent = revealed ? "Hide counts" : "Reveal counts";
    byId("practice-reveal").setAttribute("aria-expanded", String(revealed));
    if (revealed) {
      const score = counts(state.shoe, state.shown);
      byId("practice-shown").textContent = `${score.shown} / ${totalCards}`;
      byId("practice-running").textContent = signed(score.running);
      byId("practice-true").textContent = score.trueCount === null ? "—" : signed(Number(score.trueCount.toFixed(2)));
      byId("practice-indicator").textContent = complete ? "Shoe complete" : score.trueCount >= 4 ? "Dragon ≥ +4" : "Below +4";
      byId("practice-cards").textContent = state.shoe.slice(0, state.shown).map(card => `${card.rank}${card.suit}`).join(" · ") || "None yet";
    }
  }
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); byId("practice-save-error").hidden = true; }
    catch { byId("practice-save-error").hidden = false; }
  }
  byId("practice-next").addEventListener("click", () => {
    const hand = dealHand(state.shoe, state.shown);
    if (hand) { state.lastHand = hand; state.shown = hand.shown; save(); render(); }
  });
  byId("practice-reset").addEventListener("click", () => { state = newShoe(); revealed = false; save(); render(); });
  byId("practice-reveal").addEventListener("click", () => { revealed = !revealed; render(); });
  render();
})(globalThis);
