(() => {
  if (!document.getElementById("uvt-fa-cdn") && !document.querySelector('link[href*="font-awesome"]')) {
    const fontAwesomeLink = document.createElement("link");
    fontAwesomeLink.id = "uvt-fa-cdn";
    fontAwesomeLink.rel = "stylesheet";
    fontAwesomeLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    (document.head || document.documentElement).appendChild(fontAwesomeLink);
  }

  const storage = (typeof chrome !== "undefined" && chrome.storage && (chrome.storage.sync || chrome.storage.local)) || null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let isRecording = false;
  let currentTarget = null;
  let toastTimer = null;
  let currentLang = "bn-BD";
  let currentMode = "normal";
  let floatingBtnEnabled = true;
  let resizeObserver = null;
  let pendingTranscript = "";
  const translationCache = new Map();

  const isGoogleDocs = () => {
    return window.location.hostname.includes("docs.google.com") && !!document.querySelector(".docs-texteventtarget-iframe");
  };

  const isDocsEditor = (el) => {
    if (!isGoogleDocs() || !el) return false;
    return !!(
      el.classList?.contains("docs-texteventtarget-iframe") ||
      el.closest?.(".kix-appview, .kix-appview-editor, #docs-editor, .kix-page-paginated, .kix-canvas-tile-content")
    );
  };

  const getDeepActiveElement = () => {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  };

  const isEditableElement = (el) => {
    if (!el) return false;
    if (el.tagName === "TEXTAREA") return !el.readOnly && !el.disabled;
    if (el.tagName === "INPUT") {
      return !["button", "checkbox", "radio", "submit", "file", "image", "hidden", "reset"].includes(el.type) && !el.readOnly && !el.disabled;
    }
    if (el.isContentEditable) return true;
    if (el.getAttribute && (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "" || el.getAttribute("role") === "textbox")) return true;
    return false;
  };

  const syncGlobalSettings = (items) => {
    if (items.uvt_mode !== undefined) currentMode = items.uvt_mode;
    if (items.uvt_lang !== undefined) currentLang = items.uvt_lang;
    if (items.uvt_floating_btn !== undefined) {
      floatingBtnEnabled = items.uvt_floating_btn;
      if (!floatingBtnEnabled) {
        logoButton.style.display = "none";
      } else if (currentTarget) {
        positionLogo(currentTarget);
      }
    }
  };

  if (storage) {
    storage.get({ uvt_mode: "normal", uvt_lang: "bn-BD", uvt_floating_btn: true }, syncGlobalSettings);
  } else {
    currentMode = localStorage.getItem("uvt_mode") || "normal";
    currentLang = localStorage.getItem("uvt_lang") || "bn-BD";
    floatingBtnEnabled = localStorage.getItem("uvt_floating_btn") !== "false";
  }

  const toastElement = document.createElement("div");
  toastElement.className = "uvt-toast";
  document.body.appendChild(toastElement);

  const showToast = (message, type = "info") => {
    clearTimeout(toastTimer);
    const iconClass = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
    toastElement.className = `uvt-toast uvt-toast-${type} uvt-show`;
    toastElement.innerHTML = `<i class="fa-solid ${iconClass}"></i><span>${message}</span>`;
    toastTimer = setTimeout(() => {
      toastElement.classList.remove("uvt-show");
    }, 2800);
  };

  const logoUrl = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
    ? chrome.runtime.getURL("logo.png")
    : "logo.png";

  const logoButton = document.createElement("button");
  logoButton.type = "button";
  logoButton.className = "uvt-logo-trigger";
  logoButton.title = "Voice Type (Click or Alt + V)";
  logoButton.style.cssText = "position:fixed;z-index:2147483647;display:none;width:22px;height:22px;min-width:22px;border-radius:50%;background:#1e1f24;border:1px solid rgba(255,255,255,0.2);box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;padding:1px;align-items:center;justify-content:center;transition:transform 0.15s ease,box-shadow 0.2s ease,border-color 0.2s ease;user-select:none;outline:none;";

  const logoImg = document.createElement("img");
  logoImg.src = logoUrl;
  logoImg.alt = "Voice";
  logoImg.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:50%;display:block;pointer-events:none;";
  logoButton.appendChild(logoImg);
  document.body.appendChild(logoButton);

  const positionLogo = (target) => {
    if (!floatingBtnEnabled) {
      logoButton.style.display = "none";
      return;
    }
    if (!target || !document.contains(target)) {
      logoButton.style.display = "none";
      return;
    }

    if (isGoogleDocs() && isDocsEditor(target)) {
      const page = document.querySelector(".kix-page-paginated") || document.querySelector(".kix-appview-editor") || document.querySelector("#docs-editor");
      if (page) {
        const pageRect = page.getBoundingClientRect();
        const top = Math.max(pageRect.top + 16, 120);
        const left = Math.min(pageRect.right - 34, window.innerWidth - 38);
        logoButton.style.top = `${Math.round(top)}px`;
        logoButton.style.left = `${Math.round(left)}px`;
        logoButton.style.display = "flex";
        return;
      }
    }

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
      logoButton.style.display = "none";
      return;
    }

    const btnHeight = 22;
    const btnWidth = 22;
    const top = rect.height <= 44 ? rect.top + (rect.height - btnHeight) / 2 : rect.top + 6;
    let left = rect.right - btnWidth - 6;
    if (left < rect.left + 4) {
      left = rect.left + 4;
    }

    logoButton.style.top = `${Math.round(top)}px`;
    logoButton.style.left = `${Math.round(left)}px`;
    logoButton.style.display = "flex";
  };

  const updateLogoVisual = () => {
    if (isRecording) {
      logoButton.style.borderColor = "#ea4335";
      logoButton.style.boxShadow = "0 0 6px rgba(234,67,53,0.7)";
      logoButton.style.transform = "scale(1.05)";
    } else {
      logoButton.style.borderColor = "rgba(255,255,255,0.2)";
      logoButton.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
      logoButton.style.transform = "scale(1)";
    }
  };

  const fetchWithTimeout = async (url, ms = 3200) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch {
      clearTimeout(id);
      return null;
    }
  };

  const translateText = async (text, fromLang, toLang) => {
    if (!text || !text.trim()) return text;
    const cleanText = text.trim();
    const cacheKey = `${fromLang}_${toLang}_${cleanText.toLowerCase()}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    try {
      const u1 = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${fromLang}&tl=${toLang}&q=${encodeURIComponent(cleanText)}`;
      const r1 = await fetchWithTimeout(u1);
      if (r1 && r1.ok) {
        const d1 = await r1.json();
        let res = "";
        if (d1.sentences && Array.isArray(d1.sentences)) {
          res = d1.sentences.map((s) => s.trans || "").join(" ").trim();
        } else if (Array.isArray(d1)) {
          res = typeof d1[0] === "string" ? d1.join(" ") : d1[0].map((i) => i[0]).filter(Boolean).join(" ");
        }
        if (res && res !== cleanText) {
          translationCache.set(cacheKey, res);
          return res;
        }
      }
    } catch {}

    try {
      const u2 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=${toLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
      const r2 = await fetchWithTimeout(u2);
      if (r2 && r2.ok) {
        const d2 = await r2.json();
        if (d2 && d2[0]) {
          const res = d2[0].map((item) => item[0]).filter(Boolean).join("").trim();
          if (res) {
            translationCache.set(cacheKey, res);
            return res;
          }
        }
      }
    } catch {}

    try {
      const u3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${fromLang}|${toLang}`;
      const r3 = await fetchWithTimeout(u3);
      if (r3 && r3.ok) {
        const d3 = await r3.json();
        if (d3 && d3.responseData && d3.responseData.translatedText) {
          const res = d3.responseData.translatedText.trim();
          if (res && !res.toLowerCase().includes("mymemory")) {
            translationCache.set(cacheKey, res);
            return res;
          }
        }
      }
    } catch {}

    return text;
  };

  const formatBanglaPunctuation = (rawText) => {
    if (!rawText) return "";
    let s = rawText.normalize("NFC").trim();

    s = s.replace(/(^|\s)(কমা|comma)($|\s)/gi, "$1,$2");
    s = s.replace(/(^|\s)(দাঁড়ি|দাড়ি|ফুলস্টপ|ফুল স্টপ|full stop)($|\s)/gi, "$1।$2");
    s = s.replace(/(^|\s)(প্রশ্নবোধক|প্রশ্নচিহ্ন|কোশ্চেন মার্ক|question mark)($|\s)/gi, "$1?$2");

    s = s.replace(/(^|\s)(ঠিক আছে|আচ্ছা|আসলে|শুনুন|শোনো|দেখুন|দেখো|যাইহোক|যাই হোক|হ্যাঁ|না|অবশ্যই|ধন্যবাদ|হ্যালো|হাই)(?=\s|$)/gi, "$1$2,");
    s = s.replace(/(^|\s)(কিন্তু|তবে|তাহলে|সুতরাং|নাহলে|নতুবা|অথবা|কারণ)(?=\s)/gi, ", $2");
    s = s.replace(/\s+(তাই না|নাকি|হবে তো|পারবেন তো|পারবে তো|আছেন তো|আছো তো)($|[।?!,])/gi, ", $1?");

    const isQuestion = /(^|\s)(কি|কী|কেন|কোথায়|কোথাও|কখন|কেমন|কে|কার|কাকে|কিসের|কত|কবে|কিভাবে|কই|নাকি)($|\s|[।?!,])/i.test(s) || /\?$/.test(s);

    if (!/[।?!]$/.test(s)) {
      s = s.replace(/[,]+$/, "");
      s += isQuestion ? "?" : "।";
    }

    s = s.replace(/\s+([,।?!])/g, "$1");
    s = s.replace(/([,।?!])(?=[^\s,।?!])/g, "$1 ");
    s = s.replace(/,+/g, ",");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
  };

  const formatEnglishPunctuation = (rawText) => {
    if (!rawText) return "";
    let s = rawText.trim();
    s = s.replace(/(^|\s)(comma)($|\s)/gi, "$1,$2");
    s = s.replace(/(^|\s)(period|full stop)($|\s)/gi, "$1.$2");
    s = s.replace(/(^|\s)(question mark)($|\s)/gi, "$1?$2");
    s = s.replace(/(^|\s)(ok|okay|well|actually|yes|no|hello|hi|hey|sure|please)(?=\s|$)/gi, (m, p1, p2) => p1 + p2.charAt(0).toUpperCase() + p2.slice(1).toLowerCase() + ",");
    s = s.replace(/\s+(right|isn't it|aren't you|won't you)($|[.?!,])/gi, ", $1?");
    const isQuestion = /(^|\s)(what|why|when|where|who|whom|whose|which|how|is|are|am|do|does|did|can|could|will|would|should)($|\s)/i.test(s) || /\?$/.test(s);
    if (!/[.?!]$/.test(s)) {
      s = s.replace(/[,]+$/, "");
      s += isQuestion ? "?" : ".";
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    s = s.replace(/\s+([,.?!])/g, "$1");
    s = s.replace(/([,.?!])(?=[^\s,.?!])/g, "$1 ");
    s = s.replace(/,+/g, ",");
    s = s.replace(/\s{2,}/g, " ");
    return s.trim();
  };

  const insertIntoGoogleDocs = (text) => {
    if (!text || !text.trim()) return;
    const cleanText = " " + text.trim();

    const iframe = document.querySelector(".docs-texteventtarget-iframe");
    if (!iframe) return;

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;

    if (win) {
      try { win.focus(); } catch {}
    }

    const target = (doc && (doc.activeElement || doc.querySelector("[contenteditable=true]") || doc.body)) || iframe;
    if (target && target.focus) {
      try { target.focus(); } catch {}
    }

    let success = false;

    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", cleanText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true
      });
      success = target.dispatchEvent(pasteEvent);
    } catch {}

    if (!success && doc) {
      try {
        success = doc.execCommand("insertText", false, cleanText);
      } catch {}
    }

    if (!success && doc) {
      try {
        for (let i = 0; i < cleanText.length; i++) {
          const ch = cleanText[i];
          doc.execCommand("insertText", false, ch);
        }
        success = true;
      } catch {}
    }

    if (!success) {
      try {
        target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        target.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: cleanText,
          composed: true
        }));
        target.dispatchEvent(new CompositionEvent("compositionend", { data: cleanText, bubbles: true }));
        success = true;
      } catch {}
    }

    if (!success && doc) {
      try {
        for (let i = 0; i < cleanText.length; i++) {
          const ch = cleanText[i];
          const code = ch.charCodeAt(0);
          const ev = new KeyboardEvent("keypress", {
            key: ch,
            keyCode: code,
            which: code,
            charCode: code,
            bubbles: true,
            cancelable: true
          });
          doc.dispatchEvent(ev);
          target.dispatchEvent(ev);
        }
      } catch {}
    }
  };

  const insertIntoInput = (target, text) => {
    try { target.focus(); } catch {}

    let start = (target.value || "").length;
    let end = (target.value || "").length;
    try {
      if (typeof target.selectionStart === "number") {
        start = target.selectionStart;
        end = target.selectionEnd;
      }
    } catch {}

    const oldVal = target.value || "";
    const prefix = start > 0 && !/\s$/.test(oldVal.slice(0, start)) ? " " : "";
    const textToInsert = prefix + text.trim();

    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, textToInsert);
    } catch {}

    if (!inserted || target.value === oldVal) {
      const newVal = oldVal.slice(0, start) + textToInsert + oldVal.slice(end);
      const proto = target.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

      if (nativeSetter) {
        nativeSetter.call(target, newVal);
      } else {
        target.value = newVal;
      }

      try {
        const newCursor = start + textToInsert.length;
        if (typeof target.setSelectionRange === "function" && target.type !== "email" && target.type !== "number") {
          target.setSelectionRange(newCursor, newCursor);
        }
      } catch {}

      target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }
  };

  const insertIntoContentEditable = (target, text) => {
    try { target.focus(); } catch {}
    const str = " " + text.trim();
    let inserted = false;

    try {
      inserted = document.execCommand("insertText", false, str);
    } catch {}

    if (!inserted) {
      try {
        const evt = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: str,
          composed: true
        });
        target.dispatchEvent(evt);
        inserted = true;
      } catch {}
    }

    if (!inserted) {
      const doc = target.ownerDocument || document;
      const sel = doc.getSelection ? doc.getSelection() : window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const textNode = doc.createTextNode(str);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        target.textContent += str;
      }
      target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  };

  const insertText = (target, text) => {
    if (!target || !text) return;

    if (isGoogleDocs() && isDocsEditor(target)) {
      insertIntoGoogleDocs(text);
      return;
    }

    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      insertIntoInput(target, text);
    } else {
      insertIntoContentEditable(target, text);
    }

    positionLogo(target);
  };

  const getTargetElement = () => {
    if (currentTarget && document.contains(currentTarget)) {
      return currentTarget;
    }
    const active = getDeepActiveElement();
    if (isEditableElement(active)) {
      return active;
    }
    if (isGoogleDocs()) {
      const docsIframe = document.querySelector(".docs-texteventtarget-iframe");
      if (docsIframe) return docsIframe;
    }
    return document.querySelector('textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="file"]):not([type="image"]):not([type="hidden"]):not(.docs-title-input)');
  };

  const processAndInsert = async (rawText) => {
    if (!rawText || !rawText.trim()) return;
    let processedText = rawText.trim();

    if (currentMode === "bn_to_en") {
      const translated = await translateText(processedText, "bn", "en");
      processedText = formatEnglishPunctuation(translated);
    } else if (currentMode === "en_to_bn") {
      const translated = await translateText(processedText, "en", "bn");
      processedText = formatBanglaPunctuation(translated);
    } else if (currentLang === "bn-BD") {
      processedText = formatBanglaPunctuation(processedText);
    } else {
      processedText = formatEnglishPunctuation(processedText);
    }

    const target = getTargetElement();
    if (target) {
      insertText(target, processedText);
    }
  };

  const setupRecognition = () => {
    if (!SpeechRecognition) {
      showToast("Web Speech API not supported in this browser.", "error");
      return null;
    }
    const instance = new SpeechRecognition();
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 5;

    if (currentMode === "bn_to_en") {
      instance.lang = "bn-BD";
    } else if (currentMode === "en_to_bn") {
      instance.lang = "en-US";
    } else {
      instance.lang = currentLang;
    }

    instance.onstart = () => {
      isRecording = true;
      pendingTranscript = "";
      updateLogoVisual();
      if (currentMode === "bn_to_en") {
        showToast("Listening: বাংলা ➔ English...", "info");
      } else if (currentMode === "en_to_bn") {
        showToast("Listening: English ➔ বাংলা...", "info");
      } else {
        showToast("Listening...", "info");
      }
    };

    instance.onresult = async (event) => {
      let finalChunk = "";
      let interimChunk = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        let candidate = "";
        const isBanglaInput = currentMode === "bn_to_en" || (currentMode === "normal" && currentLang === "bn-BD");

        for (let j = 0; j < item.length; j++) {
          const text = item[j].transcript.trim();
          if (isBanglaInput && /[\u0980-\u09FF]/.test(text)) {
            candidate = text;
            break;
          }
        }
        if (!candidate && item[0]) {
          candidate = item[0].transcript.trim();
        }

        if (item.isFinal) {
          finalChunk += " " + candidate;
        } else {
          interimChunk += " " + candidate;
        }
      }

      if (interimChunk.trim()) {
        pendingTranscript = interimChunk.trim();
        showToast(pendingTranscript, "info");
      }

      if (finalChunk.trim()) {
        pendingTranscript = "";
        await processAndInsert(finalChunk.trim());
      }
    };

    instance.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        isRecording = false;
        pendingTranscript = "";
        updateLogoVisual();
        showToast("Microphone permission denied. Allow mic access in site settings.", "error");
        stopRecording();
        return;
      }
      showToast(`Speech error: ${event.error}`, "error");
    };

    instance.onend = () => {
      if (isRecording) {
        if (pendingTranscript.trim()) {
          const toInsert = pendingTranscript.trim();
          pendingTranscript = "";
          processAndInsert(toInsert);
        }
        try {
          recognition.start();
        } catch {
          stopRecording();
        }
      }
    };

    return instance;
  };

  const startRecording = () => {
    const target = getTargetElement();
    if (!target) {
      showToast("Please click inside an input box first.", "error");
      return;
    }
    currentTarget = target;
    if (recognition) {
      try {
        recognition.abort();
      } catch {}
    }
    recognition = setupRecognition();
    if (!recognition) return;
    try {
      recognition.start();
    } catch {
      recognition.stop();
    }
  };

  const stopRecording = () => {
    isRecording = false;
    updateLogoVisual();
    if (pendingTranscript.trim()) {
      const toInsert = pendingTranscript.trim();
      pendingTranscript = "";
      processAndInsert(toInsert);
    }
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }
    showToast("Listening stopped", "success");
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  logoButton.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  logoButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleRecording();
  });

  const handleInteraction = (e) => {
    const path = e.composedPath ? e.composedPath() : [e.target];
    const el = path[0] || e.target;
    if (!el || el === logoButton || logoButton.contains(el)) return;

    if (isGoogleDocs() && isDocsEditor(el)) {
      const docsIframe = document.querySelector(".docs-texteventtarget-iframe") || document.querySelector(".kix-appview-editor");
      if (docsIframe) {
        if (currentTarget && resizeObserver) resizeObserver.unobserve(currentTarget);
        currentTarget = docsIframe;
        positionLogo(docsIframe);
        return;
      }
    }

    let editable = null;
    for (let i = 0; i < path.length; i++) {
      const item = path[i];
      if (item instanceof HTMLElement && isEditableElement(item)) {
        editable = item;
        break;
      }
    }

    if (!editable && el instanceof HTMLElement) {
      editable = isEditableElement(el)
        ? el
        : el.closest?.('[contenteditable="true"], [contenteditable=""], [role="textbox"], textarea, input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="file"]):not([type="image"])');
    }

    if (editable && isEditableElement(editable)) {
      if (currentTarget && resizeObserver) {
        resizeObserver.unobserve(currentTarget);
      }
      currentTarget = editable;
      positionLogo(editable);

      if (window.ResizeObserver && !resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          if (currentTarget) positionLogo(currentTarget);
        });
        resizeObserver.observe(editable);
      }
    }
  };

  document.addEventListener("focusin", handleInteraction, true);
  document.addEventListener("mousedown", handleInteraction, true);
  document.addEventListener("input", () => {
    if (currentTarget) positionLogo(currentTarget);
  }, true);

  window.addEventListener("scroll", () => {
    if (currentTarget && logoButton.style.display !== "none") {
      positionLogo(currentTarget);
    }
  }, { passive: true, capture: true });

  window.addEventListener("resize", () => {
    if (currentTarget && logoButton.style.display !== "none") {
      positionLogo(currentTarget);
    }
  }, { passive: true });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      if (currentMode === "normal") {
        currentLang = currentLang === "bn-BD" ? "en-US" : "bn-BD";
        if (storage) storage.set({ uvt_lang: currentLang });
        showToast(`Language: ${currentLang === "bn-BD" ? "Bangla" : "English"}`, "info");
      } else {
        currentMode = currentMode === "bn_to_en" ? "en_to_bn" : "bn_to_en";
        if (storage) storage.set({ uvt_mode: currentMode, uvt_last_trans: currentMode });
        showToast(`Mode: ${currentMode === "bn_to_en" ? "বাংলা ➔ English" : "English ➔ বাংলা"}`, "info");
      }
      if (isRecording) {
        stopRecording();
        setTimeout(() => startRecording(), 250);
      }
    } else if (e.altKey && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      const active = getDeepActiveElement();
      if (isEditableElement(active)) {
        currentTarget = active;
        positionLogo(active);
      } else if (isGoogleDocs()) {
        const docsIframe = document.querySelector(".docs-texteventtarget-iframe");
        if (docsIframe) {
          currentTarget = docsIframe;
          positionLogo(docsIframe);
        }
      }
      toggleRecording();
    }
  });

  if (storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" || areaName === "local") {
        if (changes.uvt_mode) currentMode = changes.uvt_mode.newValue;
        if (changes.uvt_lang) currentLang = changes.uvt_lang.newValue;
        if (changes.uvt_floating_btn !== undefined) {
          floatingBtnEnabled = changes.uvt_floating_btn.newValue;
          if (!floatingBtnEnabled) {
            logoButton.style.display = "none";
          } else if (currentTarget) {
            positionLogo(currentTarget);
          }
        }
      }
    });
  }

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "toggleRecording") {
        toggleRecording();
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "setLanguage") {
        currentLang = request.lang;
        currentMode = "normal";
        if (storage) storage.set({ uvt_lang: currentLang, uvt_mode: "normal" });
        showToast(`Language: ${currentLang === "bn-BD" ? "Bangla" : "English"}`, "info");
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "setMode") {
        currentMode = request.mode;
        const updateData = { uvt_mode: currentMode };
        if (currentMode !== "normal") updateData.uvt_last_trans = currentMode;
        if (storage) storage.set(updateData);
        const modeLabel = currentMode === "bn_to_en" ? "বাংলা ➔ English" : currentMode === "en_to_bn" ? "English ➔ বাংলা" : "Normal";
        showToast(`Mode: ${modeLabel}`, "info");
        if (isRecording) {
          stopRecording();
          setTimeout(() => startRecording(), 250);
        }
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "setFloatingBtn") {
        floatingBtnEnabled = !!request.enabled;
        if (!floatingBtnEnabled) {
          logoButton.style.display = "none";
        } else if (currentTarget) {
          positionLogo(currentTarget);
        }
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      } else if (request.action === "getStatus") {
        sendResponse({ isRecording, currentLang, currentMode, floatingBtnEnabled });
      }
      return true;
    });
  }

  if (isGoogleDocs()) {
    setTimeout(() => {
      const docsIframe = document.querySelector(".docs-texteventtarget-iframe");
      if (docsIframe) {
        currentTarget = docsIframe;
        positionLogo(docsIframe);
      }
    }, 1200);
  }
})();