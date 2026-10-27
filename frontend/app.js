/* TalkBridge AI — Real-Time Bidirectional Voice Translation
 * Clean, Robust, 100% Reliable Implementation
 */

const $ = (id) => document.getElementById(id);

/* ───── DOM Elements ───── */
const els = {
  roomId: $("roomId"),
  joinBtn: $("joinBtn"),
  startBtn: $("startBtn"),
  hangupBtn: $("hangupBtn"),
  remoteAudio: $("remoteAudio"),
  translatedAudio: $("translatedAudio"),
  log: $("log"),
  clientId: $("clientId"),
  signalingStatus: $("signalingStatus"),
  callStatus: $("callStatus"),
  myLang: $("myLang"),
  theyHearLang: $("theyHearLang"),
  localLangBadge: $("localLangBadge"),
  remoteLangBadge: $("remoteLangBadge"),
  waveformCanvas: $("waveformCanvas"),
  micIndicator: $("micIndicator"),
  callTimer: $("callTimer"),
  transcriptPanel: $("transcriptPanel"),
  transcriptPlaceholder: $("transcriptPlaceholder"),
  transcriptCount: $("transcriptCount"),
  logsToggle: $("logsToggle"),
  logsChevron: $("logsChevron"),
  listenTranslated: $("listenTranslated"),
  listenBoth: $("listenBoth"),
  swapLangBtn: $("swapLangBtn"),
  chipAsr: $("chipAsr"),
  chipMt: $("chipMt"),
  chipTts: $("chipTts"),
  chipLatency: $("chipLatency"),
  copyTranscriptBtn: $("copyTranscriptBtn"),
  clearTranscriptBtn: $("clearTranscriptBtn"),
  installAppBtn: $("installAppBtn"),
  shareRoomBtn: $("shareRoomBtn"),
  localPulseRing: $("localPulseRing"),
  remotePulseRing: $("remotePulseRing"),
  streamingWordTicker: $("streamingWordTicker"),
  streamingWordTranslation: $("streamingWordTranslation"),
  translationModeHint: $("translationModeHint"),
  dockMuteBtn: $("dockMuteBtn"),
  dockMicLabel: $("dockMicLabel"),
  dockSwapLangBtn: $("dockSwapLangBtn"),
  dockListenModeBtn: $("dockListenModeBtn"),
  dockListenModeLabel: $("dockListenModeLabel"),
  dockHangupBtn: $("dockHangupBtn"),
  geminiApiKey: $("geminiApiKey"),
  commitTranslateBtn: $("commitTranslateBtn"),
  listeningStatusTip: $("listeningStatusTip"),
};

/* ───── ID helper ───── */
function randomId() {
  return Math.random().toString(16).slice(2, 10) + "-" + Date.now().toString(16).slice(-6);
}

/* ───── Logging ───── */
function log(line, obj) {
  const ts = new Date().toISOString().slice(11, 19);
  const extra = obj ? ` ${JSON.stringify(obj)}` : "";
  if (els.log) {
    els.log.textContent = `${ts} ${line}${extra}\n` + els.log.textContent;
  }
}

/* ───── Status pills ───── */
function setPill(el, status) {
  if (!el) return;
  el.setAttribute("data-status", status);
}

/* ───── Pipeline stage chips ───── */
function setChip(chip, on) {
  if (!chip) return;
  chip.setAttribute("data-active", on ? "true" : "false");
}
function pulseChip(chip) {
  if (!chip) return;
  chip.classList.remove("pulse");
  void chip.offsetWidth;
  chip.classList.add("pulse");
}
function setLatency(ms) {
  if (!els.chipLatency) return;
  if (ms == null) {
    els.chipLatency.textContent = "— ms";
    els.chipLatency.removeAttribute("data-grade");
    return;
  }
  els.chipLatency.textContent = `${ms} ms`;
  const grade = ms < 800 ? "good" : ms < 1800 ? "ok" : "slow";
  els.chipLatency.setAttribute("data-grade", grade);
}

