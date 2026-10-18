const fetchWithTimeout = async (url, ms = 3000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
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
  const remoteData = await fetchWithTimeout(manifestUrl, 3000);
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
});