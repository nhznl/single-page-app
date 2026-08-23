const storageKey = "card-tracker-v1";
const historyKey = "card-tracker-history-v1";
const bucketStorageKey = "card-tracker-bucket-counts-v1";
const totals = JSON.parse(localStorage.getItem(storageKey) || "{\"dragon\":0,\"panda\":0,\"deck\":0}");
const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
const bucketCounts = JSON.parse(localStorage.getItem(bucketStorageKey) || "{\"dragon-low\":0,\"dragon-high\":0,\"panda-plus-one\":0,\"panda-minus-two\":0,\"panda-minus-one\":0,\"panda-plus-four\":0}");

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

const cardBuckets = {
  "2": ["panda-plus-one"],
  "3": ["panda-minus-two"],
  "4": ["dragon-low", "panda-minus-two"],
  "5": ["dragon-low", "panda-minus-two"],
  "6": ["dragon-low", "panda-minus-one"],
  "7": ["dragon-low", "panda-minus-one"],
  "8": ["dragon-high", "panda-minus-two"],
  "9": ["dragon-high", "panda-plus-four"],
  "10": ["panda-plus-one"],
  J: ["panda-plus-one"],
  Q: ["panda-plus-one"],
  K: ["panda-plus-one"],
  A: ["panda-plus-one"]
};

function render() {
  for (const [counter, total] of Object.entries(totals)) {
    document.querySelector(`#${counter}-total`).value = total;
    document.querySelector(`#${counter}-total`).textContent = total;
  }
  document.querySelectorAll("[data-bucket]").forEach((button) => {
    button.querySelector(".bucket-count").textContent = bucketCounts[button.dataset.bucket] || 0;
  });
  localStorage.setItem(storageKey, JSON.stringify(totals));
  localStorage.setItem(historyKey, JSON.stringify(history));
  localStorage.setItem(bucketStorageKey, JSON.stringify(bucketCounts));
  document.querySelector("#undo").disabled = history.length === 0;
}

function applyChanges(changes, buckets = []) {
  changes.forEach(({ counter, change }) => { totals[counter] += change; });
  buckets.forEach((bucket) => { bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1; });
  history.push({ changes, buckets });
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
    const buckets = button.dataset.bucket ? [button.dataset.bucket] : [];
    applyChanges([{ counter: button.dataset.counter, change }], buckets);
  });
});

document.querySelector("#undo").addEventListener("click", () => {
  const lastAction = history.pop();
  if (!lastAction) return;
  const changes = lastAction.changes || [{ counter: lastAction.counter, change: lastAction.change }];
  changes.forEach(({ counter, change }) => { totals[counter] -= change; });
  (lastAction.buckets || []).forEach((bucket) => { bucketCounts[bucket] = Math.max(0, (bucketCounts[bucket] || 0) - 1); });
  render();
});

document.querySelector("#reset").addEventListener("click", () => {
  Object.keys(totals).forEach((key) => { totals[key] = 0; });
  Object.keys(bucketCounts).forEach((key) => { bucketCounts[key] = 0; });
  history.length = 0;
  render();
});

const voiceButton = document.querySelector("#voice");
const voiceStatus = document.querySelector("#voice-status");
const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;

if (!SpeechRecognition) {
  voiceButton.disabled = true;
  voiceStatus.textContent = "Voice commands are not supported by this browser.";
} else {
  const recognition = new SpeechRecognition();
  let voiceActive = false;
  let restartTimer;
  let lastRecognition = "";

  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  function showVoiceState(state) {
    voiceStatus.textContent = lastRecognition ? `${state} • ${lastRecognition}` : state;
  }

  function setVoiceButton(active) {
    voiceButton.classList.toggle("listening", active);
    voiceButton.textContent = active ? "Stop" : "Voice";
    voiceButton.setAttribute("aria-pressed", String(active));
  }

  function stopVoiceMode(message = "Voice stopped.") {
    voiceActive = false;
    clearTimeout(restartTimer);
    setVoiceButton(false);
    try { recognition.abort(); } catch { /* Recognition was already stopped. */ }
    showVoiceState(message);
  }

  async function startVoiceMode() {
    voiceActive = true;
    lastRecognition = "";
    setVoiceButton(true);
    showVoiceState("Starting voice mode…");

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("microphone-unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (!voiceActive) return;
      recognition.start();
    } catch (error) {
      voiceActive = false;
      setVoiceButton(false);
      voiceStatus.textContent = error.name === "NotAllowedError" || error.name === "SecurityError"
        ? "Microphone access was denied. Allow it in Safari website settings."
        : "Could not start voice recognition.";
    }
  }

  voiceButton.addEventListener("click", () => {
    if (voiceActive) stopVoiceMode();
    else startVoiceMode();
  });

  recognition.onstart = () => {
    setVoiceButton(true);
    showVoiceState("Listening…");
  };

  recognition.onresult = (event) => {
    for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
      const result = event.results[resultIndex];
      if (!result.isFinal) continue;

      let card;
      let transcript = "";
      for (let alternativeIndex = 0; alternativeIndex < result.length && !card; alternativeIndex += 1) {
        transcript = result[alternativeIndex].transcript;
        card = cardFromSpeech(transcript);
      }

      if (!card) {
        lastRecognition = `Not recognized: “${transcript}”`;
        showVoiceState("Listening…");
        continue;
      }

      const changes = cardRules[card];
      applyChanges(changes, cardBuckets[card]);
      const summary = changes.map(({ counter, change }) => `${counter === "dragon" ? "Dragon" : "Panda"} ${signedNumber(change)}`).join(", ");
      lastRecognition = `Recognized ${card}: ${summary}`;
      showVoiceState("Listening…");
    }
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" && !voiceActive) return;
    if (event.error === "no-speech" && voiceActive) {
      showVoiceState("Listening…");
      return;
    }

    const messages = {
      "not-allowed": "Microphone permission is required.",
      "service-not-allowed": "Speech recognition is unavailable. Make sure Siri is enabled.",
      "audio-capture": "Safari could not access the microphone.",
      network: "Voice recognition lost its network connection."
    };
    stopVoiceMode(messages[event.error] || `Voice error: ${event.error}.`);
  };

  recognition.onend = () => {
    if (!voiceActive) return;
    showVoiceState("Listening…");
    restartTimer = setTimeout(() => {
      if (!voiceActive) return;
      try { recognition.start(); } catch { stopVoiceMode("Voice recognition stopped. Tap Voice to restart."); }
    }, 300);
  };
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
render();