/* ───── App state ───── */
const state = {
  clientId: randomId(),
  ws: null,
  isMuted: false,
  callActive: false,
  transcriptEntries: [],
  audioStream: null,
  analyser: null,
  animFrame: null,
  translatedQueue: [],
  translatedPlaying: false,
};

if (els.clientId) els.clientId.textContent = state.clientId;

/* ───── Saved Gemini API Key ───── */
if (els.geminiApiKey) {
  const savedKey = localStorage.getItem("talkbridge_gemini_key");
  if (savedKey) els.geminiApiKey.value = savedKey;
  els.geminiApiKey.addEventListener("input", () => {
    localStorage.setItem("talkbridge_gemini_key", els.geminiApiKey.value.trim());
  });
}

/* ───── Language helpers ───── */
const LANG_NAME = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
};

// Kannada script transliterator
function transliterateKannada(text) {
  if (!text) return "";
  const kn_vowels = {'ಅ':'a','ಆ':'aa','ಇ':'i','ಈ':'ee','ಉ':'u','ಊ':'oo','ಋ':'ru','ಎ':'e','ಏ':'ee','ಐ':'ai','ಒ':'o','ಓ':'oo','ಔ':'au','ಅಂ':'am','ಅಃ':'aha'};
  const kn_matras = {'ಾ':'aa','ಿ':'i','ೀ':'ee','ು':'u','ೂ':'oo','ೃ':'ru','ೆ':'e','ೇ':'ee','ೈ':'ai','ೊ':'o','ೋ':'oo','ೌ':'au','ಂ':'m','ಃ':'h','್':''};
  const kn_cons = {'ಕ':'k','ಖ':'kh','ಗ':'g','ಘ':'gh','ಙ':'ng','ಚ':'ch','ಛ':'chh','ಜ':'j','ಝ':'jh','ಞ':'ny','ಟ':'t','ಠ':'th','ಡ':'d','ಢ':'dh','ಣ':'n','ತ':'th','ಥ':'thh','ದ':'d','ಧ':'dh','ನ':'n','ಪ':'p','ಫ':'ph','ಬ':'b','ಭ':'bh','ಮ':'m','ಯ':'y','ರ':'r','ಱ':'r','ಲ':'l','ವ':'v','ಶ':'sh','ಷ':'sh','ಸ':'s','ಹ':'h','ಳ':'l'};

  if (!/[\u0C80-\u0CFF]/.test(text)) return text;

  const res = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (kn_vowels[c]) {
      res.push(kn_vowels[c]);
    } else if (kn_cons[c]) {
      const base = kn_cons[c];
      if (i + 1 < text.length && kn_matras[text[i+1]] !== undefined) {
        res.push(base + kn_matras[text[i+1]]);
        i++;
      } else if (i + 1 < text.length && text[i+1] === '್') {
        res.push(base);
        i++;
      } else {
        res.push(base + 'a');
      }
    } else if (kn_matras[c]) {
      res.push(kn_matras[c]);
    } else {
      res.push(c);
    }
    i++;
  }
  return res.join('').trim();
}

function formatReadableText(text, lang) {
  return (text || "").trim();
}

function getLangParams() {
  const my = (els.myLang?.value || "en").trim();
  let target = (els.theyHearLang?.value || (my === "kn" ? "en" : "kn")).trim();
  if (target === my) {
    target = my === "en" ? "kn" : (my === "kn" ? "en" : "en");
    if (els.theyHearLang) els.theyHearLang.value = target;
  }
  return { source_lang: my, target_lang: target, tts_lang: target };
}

