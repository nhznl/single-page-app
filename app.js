const storageKey = "card-tracker-v1";
const historyKey = "card-tracker-history-v1";
const totals = JSON.parse(localStorage.getItem(storageKey) || "{\"dragon\":0,\"panda\":0,\"deck\":0}");
const history = JSON.parse(localStorage.getItem(historyKey) || "[]");

const cardRules = {
  "2": [{ counter: "panda", change: 1 }],
  "3": [{ counter: "panda", change: -2 }],
  "4": [{ counter: "dragon", change: -1 }, { counter: "panda", change: -2 }],
  "5": [{ counter: "dragon", change: -1 }, { counter: "panda", change: -2 }],
  "6": [{ counter: "dragon", change: -1 }, { counter: "panda", change: -1 }],
  "7": [{ counter: "dragon", change: -1 }, { counter: "panda", change: -1 }],
  "8": [{ counter: "dragon", change: 2 }, { counter: "panda", change: -2 }],
  "9": [{ counter: "dragon", change: 2 }, { counter: "panda", change: 4 }],
  "10": [{ counter: "panda", change: 1 }],
  J: [{ counter: "panda", change: 1 }],
  Q: [{ counter: "panda", change: 1 }],
  K: [{ counter: "panda", change: 1 }],
  A: [{ counter: "panda", change: 1 }]
};

const cardAliases = {
  "2": ["2", "two"],
  "3": ["3", "three"],
  "4": ["4", "four"],
  "5": ["5", "five"],
  "6": ["6", "six"],
  "7": ["7", "seven"],
  "8": ["8", "eight"],
  "9": ["9", "nine"],
  "10": ["10", "ten"],
  J: ["jack", "jay"],
  Q: ["queen", "cue"],
  K: ["king"],
  A: ["ace"]
};

function render() {
  for (const [counter, total] of Object.entries(totals)) {
    document.querySelector(`#${counter}-total`).value = total;
    document.querySelector(`#${counter}-total`).textContent = total;
  }
  localStorage.setItem(storageKey, JSON.stringify(totals));
  localStorage.setItem(historyKey, JSON.stringify(history));
  document.querySelector("#undo").disabled = history.length === 0;
}

function applyChanges(changes) {
  changes.forEach(({ counter, change }) => { totals[counter] += change; });
  history.push({ changes });
  render();
}

function cardFromSpeech(transcript) {
  const words = new Set(transcript.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  return Object.keys(cardAliases).find((card) => cardAliases[card].some((alias) => words.has(alias)));
}

function signedNumber(value) {
  return value > 0 ? `+${value}` : String(value).replace("-", "−");
}

document.querySelectorAll("[data-counter]").forEach((button) => {
  button.addEventListener("click", () => {
    const change = Number(button.dataset.change);
    applyChanges([{ counter: button.dataset.counter, change }]);
  });
});

document.querySelector("#undo").addEventListener("click", () => {
  const lastAction = history.pop();
  if (!lastAction) return;
  const changes = lastAction.changes || [{ counter: lastAction.counter, change: lastAction.change }];
  changes.forEach(({ counter, change }) => { totals[counter] -= change; });
  render();
});

document.querySelector("#reset").addEventListener("click", () => {
  Object.keys(totals).forEach((key) => { totals[key] = 0; });
  history.length = 0;
  render();
});

const voiceButton = document.querySelector("#voice");
const voiceStatus = document.querySelector("#voice-status");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  voiceButton.disabled = true;
  voiceStatus.textContent = "Voice commands are not supported by this browser.";
} else {
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  voiceButton.addEventListener("click", async () => {
    voiceStatus.textContent = "Listening…";
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("microphone-unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      recognition.start();
    } catch (error) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        voiceStatus.textContent = "Microphone access was denied. Allow it in Safari website settings.";
      } else if (error.name === "InvalidStateError") {
        voiceStatus.textContent = "Already listening…";
      } else {
        voiceStatus.textContent = "Microphone is unavailable on this device.";
      }
    }
  });

  recognition.onstart = () => {
    voiceButton.classList.add("listening");
    voiceButton.setAttribute("aria-pressed", "true");
  };

  recognition.onresult = (event) => {
    const result = event.results[0];
    let card;
    let transcript = "";
    for (let index = 0; index < result.length && !card; index += 1) {
      transcript = result[index].transcript;
      card = cardFromSpeech(transcript);
    }

    if (!card) {
      voiceStatus.textContent = `Did not recognize a card in “${transcript}”.`;
      return;
    }

    const changes = cardRules[card];
    applyChanges(changes);
    const summary = changes.map(({ counter, change }) => `${counter === "dragon" ? "Dragon" : "Panda"} ${signedNumber(change)}`).join(", ");
    voiceStatus.textContent = `${card}: ${summary}`;
  };

  recognition.onerror = (event) => {
    voiceStatus.textContent = event.error === "not-allowed" ? "Microphone permission is required." : "Could not hear a card. Tap Voice to try again.";
  };

  recognition.onend = () => {
    voiceButton.classList.remove("listening");
    voiceButton.setAttribute("aria-pressed", "false");
    if (voiceStatus.textContent === "Listening…") voiceStatus.textContent = "No card heard. Tap Voice to try again.";
  };
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
