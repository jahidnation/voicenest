document.addEventListener("DOMContentLoaded", () => {
  const tabNormal = document.getElementById("tabNormal");
  const tabTranslate = document.getElementById("tabTranslate");
  const normalLangGroup = document.getElementById("normalLangGroup");
  const translateGroup = document.getElementById("translateGroup");
  const btnBangla = document.getElementById("btnBangla");
  const btnEnglish = document.getElementById("btnEnglish");
  const btnBnToEn = document.getElementById("btnBnToEn");
  const btnEnToBn = document.getElementById("btnEnToBn");
  const toggleFloatingBtn = document.getElementById("toggleFloatingBtn");
  const mainMicBtn = document.getElementById("mainMicBtn");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const micActionText = document.getElementById("micActionText");
  const updateBanner = document.getElementById("updateBanner");
  const updateVersion = document.getElementById("updateVersion");
  const btnUpdate = document.getElementById("btnUpdate");
  const btnDismissUpdate = document.getElementById("btnDismissUpdate");

  const storage = (typeof chrome !== "undefined" && chrome.storage && (chrome.storage.sync || chrome.storage.local)) || null;

  const getGlobalSettings = (callback) => {
    const defaults = { uvt_mode: "normal", uvt_lang: "bn-BD", uvt_floating_btn: true, uvt_last_trans: "bn_to_en" };
    if (storage) {
      storage.get(defaults, callback);
    } else {
      callback({
        uvt_mode: localStorage.getItem("uvt_mode") || defaults.uvt_mode,
        uvt_lang: localStorage.getItem("uvt_lang") || defaults.uvt_lang,
        uvt_floating_btn: localStorage.getItem("uvt_floating_btn") !== "false",
        uvt_last_trans: localStorage.getItem("uvt_last_trans") || defaults.uvt_last_trans
      });
    }
  };

  const saveGlobalSettings = (items, callback) => {
    if (storage) {
      storage.set(items, callback);
    } else {
      Object.entries(items).forEach(([k, v]) => localStorage.setItem(k, String(v)));
      if (callback) callback();
    }
  };

  const updateUI = (isRecording, currentLang, currentMode, floatingEnabled) => {
    const mode = currentMode || "normal";
    const lang = currentLang || "bn-BD";
    const isFloating = floatingEnabled !== undefined ? floatingEnabled : true;

    if (toggleFloatingBtn) {
      toggleFloatingBtn.checked = isFloating;
    }

    if (mode === "normal") {
      tabNormal.classList.add("active");
      tabTranslate.classList.remove("active");
      normalLangGroup.classList.remove("hidden");
      translateGroup.classList.add("hidden");
    } else {
      tabTranslate.classList.add("active");
      tabNormal.classList.remove("active");
      normalLangGroup.classList.add("hidden");
      translateGroup.classList.remove("hidden");

      if (mode === "bn_to_en") {
        btnBnToEn.classList.add("active");
        btnEnToBn.classList.remove("active");
      } else {
        btnEnToBn.classList.add("active");
        btnBnToEn.classList.remove("active");
      }
    }

    if (lang === "bn-BD") {
      btnBangla.classList.add("active");
      btnEnglish.classList.remove("active");
    } else {
      btnEnglish.classList.add("active");
      btnBangla.classList.remove("active");
    }

    if (isRecording) {
      mainMicBtn.classList.add("active");
      mainMicBtn.innerHTML = '<i class="fa-solid fa-microphone-lines"></i>';
      statusDot.classList.add("recording");
      if (mode === "bn_to_en") {
        statusText.innerText = "বাংলা ➔ EN";
        micActionText.innerText = "Speaking Bangla... Typing English";
      } else if (mode === "en_to_bn") {
        statusText.innerText = "EN ➔ বাংলা";
        micActionText.innerText = "Speaking English... Typing Bangla";
      } else {
        statusText.innerText = "Listening...";
        micActionText.innerText = "Listening... Click to Stop";
      }
    } else {
      mainMicBtn.classList.remove("active");
      mainMicBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      statusDot.classList.remove("recording");
      statusText.innerText = "Ready";
      micActionText.innerText = "Click to Speak";
    }
  };

  const getActiveTab = async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs && tabs.length > 0 ? tabs[0] : null;
    } catch {
      return null;
    }
  };

  const safeSendMessage = async (message, callback) => {
    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      if (callback) callback(null);
      return;
    }

    if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("about:"))) {
      if (callback) callback(null);
      return;
    }

    try {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    } catch {
      if (callback) callback(null);
    }
  };

  const syncState = () => {
    getGlobalSettings((items) => {
      updateUI(false, items.uvt_lang, items.uvt_mode, items.uvt_floating_btn);
      safeSendMessage({ action: "getStatus" }, (response) => {
        if (response) {
          updateUI(
            response.isRecording,
            response.currentLang || items.uvt_lang,
            response.currentMode || items.uvt_mode,
            response.floatingBtnEnabled !== undefined ? response.floatingBtnEnabled : items.uvt_floating_btn
          );
        }
      });
    });
  };

  const applyMode = (mode) => {
    const updateData = { uvt_mode: mode };
    if (mode !== "normal") {
      updateData.uvt_last_trans = mode;
    }
    saveGlobalSettings(updateData, () => {
      getGlobalSettings((items) => {
        updateUI(false, items.uvt_lang, items.uvt_mode, items.uvt_floating_btn);
      });
    });
    safeSendMessage({ action: "setMode", mode }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode, response.floatingBtnEnabled);
      }
    });
  };

  const applyLanguage = (lang) => {
    saveGlobalSettings({ uvt_lang: lang, uvt_mode: "normal" }, () => {
      getGlobalSettings((items) => {
        updateUI(false, items.uvt_lang, items.uvt_mode, items.uvt_floating_btn);
      });
    });
    safeSendMessage({ action: "setLanguage", lang }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode, response.floatingBtnEnabled);
      }
    });
  };

  const checkUpdateStatus = () => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get("uvt_update_info", (res) => {
        const info = res?.uvt_update_info;
        if (info && info.hasUpdate && updateBanner && updateVersion) {
          updateVersion.textContent = info.latestVersion;
          updateBanner.classList.remove("hidden");
        }
      });

      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "checkUpdateManual" }, () => {
          chrome.storage.local.get("uvt_update_info", (res) => {
            const info = res?.uvt_update_info;
            if (info && info.hasUpdate && updateBanner && updateVersion) {
              updateVersion.textContent = info.latestVersion;
              updateBanner.classList.remove("hidden");
            }
          });
        });
      }
    }
  };

  tabNormal.addEventListener("click", () => applyMode("normal"));

  tabTranslate.addEventListener("click", () => {
    getGlobalSettings((items) => {
      const targetTrans = items.uvt_last_trans || "bn_to_en";
      applyMode(targetTrans);
    });
  });

  btnBangla.addEventListener("click", () => applyLanguage("bn-BD"));
  btnEnglish.addEventListener("click", () => applyLanguage("en-US"));

  btnBnToEn.addEventListener("click", () => applyMode("bn_to_en"));
  btnEnToBn.addEventListener("click", () => applyMode("en_to_bn"));

  if (toggleFloatingBtn) {
    toggleFloatingBtn.addEventListener("change", () => {
      const isEnabled = toggleFloatingBtn.checked;
      saveGlobalSettings({ uvt_floating_btn: isEnabled });
      safeSendMessage({ action: "setFloatingBtn", enabled: isEnabled });
    });
  }

  mainMicBtn.addEventListener("click", () => {
    safeSendMessage({ action: "toggleRecording" }, (response) => {
      if (response) {
        updateUI(response.isRecording, response.currentLang, response.currentMode, response.floatingBtnEnabled);
      }
    });
  });

  if (btnUpdate) {
    btnUpdate.addEventListener("click", () => {
      const repoUrl = "https://github.com/jahidnation/voicenest";
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: repoUrl });
      } else {
        window.open(repoUrl, "_blank");
      }
    });
  }

  if (btnDismissUpdate && updateBanner) {
    btnDismissUpdate.addEventListener("click", () => {
      updateBanner.classList.add("hidden");
    });
  }

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(() => {
      getGlobalSettings((items) => {
        updateUI(false, items.uvt_lang, items.uvt_mode, items.uvt_floating_btn);
      });
    });
  }

  syncState();
  checkUpdateStatus();
});