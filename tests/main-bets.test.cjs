const test = require('node:test');
const assert = require('node:assert/strict');
const { remainingShoe, probabilities, recommendation, calculate } = require('../main-bets.js');
const shoe = ranks => Array.from({ length: 10 }, (_, n) => ranks.filter(rank => rank === n).length);
function near(actual, expected, tolerance = 1e-11) { assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`); }

// Independent reference: enumerate six distinct physical cards, then resolve via
// a draw lookup table. Unused fifth/sixth cards integrate out automatically.
function physicalCardReference(ranks) {
  const tallies = { banker: 0, player: 0, tie: 0, dragon: 0, panda: 0 };
  const bankerTable = ["0123456789", "0123456789", "0123456789", "012345679", "234567", "4567", "67", ""];
  const order = [], used = new Set();
  let permutations = 0;
  function resolve() {
    let p = (order[0] + order[2]) % 10, b = (order[1] + order[3]) % 10;
    let pLength = 2, bLength = 2;
    if (p < 8 && b < 8) {
      if (p < 6) {
        const extra = order[4];
        p = (p + extra) % 10;
        pLength++;
        if (bankerTable[b].includes(String(extra))) { b = (b + order[5]) % 10; bLength++; }
      } else if (b < 6) { b = (b + order[4]) % 10; bLength++; }
    }
    if (p > b) { tallies.player++; if (pLength === 3 && p === 8) tallies.panda++; }
    else if (b > p) { tallies.banker++; if (bLength === 3 && b === 7) tallies.dragon++; }
    else tallies.tie++;
    permutations++;
  }
  function visit() {
    if (order.length === 6) return resolve();
    for (let index = 0; index < ranks.length; index++) {
      if (used.has(index)) continue;
      used.add(index); order.push(ranks[index]); visit(); order.pop(); used.delete(index);
    }
  }
  visit();
  return Object.fromEntries(Object.entries(tallies).map(([key, count]) => [key, count / permutations]));
}

test('fresh eight-deck outcomes match published exact combination counts', () => {
  // https://wizardofodds.com/games/ez-baccarat/
  const denominator = 4998398275503360;
  const expected = {
    banker: (2179619555108870 + 112633011329024) / denominator,
    player: 2230518282592250 / denominator,
    tie: 475627426473216 / denominator,
    dragon: 112633011329024 / denominator,
    panda: 172660763262976 / denominator
  };
  const cards = [128,32,32,32,32,32,32,32,32,32];
  const result = calculate(cards);
  for (const key in expected) near(result.outcomes[key], expected[key]);
  near(result.banker, -0.010183007571);
  near(result.player, -0.046894031686);
  assert.equal(result.recommendation, 'sit-out');
  assert.deepEqual(cards, [128,32,32,32,32,32,32,32,32,32]);
});

test('drawing rules match exhaustive physical-card permutations on varied small shoes', () => {
  const cases = [[0,0,0,0,0,0], [9,9,9,9,9,9], [0,0,0,1,6,7,8,9], [1,2,3,4,5,6,7,8]];
  let seed = 731;
  for (let sample = 0; sample < 24; sample++) {
    cases.push(Array.from({length: 8}, () => { seed = (seed * 16807) % 2147483647; return seed % 10; }));
  }
  for (const ranks of cases) {
    const expected = physicalCardReference(ranks), actual = probabilities(shoe(ranks));
    for (const key in expected) near(actual[key], expected[key]);
    near(actual.banker + actual.player + actual.tie, 1);
    const returns = calculate(shoe(ranks));
    near(returns.banker + returns.player, -actual.dragon - actual.panda);
  }
});

test('decision compares with sitting out and does not turn smaller losses into recommendations', () => {
  assert.equal(recommendation(-0.01, -0.04), 'sit-out');
  assert.equal(recommendation(0, 0), 'sit-out');
  assert.equal(recommendation(1e-15, -0.04), 'sit-out');
  assert.equal(recommendation(0.001, -0.04), 'banker');
  assert.equal(recommendation(-0.04, 0.001), 'player');
});

test('composition validation preserves unknown, grouped, invalid and exhausted states', () => {
  const input = { decks: 8, dealt: 0, counts: {} };
  assert.deepEqual(remainingShoe(input).cards, [128,32,32,32,32,32,32,32,32,32]);
  assert.match(remainingShoe({...input, dealt: 2}).reason, /no rank/);
  assert.match(remainingShoe({...input, dealt: 2, counts: {'common-45': 2}}).reason, /grouped/);
  assert.match(remainingShoe({...input, dealt: 33, counts: {ace: 33}}).reason, /exceeds/);
  assert.match(remainingShoe({...input, counts: {ace: -1}}).reason, /invalid/);
  assert.match(remainingShoe({...input, counts: {ace: 0.5}}).reason, /invalid/);
  assert.match(remainingShoe({...input, decks: 1.5}).reason, /whole/);
  assert.match(remainingShoe({...input, dealt: -1}).reason, /nonnegative/);
  assert.match(remainingShoe({...input, counts: {ace: 1}}).reason, /match/);
  const removed = {'panda-faces':128, ace:32, two:32, 'panda-three':32, four:32, five:32, six:32, seven:32, 'common-8':32, 'common-9':27};
  assert.match(remainingShoe({...input, dealt:411, counts:removed}).reason, /Fewer/);
  const mixed = remainingShoe({...input, dealt:3, counts:{ace:1, 'panda-faces':2}});
  assert.equal(mixed.cards[0],126); assert.equal(mixed.cards[1],31);
  assert.throws(() => calculate([1,1]), /Invalid/);
  assert.throws(() => calculate(Array(10).fill(0)), /six/);
});

test('real depleted shoes can favor either main bet and exact ties still sit out', () => {
  for (const [ranks, side] of [
    [[3,9,8,0,2,3,9,1], 'banker'],
    [[2,3,3,1,2,0,4,4], 'player']
  ]) {
    const result = calculate(shoe(ranks)), exact = physicalCardReference(ranks);
    assert.equal(result.recommendation, side);
    near(result.banker, exact.banker - exact.dragon - exact.player);
    near(result.player, exact.player - exact.panda - exact.banker);
    assert(result[side] > 0);
  }
  assert.equal(calculate(shoe([9,9,9,9,9,9])).recommendation, 'sit-out');
});