function updateLanguageBadges() {
  const params = getLangParams();
  const my = params.source_lang;
  const target = params.target_lang;

  if (els.localLangBadge) {
    els.localLangBadge.textContent = `Speaks ${LANG_NAME[my] || my}`;
  }
  if (els.remoteLangBadge) {
    els.remoteLangBadge.textContent = `Hears ${LANG_NAME[target] || target}`;
  }
  if (els.translationModeHint) {
    els.translationModeHint.textContent = `${LANG_NAME[my] || my} ➔ ${LANG_NAME[target] || target}`;
  }

  if (speechEngine && speechEngine.recognizer) {
    speechEngine.updateLanguage();
  }
}

els.myLang?.addEventListener("change", updateLanguageBadges);
els.theyHearLang?.addEventListener("change", updateLanguageBadges);

function swapLanguages() {
  const params = getLangParams();
  const oldMy = params.source_lang;
  const oldTarget = params.target_lang;

  if (els.myLang) els.myLang.value = oldTarget;
  if (els.theyHearLang) els.theyHearLang.value = oldMy;

  updateLanguageBadges();
  els.swapLangBtn?.classList.add("spin");
  setTimeout(() => els.swapLangBtn?.classList.remove("spin"), 500);
  log("languages_swapped", { my: oldTarget, target: oldMy });
}

els.swapLangBtn?.addEventListener("click", swapLanguages);
els.dockSwapLangBtn?.addEventListener("click", swapLanguages);

/* ───── Call timer (Stopwatch) ───── */
let callTimerInterval = null;
let callStartTime = null;

function startCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callStartTime = Date.now();
  if (els.callTimer) {
    els.callTimer.classList.add("active");
    els.callTimer.textContent = "00:00";
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      els.callTimer.textContent = `${mm}:${ss}`;
    }, 1000);
  }
}

function stopCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = null;
  callStartTime = null;
  if (els.callTimer) {
    els.callTimer.textContent = "00:00";
    els.callTimer.classList.remove("active");
  }
}

/* ───── Transcript Panel ───── */
function updateTranscriptCount() {
  if (els.transcriptCount) {
    const count = state.transcriptEntries.length;
    els.transcriptCount.textContent = `${count} message${count === 1 ? '' : 's'}`;
  }
}

window.playEntryAudio = function(b64, mime) {
  if (!b64) return;
  try {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime || "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
  } catch (e) {
    log("play_entry_audio_err", { error: String(e) });
  }
};

function addTranscriptEntry(type, text, lang, tts_b64 = null, tts_mime = null) {
  if (!text || !text.trim()) return;
  const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.transcriptEntries.push({ type, text, lang, ts });

  if (els.transcriptPlaceholder) {
    els.transcriptPlaceholder.style.display = "none";
  }

  const card = document.createElement("div");
  card.className = `transcript-entry ${type}`;

  const langLabel = LANG_NAME[lang] || lang.toUpperCase();
  const cleanText = text.trim();

  let phoneticHtml = "";
  if (lang === "kn" || /[\u0C80-\u0CFF]/.test(cleanText)) {
    const roman = transliterateKannada(cleanText);
    if (roman && roman !== cleanText) {
      phoneticHtml = `<div class="entry-romanized" style="font-size: 0.8rem; color: #94a3b8; font-style: italic; margin-top: 3px;">📖 Pronunciation: ${roman}</div>`;
    }
  }

  let playButtonHtml = "";
  if (type === "translated" && tts_b64) {
    window._latestTtsB64 = tts_b64;
    window._latestTtsMime = tts_mime || "audio/mpeg";
    playButtonHtml = `
      <button class="entry-audio-btn" onclick="window.playEntryAudio(window._latestTtsB64, window._latestTtsMime)" title="Replay natural voice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        Play Voice
      </button>
    `;
  }

  card.innerHTML = `
    <div class="entry-meta">
      <span class="entry-label">${type === "original" ? "You (Spoken)" : "Live Translation"}</span>
      <span class="entry-lang">${langLabel}</span>
      <span class="entry-ts">${ts}</span>
    </div>
    <div class="entry-text">${cleanText}</div>
    ${phoneticHtml}
    ${playButtonHtml}
  `;

  if (els.transcriptPanel) {
    els.transcriptPanel.appendChild(card);
    els.transcriptPanel.scrollTop = els.transcriptPanel.scrollHeight;
  }
  updateTranscriptCount();
}

