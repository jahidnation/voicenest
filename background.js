let currentKeyIndex = 0;

const fetchWithTimeout = async (url, ms = 3200) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res;
  } catch {
    clearTimeout(timer);
    return null;
  }
};

const isNewerVersion = (remote, current) => {
  const r = remote.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const rv = r[i] || 0;
    const cv = c[i] || 0;
    if (rv > cv) return true;
    if (rv < cv) return false;
  }
  return false;
};

const checkForUpdates = async () => {
  const manifestUrl = "https://raw.githubusercontent.com/jahidnation/voicenest/main/manifest.json";
  const remoteRes = await fetchWithTimeout(manifestUrl, 3000);
  if (!remoteRes) return;
  const remoteData = await remoteRes.json().catch(() => null);
  if (!remoteData || !remoteData.version) return;

  const currentVersion = chrome.runtime.getManifest().version;
  const hasUpdate = isNewerVersion(remoteData.version, currentVersion);

  if (hasUpdate) {
    chrome.action.setBadgeText({ text: "NEW" });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }

  chrome.storage.local.set({
    uvt_update_info: {
      hasUpdate,
      latestVersion: remoteData.version,
      currentVersion,
      checkedAt: Date.now(),
      releaseUrl: "https://github.com/jahidnation/voicenest"
    }
  });
};

const executeWhisperRequest = async (audioBlob, apiKey, language) => {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", "whisper-large-v3");

  const langCode = (language || "bn").split("-")[0].toLowerCase();
  formData.append("language", langCode);

  if (langCode === "bn") {
    formData.append("prompt", "বাংলা হরফে স্পষ্ট বাক্য লিখুন।");
  } else {
    formData.append("prompt", "Punctuate correctly and clearly in English.");
  }

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  return res;
};

const handleAudioTranscription = async (request, sendResponse) => {
  try {
    const { base64Audio, mimeType, language, keys } = request;
    const keyPool = Array.isArray(keys) ? keys.filter(Boolean) : [];

    if (keyPool.length === 0) {
      sendResponse({ success: false, error: "No active API keys found in settings." });
      return;
    }

    const dataRes = await fetch(`data:${mimeType || "audio/webm"};base64,${base64Audio}`);
    const audioBlob = await dataRes.blob();

    let lastErrorMessage = "";
    const totalKeys = keyPool.length;

    for (let attempt = 0; attempt < totalKeys; attempt++) {
      const activeIndex = (currentKeyIndex + attempt) % totalKeys;
      const selectedKey = keyPool[activeIndex];

      try {
        const res = await executeWhisperRequest(audioBlob, selectedKey, language);

        if (res.ok) {
          currentKeyIndex = (activeIndex + 1) % totalKeys;
          const result = await res.json();
          sendResponse({ success: true, text: (result.text || "").trim() });
          return;
        }

        if (res.status === 429 || res.status === 401) {
          const errData = await res.json().catch(() => ({}));
          lastErrorMessage = errData.error?.message || `Key rate-limited or invalid (HTTP ${res.status})`;
          continue;
        }

        const errData = await res.json().catch(() => ({}));
        lastErrorMessage = errData.error?.message || `API error ${res.status}`;
      } catch (err) {
        lastErrorMessage = err.message || "Network error during transcription";
      }
    }

    sendResponse({ success: false, error: lastErrorMessage || "All API keys in pool failed." });
  } catch (err) {
    sendResponse({ success: false, error: err.message || "Failed to process audio." });
  }
};

const handleTranslation = async (request, sendResponse) => {
  const { text, fromLang, toLang } = request;
  if (!text || !text.trim()) {
    sendResponse({ success: true, translated: text });
    return;
  }
  const cleanText = text.trim();

  try {
    const u1 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${fromLang}&tl=${toLang}&q=${encodeURIComponent(cleanText)}`;
    const r1 = await fetchWithTimeout(u1, 3000);
    if (r1 && r1.ok) {
      const d1 = await r1.json();
      let res = "";
      if (d1.sentences && Array.isArray(d1.sentences)) {
        res = d1.sentences.map((s) => s.trans || "").join(" ").trim();
      } else if (Array.isArray(d1)) {
        res = typeof d1[0] === "string" ? d1.join(" ") : d1[0].map((i) => i[0]).filter(Boolean).join(" ");
      }
      if (res && res !== cleanText) {
        sendResponse({ success: true, translated: res });
        return;
      }
    }
  } catch {}

  try {
    const u2 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
    const r2 = await fetchWithTimeout(u2, 3000);
    if (r2 && r2.ok) {
      const d2 = await r2.json();
      if (d2 && d2[0]) {
        const res = d2[0].map((item) => item[0]).filter(Boolean).join("").trim();
        if (res) {
          sendResponse({ success: true, translated: res });
          return;
        }
      }
    }
  } catch {}

  try {
    const u3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${fromLang}|${toLang}`;
    const r3 = await fetchWithTimeout(u3, 3000);
    if (r3 && r3.ok) {
      const d3 = await r3.json();
      if (d3 && d3.responseData && d3.responseData.translatedText) {
        const res = d3.responseData.translatedText.trim();
        if (res && !res.toLowerCase().includes("mymemory")) {
          sendResponse({ success: true, translated: res });
          return;
        }
      }
    }
  } catch {}

  sendResponse({ success: false, translated: cleanText });
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("periodicUpdateCheck", { periodInMinutes: 360 });
  checkForUpdates();
});

chrome.runtime.onStartup.addListener(() => {
  checkForUpdates();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "periodicUpdateCheck") {
    checkForUpdates();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkUpdateManual") {
    checkForUpdates().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === "transcribeAudio") {
    handleAudioTranscription(request, sendResponse);
    return true;
  }
  if (request.action === "translateText") {
    handleTranslation(request, sendResponse);
    return true;
  }
});