const storageKey = "card-tracker-v1";
const historyKey = "card-tracker-history-v1";
const totals = JSON.parse(localStorage.getItem(storageKey) || "{\"dragon\":0,\"panda\":0,\"deck\":0}");
const history = JSON.parse(localStorage.getItem(historyKey) || "[]");

function render() {
  for (const [counter, total] of Object.entries(totals)) {
    document.querySelector(`#${counter}-total`).value = total;
    document.querySelector(`#${counter}-total`).textContent = total;
  }
  localStorage.setItem(storageKey, JSON.stringify(totals));
  localStorage.setItem(historyKey, JSON.stringify(history));
  document.querySelector("#undo").disabled = history.length === 0;
}

document.querySelectorAll("[data-counter]").forEach((button) => {
  button.addEventListener("click", () => {
    const change = Number(button.dataset.change);
    totals[button.dataset.counter] += change;
    history.push({ counter: button.dataset.counter, change });
    render();
  });
});

document.querySelector("#undo").addEventListener("click", () => {
  const lastAction = history.pop();
  if (!lastAction) return;
  totals[lastAction.counter] -= lastAction.change;
  render();
});

document.querySelector("#reset").addEventListener("click", () => {
  Object.keys(totals).forEach((key) => { totals[key] = 0; });
  history.length = 0;
  render();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