function clearTranscript() {
  state.transcriptEntries = [];
  if (els.transcriptPanel) {
    els.transcriptPanel.innerHTML = '<div class="transcript-placeholder" id="transcriptPlaceholder">Live transcript will appear here as you speak...</div>';
    els.transcriptPlaceholder = $("transcriptPlaceholder");
  }
  updateTranscriptCount();
}

function copyTranscript() {
  const text = state.transcriptEntries
    .map((e) => `[${e.ts}] (${e.type === "original" ? "Spoken" : "Translation"}) [${e.lang}]: ${e.text}`)
    .join("\n");
  navigator.clipboard.writeText(text).then(() => {
    const btn = els.copyTranscriptBtn;
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = "✓ Copied";
      setTimeout(() => (btn.innerHTML = orig), 2000);
    }
  });
}

els.clearTranscriptBtn?.addEventListener("click", clearTranscript);
els.copyTranscriptBtn?.addEventListener("click", copyTranscript);

/* ───── Share Room Link ───── */
els.shareRoomBtn?.addEventListener("click", () => {
  const room = (els.roomId?.value || "demo-room").trim() || "demo-room";
  const url = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(room)}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = els.shareRoomBtn;
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = `<span>✓ Link Copied!</span>`;
      setTimeout(() => (btn.innerHTML = orig), 2200);
    }
  });
});

if (window.location.hash) {
  const hashRoom = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (hashRoom && els.roomId) els.roomId.value = hashRoom;
}

/* ───── Audio Output Queue (Zero Echo & Pristine Clarity) ───── */
function queueTranslatedAudio(mime, b64) {
  try {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime || "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    state.translatedQueue.push(url);
    playNextTranslated();
  } catch (e) {
    log("queue_tts_error", { error: String(e) });
  }
}

function playNextTranslated() {
  if (state.translatedPlaying) return;
  const url = state.translatedQueue.shift();
  if (!url) return;

  // 1. Immediately pause microphone before audio plays (prevents speaker feedback)
  speechEngine.pauseForAudio();
  state.translatedPlaying = true;
  state.ttsCooldownUntil = Date.now() + 30000; // Guard during playback

  const audioEl = els.translatedAudio || new Audio();
  audioEl.src = url;

  const onEnded = () => {
    URL.revokeObjectURL(url);
    state.translatedPlaying = false;
    state.ttsCooldownUntil = Date.now() + 800; // 800ms echo clearance buffer
    setChip(els.chipTts, false);

    if (state.translatedQueue.length > 0) {
      playNextTranslated();
    } else {
      setTimeout(() => {
        if (!state.translatedPlaying && state.translatedQueue.length === 0) {
          speechEngine.resumeAfterAudio();
        }
      }, 800);
    }
  };

  audioEl.onended = onEnded;
  audioEl.onerror = onEnded;
  audioEl.play().catch(onEnded);
}

