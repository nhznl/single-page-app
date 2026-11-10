const test = require('node:test');
const assert = require('node:assert/strict');
const { shuffleShoe, impact, counts, valid, bankerDraws, dealHand, total } = require('../practice.js');
const makeCards = ranks => ranks.map(rank => ({rank: String(rank), suit: '♠'}));

test('eight-deck shoe has exactly eight copies of each rank and suit', () => {
  const shoe = shuffleShoe(limit => Math.floor(limit / 2));
  const frequency = new Map();
  for (const card of shoe) frequency.set(card.rank + card.suit, (frequency.get(card.rank + card.suit) || 0) + 1);
  assert.equal(shoe.length, 416);
  assert.equal(frequency.size, 52);
  assert([...frequency.values()].every(count => count === 8));
  assert(valid({shoe, shown: 0, lastHand: null}));
  assert(!valid({shoe, shown: 417, lastHand: null}));
  assert(!valid({shoe: Array(416).fill(shoe[0]), shown: 0, lastHand: null}));
});

test('banker third-card decisions match all baccarat drawing rules', () => {
  const expected = ['0123456789','0123456789','0123456789','012345679','234567','4567','67',''];
  for (let banker = 0; banker <= 7; banker++) {
    for (let third = 0; third <= 9; third++) assert.equal(bankerDraws(banker, third), expected[banker].includes(String(third)), `banker ${banker}, player third ${third}`);
    assert.equal(bankerDraws(banker, null), banker <= 5);
  }
});

test('deals naturals and all four-, five- and six-card hand patterns', () => {
  // Deal order: player, banker, player, banker, player third if needed, banker third if needed.
  const scenarios = [
    { cards: ['4','2','4','3','A','A'], player: ['4','4'], banker: ['2','3'], count: 4 }, // player natural
    { cards: ['2','4','3','5','A','A'], player: ['2','3'], banker: ['4','5'], count: 4 }, // banker natural
    { cards: ['3','3','3','3','A','A'], player: ['3','3'], banker: ['3','3'], count: 4 }, // both stand
    { cards: ['3','2','3','2','8','A'], player: ['3','3'], banker: ['2','2','8'], count: 5 }, // banker draws
    { cards: ['2','3','2','3','8','A'], player: ['2','2','8'], banker: ['3','3'], count: 5 }, // banker stands on 6 vs 8
    { cards: ['2','3','2','3','6','A'], player: ['2','2','6'], banker: ['3','3','A'], count: 6 }
  ];
  for (const item of scenarios) {
    const result = dealHand(makeCards(item.cards), 0);
    assert.deepEqual(result.player.map(c => c.rank), item.player);
    assert.deepEqual(result.banker.map(c => c.rank), item.banker);
    assert.equal(result.shown, item.count);
  }
  assert.equal(dealHand(makeCards(['A','2','3','4','5']), 0), null);
  assert.equal(total(makeCards(['9','9','9'])), 7);
});

test('Dragon count and true count include every dealt card', () => {
  assert.deepEqual(['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(impact), [0,0,0,-1,-1,-1,-1,2,2,0,0,0,0]);
  const shoe = [{rank:'8'}, {rank:'6'}, ...Array(414).fill({rank:'A'})];
  assert.equal(counts(shoe, 2).running, 1);
  assert.equal(counts(shoe, 2).trueCount, 52 / 414);
  assert.equal(counts(shoe, 416).trueCount, null);
});
