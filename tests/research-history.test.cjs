const test = require('node:test');
const assert = require('node:assert/strict');
const research = require('../research-history.js');
const snapshot = n => ({ totals: { deck: n, dragon: n, panda: -n }, trueCounts: { dragon: n / 8 }, mainBet: { state: 'calculated', recommendation: 'sit-out' } });
const card = label => ({ kind: 'card', label, count: 1, source: 'tap' });

test('preserves input order, repeated cards, session snapshots and undo audit', () => {
  const state = research.create(snapshot(0));
  const id = research.begin(state, snapshot(0), 25, 'start');
  research.record(state, id, card('6'), snapshot(1), 'one');
  const second = research.record(state, id, card('6'), snapshot(2), 'two');
  research.undo(state, second, snapshot(1), 'undo');
  research.record(state, id, { ...card('J'), source: 'keyboard' }, snapshot(2), 'three');
  research.close(state, id, 'manual', snapshot(2), 'end');
  const session = state.current.sessions[0];
  assert.deepEqual(session.entries.map(entry => entry.label), ['6', '6', 'J']);
  assert.equal(session.entries[1].undoneAt, 'undo');
  assert.deepEqual(session.corrections, [{ entryId: second, at: 'undo' }]);
  assert.equal(session.beforeSession.totals.deck, 0);
  assert.equal(session.afterSession.totals.deck, 2);
  research.undo(state, session.entries[2].id, snapshot(1), 'later-undo');
  assert.equal(session.afterSession.totals.deck, 2, 'original close snapshot remains an audit record');
  assert.equal(session.latestAfter.totals.deck, 1);
  assert.throws(() => research.record(state, id, card('9'), snapshot(2)), /closed/);
});

test('reset freezes a deep copy, closes active sessions and starts an empty list', () => {
  const state = research.create(snapshot(0));
  const id = research.begin(state, snapshot(0), 25);
  const entry = research.record(state, id, card('8'), snapshot(1));
  const original = JSON.stringify(state);
  const next = research.freeze(state, snapshot(1), snapshot(0), 'reset-time');
  assert.equal(JSON.stringify(state), original, 'staging a reset must not mutate the saved list');
  assert.equal(next.frozen[0].sessions[0].endReason, 'reset');
  assert.equal(next.frozen[0].frozenAt, 'reset-time');
  assert.equal(next.current.sessions.length, 0);
  assert.notEqual(next.current.id, next.frozen[0].id);
  const frozen = JSON.stringify(next.frozen[0]);
  const nextSession = research.begin(next, snapshot(0), 25);
  research.record(next, nextSession, card('9'), snapshot(1));
  research.undo(next, entry, snapshot(0));
  research.recover(next, snapshot(1));
  const third = research.freeze(next, snapshot(1), snapshot(0));
  assert.equal(JSON.stringify(next.frozen[0]), frozen);
  assert.equal(JSON.stringify(third.frozen[0]), frozen);
});

test('reload preserves recorded entries and finalizes interrupted sessions only once', () => {
  const state = research.create(snapshot(0));
  const id = research.begin(state, snapshot(0), 25);
  research.record(state, id, card('A'), snapshot(1));
  const restored = research.validate(JSON.parse(JSON.stringify(state)));
  research.recover(restored, snapshot(1), 'reloaded');
  research.recover(restored, snapshot(3), 'second-reload');
  assert.equal(restored.current.sessions[0].endReason, 'reload-interrupted');
  assert.equal(restored.current.sessions[0].endedAt, 'reloaded');
  assert.equal(restored.current.sessions[0].afterSession.totals.deck, 1);
  assert.equal(restored.current.sessions[0].entries[0].label, 'A');
});

test('existing totals and quantity-only inputs never invent card identities or earlier sessions', () => {
  const state = research.create(snapshot(50));
  assert.equal(state.current.sessions.length, 0);
  assert.match(state.current.qualityNotes[0], /earlier sessions are not available/);
  research.record(state, null, { kind: 'unknown', label: '+3', count: 3, pointValue: null, rank: null }, snapshot(53));
  assert.equal(state.current.outsideSession[0].rank, null);
  assert.equal(state.current.outsideSession[0].count, 3);
  assert.throws(() => research.validate({ schemaVersion: 99 }), /Unsupported/);
  const malformed = JSON.parse(JSON.stringify(state));
  delete malformed.current.outsideSession;
  assert.throws(() => research.validate(malformed), /Invalid research list/);
});