/* ───── Real-Time Speech Recognition Engine ───── */
const speechEngine = {
  recognizer: null,
  active: false,
  isPausedForPlayback: false,
  _lastProcessedText: "",
  _currentSpeechBuffer: "",
  _translateDebounce: null,

  init() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      log("speech_rec_not_supported");
      if (els.streamingWordTicker) {
        els.streamingWordTicker.textContent = "Web Speech API not supported in this browser. Use Chrome/Edge.";
      }
      return;
    }
    try {
      this.recognizer = new SpeechRec();
      this.recognizer.continuous = true;
      this.recognizer.interimResults = true;
      this.recognizer.maxAlternatives = 1;
      this.updateLanguage();

      this.recognizer.onstart = () => {
        this.active = true;
        setChip(els.chipAsr, true);
        log("speech_rec_started");
      };

      this.recognizer.onresult = (event) => {
        // Drop any voice input during playback or echo cooldown
        if (this.isPausedForPlayback || state.translatedPlaying || Date.now() < (state.ttsCooldownUntil || 0)) {
          return;
        }

        const params = getLangParams();
        const my = params.source_lang;

        let accumulated = "";
        for (let i = 0; i < event.results.length; ++i) {
          accumulated += event.results[i][0].transcript + " ";
        }

        const currentWords = accumulated.trim();
        if (currentWords && !this.isPausedForPlayback) {
          this._currentSpeechBuffer = currentWords;

          if (els.streamingWordTicker) {
            els.streamingWordTicker.textContent = formatReadableText(currentWords, my);
            els.streamingWordTicker.className = "streaming-text";
          }
          if (els.listeningStatusTip) {
            els.listeningStatusTip.textContent = "🎙️ Listening... (Speak freely in full sentences, translates after 1.5s pause or press Space)";
          }
          if (els.localPulseRing) {
            els.localPulseRing.classList.add("active-speech");
            clearTimeout(this._pulseTimeout);
            this._pulseTimeout = setTimeout(() => {
              els.localPulseRing?.classList.remove("active-speech");
            }, 800);
          }

          // Forward live interim speech to peer in room
          if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            sendSignal({
              type: "peer-interim",
              data: { text: currentWords, isInterim: true, lang: my },
            });
          }

          // 1.5s natural paragraph pause silence detector (allows continuous full paragraphs)
          clearTimeout(this._translateDebounce);
          this._translateDebounce = setTimeout(() => {
            if (!this.isPausedForPlayback && this._currentSpeechBuffer.trim().length > 2) {
              this.commitTranslation();
            }
          }, 1500);
        }
      };

      this.recognizer.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          log("speech_rec_error", { error: e.error });
        }
      };

      this.recognizer.onend = () => {
        if (this.active && !this.isPausedForPlayback) {
          try {
            setTimeout(() => {
              if (this.active && !this.isPausedForPlayback) {
                try { this.recognizer.start(); } catch {}
              }
            }, 100);
          } catch {}
        }
      };
    } catch (e) {
      log("speech_rec_init_failed", { error: String(e) });
    }
  },

  updateLanguage() {
    if (!this.recognizer) return;
    const my = (els.myLang?.value || "en").trim();
    const langMap = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };
    const newLang = langMap[my] || "en-IN";
    if (this.recognizer.lang !== newLang) {
      this.recognizer.lang = newLang;
      log("speech_rec_lang_updated", { lang: newLang });
      if (this.active && !this.isPausedForPlayback) {
        try {
          this.recognizer.abort();
          setTimeout(() => { if (this.active) this.start(); }, 150);
        } catch {}
      }
    }
  },

  pauseForAudio() {
    this.isPausedForPlayback = true;
    clearTimeout(this._translateDebounce);
    if (this.recognizer) {
      try { this.recognizer.abort(); } catch {}
    }
  },

  resumeAfterAudio() {
    this.isPausedForPlayback = false;
    if (this.active) {
      try { this.recognizer.start(); } catch {}
    }
  },

  start() {
    if (!this.recognizer) this.init();
    if (this.recognizer) {
      this.active = true;
      this.isPausedForPlayback = false;
      try {
        const my = (els.myLang?.value || "en").trim();
        const langMap = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };
        this.recognizer.lang = langMap[my] || "en-IN";
        this.recognizer.start();
      } catch (e) {}
    }
  },

  stop() {
    this.active = false;
    this.isPausedForPlayback = false;
    clearTimeout(this._translateDebounce);
    if (this.recognizer) {
      try { this.recognizer.abort(); } catch {}
    }
    if (els.streamingWordTicker) {
      els.streamingWordTicker.textContent = "Waiting for voice input...";
      els.streamingWordTicker.className = "streaming-text";
    }
    setChip(els.chipAsr, false);
  },

  commitTranslation() {
    clearTimeout(this._translateDebounce);
    const textToTranslate = (this._currentSpeechBuffer || "").trim();
    if (!textToTranslate || textToTranslate.length < 2 || textToTranslate === this._lastProcessedText) {
      return;
    }
    this._lastProcessedText = textToTranslate;
    this._currentSpeechBuffer = "";

    if (els.listeningStatusTip) {
      els.listeningStatusTip.textContent = "⚡ Translating full thought...";
    }
    this.translateAndSpeak(textToTranslate);
  },

  async translateAndSpeak(text) {
    if (!text) return;
    const params = getLangParams();
    const my = params.source_lang;
    const target = params.target_lang;

    const startTime = performance.now();
    setChip(els.chipAsr, false);
    setChip(els.chipMt, true);
    pulseChip(els.chipMt);

    // 1. Add Original Bubble
    addTranscriptEntry("original", text, my);

    try {
      const geminiKey = (els.geminiApiKey?.value || "").trim();
      const res = await fetch("/translate-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          src_lang: my,
          tgt_lang: target,
          tts: true,
          gemini_api_key: geminiKey || undefined,
        }),
      });

      setChip(els.chipMt, false);

      if (res.ok) {
        const data = await res.json();
        const translatedText = data.translated || text;

        // 2. Add Translated Bubble
        addTranscriptEntry("translated", translatedText, target, data.tts_b64, data.tts_mime);

        // 3. Subtitle Row
        if (els.streamingWordTranslation) {
          els.streamingWordTranslation.textContent = formatReadableText(translatedText, target);
        }

        // 4. Latency
        setLatency(Math.round(performance.now() - startTime));

        // 5. Play Voice Audio locally
        if (data.tts_b64) {
          setChip(els.chipTts, true);
          pulseChip(els.chipTts);
          queueTranslatedAudio(data.tts_mime || "audio/mpeg", data.tts_b64);

          // Forward translation to room peers
          if (state.ws && state.ws.readyState === WebSocket.OPEN) {
            sendSignal({
              type: "peer-translation",
              sender: state.clientId,
              data: {
                original: text,
                translated: translatedText,
                src_lang: my,
                tgt_lang: target,
                tts_b64: data.tts_b64,
                tts_mime: data.tts_mime,
              },
            });
            log("sent_translation_to_peer", { target, text: translatedText });
          }
        }
      }
    } catch (err) {
      log("translate_error", { error: String(err) });
      setChip(els.chipMt, false);
      setChip(els.chipTts, false);
    }
  }
};

