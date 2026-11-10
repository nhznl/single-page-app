"use strict";
importScripts("main-bets.js?v=46");
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: BaccaratMainBets.calculate(data.cards) });
  } catch {
    self.postMessage({ id: data.id, error: "Calculation unavailable. Check the recorded shoe and reload." });
  }
};
