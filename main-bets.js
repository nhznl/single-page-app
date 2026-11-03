(function (root) {
  "use strict";

  const buckets = { "panda-faces": 0, ace: 1, two: 2, "panda-three": 3, four: 4, five: 5, six: 6, seven: 7, "common-8": 8, "common-9": 9 };

  function remainingShoe({ decks, dealt, counts }) {
    if (!Number.isInteger(decks) || decks < 1) return { reason: "Use a whole number of starting decks." };
    if (!Number.isInteger(dealt) || dealt < 0) return { reason: "Cards dealt must be a nonnegative whole number." };
    const cards = Array.from({ length: 10 }, (_, value) => decks * (value === 0 ? 16 : 4));
    let recorded = 0;
    for (const [bucket, count] of Object.entries(counts)) {
      if (!Number.isInteger(count) || count < 0) return { reason: "Recorded card counts are invalid." };
      if (!count) continue;
      if (!Object.hasOwn(buckets, bucket)) return { reason: "Recorded card values are invalid." };
      recorded += count;
      cards[buckets[bucket]] -= count;
    }
    if (cards.some(count => count < 0)) return { reason: "A rank exceeds the starting shoe. Check inputs or reset at a new shoe." };
    if (recorded !== dealt) return { reason: dealt > recorded ? `${dealt - recorded} dealt card(s) have no rank. Undo quantity shortcuts or reset at a new shoe.` : "Cards dealt do not match recorded ranks." };
    if (cards.reduce((sum, count) => sum + count, 0) < 6) return { reason: "Fewer than six cards remain. Start a new shoe." };
    return { cards };
  }

  // Standard baccarat drawing rules, without replacement. Enumerate point values,
  // weighting each draw by its remaining multiplicity. No count-based approximation.
  // https://wizardofodds.com/games/baccarat/ and /games/ez-baccarat/
  function probabilities(input) {
    if (!Array.isArray(input) || input.length !== 10 || input.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error("Invalid shoe composition");
    const cards = input.slice();
    const total = cards.reduce((sum, count) => sum + count, 0);
    if (!Number.isSafeInteger(total) || total < 6) throw new Error("At least six cards are required");
    const result = { banker: 0, player: 0, tie: 0, dragon: 0, panda: 0 };

    function settle(player, banker, playerCards, bankerCards, weight) {
      if (banker > player) {
        result.banker += weight;
        if (banker === 7 && bankerCards === 3) result.dragon += weight;
      } else if (player > banker) {
        result.player += weight;
        if (player === 8 && playerCards === 3) result.panda += weight;
      } else result.tie += weight;
    }

    function bankerDraw(player, banker, playerCards, remaining, weight) {
      for (let value = 0; value < 10; value++) {
        if (cards[value]) settle(player, (banker + value) % 10, playerCards, 3, weight * cards[value] / remaining);
      }
    }

    function finish(player, banker, weight) {
      if (player >= 8 || banker >= 8) {
        settle(player, banker, 2, 2, weight);
      } else if (player >= 6) {
        if (banker <= 5) bankerDraw(player, banker, 2, total - 4, weight);
        else settle(player, banker, 2, 2, weight);
      } else {
        for (let third = 0; third < 10; third++) {
          if (!cards[third]) continue;
          const nextWeight = weight * cards[third] / (total - 4);
          cards[third]--;
          const nextPlayer = (player + third) % 10;
          const draws = banker <= 2 ||
            (banker === 3 && third !== 8) ||
            (banker === 4 && third >= 2 && third <= 7) ||
            (banker === 5 && third >= 4 && third <= 7) ||
            (banker === 6 && (third === 6 || third === 7));
          if (draws) bankerDraw(nextPlayer, banker, 3, total - 5, nextWeight);
          else settle(nextPlayer, banker, 3, 2, nextWeight);
          cards[third]++;
        }
      }
    }

    function deal(depth, player, banker, weight) {
      if (depth === 4) return finish(player, banker, weight);
      for (let value = 0; value < 10; value++) {
        if (!cards[value]) continue;
        const nextWeight = weight * cards[value] / (total - depth);
        cards[value]--;
        if (depth % 2 === 0) deal(depth + 1, (player + value) % 10, banker, nextWeight);
        else deal(depth + 1, player, (banker + value) % 10, nextWeight);
        cards[value]++;
      }
    }
    deal(0, 0, 0, 1);
    return result;
  }

  function recommendation(banker, player) {
    // Suppress numerical roundoff around an exactly zero return.
    const threshold = 1e-12;
    if (banker <= threshold && player <= threshold) return "sit-out";
    return banker >= player ? "banker" : "player";
  }

  function calculate(cards) {
    const outcomes = probabilities(cards);
    // Standard EZ Baccarat: Banker pushes on Dragon 7; Panda 8 pays Player.
    // Other wins pay 1:1 and ties push. These are main-bet returns before fees.
    const banker = outcomes.banker - outcomes.dragon - outcomes.player;
    const player = outcomes.player - outcomes.banker;
    return { banker, player, recommendation: recommendation(banker, player), outcomes };
  }

  function afterFees(result, bankerWager, playerWager, fee) {
    if (!Number.isFinite(bankerWager) || bankerWager <= 0 || !Number.isFinite(playerWager) || playerWager <= 0 || !Number.isFinite(fee) || fee < 0) return null;
    const banker = result.banker - fee / bankerWager;
    const player = result.player - fee / playerWager;
    return { ...result, banker, player, recommendation: recommendation(banker, player), gross: { banker: result.banker, player: result.player }, wagers: { banker: bankerWager, player: playerWager }, fee, basis: "after-collection", rulesVersion: "standard-ez-v1" };
  }

  const api = { remainingShoe, probabilities, recommendation, calculate, afterFees };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BaccaratMainBets = api;
})(globalThis);