speechEngine.init();

els.commitTranslateBtn?.addEventListener("click", () => {
  speechEngine.commitTranslation();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "SELECT") {
    if (speechEngine._currentSpeechBuffer && speechEngine._currentSpeechBuffer.trim().length > 2) {
      e.preventDefault();
      speechEngine.commitTranslation();
    }
  }
});

/* ───── Waveform Visualizer ───── */
async function startVisualizer() {
  if (state.audioStream) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    state.audioStream = stream;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);

    const canvas = els.waveformCanvas;
    if (!canvas) return;
    const canvasCtx = canvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      state.animFrame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const avg = sum / bufferLength;

      if (avg > 15) {
        els.micIndicator?.classList.add("speaking");
        els.localPulseRing?.classList.add("active-speech");
      } else {
        els.micIndicator?.classList.remove("speaking");
      }

      canvasCtx.fillStyle = "rgba(5, 8, 20, 0.4)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        const grad = canvasCtx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        grad.addColorStop(0, "#818cf8");
        grad.addColorStop(1, "#38bdf8");

        canvasCtx.fillStyle = grad;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth + 1;
      }
    }
    draw();
  } catch (e) {
    log("visualizer_mic_error", { error: String(e) });
  }
}

function stopVisualizer() {
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  if (state.audioStream) {
    state.audioStream.getTracks().forEach((t) => t.stop());
    state.audioStream = null;
  }
}

