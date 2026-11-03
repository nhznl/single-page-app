(function (root) {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => root.crypto.randomUUID();
  const now = () => new Date().toISOString();
  function newShoe(baseline, time = now()) {
    return { id: uid(), startedAt: time, frozenAt: null, baseline: copy(baseline), lastSnapshot: copy(baseline), sessions: [], outsideSession: [], qualityNotes: baseline.totals.deck > 0 ? ["Recording began with existing totals; earlier sessions are not available."] : [] };
  }
  function create(baseline) { return { schemaVersion: 1, appVersion: "44", current: newShoe(baseline), frozen: [] }; }
  function validate(state) {
    if (state?.schemaVersion !== 1 || !state.current || !Array.isArray(state.current.sessions) || !Array.isArray(state.frozen)) throw Error("Unsupported research history");
    for (const shoe of [state.current, ...state.frozen]) {
      if (!shoe.id || !shoe.baseline || !shoe.lastSnapshot || !Array.isArray(shoe.sessions) || !Array.isArray(shoe.outsideSession) || !Array.isArray(shoe.qualityNotes)) throw Error("Invalid research list");
      for (const session of shoe.sessions) {
        if (!session.id || !Array.isArray(session.entries) || !Array.isArray(session.corrections) || !session.beforeSession?.trueCounts || !session.beforeSession?.mainBet) throw Error("Invalid research session");
      }
    }
    return state;
  }
  function begin(state, before, duration, time = now()) {
    const session = { id: uid(), startedAt: time, endedAt: null, endReason: null, durationSeconds: duration, entries: [], corrections: [], beforeSession: copy(before), afterSession: null, latestAfter: null };
    state.current.sessions.push(session);
    return session.id;
  }
  function record(state, sessionId, entry, snapshot, time = now()) {
    const row = { id: uid(), recordedAt: time, undoneAt: null, ...copy(entry) };
    if (sessionId) {
      const session = state.current.sessions.find(item => item.id === sessionId && !item.endedAt);
      if (!session) throw Error("Cannot add to a closed research session");
      session.entries.push(row);
    } else state.current.outsideSession.push(row);
    state.current.lastSnapshot = copy(snapshot);
    return row.id;
  }
  function close(state, sessionId, reason, snapshot, time = now()) {
    const session = state.current.sessions.find(item => item.id === sessionId);
    if (!session || session.endedAt) return;
    session.endedAt = time;
    session.endReason = reason;
    session.afterSession = copy(snapshot);
    session.latestAfter = copy(snapshot);
    state.current.lastSnapshot = copy(snapshot);
  }
  function undo(state, entryId, snapshot, time = now()) {
    const session = state.current.sessions.find(item => item.entries.some(entry => entry.id === entryId));
    const entry = session ? session.entries.find(item => item.id === entryId) : state.current.outsideSession.find(item => item.id === entryId);
    if (entry) {
      entry.undoneAt = time;
      if (session) { session.corrections.push({ entryId, at: time }); session.latestAfter = copy(snapshot); }
    }
    state.current.lastSnapshot = copy(snapshot);
  }
  function freeze(state, finalSnapshot, nextBaseline, time = now()) {
    const next = copy(state);
    for (const session of next.current.sessions) if (!session.endedAt) close(next, session.id, "reset", finalSnapshot, time);
    next.current.lastSnapshot = copy(finalSnapshot);
    next.current.frozenAt = time;
    next.frozen.push(next.current);
    next.current = newShoe(nextBaseline, time);
    return next;
  }
  function recover(state, snapshot, time = now()) {
    for (const session of state.current.sessions) if (!session.endedAt) close(state, session.id, "reload-interrupted", snapshot, time);
  }
  const api = { create, validate, begin, record, close, undo, freeze, recover };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BaccaratResearch = api;
})(globalThis);
