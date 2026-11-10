const test = require('node:test');
const assert = require('node:assert/strict');
const { shuffleDeck, impact, counts, valid } = require('../practice.js');

test('a shuffled deck contains exactly one of each rank and suit', () => {
  const deck = shuffleDeck(limit => Math.floor(limit / 2));
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => `${card.rank}${card.suit}`)).size, 52);
  assert.equal(valid({ deck, shown: 0 }), true);
  assert.equal(valid({ deck, shown: 52 }), true);
  assert.equal(valid({ deck, shown: 53 }), false);
  assert.equal(valid({ deck: Array(52).fill(deck[0]), shown: 1 }), false);
});

test('Dragon count changes only for 4 through 9 and uses remaining decks', () => {
  assert.deepEqual(['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(impact), [0,0,0,-1,-1,-1,-1,2,2,0,0,0,0]);
  const deck = shuffleDeck(limit => limit - 1);
  const firstNine = counts(deck, 9);
  assert.equal(firstNine.running, 0);
  assert.equal(firstNine.remaining, 43);
  const afterEight = counts([{rank:'8'}, ...Array(51).fill({rank:'A'})], 1);
  assert.equal(afterEight.running, 2);
  assert.equal(afterEight.trueCount, 104 / 51);
  assert.equal(counts(deck, 52).trueCount, null);
  assert.equal(counts(deck, 52).running, 0);
});