/* ───── WebSocket Room Signaling ───── */
function sendSignal(msg) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(msg));
  }
}

function joinRoom() {
  return new Promise((resolve) => {
    const roomId = (els.roomId?.value || "demo-room").trim() || "demo-room";
    const loc = window.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${loc.host}/ws/signaling/${encodeURIComponent(roomId)}/${encodeURIComponent(state.clientId)}`;

    setPill(els.signalingStatus, "bad");
    if (els.joinBtn) els.joinBtn.innerHTML = `<span class="btn-spinner"></span> Connecting...`;

    try {
      if (state.ws) {
        try { state.ws.close(); } catch {}
      }
      const ws = new WebSocket(url);
      state.ws = ws;

      ws.onopen = () => {
        setPill(els.signalingStatus, "ok");
        if (els.joinBtn) {
          els.joinBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Joined (${roomId})`;
          els.joinBtn.classList.add("btn-joined");
        }
        log("signaling connected", { roomId, clientId: state.clientId });
        resolve(true);
      };

      ws.onclose = () => {
        setPill(els.signalingStatus, "off");
        if (els.joinBtn) {
          els.joinBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg> Join Room`;
          els.joinBtn.classList.remove("btn-joined");
        }
        log("signaling closed");
        resolve(false);
      };

      ws.onerror = (ev) => {
        setPill(els.signalingStatus, "bad");
        if (els.joinBtn) {
          els.joinBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg> Retry Join`;
          els.joinBtn.classList.remove("btn-joined");
        }
        resolve(false);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          handleSignalMessage(msg);
        } catch (e) {}
      };
    } catch (err) {
      resolve(false);
    }
  });
}

function handleSignalMessage(msg) {
  if (!msg || msg.sender === state.clientId) {
    // Ignore self-broadcast message (prevents echo / duplicate audio)
    return;
  }
  if (msg.type === "peer-interim") {
    if (msg.data?.text && els.streamingWordTicker) {
      els.streamingWordTicker.textContent = formatReadableText(msg.data.text, msg.data.lang);
      els.streamingWordTicker.className = "streaming-text interim";
    }
    if (els.remotePulseRing) {
      els.remotePulseRing.classList.add("active-speech");
      setTimeout(() => els.remotePulseRing?.classList.remove("active-speech"), 700);
    }
  } else if (msg.type === "peer-translation") {
    const data = msg.data;
    if (!data) return;
    if (data.original) addTranscriptEntry("original", data.original, data.src_lang);
    if (data.translated) {
      addTranscriptEntry("translated", data.translated, data.tgt_lang, data.tts_b64, data.tts_mime);
      if (els.streamingWordTranslation) {
        els.streamingWordTranslation.textContent = formatReadableText(data.translated, data.tgt_lang);
      }
      if (els.streamingWordTicker) {
        els.streamingWordTicker.textContent = formatReadableText(data.original || data.translated, data.src_lang);
      }
    }
    if (els.remotePulseRing) {
      els.remotePulseRing.classList.add("active-speech");
      setTimeout(() => els.remotePulseRing?.classList.remove("active-speech"), 1200);
    }
    if (data.tts_b64) {
      setChip(els.chipTts, true);
      pulseChip(els.chipTts);
      queueTranslatedAudio(data.tts_mime || "audio/mpeg", data.tts_b64);
    }
  }
}

/* ───── Main Call Controls ───── */
async function startCall() {
  log("startCall triggered");

  // 1. Immediately activate Stopwatch Timer & Status UI
  state.callActive = true;
  setPill(els.callStatus, "ok");
  startCallTimer();

  if (els.startBtn) {
    els.startBtn.innerHTML = `🎙️ Voice Translation Active`;
    els.startBtn.classList.add("btn-joined");
  }
  if (els.hangupBtn) els.hangupBtn.disabled = false;
  if (els.dockHangupBtn) els.dockHangupBtn.disabled = false;
  if (els.micIndicator) els.micIndicator.classList.add("active");

  // 2. Start Speech Recognition
  speechEngine.start();

  // 3. Start Waveform Visualizer
  startVisualizer().catch(() => {});

  // 4. Auto-connect room in background
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    joinRoom().catch(() => {});
  }
}

function hangup() {
  log("hangup triggered");
  state.callActive = false;

  speechEngine.stop();
  stopVisualizer();
  stopCallTimer();

  if (els.startBtn) {
    els.startBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg> Start Voice Translation`;
    els.startBtn.classList.remove("btn-joined");
  }
  if (els.hangupBtn) els.hangupBtn.disabled = true;
  if (els.dockHangupBtn) els.dockHangupBtn.disabled = true;
  setPill(els.callStatus, "off");
  els.micIndicator?.classList.remove("active");
}

/* ───── Mute Control ───── */
function toggleMicMute() {
  state.isMuted = !state.isMuted;
  if (state.isMuted) {
    speechEngine.pauseForAudio();
  } else {
    speechEngine.resumeAfterAudio();
  }
  if (els.dockMuteBtn) els.dockMuteBtn.classList.toggle("active-muted", state.isMuted);
  if (els.dockMicLabel) els.dockMicLabel.textContent = state.isMuted ? "Unmute" : "Mute";
  log("mic_mute_toggled", { muted: state.isMuted });
}

els.dockMuteBtn?.addEventListener("click", toggleMicMute);

/* ───── Wire Global Handlers & Buttons ───── */
window.joinRoom = joinRoom;
window.startCall = startCall;
window.hangup = hangup;

els.joinBtn?.addEventListener("click", joinRoom);
els.startBtn?.addEventListener("click", startCall);
els.hangupBtn?.addEventListener("click", hangup);
els.dockHangupBtn?.addEventListener("click", hangup);

/* ───── Collapsible logs ───── */
els.logsToggle?.addEventListener("click", () => {
  const card = els.logsToggle.closest(".logs-card");
  card?.classList.toggle("collapsed");
});

/* ───── Sliding Reviews Carousel ───── */
(function initReviews() {
  const viewport = document.getElementById("reviewsViewport");
  const track = document.getElementById("reviewsTrack");
  const dotsContainer = document.getElementById("reviewsDots");
  const prevBtn = document.getElementById("reviewPrev");
  const nextBtn = document.getElementById("reviewNext");
  if (!viewport || !track || !dotsContainer) return;

  const slides = Array.from(track.querySelectorAll(".review-slide"));
  if (slides.length === 0) return;

  let index = 0;
  let autoTimer = null;
  let paused = false;
  const AUTO_MS = 5000;

  slides.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot" + (i === 0 ? " active" : "");
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Go to review ${i + 1}`);
    dot.addEventListener("click", () => goTo(i, { user: true }));
    dotsContainer.appendChild(dot);
  });
  const dots = Array.from(dotsContainer.children);

  function render() {
    track.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("active", i === index));
  }

  function goTo(i, opts = {}) {
    const n = slides.length;
    index = ((i % n) + n) % n;
    render();
    if (opts.user) restartAuto();
  }
  function next(opts) { goTo(index + 1, opts); }
  function prev(opts) { goTo(index - 1, opts); }

  function startAuto() {
    stopAuto();
    autoTimer = setInterval(() => { if (!paused) next(); }, AUTO_MS);
  }
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
  function restartAuto() { startAuto(); }

  prevBtn?.addEventListener("click", () => prev({ user: true }));
  nextBtn?.addEventListener("click", () => next({ user: true }));

  viewport.addEventListener("mouseenter", () => { paused = true; });
  viewport.addEventListener("mouseleave", () => { paused = false; });

  render();
  startAuto();
})();

// Initial language setup
updateLanguageBadges();

// Auto-connect room on initial load
setTimeout(() => {
  joinRoom().catch(() => {});
}, 300);
