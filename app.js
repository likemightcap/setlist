const STORAGE_KEY = "setlist-builder-sets-v1";
const AUDIO_DB_NAME = "setlist-builder-audio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE = "files";
const COUNT_IN_PREROLL_MS = 180;
const PLAY_SYNC_PREP_MS = 170;
const CLICK_ONSET_THRESHOLD = 0.02;
const BUFFER_ONSET_CACHE = new WeakMap();
const RENDER_SAMPLE_RATE = 48000;
const RENDER_DURATION_PAD_SEC = 0.25;
const RENDER_VALIDATION_TOLERANCE_MS = 25;
const BUILTIN_CLICK_ASSET_PATHS = {
  wood2: "assets/clicks/Woodblock.wav",
  cowbell: "assets/clicks/Cowbell-1.wav",
  cowbellStrong: "assets/clicks/Cowbell-2.wav",
  klank: "assets/clicks/Klank-3.wav",
  shaker: "assets/clicks/Korg-N1R-Shaker.wav"
};
const STRONG_BEAT_AUTO_BY_MAIN_SAMPLE = {
  beep: { sample: "beep", playbackRate: 1.14 },
  wood: { sample: "wood", playbackRate: 1.12 },
  wood2: { sample: "wood2", playbackRate: 1.12 },
  cowbell: { sample: "cowbellStrong", playbackRate: 1 },
  klank: { sample: "klank", playbackRate: 1.12 },
  shaker: { sample: "shaker", playbackRate: 1.12 }
};
const AUTO_STRONG_MAIN_SAMPLES = new Set(Object.keys(STRONG_BEAT_AUTO_BY_MAIN_SAMPLE));
const BUILTIN_CLICK_ASSET_ARRAY_BUFFER_CACHE = new Map();

const appState = {
  currentSet: newEmptySet(),
  savedSets: [],
  editingTrackId: null,
  activeType: "master",
  selectedTrackIndex: -1,
  playingTrackIndex: -1,
  playingHandle: null,
  confirmAction: null,
  renderStatusByTrackId: {},
  renderQueueRunning: false,
  installPromptEvent: null,
  renderProgress: {
    active: false,
    total: 0,
    done: 0,
    showBanner: false,
    hideTimerId: null,
    currentTrackId: null,
    currentTrackName: "",
    queuedTrackIds: [],
    doneTrackIds: [],
    lastMessage: "",
    lastMessageUntil: 0
  },
  playbackSessionId: 0,
  diagnostics: {
    enabled: false,
    tapCount: 0,
    tapResetTimer: null,
    events: []
  },
  wakeLock: {
    sentinel: null,
    requesting: false
  },
  dragReorder: {
    active: false,
    pointerId: null,
    sourceIndex: -1,
    targetIndex: -1,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    suppressClick: false,
    sourceRow: null,
    placeholder: null
  },
  playbackVisual: {
    active: false,
    sessionId: null,
    trackId: null,
    timerId: null,
    countInBeats: 0,
    beatDurationMs: 0,
    countInStartMs: 0,
    countInEndMs: 0,
    trackStartMs: 0,
    trackEndMs: 0,
    trackDurationSec: 0,
    phase: "idle",
    countDisplay: 0,
    progressRatio: 0,
    remainingSec: 0
  }
};

const els = {
  setNameLabel: document.getElementById("setNameLabel"),
  installAppBtn: document.getElementById("installAppBtn"),
  renameSetBtn: document.getElementById("renameSetBtn"),
  trackList: document.getElementById("trackList"),
  renderQueueBanner: document.getElementById("renderQueueBanner"),
  playbackCueOverlay: document.getElementById("playbackCueOverlay"),
  playbackCueNumber: document.getElementById("playbackCueNumber"),
  addTrackBtn: document.getElementById("addTrackBtn"),
  transportPlayBtn: document.getElementById("transportPlayBtn"),
  transportStopBtn: document.getElementById("transportStopBtn"),
  transportContinuousBtn: document.getElementById("transportContinuousBtn"),
  renderAllBtn: document.getElementById("renderAllBtn"),
  newSetBtn: document.getElementById("newSetBtn"),
  loadSetBtn: document.getElementById("loadSetBtn"),
  saveSetBtn: document.getElementById("saveSetBtn"),
  trackModal: document.getElementById("trackModal"),
  playModal: document.getElementById("playModal"),
  loadModal: document.getElementById("loadModal"),
  confirmModal: document.getElementById("confirmModal"),
  contextMenu: document.getElementById("contextMenu"),
  typeMasterBtn: document.getElementById("typeMasterBtn"),
  typeBuiltBtn: document.getElementById("typeBuiltBtn"),
  trackForm: document.getElementById("trackForm"),
  trackNameInput: document.getElementById("trackNameInput"),
  mainAudioInput: document.getElementById("mainAudioInput"),
  mainAudioFileState: document.getElementById("mainAudioFileState"),
  masterCountInInput: document.getElementById("masterCountInInput"),
  masterCountInFields: document.getElementById("masterCountInFields"),
  masterCountInBeatsInput: document.getElementById("masterCountInBeatsInput"),
  masterCountInBpmInput: document.getElementById("masterCountInBpmInput"),
  masterClickSampleInput: document.getElementById("masterClickSampleInput"),
  masterCountInFileInput: document.getElementById("masterCountInFileInput"),
  masterCountInFileState: document.getElementById("masterCountInFileState"),
  countInInput: document.getElementById("countInInput"),
  countInBeatsInput: document.getElementById("countInBeatsInput"),
  countInBpmInput: document.getElementById("countInBpmInput"),
  clickSampleInput: document.getElementById("clickSampleInput"),
  customCountInFileInput: document.getElementById("customCountInFileInput"),
  customCountInFileState: document.getElementById("customCountInFileState"),
  mainClickSampleInput: document.getElementById("mainClickSampleInput"),
  customMainClickFileInput: document.getElementById("customMainClickFileInput"),
  customMainClickFileState: document.getElementById("customMainClickFileState"),
  strongBeatEnabledInput: document.getElementById("strongBeatEnabledInput"),
  strongBeatRow: document.getElementById("strongBeatRow"),
  strongBeatClickSampleInput: document.getElementById("strongBeatClickSampleInput"),
  customStrongBeatFileInput: document.getElementById("customStrongBeatFileInput"),
  customStrongBeatFileState: document.getElementById("customStrongBeatFileState"),
  splitOutputInput: document.getElementById("splitOutputInput"),
  clickChannelInput: document.getElementById("clickChannelInput"),
  backingChannelInput: document.getElementById("backingChannelInput"),
  addSectionBtn: document.getElementById("addSectionBtn"),
  sectionList: document.getElementById("sectionList"),
  playTrackName: document.getElementById("playTrackName"),
  playTrackMeta: document.getElementById("playTrackMeta"),
  setSearchInput: document.getElementById("setSearchInput"),
  setSortInput: document.getElementById("setSortInput"),
  savedSetList: document.getElementById("savedSetList"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn")
};

init();

function init() {
  loadSavedSets();
  wireEvents();
  initInstallPrompt();
  wireWakeLockLifecycle();
  initDiagnosticsToggle();
  render();
  requestPersistentStorage();
  requestScreenWakeLock();
  queueEnsureCurrentSetRendered({ forceAll: false });
  registerServiceWorker();
}

function canUseWakeLock() {
  return !!navigator.wakeLock && typeof navigator.wakeLock.request === "function";
}

async function requestScreenWakeLock() {
  if (!canUseWakeLock() || document.hidden) {
    return;
  }

  if (appState.wakeLock.sentinel || appState.wakeLock.requesting) {
    return;
  }

  appState.wakeLock.requesting = true;
  try {
    const sentinel = await navigator.wakeLock.request("screen");
    appState.wakeLock.sentinel = sentinel;
    sentinel.addEventListener("release", () => {
      if (appState.wakeLock.sentinel === sentinel) {
        appState.wakeLock.sentinel = null;
      }
      if (!document.hidden) {
        requestScreenWakeLock();
      }
    });
  } catch {
    // Best-effort only; unsupported or denied environments keep default behavior.
  } finally {
    appState.wakeLock.requesting = false;
  }
}

async function releaseScreenWakeLock() {
  const sentinel = appState.wakeLock.sentinel;
  appState.wakeLock.sentinel = null;
  if (!sentinel) {
    return;
  }

  try {
    await sentinel.release();
  } catch {
    // Ignore release failures.
  }
}

function wireWakeLockLifecycle() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      releaseScreenWakeLock();
      return;
    }
    requestScreenWakeLock();
  });

  window.addEventListener("focus", () => {
    requestScreenWakeLock();
  });

  window.addEventListener("pagehide", () => {
    releaseScreenWakeLock();
  });

  document.addEventListener("pointerdown", () => {
    requestScreenWakeLock();
  });

  document.addEventListener("keydown", () => {
    requestScreenWakeLock();
  });
}

async function requestPersistentStorage() {
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    return;
  }

  try {
    await navigator.storage.persist();
  } catch {
    // Best-effort only; app continues if persistence isn't granted.
  }
}

function wireEvents() {
  const bind = (el, event, handler) => {
    if (el) {
      el.addEventListener(event, handler);
    }
  };

  bind(els.renameSetBtn, "click", onRenameSet);
  bind(els.installAppBtn, "click", onInstallAppClick);
  bind(els.addTrackBtn, "click", () => openTrackModal("add"));
  bind(els.newSetBtn, "click", onNewSet);
  bind(els.saveSetBtn, "click", onSaveSet);
  bind(els.loadSetBtn, "click", () => {
    renderLoadList();
    openModal(els.loadModal);
  });

  bind(els.typeMasterBtn, "click", () => setTrackType("master"));
  bind(els.typeBuiltBtn, "click", () => setTrackType("built"));
  bind(els.trackForm, "submit", onSubmitTrack);
  bind(els.addSectionBtn, "click", () => addSectionRow());

  bind(els.masterCountInInput, "change", syncCountInControls);
  bind(els.countInInput, "change", syncCountInControls);
  bind(els.masterCountInFileInput, "change", () => {
    if (els.masterCountInFileInput.files.length > 0) {
      els.masterCountInFileInput.dataset.existing = "";
    }
    syncFilePresenceIndicators();
    syncCountInControls();
  });
  bind(els.customCountInFileInput, "change", () => {
    if (els.customCountInFileInput.files.length > 0) {
      els.customCountInFileInput.dataset.existing = "";
    }
    syncFilePresenceIndicators();
    syncCountInControls();
  });
  bind(els.customMainClickFileInput, "change", () => {
    if (els.customMainClickFileInput.files.length > 0) {
      els.customMainClickFileInput.dataset.existing = "";
    }
    syncFilePresenceIndicators();
    syncCountInControls();
  });
  bind(els.customStrongBeatFileInput, "change", () => {
    if (els.customStrongBeatFileInput.files.length > 0) {
      els.customStrongBeatFileInput.dataset.existing = "";
    }
    syncFilePresenceIndicators();
    syncCountInControls();
  });
  bind(els.mainAudioInput, "change", syncFilePresenceIndicators);
  bind(els.strongBeatEnabledInput, "change", syncCountInControls);
  bind(els.mainClickSampleInput, "change", syncCountInControls);

  bind(els.transportPlayBtn, "click", onPlayCurrentTrack);
  bind(els.transportStopBtn, "click", () => {
    stopPlayback();
    render();
  });
  bind(els.transportContinuousBtn, "click", () => {
    appState.currentSet.continuousPlay = !appState.currentSet.continuousPlay;
    render();
  });
  bind(els.renderAllBtn, "click", () => {
    queueEnsureCurrentSetRendered({ forceAll: true, showBanner: true });
    render();
  });

  bind(els.setSearchInput, "input", renderLoadList);
  bind(els.setSortInput, "change", renderLoadList);

  bind(els.confirmCancelBtn, "click", () => closeModal(els.confirmModal));
  bind(els.confirmOkBtn, "click", async () => {
    if (typeof appState.confirmAction === "function") {
      await appState.confirmAction();
      appState.confirmAction = null;
    }
    closeModal(els.confirmModal);
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-close");
      const modal = document.getElementById(id);
      closeModal(modal);
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal")) {
      closeModal(event.target);
    }
  });

  syncCountInControls();
}

function isRunningStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function updateInstallButtonVisibility() {
  if (!els.installAppBtn) {
    return;
  }

  const canShow = !isRunningStandalone() && window.isSecureContext;
  els.installAppBtn.hidden = !canShow;
  els.installAppBtn.textContent = appState.installPromptEvent ? "Download App" : "Install App";
}

function initInstallPrompt() {
  updateInstallButtonVisibility();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    appState.installPromptEvent = event;
    updateInstallButtonVisibility();
  });

  window.addEventListener("appinstalled", () => {
    appState.installPromptEvent = null;
    updateInstallButtonVisibility();
  });
}

async function onInstallAppClick() {
  const promptEvent = appState.installPromptEvent;
  if (!promptEvent) {
    window.alert(
      "Chrome can suppress the native install prompt even when the app is installable.\n\n"
      + "To install now: Chrome menu (3 dots) -> Install app (or Add to Home screen)."
    );
    return;
  }

  try {
    await promptEvent.prompt();
    await promptEvent.userChoice;
  } catch {
    // Ignore failed prompt attempts.
  }

  appState.installPromptEvent = null;
  updateInstallButtonVisibility();
}

function initDiagnosticsToggle() {
  if (!els.setNameLabel) {
    return;
  }

  els.setNameLabel.addEventListener("click", () => {
    const diag = appState.diagnostics;
    diag.tapCount += 1;

    if (diag.tapResetTimer) {
      clearTimeout(diag.tapResetTimer);
    }

    diag.tapResetTimer = setTimeout(() => {
      diag.tapCount = 0;
    }, 1800);

    if (diag.tapCount >= 6) {
      diag.tapCount = 0;
      toggleDiagnostics();
    }
  });
}

function toggleDiagnostics() {
  appState.diagnostics.enabled = !appState.diagnostics.enabled;
  appState.diagnostics.events = [];

  const existing = document.getElementById("diagBadge");
  if (existing) {
    existing.remove();
  }

  if (appState.diagnostics.enabled) {
    const badge = document.createElement("div");
    badge.id = "diagBadge";
    badge.textContent = "DIAG ON";
    badge.style.position = "fixed";
    badge.style.top = "10px";
    badge.style.right = "10px";
    badge.style.zIndex = "999";
    badge.style.padding = "6px 10px";
    badge.style.borderRadius = "999px";
    badge.style.background = "#2f9e63";
    badge.style.color = "#fff";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "12px";
    document.body.appendChild(badge);
  }

  const stateText = appState.diagnostics.enabled ? "enabled" : "disabled";
  console.log(`[DIAG] timing diagnostics ${stateText}`);
}

function makeContextClock(context) {
  return {
    contextTimeAtCreate: context.currentTime,
    wallTimeAtCreate: performance.now()
  };
}

function expectedWallTimeMs(clock, whenSeconds) {
  return clock.wallTimeAtCreate + (whenSeconds - clock.contextTimeAtCreate) * 1000;
}

function recordDiagnosticEvent(event) {
  if (!appState.diagnostics.enabled) {
    return;
  }
  appState.diagnostics.events.push(event);
}

function dumpDiagnosticSummary(sessionId) {
  if (!appState.diagnostics.enabled) {
    return;
  }

  const events = appState.diagnostics.events.filter((event) => event.sessionId === sessionId);
  if (!events.length) {
    console.log(`[DIAG ${sessionId}] no timing events captured`);
    return;
  }

  const withDrift = events.filter((event) => Number.isFinite(event.driftMs));
  const maxAbsDrift = withDrift.length
    ? Math.max(...withDrift.map((event) => Math.abs(event.driftMs)))
    : null;

  const firstBeat = events.find((event) => event.label && event.label.includes("count-in beat 1"));
  console.log(`[DIAG ${sessionId}] events=${events.length} maxAbsDriftMs=${maxAbsDrift ?? "n/a"} firstCountInBeatDriftMs=${firstBeat?.driftMs ?? "n/a"}`);
  console.table(events.slice(0, 60));
}

function newEmptySet() {
  return {
    id: crypto.randomUUID(),
    name: "UNTITLED SET",
    tracks: [],
    continuousPlay: false,
    lastUsedAt: Date.now()
  };
}

function render() {
  normalizeSelectedTrack();
  const renderCompletionRatio = appState.renderProgress.total > 0
    ? Math.max(0, Math.min(1, appState.renderProgress.done / appState.renderProgress.total))
    : 0;
  if (els.setNameLabel) {
    els.setNameLabel.textContent = appState.currentSet.name || "UNTITLED SET";
  }
  if (els.transportContinuousBtn) {
    els.transportContinuousBtn.classList.toggle("active", !!appState.currentSet.continuousPlay);
    els.transportContinuousBtn.setAttribute("aria-pressed", String(!!appState.currentSet.continuousPlay));
  }
  if (els.transportPlayBtn) {
    els.transportPlayBtn.disabled = appState.selectedTrackIndex < 0;
  }
  if (els.transportStopBtn) {
    els.transportStopBtn.disabled = !appState.playingHandle;
  }
  if (els.renderAllBtn) {
    els.renderAllBtn.disabled = !!appState.renderQueueRunning;
    els.renderAllBtn.classList.toggle("busy", !!appState.renderQueueRunning);
    els.renderAllBtn.classList.toggle("render-progress", !!appState.renderQueueRunning);
    els.renderAllBtn.classList.toggle("render-complete", !appState.renderQueueRunning && isCurrentSetRenderedFully());
    els.renderAllBtn.style.setProperty("--render-progress", `${Math.round(renderCompletionRatio * 100)}%`);
    if (appState.renderQueueRunning) {
      const label = `Rendering ${appState.renderProgress.done}/${appState.renderProgress.total}`;
      els.renderAllBtn.setAttribute("aria-label", label);
      els.renderAllBtn.title = label;
    } else {
      els.renderAllBtn.setAttribute("aria-label", "Render all tracks");
      els.renderAllBtn.title = "Render all tracks";
    }
  }
  if (els.renderQueueBanner) {
    const now = Date.now();
    const running = !!appState.renderQueueRunning;
    const bannerEnabled = !!appState.renderProgress.showBanner;
    const showComplete = bannerEnabled && !running && appState.renderProgress.lastMessageUntil > now;

    if (!bannerEnabled || (!running && !showComplete)) {
      els.renderQueueBanner.hidden = true;
      els.renderQueueBanner.classList.remove("complete");
      els.renderQueueBanner.textContent = "";
    } else if (running) {
      const done = appState.renderProgress.done;
      const total = appState.renderProgress.total;
      const name = appState.renderProgress.currentTrackName || "Preparing...";
      els.renderQueueBanner.hidden = false;
      els.renderQueueBanner.classList.remove("complete");
      els.renderQueueBanner.textContent = `Rendering ${done}/${total} · ${name}`;
    } else {
      els.renderQueueBanner.hidden = false;
      els.renderQueueBanner.classList.add("complete");
      els.renderQueueBanner.textContent = appState.renderProgress.lastMessage;
    }
  }
  renderTrackRows();
  updatePlaybackVisualUI();
}

function isCurrentSetRenderedFully() {
  const buildTracks = (appState.currentSet.tracks || []).filter((track) => track.type === "built");
  if (!buildTracks.length) {
    return false;
  }
  return buildTracks.every((track) => {
    const rendered = track.built?.rendered;
    const validation = track.built?.renderValidation;
    return !!rendered?.ready && !!rendered?.clickFileId && !!rendered?.backingFileId && validation?.ok !== false;
  });
}

function renderTrackRows() {
  const rows = appState.currentSet.tracks.map((track, index) => {
    const row = document.createElement("article");
    row.className = "track-row";
    if (index === appState.selectedTrackIndex) {
      row.classList.add("selected");
    }
    row.dataset.trackId = track.id;
    row.dataset.index = String(index);

    const baseDurationSec = totalTrackSeconds(track);
    const playbackState = getTrackPlaybackState(track, index, baseDurationSec);
    const trackDuration = formatDuration(playbackState.remainingSec);
    const bpmValue = displayBpmForTrackCard(track);
    const status = getTrackRenderStatus(track);

    if (playbackState.playing) {
      row.classList.add("playing");
      row.style.setProperty("--play-progress", `${Math.round(playbackState.progressRatio * 100)}%`);
    }

    row.innerHTML = `
      <div class="track-handle" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="track-main">
        <div class="track-title-row">
          <h2>${escapeHtml(track.displayName)}</h2>
          <span class="render-chip ${escapeAttr(status.className)}">${escapeHtml(status.label)}</span>
        </div>
        <div class="track-time">${trackDuration}</div>
      </div>
      <div class="track-bpm">
        <span class="track-bpm-label">BPM</span>
        <span class="track-bpm-value">${escapeHtml(String(bpmValue))}</span>
      </div>
      <div class="track-actions">
        <button class="track-action-btn edit-track-btn" aria-label="Edit track">
          <img src="assets/edit-icon.png" alt="Edit track">
        </button>
        <button class="track-action-btn delete-track-btn" aria-label="Delete track">
          <img src="assets/delete-icon.png" alt="Delete track">
        </button>
      </div>
    `;

    row.addEventListener("click", (event) => {
      if (appState.dragReorder.suppressClick) {
        appState.dragReorder.suppressClick = false;
        return;
      }
      if (event.target.closest(".track-action-btn")) {
        return;
      }
      selectTrack(index);
    });

    row.querySelector(".edit-track-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      openTrackModal("edit", track.id);
    });

    row.querySelector(".delete-track-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      confirmDeleteTrack(track.id);
    });

    row.addEventListener("pointerdown", (event) => {
      beginTrackDrag(event, row, index);
    });

    return row;
  });

  els.trackList.replaceChildren(...rows);
}

function getTrackPlaybackState(track, index, baseDurationSec) {
  const visual = appState.playbackVisual;
  const isCurrentTrack =
    !!appState.playingHandle &&
    index === appState.playingTrackIndex &&
    !!visual.active &&
    visual.trackId === track.id;

  if (!isCurrentTrack) {
    return {
      playing: false,
      progressRatio: 0,
      remainingSec: baseDurationSec
    };
  }

  const inTrackPlayback = visual.phase === "track" || visual.phase === "complete";
  return {
    playing: inTrackPlayback,
    progressRatio: inTrackPlayback ? visual.progressRatio : 0,
    remainingSec: inTrackPlayback ? visual.remainingSec : baseDurationSec
  };
}

function renderPlaybackCueOverlay() {
  if (!els.playbackCueOverlay || !els.playbackCueNumber) {
    return;
  }

  const visual = appState.playbackVisual;
  const visible = !!visual.active && visual.phase === "countin" && visual.countDisplay > 0;

  if (!visible) {
    els.playbackCueOverlay.hidden = true;
    els.playbackCueOverlay.classList.remove("visible");
    els.playbackCueNumber.textContent = "";
    return;
  }

  els.playbackCueOverlay.hidden = false;
  els.playbackCueOverlay.classList.add("visible");
  els.playbackCueNumber.textContent = String(visual.countDisplay);
}

function applyPlaybackVisualToTrackRows() {
  if (!els.trackList) {
    return;
  }

  const visual = appState.playbackVisual;
  const rows = [...els.trackList.querySelectorAll(".track-row")];
  const activeTrackPhase = !!visual.active && (visual.phase === "track" || visual.phase === "complete");
  const playingTrack = activeTrackPhase
    ? appState.currentSet.tracks.find((item) => item.id === visual.trackId) || null
    : null;
  const liveBpmValue = playingTrack ? playbackBpmForTrack(playingTrack, visual) : null;

  rows.forEach((row) => {
    const isPlayingRow = activeTrackPhase && row.dataset.trackId === visual.trackId;
    if (isPlayingRow) {
      row.classList.add("playing");
      row.style.setProperty("--play-progress", `${Math.round(visual.progressRatio * 100)}%`);
      const timeEl = row.querySelector(".track-time");
      if (timeEl) {
        timeEl.textContent = formatDuration(visual.remainingSec);
      }
      const bpmEl = row.querySelector(".track-bpm-value");
      if (bpmEl && liveBpmValue !== null && liveBpmValue !== undefined) {
        bpmEl.textContent = String(liveBpmValue);
      }
      return;
    }

    row.classList.remove("playing");
    row.style.removeProperty("--play-progress");
  });
}

function playbackBpmForTrack(track, visual) {
  if (!track) {
    return null;
  }

  if (track.type === "master") {
    return displayBpmForTrackCard(track);
  }

  const durationSec = Math.max(0, Number(visual.trackDurationSec) || 0);
  const remainingSec = Math.max(0, Number(visual.remainingSec) || 0);
  const elapsedSec = Math.max(0, durationSec - remainingSec);
  return builtTrackBpmAtElapsedSec(track, elapsedSec);
}

function displayBpmForTrackCard(track) {
  if (!track) {
    return "---";
  }

  if (track.type === "master") {
    const countIn = track.masterCountIn || {};
    if (!countIn.enabled) {
      return "---";
    }
    const bpm = Number(countIn.bpm) || 0;
    return bpm > 0 ? Math.round(bpm) : "---";
  }

  return representativeBpm(track.built?.sections);
}

function builtTrackBpmAtElapsedSec(track, elapsedSec) {
  const sections = track.built?.sections || [];
  if (!sections.length) {
    return "-";
  }

  let cursorSec = 0;
  for (const section of sections) {
    const bpm = Number(section.bpm) || 120;
    const beatsPerBar = Number(String(section.timeSignature || "4/4").split("/")[0]) || 4;
    const sectionBeats = (Number(section.bars) || 1) * beatsPerBar;
    const sectionDurationSec = sectionBeats * (60 / bpm);
    if (elapsedSec < cursorSec + sectionDurationSec) {
      return Math.round(bpm);
    }
    cursorSec += sectionDurationSec;
  }

  const lastBpm = Number(sections[sections.length - 1]?.bpm) || 120;
  return Math.round(lastBpm);
}

function updatePlaybackVisualUI() {
  renderPlaybackCueOverlay();
  applyPlaybackVisualToTrackRows();
}

function startPlaybackVisual(track, sessionId, options = {}) {
  stopPlaybackVisualTimer();

  const countInBeats = Math.max(0, Number(options.countInBeats) || 0);
  const countInBpm = Math.max(20, Number(options.countInBpm) || 120);
  const countInPrerollMs = Math.max(0, Math.round((Number(options.countInPrerollSec) || 0) * 1000));
  const trackDurationSec = Math.max(0, Number(options.trackDurationSec) || 0);
  const explicitCountInStartMs = Number(options.countInStartWallMs);
  const explicitTrackStartMs = Number(options.trackStartWallMs);

  const nowMs = performance.now();
  const beatDurationMs = 60000 / countInBpm;
  const hasExplicitCountInStart = Number.isFinite(explicitCountInStartMs) && explicitCountInStartMs > 0;
  const hasExplicitTrackStart = Number.isFinite(explicitTrackStartMs) && explicitTrackStartMs > 0;
  const countInStartMs = hasExplicitCountInStart
    ? explicitCountInStartMs
    : (countInBeats > 0 ? nowMs + countInPrerollMs : nowMs);
  const countInEndMs = countInBeats > 0
    ? countInStartMs + (countInBeats * beatDurationMs)
    : (hasExplicitTrackStart ? explicitTrackStartMs : nowMs);
  const trackStartMs = hasExplicitTrackStart ? explicitTrackStartMs : countInEndMs;
  const trackEndMs = trackStartMs + (trackDurationSec * 1000);

  appState.playbackVisual.active = true;
  appState.playbackVisual.sessionId = sessionId;
  appState.playbackVisual.trackId = track.id;
  appState.playbackVisual.countInBeats = countInBeats;
  appState.playbackVisual.beatDurationMs = beatDurationMs;
  appState.playbackVisual.countInStartMs = countInStartMs;
  appState.playbackVisual.countInEndMs = countInEndMs;
  appState.playbackVisual.trackStartMs = trackStartMs;
  appState.playbackVisual.trackEndMs = trackEndMs;
  appState.playbackVisual.trackDurationSec = trackDurationSec;
  appState.playbackVisual.phase = countInBeats > 0 ? "countin" : "track";
  appState.playbackVisual.countDisplay = countInBeats > 0 ? countInBeats : 0;
  appState.playbackVisual.progressRatio = 0;
  appState.playbackVisual.remainingSec = trackDurationSec;

  tickPlaybackVisual();
  appState.playbackVisual.timerId = window.setInterval(tickPlaybackVisual, 50);
}

function stopPlaybackVisualTimer() {
  const timerId = appState.playbackVisual.timerId;
  if (timerId) {
    clearInterval(timerId);
    appState.playbackVisual.timerId = null;
  }
}

function resetPlaybackVisual() {
  stopPlaybackVisualTimer();
  appState.playbackVisual.active = false;
  appState.playbackVisual.sessionId = null;
  appState.playbackVisual.trackId = null;
  appState.playbackVisual.countInBeats = 0;
  appState.playbackVisual.beatDurationMs = 0;
  appState.playbackVisual.countInStartMs = 0;
  appState.playbackVisual.countInEndMs = 0;
  appState.playbackVisual.trackStartMs = 0;
  appState.playbackVisual.trackEndMs = 0;
  appState.playbackVisual.trackDurationSec = 0;
  appState.playbackVisual.phase = "idle";
  appState.playbackVisual.countDisplay = 0;
  appState.playbackVisual.progressRatio = 0;
  appState.playbackVisual.remainingSec = 0;
}

function tickPlaybackVisual() {
  const visual = appState.playbackVisual;
  if (!visual.active) {
    return;
  }

  const nowMs = performance.now();

  if (nowMs < visual.trackStartMs && visual.countInBeats > 0) {
    visual.phase = "countin";
    if (nowMs < visual.countInStartMs) {
      visual.countDisplay = visual.countInBeats;
      visual.progressRatio = 0;
      visual.remainingSec = visual.trackDurationSec;
      updatePlaybackVisualUI();
      return;
    }

    const elapsedInCountInMs = nowMs - visual.countInStartMs;
    const beatIndex = Math.floor(elapsedInCountInMs / visual.beatDurationMs);
    if (beatIndex >= 0 && beatIndex < visual.countInBeats) {
      visual.countDisplay = visual.countInBeats - beatIndex;
    } else {
      visual.countDisplay = 0;
    }
    visual.progressRatio = 0;
    visual.remainingSec = visual.trackDurationSec;
    updatePlaybackVisualUI();
    return;
  }

  visual.phase = "track";
  visual.countDisplay = 0;

  const durationSec = Math.max(0.001, visual.trackDurationSec);
  const elapsedSec = Math.max(0, (nowMs - visual.trackStartMs) / 1000);
  const remainingSec = Math.max(0, durationSec - elapsedSec);
  const progressRatio = Math.max(0, Math.min(1, elapsedSec / durationSec));

  visual.remainingSec = remainingSec;
  visual.progressRatio = progressRatio;
  if (remainingSec <= 0.001) {
    visual.phase = "complete";
  }

  updatePlaybackVisualUI();
}

function normalizeSelectedTrack() {
  const count = appState.currentSet.tracks.length;
  if (!count) {
    appState.selectedTrackIndex = -1;
    if (appState.playingTrackIndex >= 0) {
      appState.playingTrackIndex = -1;
    }
    return;
  }
  if (appState.selectedTrackIndex < 0 || appState.selectedTrackIndex >= count) {
    appState.selectedTrackIndex = 0;
  }
}

function selectTrack(index) {
  if (index < 0 || index >= appState.currentSet.tracks.length) {
    return;
  }
  appState.selectedTrackIndex = index;
  render();
}

function getTrackRenderStatus(track) {
  if (track.type === "master") {
    return { label: "AUDIO", className: "render-chip-master" };
  }

  const override = appState.renderStatusByTrackId[track.id];
  if (override === "rendering") {
    return { label: "RENDERING", className: "render-chip-rendering" };
  }
  if (override === "error") {
    return { label: "RENDER ERROR", className: "render-chip-error" };
  }

  if (appState.renderQueueRunning) {
    const queued = appState.renderProgress.queuedTrackIds || [];
    const doneIds = appState.renderProgress.doneTrackIds || [];
    if (queued.includes(track.id) && !doneIds.includes(track.id) && appState.renderProgress.currentTrackId !== track.id) {
      return { label: "QUEUED", className: "render-chip-queued" };
    }
  }

  const rendered = track.built?.rendered;
  const validation = track.built?.renderValidation;

  if (rendered?.ready && validation?.ok !== false) {
    return { label: "RENDERED OK", className: "render-chip-ok" };
  }
  if (rendered?.ready && validation?.ok === false) {
    return { label: "RENDER WARN", className: "render-chip-warn" };
  }
  if (rendered?.fallbackMode === "live") {
    return { label: "LIVE FALLBACK", className: "render-chip-warn" };
  }
  return { label: "NEEDS RENDER", className: "render-chip-pending" };
}

function beginTrackDrag(event, row, index) {
  if (!event.isPrimary) {
    return;
  }
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  if (event.target.closest(".track-action-btn")) {
    return;
  }

  const drag = appState.dragReorder;
  drag.active = false;
  drag.pointerId = event.pointerId;
  drag.sourceIndex = index;
  drag.targetIndex = index;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.sourceRow = row;

  try {
    row.setPointerCapture(event.pointerId);
  } catch {
    // Some browsers may throw when capture isn't available.
  }

  row.addEventListener("pointermove", onTrackDragMove);
  row.addEventListener("pointerup", onTrackDragEnd);
  row.addEventListener("pointercancel", onTrackDragCancel);
}

function onTrackDragMove(event) {
  const drag = appState.dragReorder;
  if (event.pointerId !== drag.pointerId || !drag.sourceRow) {
    return;
  }

  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.active && distance < 8) {
    return;
  }

  if (!drag.active) {
    startFloatingDrag(event);
    if (!drag.active) {
      return;
    }
  }

  event.preventDefault();
  drag.sourceRow.style.left = `${Math.round(event.clientX - drag.offsetX)}px`;
  drag.sourceRow.style.top = `${Math.round(event.clientY - drag.offsetY)}px`;

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".track-row");
  const placeholder = drag.placeholder;
  if (!placeholder || !target || target === drag.sourceRow) {
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const insertBefore = event.clientY < targetRect.top + (targetRect.height / 2);
  if (insertBefore) {
    if (target.previousElementSibling !== placeholder) {
      els.trackList.insertBefore(placeholder, target);
    }
  } else if (target.nextElementSibling !== placeholder) {
    els.trackList.insertBefore(placeholder, target.nextElementSibling);
  }

  drag.targetIndex = indexOfPlaceholder();
}

function onTrackDragEnd(event) {
  const drag = appState.dragReorder;
  if (event.pointerId !== drag.pointerId) {
    return;
  }

  if (drag.active && drag.sourceIndex !== drag.targetIndex) {
    reorderTrackByIndex(drag.sourceIndex, drag.targetIndex);
    drag.suppressClick = true;
    render();
  }

  clearTrackDragState();
}

function onTrackDragCancel(event) {
  const drag = appState.dragReorder;
  if (event.pointerId !== drag.pointerId) {
    return;
  }
  clearTrackDragState();
}

function clearTrackDragState() {
  const drag = appState.dragReorder;
  if (drag.sourceRow) {
    drag.sourceRow.classList.remove("dragging", "floating-drag");
    drag.sourceRow.style.left = "";
    drag.sourceRow.style.top = "";
    drag.sourceRow.style.width = "";
    drag.sourceRow.style.height = "";
    drag.sourceRow.removeEventListener("pointermove", onTrackDragMove);
    drag.sourceRow.removeEventListener("pointerup", onTrackDragEnd);
    drag.sourceRow.removeEventListener("pointercancel", onTrackDragCancel);
  }

  if (drag.placeholder) {
    drag.placeholder.remove();
  }
  if (els.trackList) {
    els.trackList.classList.remove("drag-active");
  }

  drag.active = false;
  drag.pointerId = null;
  drag.sourceIndex = -1;
  drag.targetIndex = -1;
  drag.startX = 0;
  drag.startY = 0;
  drag.offsetX = 0;
  drag.offsetY = 0;
  drag.sourceRow = null;
  drag.placeholder = null;
}

function startFloatingDrag(event) {
  const drag = appState.dragReorder;
  if (!drag.sourceRow || !els.trackList) {
    return;
  }

  const rowRect = drag.sourceRow.getBoundingClientRect();
  drag.offsetX = event.clientX - rowRect.left;
  drag.offsetY = event.clientY - rowRect.top;

  const placeholder = document.createElement("div");
  placeholder.className = "track-row-placeholder";
  placeholder.style.height = `${Math.round(rowRect.height)}px`;
  placeholder.dataset.placeholder = "true";
  els.trackList.insertBefore(placeholder, drag.sourceRow.nextSibling);

  drag.placeholder = placeholder;
  drag.active = true;
  drag.targetIndex = indexOfPlaceholder();

  drag.sourceRow.classList.add("dragging", "floating-drag");
  drag.sourceRow.style.width = `${Math.round(rowRect.width)}px`;
  drag.sourceRow.style.height = `${Math.round(rowRect.height)}px`;
  drag.sourceRow.style.left = `${Math.round(event.clientX - drag.offsetX)}px`;
  drag.sourceRow.style.top = `${Math.round(event.clientY - drag.offsetY)}px`;
  els.trackList.classList.add("drag-active");
}

function indexOfPlaceholder() {
  const drag = appState.dragReorder;
  if (!drag.placeholder || !els.trackList) {
    return drag.sourceIndex;
  }

  const children = [...els.trackList.children];
  const placeholderIndex = children.indexOf(drag.placeholder);
  if (placeholderIndex < 0) {
    return drag.sourceIndex;
  }

  let target = 0;
  for (let i = 0; i < placeholderIndex; i += 1) {
    const child = children[i];
    if (child === drag.sourceRow) {
      continue;
    }
    if (child.classList?.contains("track-row")) {
      target += 1;
    }
  }

  const maxIndex = Math.max(0, appState.currentSet.tracks.length - 1);
  return Math.max(0, Math.min(target, maxIndex));
}

function onRenameSet() {
  const name = window.prompt("Set name", appState.currentSet.name);
  if (!name) {
    return;
  }
  appState.currentSet.name = name.trim().toUpperCase();
  render();
}

function onNewSet() {
  stopPlayback();
  const response = window.confirm("Start a new set? Unsaved changes in the current set will remain in memory until you save a different set.");
  if (!response) {
    return;
  }
  appState.currentSet = newEmptySet();
  appState.renderStatusByTrackId = {};
  appState.selectedTrackIndex = -1;
  appState.playingTrackIndex = -1;
  render();
}

function onSaveSet() {
  const setName = appState.currentSet.name === "UNTITLED SET"
    ? window.prompt("Name this set", "My Live Set")
    : appState.currentSet.name;

  if (!setName) {
    return;
  }

  appState.currentSet.name = setName.trim().toUpperCase();
  appState.currentSet.lastUsedAt = Date.now();

  const existingIndex = appState.savedSets.findIndex((item) => item.id === appState.currentSet.id);
  if (existingIndex >= 0) {
    appState.savedSets[existingIndex] = structuredClone(appState.currentSet);
  } else {
    appState.savedSets.push(structuredClone(appState.currentSet));
  }

  persistSavedSets();
  render();
  queueEnsureCurrentSetRendered({ forceAll: false });
}

function loadSavedSets() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    appState.savedSets = [];
    return;
  }

  try {
    appState.savedSets = JSON.parse(raw);
  } catch {
    appState.savedSets = [];
  }
}

function persistSavedSets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.savedSets));
}

function queueEnsureCurrentSetRendered(options = { forceAll: false }) {
  if (appState.renderQueueRunning) {
    return;
  }

  clearRenderQueueBannerHideTimer();

  const buildTracks = (appState.currentSet.tracks || []).filter((track) => track.type === "built");
  appState.renderStatusByTrackId = {};
  appState.renderProgress.active = true;
  appState.renderProgress.total = buildTracks.length;
  appState.renderProgress.done = 0;
  appState.renderProgress.showBanner = !!options.showBanner;
  appState.renderProgress.currentTrackId = null;
  appState.renderProgress.currentTrackName = "Preparing...";
  appState.renderProgress.queuedTrackIds = buildTracks.map((track) => track.id);
  appState.renderProgress.doneTrackIds = [];
  appState.renderProgress.lastMessage = "";
  appState.renderProgress.lastMessageUntil = 0;
  appState.renderQueueRunning = true;
  render();
  ensureSetRendered(appState.currentSet, options)
    .catch(() => {
      // Keep UI usable; statuses will show render errors where relevant.
    })
    .finally(() => {
      appState.renderQueueRunning = false;
      appState.renderProgress.active = false;
      appState.renderProgress.currentTrackId = null;
      appState.renderProgress.currentTrackName = "";
      appState.renderProgress.done = appState.renderProgress.total;
      if (appState.renderProgress.showBanner) {
        appState.renderProgress.lastMessage = `Render complete · ${appState.renderProgress.total} tracks verified`;
        appState.renderProgress.lastMessageUntil = Date.now() + 2800;
        scheduleRenderQueueBannerHide(2800);
      } else {
        appState.renderProgress.lastMessage = "";
        appState.renderProgress.lastMessageUntil = 0;
        clearRenderQueueBannerHideTimer();
      }
      render();
    });
}

function clearRenderQueueBannerHideTimer() {
  const timerId = appState.renderProgress.hideTimerId;
  if (timerId) {
    clearTimeout(timerId);
    appState.renderProgress.hideTimerId = null;
  }
}

function scheduleRenderQueueBannerHide(delayMs) {
  clearRenderQueueBannerHideTimer();
  appState.renderProgress.hideTimerId = window.setTimeout(() => {
    appState.renderProgress.hideTimerId = null;
    appState.renderProgress.showBanner = false;
    appState.renderProgress.lastMessage = "";
    appState.renderProgress.lastMessageUntil = 0;
    render();
  }, Math.max(0, Number(delayMs) || 0));
}

async function ensureSetRendered(set, options = { forceAll: false }) {
  const tracks = set?.tracks || [];
  let changed = false;
  let processed = 0;

  for (const track of tracks) {
    if (track.type !== "built") {
      continue;
    }

    appState.renderProgress.currentTrackId = track.id;
    appState.renderProgress.currentTrackName = track.displayName || "Build Track";
    render();

    const stepStartMs = performance.now();
    const result = await ensureBuiltTrackRendered(track, options);
    changed = changed || result.changed;
    processed += 1;
    appState.renderProgress.done = processed;
    if (!appState.renderProgress.doneTrackIds.includes(track.id)) {
      appState.renderProgress.doneTrackIds.push(track.id);
    }

    if (options.forceAll) {
      const elapsed = performance.now() - stepStartMs;
      const minStepMs = 140;
      if (elapsed < minStepMs) {
        await waitMs(minStepMs - elapsed);
      }
    }

    render();
  }

  if (changed) {
    set.lastUsedAt = Date.now();
    const existingIndex = appState.savedSets.findIndex((item) => item.id === set.id);
    if (existingIndex >= 0) {
      appState.savedSets[existingIndex] = structuredClone(set);
    }
    persistSavedSets();
  }
}

async function ensureBuiltTrackRendered(track, options = { forceAll: false }) {
  const forceAll = !!options.forceAll;
  const rendered = track.built?.rendered;
  const validation = track.built?.renderValidation;
  let needsRender = forceAll || !rendered?.ready || !rendered?.clickFileId || !rendered?.backingFileId || validation?.ok === false;

  if (!needsRender) {
    const [clickFile, backingFile] = await Promise.all([
      getFileById(rendered.clickFileId),
      getFileById(rendered.backingFileId)
    ]);
    needsRender = !clickFile || !backingFile;
  }

  if (!needsRender) {
    delete appState.renderStatusByTrackId[track.id];
    return { changed: false };
  }

  appState.renderStatusByTrackId[track.id] = "rendering";
  render();

  try {
    const rerender = await renderAndPersistBuiltTrackAssets(track.built);
    track.built.rendered = rerender.rendered;
    track.built.renderValidation = rerender.validation;
    delete appState.renderStatusByTrackId[track.id];
    return { changed: true };
  } catch {
    appState.renderStatusByTrackId[track.id] = "error";
    return { changed: false };
  }
}

function renderLoadList() {
  const search = els.setSearchInput.value.trim().toLowerCase();
  const sort = els.setSortInput.value;

  let sets = appState.savedSets.filter((set) => set.name.toLowerCase().includes(search));

  sets.sort((a, b) => {
    if (sort === "name") {
      return a.name.localeCompare(b.name);
    }
    return (b.lastUsedAt || 0) - (a.lastUsedAt || 0);
  });

  if (!sets.length) {
    const empty = document.createElement("p");
    empty.textContent = "No saved sets found.";
    els.savedSetList.replaceChildren(empty);
    return;
  }

  const rows = sets.map((set) => {
    const row = document.createElement("div");
    row.className = "saved-set-item";

    const totalDuration = formatDuration(set.tracks.reduce((sum, track) => sum + totalTrackSeconds(track), 0));
    row.innerHTML = `
      <div class="saved-set-meta">
        <h3>${escapeHtml(set.name)}</h3>
        <p>${set.tracks.length} tracks | ${totalDuration}</p>
      </div>
      <button class="load-this" type="button">Load</button>
    `;

    row.querySelector(".load-this").addEventListener("click", () => {
      stopPlayback();
      appState.currentSet = structuredClone(set);
      appState.renderStatusByTrackId = {};
      appState.selectedTrackIndex = appState.currentSet.tracks.length ? 0 : -1;
      appState.playingTrackIndex = -1;
      appState.currentSet.lastUsedAt = Date.now();
      onSaveSet();
      closeModal(els.loadModal);
      render();
      queueEnsureCurrentSetRendered({ forceAll: false });
    });

    return row;
  });

  els.savedSetList.replaceChildren(...rows);
}

function openTrackModal(mode, trackId = null) {
  appState.editingTrackId = mode === "edit" ? trackId : null;
  appState.activeType = "master";

  els.trackForm.reset();
  els.masterCountInFileInput.dataset.existing = "";
  els.masterCountInFileInput.dataset.existingName = "";
  els.customCountInFileInput.dataset.existing = "";
  els.customCountInFileInput.dataset.existingName = "";
  els.customMainClickFileInput.dataset.existing = "";
  els.customMainClickFileInput.dataset.existingName = "";
  els.customStrongBeatFileInput.dataset.existing = "";
  els.customStrongBeatFileInput.dataset.existingName = "";
  els.sectionList.innerHTML = "";
  addSectionRow({ name: "Verse", bpm: 120, timeSignature: "4/4", bars: 8 });
  addSectionRow({ name: "Chorus", bpm: 120, timeSignature: "4/4", bars: 8 });
  syncCountInControls();

  if (mode === "edit") {
    const track = appState.currentSet.tracks.find((item) => item.id === trackId);
    if (!track) {
      return;
    }

    els.trackNameInput.value = track.displayName;
    setTrackType(track.type);

    if (track.type === "master") {
      els.mainAudioInput.dataset.existingName = track.audioName || "";
      els.masterCountInInput.checked = !!track.masterCountIn?.enabled;
      els.masterCountInBeatsInput.value = track.masterCountIn?.beats || 4;
      els.masterCountInBpmInput.value = track.masterCountIn?.bpm || 120;
      els.masterClickSampleInput.value = track.masterCountIn?.clickSample || "beep";
      els.masterCountInFileInput.dataset.existing = track.masterCountIn?.customFileId || "";
      els.masterCountInFileInput.dataset.existingName = track.masterCountIn?.customFileName || "";
    } else {
      els.mainAudioInput.dataset.existingName = "";
      const firstSection = track.built.sections?.[0] || {};
      els.countInInput.checked = !!track.built.countIn;
      els.countInBeatsInput.value = track.built.countInBeats || 4;
      els.countInBpmInput.value = track.built.countInBpm || 120;
      els.clickSampleInput.value = track.built.countInClickSample || track.built.clickSample || "beep";
      els.customCountInFileInput.dataset.existing = track.built.customCountInFileId || "";
      els.customCountInFileInput.dataset.existingName = track.built.customCountInFileName || "";
      els.mainClickSampleInput.value = track.built.mainClickSample || track.built.clickSample || "beep";
      els.customMainClickFileInput.dataset.existing = track.built.customMainClickFileId || "";
      els.customMainClickFileInput.dataset.existingName = track.built.customMainClickFileName || "";
      els.strongBeatEnabledInput.checked = !!track.built.strongBeatEnabled;
      els.strongBeatClickSampleInput.value = track.built.strongBeatClickSample || "rim";
      els.customStrongBeatFileInput.dataset.existing = track.built.customStrongBeatFileId || "";
      els.customStrongBeatFileInput.dataset.existingName = track.built.customStrongBeatFileName || "";
      els.splitOutputInput.checked = !!track.built.splitOutput?.enabled;
      els.clickChannelInput.value = track.built.splitOutput?.clickChannel || "left";
      els.backingChannelInput.value = track.built.splitOutput?.backingChannel || "right";
      els.sectionList.innerHTML = "";
      (track.built.sections || []).forEach((section) => addSectionRow({
        name: section.name,
        bpm: section.bpm || firstSection.bpm || 120,
        timeSignature: section.timeSignature || firstSection.timeSignature || "4/4",
        bars: section.bars,
        backingFileId: section.backingFileId || null,
        backingName: section.backingName || ""
      }));
      if (!track.built.sections?.length) {
        addSectionRow({ name: "Section", bpm: 120, timeSignature: "4/4", bars: 8 });
      }
    }
  } else {
    els.mainAudioInput.dataset.existingName = "";
    setTrackType("master");
  }

  syncCountInControls();
  syncFilePresenceIndicators();

  openModal(els.trackModal);
}

function setFilePresenceText(textEl, message, empty = false) {
  if (!textEl) {
    return;
  }
  textEl.textContent = message;
  textEl.classList.toggle("empty", !!empty);
}

function visibleFileNameFromInput(input) {
  if (!input) {
    return "";
  }
  if (input.files && input.files.length > 0) {
    return input.files[0].name || "";
  }
  return input.dataset.existingName || "";
}

function syncFilePresenceIndicators() {
  const mainAudioName = visibleFileNameFromInput(els.mainAudioInput);
  setFilePresenceText(
    els.mainAudioFileState,
    mainAudioName ? `Current file: ${mainAudioName}` : "No file selected",
    !mainAudioName
  );

  const masterCountInName = visibleFileNameFromInput(els.masterCountInFileInput);
  setFilePresenceText(
    els.masterCountInFileState,
    masterCountInName ? `Current file: ${masterCountInName}` : "No file selected",
    !masterCountInName
  );

  const customCountInName = visibleFileNameFromInput(els.customCountInFileInput);
  setFilePresenceText(
    els.customCountInFileState,
    customCountInName ? `Current file: ${customCountInName}` : "No file selected",
    !customCountInName
  );

  const customMainClickName = visibleFileNameFromInput(els.customMainClickFileInput);
  setFilePresenceText(
    els.customMainClickFileState,
    customMainClickName ? `Current file: ${customMainClickName}` : "No file selected",
    !customMainClickName
  );

  const customStrongBeatName = visibleFileNameFromInput(els.customStrongBeatFileInput);
  setFilePresenceText(
    els.customStrongBeatFileState,
    customStrongBeatName ? `Current file: ${customStrongBeatName}` : "No file selected",
    !customStrongBeatName
  );
}

function setTrackType(type) {
  appState.activeType = type;
  const isMaster = type === "master";

  els.typeMasterBtn.classList.toggle("active", isMaster);
  els.typeBuiltBtn.classList.toggle("active", !isMaster);

  const masterOnlyNodes = document.querySelectorAll(".master-only");
  masterOnlyNodes.forEach((node) => {
    node.style.display = isMaster ? "block" : "none";
  });

  const builtOnlyNodes = document.querySelectorAll(".built-only");
  builtOnlyNodes.forEach((node) => {
    node.style.display = isMaster ? "none" : "block";
  });

  syncCountInControls();
}

function syncCountInControls() {
  if (!els.masterCountInInput || !els.countInInput) {
    return;
  }

  const masterCountInEnabled = !!els.masterCountInInput.checked;
  els.masterCountInBeatsInput.disabled = !masterCountInEnabled;
  els.masterCountInBpmInput.disabled = !masterCountInEnabled;
  els.masterCountInFileInput.disabled = !masterCountInEnabled;
  const masterHasCustom = masterCountInEnabled && (els.masterCountInFileInput.files.length > 0 || !!els.masterCountInFileInput.dataset.existing);
  els.masterClickSampleInput.disabled = !masterCountInEnabled || masterHasCustom;

  const builtCountInEnabled = !!els.countInInput.checked;
  els.countInBeatsInput.disabled = !builtCountInEnabled;
  els.countInBpmInput.disabled = !builtCountInEnabled;
  els.customCountInFileInput.disabled = !builtCountInEnabled;
  const builtHasCustom = builtCountInEnabled && (els.customCountInFileInput.files.length > 0 || !!els.customCountInFileInput.dataset.existing);
  els.clickSampleInput.disabled = !builtCountInEnabled || builtHasCustom;

  const hasCustomMainClick = els.customMainClickFileInput.files.length > 0 || !!els.customMainClickFileInput.dataset.existing;
  els.mainClickSampleInput.disabled = hasCustomMainClick;
  const usesAutoStrongBeatBuiltIn = !hasCustomMainClick && AUTO_STRONG_MAIN_SAMPLES.has(els.mainClickSampleInput.value || "beep");

  const strongBeatEnabled = !!els.strongBeatEnabledInput.checked;
  els.strongBeatRow.classList.toggle("hidden", !strongBeatEnabled);
  els.customStrongBeatFileInput.disabled = !strongBeatEnabled;
  const hasCustomStrongBeat = strongBeatEnabled && (els.customStrongBeatFileInput.files.length > 0 || !!els.customStrongBeatFileInput.dataset.existing);
  const autoStrongBeatLocked = strongBeatEnabled && usesAutoStrongBeatBuiltIn;
  els.strongBeatClickSampleInput.disabled = !strongBeatEnabled || hasCustomStrongBeat || autoStrongBeatLocked;
}

function addSectionRow(section = {}) {
  const {
    name = "Section",
    bpm = 120,
    timeSignature = "4/4",
    bars = 8,
    backingFileId = "",
    backingName = ""
  } = section;

  const row = document.createElement("div");
  row.className = "section-row";
  row.innerHTML = `
    <input type="text" class="section-name" value="${escapeAttr(name)}" maxlength="32" placeholder="Section name">
    <input type="number" class="section-bpm" value="${Number(bpm) || 120}" min="20" max="320" placeholder="BPM">
    <select class="section-time-signature">
      <option value="4/4" ${timeSignature === "4/4" ? "selected" : ""}>4/4</option>
      <option value="3/4" ${timeSignature === "3/4" ? "selected" : ""}>3/4</option>
      <option value="6/8" ${timeSignature === "6/8" ? "selected" : ""}>6/8</option>
      <option value="7/8" ${timeSignature === "7/8" ? "selected" : ""}>7/8</option>
    </select>
    <input type="number" class="section-bars" value="${Number(bars) || 8}" min="1" max="256" placeholder="Bars">
    <input type="file" class="section-backing-file" accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/*" data-existing-file-id="${escapeAttr(backingFileId)}" data-existing-file-name="${escapeAttr(backingName)}" title="${escapeAttr(backingName || "")}">
    <button type="button" class="remove-section" aria-label="Remove section">X</button>
  `;

  row.querySelector(".remove-section").addEventListener("click", () => {
    row.remove();
  });

  els.sectionList.appendChild(row);
}

async function onSubmitTrack(event) {
  event.preventDefault();

  const displayName = els.trackNameInput.value.trim();
  if (!displayName) {
    return;
  }

  let nextTrack;
  if (appState.activeType === "master") {
    nextTrack = await buildMasterTrack(displayName);
  } else {
    nextTrack = await buildBuiltTrack(displayName);
  }

  if (!nextTrack) {
    return;
  }

  if (appState.editingTrackId) {
    const index = appState.currentSet.tracks.findIndex((item) => item.id === appState.editingTrackId);
    if (index >= 0) {
      nextTrack.id = appState.editingTrackId;
      appState.currentSet.tracks[index] = nextTrack;
      appState.selectedTrackIndex = index;
    }
  } else {
    appState.currentSet.tracks.push(nextTrack);
    appState.selectedTrackIndex = appState.currentSet.tracks.length - 1;
  }

  closeModal(els.trackModal);
  render();
}

async function buildMasterTrack(displayName) {
  const editingTrack = getEditingTrack();
  const selectedFile = els.mainAudioInput.files[0];
  const selectedAudio = selectedFile || (editingTrack && editingTrack.type === "master" ? await getFileById(editingTrack.audioFileId) : null);

  if (!selectedAudio) {
    window.alert("Master Slate requires an audio file.");
    return null;
  }

  const audioFileId = selectedFile
    ? await saveFileToDb(selectedFile)
    : editingTrack.audioFileId;

  const meta = await getAudioMetadata(selectedAudio);

  let masterCountInFileId = editingTrack?.masterCountIn?.customFileId || null;
  let masterCountInFileName = editingTrack?.masterCountIn?.customFileName || "";

  if (els.masterCountInFileInput.files[0]) {
    masterCountInFileId = await saveFileToDb(els.masterCountInFileInput.files[0]);
    masterCountInFileName = els.masterCountInFileInput.files[0].name;
  }

  return {
    id: crypto.randomUUID(),
    type: "master",
    displayName,
    audioFileId,
    audioName: selectedAudio.name,
    lockedMeta: {
      bpm: Math.round(meta.estimatedBpm || 120),
      timeSignature: "4/4",
      lengthSec: meta.durationSec
    },
    masterCountIn: {
      enabled: !!els.masterCountInInput.checked,
      beats: Number(els.masterCountInBeatsInput.value) || 4,
      bpm: Number(els.masterCountInBpmInput.value) || 120,
      clickSample: els.masterClickSampleInput.value,
      customFileId: masterCountInFileId,
      customFileName: masterCountInFileName
    }
  };
}

async function buildBuiltTrack(displayName) {
  const sectionRows = [...els.sectionList.querySelectorAll(".section-row")];
  const editingTrack = getEditingTrack();
  const existingSections = editingTrack?.built?.sections || [];

  const sections = [];
  for (let index = 0; index < sectionRows.length; index += 1) {
    const row = sectionRows[index];
    const sectionFileInput = row.querySelector(".section-backing-file");
    let backingFileId = sectionFileInput.dataset.existingFileId || existingSections[index]?.backingFileId || null;
    let backingName = sectionFileInput.dataset.existingFileName || existingSections[index]?.backingName || "";

    if (sectionFileInput.files[0]) {
      backingFileId = await saveFileToDb(sectionFileInput.files[0]);
      backingName = sectionFileInput.files[0].name;
    }

    sections.push({
      name: row.querySelector(".section-name").value.trim() || "Section",
      bpm: Number(row.querySelector(".section-bpm").value) || 120,
      timeSignature: row.querySelector(".section-time-signature").value || "4/4",
      bars: Number(row.querySelector(".section-bars").value) || 1,
      backingFileId,
      backingName
    });
  }

  if (!sections.length) {
    window.alert("Build Track requires at least one section.");
    return null;
  }

  let customCountInFileId = editingTrack?.built?.customCountInFileId || null;
  let customCountInFileName = editingTrack?.built?.customCountInFileName || "";

  if (els.customCountInFileInput.files[0]) {
    customCountInFileId = await saveFileToDb(els.customCountInFileInput.files[0]);
    customCountInFileName = els.customCountInFileInput.files[0].name;
  }

  let customMainClickFileId = editingTrack?.built?.customMainClickFileId || null;
  let customMainClickFileName = editingTrack?.built?.customMainClickFileName || "";

  if (els.customMainClickFileInput.files[0]) {
    customMainClickFileId = await saveFileToDb(els.customMainClickFileInput.files[0]);
    customMainClickFileName = els.customMainClickFileInput.files[0].name;
  }

  let customStrongBeatFileId = editingTrack?.built?.customStrongBeatFileId || null;
  let customStrongBeatFileName = editingTrack?.built?.customStrongBeatFileName || "";

  if (els.customStrongBeatFileInput.files[0]) {
    customStrongBeatFileId = await saveFileToDb(els.customStrongBeatFileInput.files[0]);
    customStrongBeatFileName = els.customStrongBeatFileInput.files[0].name;
  }

  const draftBuilt = {
    countIn: !!els.countInInput.checked,
    countInBeats: Number(els.countInBeatsInput.value) || 4,
    countInBpm: Number(els.countInBpmInput.value) || 120,
    countInClickSample: els.clickSampleInput.value,
    customCountInFileId,
    customCountInFileName,
    mainClickSample: els.mainClickSampleInput.value,
    customMainClickFileId,
    customMainClickFileName,
    strongBeatEnabled: !!els.strongBeatEnabledInput.checked,
    strongBeatClickSample: els.strongBeatClickSampleInput.value,
    customStrongBeatFileId,
    customStrongBeatFileName,
    sections,
    splitOutput: {
      enabled: !!els.splitOutputInput.checked,
      clickChannel: els.clickChannelInput.value,
      backingChannel: els.backingChannelInput.value
    }
  };

  const renderResult = await renderAndPersistBuiltTrackAssets(draftBuilt);

  return {
    id: crypto.randomUUID(),
    type: "built",
    displayName,
    built: {
      ...draftBuilt,
      rendered: renderResult.rendered,
      renderValidation: renderResult.validation
    }
  };
}

function getEditingTrack() {
  if (!appState.editingTrackId) {
    return null;
  }
  return appState.currentSet.tracks.find((track) => track.id === appState.editingTrackId) || null;
}

async function onPlayCurrentTrack() {
  if (appState.selectedTrackIndex < 0) {
    window.alert("Select a track first.");
    return;
  }

  appState.playingTrackIndex = appState.selectedTrackIndex;
  const track = appState.currentSet.tracks[appState.playingTrackIndex];
  if (!track) {
    return;
  }

  stopPlayback();
  appState.playbackSessionId += 1;
  const sessionId = appState.playbackSessionId;

  if (track.type === "master") {
    await playMasterTrack(track, sessionId);
  } else {
    await playBuiltTrack(track, sessionId);
  }
}

function onPlayNextTrack() {
  if (!appState.currentSet.tracks.length) {
    return;
  }
  stopPlayback();
  appState.selectedTrackIndex = (appState.selectedTrackIndex + 1) % appState.currentSet.tracks.length;
  appState.playingTrackIndex = appState.selectedTrackIndex;
  render();
}

async function playMasterTrack(track, sessionId) {
  const file = await getFileById(track.audioFileId);
  if (!file) {
    window.alert("Audio file is missing. Use Replace Audio to relink the file.");
    return;
  }

  let cancelled = false;
  const timers = [];
  let countInContext = null;
  let audio = null;
  let audioUrl = null;
  let diagDumped = false;
  const countInConfig = track.masterCountIn || {};
  const countInBeats = countInConfig.enabled ? (Number(countInConfig.beats) || 4) : 0;
  const countInBpm = Number(countInConfig.bpm) || 120;
  const durationSec = Number(track.lockedMeta?.lengthSec) || totalTrackSeconds(track);
  let playbackVisualStarted = false;

  const stop = () => {
    cancelled = true;
    timers.forEach((timerId) => clearTimeout(timerId));
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
    if (countInContext && countInContext.state !== "closed") {
      countInContext.close();
    }
    if (!diagDumped) {
      dumpDiagnosticSummary(sessionId);
      diagDumped = true;
    }
    appState.playingHandle = null;
    render();
  };

  appState.playingHandle = { stop };
  render();

  if (countInConfig.enabled) {
    countInContext = new (window.AudioContext || window.webkitAudioContext)();
    if (countInContext.state === "suspended") {
      await countInContext.resume();
    }

    let countInBuffer = null;
    if (countInConfig.customFileId) {
      const countInClip = await getFileById(countInConfig.customFileId);
      if (countInClip) {
        countInBuffer = await decodeFileToAudioBuffer(countInContext, countInClip);
      }
    }

    const countInSample = countInConfig.clickSample || "beep";
    const builtInClickBuffers = await loadBuiltInSampleBuffersForContext(countInContext, [countInSample]);
    const countInResolvedBuffer = countInBuffer || builtInClickBuffers.get(countInSample) || null;

    const beatDuration = 60 / (Number(countInConfig.bpm) || 120);
    const beatTotal = Number(countInConfig.beats) || 4;
    const firstBeatAt = countInContext.currentTime + ((COUNT_IN_PREROLL_MS + PLAY_SYNC_PREP_MS) / 1000);
    const countInClock = makeContextClock(countInContext);

    for (let beat = 0; beat < beatTotal; beat += 1) {
      const when = firstBeatAt + beat * beatDuration;
      scheduleClickCueAt(
        countInContext,
        countInResolvedBuffer,
        countInSample,
        0,
        when,
        {
          sessionId,
          label: `master count-in beat ${beat + 1}`,
          clock: countInClock
        }
      );
    }

    const countInEndsAt = firstBeatAt + beatTotal * beatDuration;
    startPlaybackVisual(track, sessionId, {
      countInBeats,
      countInBpm,
      trackDurationSec: durationSec,
      countInStartWallMs: expectedWallTimeMs(countInClock, firstBeatAt),
      trackStartWallMs: expectedWallTimeMs(countInClock, countInEndsAt)
    });
    playbackVisualStarted = true;
    await waitMs(Math.max(0, (countInEndsAt - countInContext.currentTime) * 1000));
  }

  if (!playbackVisualStarted) {
    const trackStartWallMs = performance.now() + PLAY_SYNC_PREP_MS;
    startPlaybackVisual(track, sessionId, {
      countInBeats: 0,
      countInBpm,
      trackDurationSec: durationSec,
      trackStartWallMs
    });
    await waitMs(PLAY_SYNC_PREP_MS);
  }

  if (cancelled) {
    stop();
    return;
  }

  audioUrl = URL.createObjectURL(file);
  audio = new Audio(audioUrl);

  audio.addEventListener("ended", () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
    if (countInContext && countInContext.state !== "closed") {
      countInContext.close();
    }
    if (!diagDumped) {
      dumpDiagnosticSummary(sessionId);
      diagDumped = true;
    }
    resetPlaybackVisual();
    appState.playingHandle = null;
    render();
    if (appState.currentSet.continuousPlay) {
      playNextIfAvailable();
    }
  });

  await audio.play();
}

async function playBuiltTrack(track, sessionId) {
  const renderedReady = !!track.built?.rendered?.ready;
  if (renderedReady) {
    const renderedOk = await playBuiltTrackRendered(track, sessionId);
    if (renderedOk) {
      return;
    }
  }

  await playBuiltTrackLive(track, sessionId);
}

async function playBuiltTrackRendered(track, sessionId) {
  let cancelled = false;
  const activeAudios = [];
  const rendered = track.built?.rendered || {};

  const stop = () => {
    cancelled = true;
    activeAudios.forEach(({ audio, url }) => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(url);
    });
    appState.playingHandle = null;
    resetPlaybackVisual();
    dumpDiagnosticSummary(sessionId);
    render();
  };

  appState.playingHandle = { stop };
  render();

  const clickFile = rendered.clickFileId ? await getFileById(rendered.clickFileId) : null;
  const backingFile = rendered.backingFileId ? await getFileById(rendered.backingFileId) : null;

  if (!clickFile && !backingFile) {
    stop();
    return false;
  }

  await waitMs(PLAY_SYNC_PREP_MS);
  if (cancelled) {
    stop();
    return false;
  }

  try {
    const playPromises = [];
    if (clickFile) {
      const clickUrl = URL.createObjectURL(clickFile);
      const clickAudio = new Audio(clickUrl);
      activeAudios.push({ audio: clickAudio, url: clickUrl });
      playPromises.push(clickAudio.play());
    }

    if (backingFile) {
      const backingUrl = URL.createObjectURL(backingFile);
      const backingAudio = new Audio(backingUrl);
      activeAudios.push({ audio: backingAudio, url: backingUrl });
      playPromises.push(backingAudio.play());
    }

    if (playPromises.length) {
      await Promise.all(playPromises);
    }
  } catch {
    stop();
    return false;
  }

  const durationSec = Number(rendered.durationSec) || totalTrackSeconds(track);
  const countInBeats = track.built.countIn ? (Number(track.built.countInBeats) || 4) : 0;
  const countInBpm = Number(track.built.countInBpm) || 120;
  const countInDurationMs = countInBeats > 0
    ? COUNT_IN_PREROLL_MS + (countInBeats * (60000 / countInBpm))
    : 0;
  const playbackStartWallMs = performance.now();
  startPlaybackVisual(track, sessionId, {
    countInBeats,
    countInBpm,
    trackDurationSec: totalTrackSeconds(track),
    countInStartWallMs: countInBeats > 0 ? playbackStartWallMs + COUNT_IN_PREROLL_MS : null,
    trackStartWallMs: playbackStartWallMs + countInDurationMs
  });

  setTimeout(() => {
    if (cancelled) {
      return;
    }
    stop();
    if (appState.currentSet.continuousPlay) {
      playNextIfAvailable();
    }
  }, Math.max((durationSec + 0.2) * 1000, 500));

  recordDiagnosticEvent({
    sessionId,
    label: "rendered-playback-start",
    source: "rendered",
    expectedStartWallMs: roundMs(performance.now()),
    expectedEndWallMs: roundMs(performance.now() + durationSec * 1000),
    actualEndWallMs: null,
    driftMs: null
  });

  return true;
}

async function playBuiltTrackLive(track, sessionId) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") {
    await context.resume();
  }

  let cancelled = false;
  const timers = [];
  const activeAudios = [];
  const durationSec = totalTrackSeconds(track);
  const sections = track.built.sections || [];

  const clickPan = panValue(track.built.splitOutput?.enabled ? track.built.splitOutput.clickChannel : "center");
  const backingPan = panValue(track.built.splitOutput?.enabled ? track.built.splitOutput.backingChannel : "center");

  let countInClip = null;
  if (track.built.customCountInFileId) {
    countInClip = await getFileById(track.built.customCountInFileId);
  }
  let countInBuffer = null;
  if (countInClip) {
    countInBuffer = await decodeFileToAudioBuffer(context, countInClip);
  }

  let customMainClickClip = null;
  if (track.built.customMainClickFileId) {
    customMainClickClip = await getFileById(track.built.customMainClickFileId);
  }
  let customMainClickBuffer = null;
  if (customMainClickClip) {
    customMainClickBuffer = await decodeFileToAudioBuffer(context, customMainClickClip);
  }

  let customStrongBeatClip = null;
  if (track.built.customStrongBeatFileId) {
    customStrongBeatClip = await getFileById(track.built.customStrongBeatFileId);
  }
  let customStrongBeatBuffer = null;
  if (customStrongBeatClip) {
    customStrongBeatBuffer = await decodeFileToAudioBuffer(context, customStrongBeatClip);
  }

  const countInSample = track.built.countInClickSample || track.built.clickSample || "beep";
  const mainClickSample = track.built.mainClickSample || "beep";
  const strongSpec = resolveStrongBeatSpecForBuiltTrack(track.built);
  const builtInClickBuffers = await loadBuiltInSampleBuffersForContext(context, [countInSample, mainClickSample, strongSpec.sample]);

  const countInBpm = Number(track.built.countInBpm) || 120;
  const countInBeats = track.built.countIn ? (Number(track.built.countInBeats) || 4) : 0;
  const countInDurationSec = track.built.countIn
    ? (COUNT_IN_PREROLL_MS / 1000) + countInBeats * (60 / countInBpm)
    : 0;

  const timelineStartAt = context.currentTime + (PLAY_SYNC_PREP_MS / 1000);
  const sectionStartAt = timelineStartAt + countInDurationSec;
  const contextClock = makeContextClock(context);
  const firstCountBeatAt = track.built.countIn ? timelineStartAt + (COUNT_IN_PREROLL_MS / 1000) : null;

  if (track.built.countIn) {
    const countBeatDuration = 60 / countInBpm;
    for (let beat = 0; beat < countInBeats; beat += 1) {
      const when = firstCountBeatAt + beat * countBeatDuration;
      scheduleClickCueAt(
        context,
        countInBuffer || builtInClickBuffers.get(countInSample) || null,
        countInSample,
        clickPan,
        when,
        {
          sessionId,
          label: `build count-in beat ${beat + 1}`,
          clock: contextClock
        }
      );
    }
  }

  startPlaybackVisual(track, sessionId, {
    countInBeats,
    countInBpm,
    trackDurationSec: durationSec,
    countInStartWallMs: firstCountBeatAt ? expectedWallTimeMs(contextClock, firstCountBeatAt) : null,
    trackStartWallMs: expectedWallTimeMs(contextClock, sectionStartAt)
  });

  let sectionStartSec = 0;
  for (const section of sections) {
    const sectionBpm = Number(section.bpm) || 120;
    const beatsPerBar = Number(String(section.timeSignature || "4/4").split("/")[0]) || 4;
    const sectionBeats = (Number(section.bars) || 1) * beatsPerBar;
    const beatDuration = 60 / sectionBpm;

    for (let beat = 0; beat < sectionBeats; beat += 1) {
      const when = sectionStartAt + sectionStartSec + beat * beatDuration;
      const strongBeat = !!track.built.strongBeatEnabled && beat % beatsPerBar === 0;
      if (strongBeat) {
        scheduleClickCueAt(
          context,
          customStrongBeatBuffer || builtInClickBuffers.get(strongSpec.sample) || null,
          strongSpec.sample,
          clickPan,
          when,
          {
            sessionId,
            label: `section ${section.name} strong beat ${beat + 1}`,
            clock: contextClock
          },
          { playbackRate: strongSpec.playbackRate }
        );
      } else {
        scheduleClickCueAt(
          context,
          customMainClickBuffer || builtInClickBuffers.get(mainClickSample) || null,
          mainClickSample,
          clickPan,
          when,
          {
            sessionId,
            label: `section ${section.name} click beat ${beat + 1}`,
            clock: contextClock
          }
        );
      }
    }

    if (section.backingFileId) {
      const backingFile = await getFileById(section.backingFileId);
      if (backingFile) {
        const when = sectionStartAt + sectionStartSec;
        const delayMs = Math.max(0, (when - context.currentTime) * 1000);
        const timer = setTimeout(() => {
          if (cancelled) {
            return;
          }
          const url = URL.createObjectURL(backingFile);
          const audio = new Audio(url);
          const source = context.createMediaElementSource(audio);
          const panner = context.createStereoPanner();
          panner.pan.value = backingPan;
          source.connect(panner).connect(context.destination);
          audio.play();
          activeAudios.push({ audio, url });
        }, delayMs);
        timers.push(timer);
      }
    }

    sectionStartSec += sectionBeats * beatDuration;
  }

  const stop = () => {
    cancelled = true;
    timers.forEach((timerId) => clearTimeout(timerId));
    context.close();
    activeAudios.forEach(({ audio, url }) => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(url);
    });
    dumpDiagnosticSummary(sessionId);
    resetPlaybackVisual();
    appState.playingHandle = null;
    render();
  };

  appState.playingHandle = { stop };
  render();

  setTimeout(() => {
    if (cancelled) {
      return;
    }
    stop();
    if (appState.currentSet.continuousPlay) {
      playNextIfAvailable();
    }
  }, Math.max((countInDurationSec + durationSec + 0.2) * 1000, 500));
}

function stopPlayback() {
  if (appState.playingHandle) {
    appState.playingHandle.stop();
    appState.playingHandle = null;
  }
  resetPlaybackVisual();
  render();
}

function playNextIfAvailable() {
  if (!appState.currentSet.tracks.length) {
    return;
  }
  const baseIndex = appState.selectedTrackIndex >= 0 ? appState.selectedTrackIndex : 0;
  appState.selectedTrackIndex = (baseIndex + 1) % appState.currentSet.tracks.length;
  appState.playingTrackIndex = appState.selectedTrackIndex;
  render();
  onPlayCurrentTrack();
}

function showTrackInfo() {
  const track = appState.currentSet.tracks[appState.playingTrackIndex];
  if (!track) {
    return;
  }

  if (track.type === "master") {
    window.alert(
      [
        `${track.displayName} (Master Slate)`,
        `Length: ${formatDuration(totalTrackSeconds(track))}`,
        `Audio: ${track.audioName || "Unknown"}`,
        "Tempo and time are locked to file metadata."
      ].join("\n")
    );
    return;
  }

  const sectionSummary = track.built.sections.map((section) => `${section.name}: ${section.bars} bars`).join(", ");
  const validation = track.built.renderValidation;
  const firstCheck = validation?.checks?.[0];
  const validationLine = validation
    ? `Render validation: ${validation.ok ? "OK" : "Needs attention"} (${firstCheck || `max delta ${validation.maxDeltaMs ?? "n/a"}ms`})`
    : "Render validation: not available";
  window.alert(
    [
      `${track.displayName} (Build Track)`,
      `Sections: ${(track.built.sections || []).length}`,
      `Count-in: ${track.built.countIn ? "On" : "Off"}`,
      `Count-in beats: ${track.built.countInBeats || 4}`,
      `Section map: ${sectionSummary}`,
      validationLine
    ].join("\n")
  );
}

function duplicateTrack(trackId) {
  const track = appState.currentSet.tracks.find((item) => item.id === trackId);
  if (!track) {
    return;
  }
  const copy = structuredClone(track);
  copy.id = crypto.randomUUID();
  copy.displayName = `${copy.displayName} COPY`;
  appState.currentSet.tracks.push(copy);
}

async function replaceAudio(trackId) {
  const track = appState.currentSet.tracks.find((item) => item.id === trackId);
  if (!track) {
    return;
  }

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "audio/*";

  picker.addEventListener("change", async () => {
    const file = picker.files?.[0];
    if (!file) {
      return;
    }

    const newId = await saveFileToDb(file);

    if (track.type === "master") {
      track.audioFileId = newId;
      track.audioName = file.name;
      const meta = await getAudioMetadata(file);
      track.lockedMeta.lengthSec = meta.durationSec;
      track.lockedMeta.bpm = Math.round(meta.estimatedBpm || track.lockedMeta.bpm || 120);
    } else {
      const sections = track.built.sections || [];
      if (!sections.length) {
        return;
      }

      const sectionNames = sections.map((section, idx) => `${idx + 1}. ${section.name}`).join("\n");
      const selection = window.prompt(`Replace backing for which section?\n${sectionNames}`, "1");
      const sectionIndex = Number(selection) - 1;
      const chosenSection = sections[sectionIndex] || sections[0];
      chosenSection.backingFileId = newId;
      chosenSection.backingName = file.name;

      const rerender = await renderAndPersistBuiltTrackAssets(track.built);
      track.built.rendered = rerender.rendered;
      track.built.renderValidation = rerender.validation;
    }

    render();
  });

  picker.click();
}

function moveTrack(trackId, delta) {
  const index = appState.currentSet.tracks.findIndex((item) => item.id === trackId);
  if (index < 0) {
    return;
  }

  const target = index + delta;
  reorderTrackByIndex(index, target);
}

function reorderTrackByIndex(sourceIndex, targetIndex) {
  const tracks = appState.currentSet.tracks;
  if (!tracks.length) {
    return;
  }
  if (sourceIndex < 0 || sourceIndex >= tracks.length || targetIndex < 0 || targetIndex >= tracks.length) {
    return;
  }
  if (sourceIndex === targetIndex) {
    return;
  }

  const [track] = tracks.splice(sourceIndex, 1);
  tracks.splice(targetIndex, 0, track);

  appState.selectedTrackIndex = remapIndexAfterReorder(appState.selectedTrackIndex, sourceIndex, targetIndex);
  appState.playingTrackIndex = remapIndexAfterReorder(appState.playingTrackIndex, sourceIndex, targetIndex);
}

function remapIndexAfterReorder(index, sourceIndex, targetIndex) {
  if (index < 0) {
    return index;
  }
  if (index === sourceIndex) {
    return targetIndex;
  }

  if (sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) {
    return index - 1;
  }

  if (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex) {
    return index + 1;
  }

  return index;
}

function confirmDeleteTrack(trackId) {
  appState.confirmAction = async () => {
    const index = appState.currentSet.tracks.findIndex((item) => item.id === trackId);
    if (index < 0) {
      return;
    }

    const track = appState.currentSet.tracks[index];

    if (track.type === "master" && track.audioFileId) {
      await deleteFileFromDb(track.audioFileId);
    }

    if (track.type === "master" && track.masterCountIn?.customFileId) {
      await deleteFileFromDb(track.masterCountIn.customFileId);
    }

    if (track.type === "built" && track.built.customCountInFileId) {
      await deleteFileFromDb(track.built.customCountInFileId);
    }

    if (track.type === "built" && track.built.customMainClickFileId) {
      await deleteFileFromDb(track.built.customMainClickFileId);
    }

    if (track.type === "built" && track.built.customStrongBeatFileId) {
      await deleteFileFromDb(track.built.customStrongBeatFileId);
    }

    if (track.type === "built" && track.built.rendered?.clickFileId) {
      await deleteFileFromDb(track.built.rendered.clickFileId);
    }

    if (track.type === "built" && track.built.rendered?.backingFileId) {
      await deleteFileFromDb(track.built.rendered.backingFileId);
    }

    if (track.type === "built") {
      for (const section of track.built.sections || []) {
        if (section.backingFileId) {
          await deleteFileFromDb(section.backingFileId);
        }
      }
    }

    appState.currentSet.tracks.splice(index, 1);
    if (appState.selectedTrackIndex === index) {
      appState.selectedTrackIndex = Math.min(index, appState.currentSet.tracks.length - 1);
    } else if (appState.selectedTrackIndex > index) {
      appState.selectedTrackIndex -= 1;
    }
    render();
  };

  els.confirmMessage.textContent = "Delete this track from the set?";
  openModal(els.confirmModal);
}

function openModal(modal) {
  modal.classList.remove("hidden");
}

function closeModal(modal) {
  modal.classList.add("hidden");
}

function totalTrackSeconds(track) {
  if (track.type === "master") {
    return Number(track.lockedMeta?.lengthSec || 0);
  }

  return (track.built.sections || []).reduce((sum, section) => {
    const beatsPerBar = Number(String(section.timeSignature || "4/4").split("/")[0]) || 4;
    const beats = (Number(section.bars) || 0) * beatsPerBar;
    const bpm = Number(section.bpm) || 120;
    return sum + beats * (60 / bpm);
  }, 0);
}

function representativeBpm(sections) {
  const first = (sections || []).find((section) => Number(section.bpm) > 0);
  return first ? Number(first.bpm) : "-";
}

function formatDuration(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = String(Math.floor(whole / 60)).padStart(2, "0");
  const secs = String(whole % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function getAudioMetadata(file) {
  return new Promise((resolve) => {
    const probe = new Audio();
    const url = URL.createObjectURL(file);

    probe.preload = "metadata";
    probe.src = url;

    probe.addEventListener("loadedmetadata", () => {
      const durationSec = Number.isFinite(probe.duration) ? probe.duration : 0;
      URL.revokeObjectURL(url);
      resolve({ durationSec, estimatedBpm: null });
    });

    probe.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      resolve({ durationSec: 0, estimatedBpm: null });
    });
  });
}

async function renderAndPersistBuiltTrackAssets(built) {
  const timeline = buildTrackTimeline(built);
  const totalDurationSec = timeline.totalDurationSec + RENDER_DURATION_PAD_SEC;

  let decodeContext = null;
  try {
    decodeContext = new (window.AudioContext || window.webkitAudioContext)();
    const assets = await decodeBuiltTrackAssets(built, decodeContext);

    const clickPan = built.splitOutput?.enabled ? panValue(built.splitOutput.clickChannel) : 0;
    const backingPan = built.splitOutput?.enabled ? panValue(built.splitOutput.backingChannel) : 0;

    const clickBuffer = await renderClickStemBuffer(built, timeline, assets, totalDurationSec, clickPan);
    const backingBuffer = await renderBackingStemBuffer(timeline, assets, totalDurationSec, backingPan);

    const clickBlob = audioBufferToWavBlob(clickBuffer);
    const backingBlob = audioBufferToWavBlob(backingBuffer);
    const clickFileId = await saveFileToDb(new File([clickBlob], `click-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));
    const backingFileId = await saveFileToDb(new File([backingBlob], `backing-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));

    const previousClickId = built.rendered?.clickFileId;
    const previousBackingId = built.rendered?.backingFileId;
    if (previousClickId && previousClickId !== clickFileId) {
      await deleteFileFromDb(previousClickId);
    }
    if (previousBackingId && previousBackingId !== backingFileId) {
      await deleteFileFromDb(previousBackingId);
    }

    const validation = validateRenderedTrack(built, timeline, clickBuffer.duration, backingBuffer.duration);
    return {
      rendered: {
        ready: true,
        clickFileId,
        backingFileId,
        durationSec: timeline.totalDurationSec,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation
    };
  } catch {
    return {
      rendered: {
        ready: false,
        clickFileId: null,
        backingFileId: null,
        durationSec: timeline.totalDurationSec,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation: {
        ok: false,
        expectedDurationSec: timeline.totalDurationSec,
        clickDurationSec: 0,
        backingDurationSec: 0,
        maxDeltaMs: null,
        checks: ["Render failed; live scheduler fallback will be used."]
      }
    };
  } finally {
    if (decodeContext && decodeContext.state !== "closed") {
      decodeContext.close();
    }
  }
}

function buildTrackTimeline(built) {
  const countInBeats = built.countIn ? (Number(built.countInBeats) || 4) : 0;
  const countInBpm = Number(built.countInBpm) || 120;
  const countInDurationSec = countInBeats > 0 ? countInBeats * (60 / countInBpm) : 0;

  let cursorSec = countInDurationSec;
  const sectionWindows = (built.sections || []).map((section) => {
    const bpm = Number(section.bpm) || 120;
    const beatsPerBar = Number(String(section.timeSignature || "4/4").split("/")[0]) || 4;
    const beats = (Number(section.bars) || 1) * beatsPerBar;
    const durationSec = beats * (60 / bpm);

    const window = {
      section,
      startSec: cursorSec,
      bpm,
      beatsPerBar,
      beats,
      durationSec
    };
    cursorSec += durationSec;
    return window;
  });

  return {
    countInBeats,
    countInBpm,
    countInDurationSec,
    sectionWindows,
    totalDurationSec: cursorSec
  };
}

async function decodeBuiltTrackAssets(built, decodeContext) {
  const countInFile = built.customCountInFileId ? await getFileById(built.customCountInFileId) : null;
  const mainClickFile = built.customMainClickFileId ? await getFileById(built.customMainClickFileId) : null;
  const strongBeatFile = built.customStrongBeatFileId ? await getFileById(built.customStrongBeatFileId) : null;

  const sectionBackingBuffers = new Map();
  for (const section of built.sections || []) {
    if (!section.backingFileId) {
      continue;
    }
    const backingFile = await getFileById(section.backingFileId);
    if (!backingFile) {
      continue;
    }
    const backingBuffer = await decodeFileToAudioBuffer(decodeContext, backingFile);
    if (backingBuffer) {
      sectionBackingBuffers.set(section.backingFileId, backingBuffer);
    }
  }

  const strongSpec = resolveStrongBeatSpecForBuiltTrack(built);
  const builtInSampleIds = new Set();
  if (!built.customCountInFileId) {
    builtInSampleIds.add(built.countInClickSample || built.clickSample || "beep");
  }
  if (!built.customMainClickFileId) {
    builtInSampleIds.add(built.mainClickSample || "beep");
  }
  if (!!built.strongBeatEnabled && !built.customStrongBeatFileId) {
    builtInSampleIds.add(strongSpec.sample);
  }

  const builtInBuffers = await loadBuiltInSampleBuffersForContext(decodeContext, [...builtInSampleIds]);

  return {
    countInBuffer: countInFile ? await decodeFileToAudioBuffer(decodeContext, countInFile) : null,
    mainClickBuffer: mainClickFile ? await decodeFileToAudioBuffer(decodeContext, mainClickFile) : null,
    strongBeatBuffer: strongBeatFile ? await decodeFileToAudioBuffer(decodeContext, strongBeatFile) : null,
    builtInBuffers,
    sectionBackingBuffers
  };
}

async function renderClickStemBuffer(built, timeline, assets, durationSec, clickPan) {
  const frameCount = Math.max(1, Math.ceil(durationSec * RENDER_SAMPLE_RATE));
  const context = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);

  if (built.countIn && timeline.countInBeats > 0) {
    const beatDuration = 60 / timeline.countInBpm;
    const countInSample = built.countInClickSample || built.clickSample || "beep";
    const countInBuffer = assets.countInBuffer || assets.builtInBuffers?.get(countInSample) || null;
    for (let beat = 0; beat < timeline.countInBeats; beat += 1) {
      const when = beat * beatDuration;
      scheduleClickCueAt(
        context,
        countInBuffer,
        countInSample,
        clickPan,
        when
      );
    }
  }

  const mainSample = built.mainClickSample || "beep";
  const strongSpec = resolveStrongBeatSpecForBuiltTrack(built);
  const mainBuffer = assets.mainClickBuffer || assets.builtInBuffers?.get(mainSample) || null;
  const strongBuffer = assets.strongBeatBuffer || assets.builtInBuffers?.get(strongSpec.sample) || null;

  for (const window of timeline.sectionWindows) {
    for (let beat = 0; beat < window.beats; beat += 1) {
      const when = window.startSec + beat * (60 / window.bpm);
      const strongBeat = !!built.strongBeatEnabled && beat % window.beatsPerBar === 0;
      if (strongBeat) {
        scheduleClickCueAt(context, strongBuffer, strongSpec.sample, clickPan, when, null, { playbackRate: strongSpec.playbackRate });
      } else {
        scheduleClickCueAt(context, mainBuffer, mainSample, clickPan, when);
      }
    }
  }

  return await context.startRendering();
}

async function renderBackingStemBuffer(timeline, assets, durationSec, backingPan) {
  const frameCount = Math.max(1, Math.ceil(durationSec * RENDER_SAMPLE_RATE));
  const context = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);

  for (const window of timeline.sectionWindows) {
    const backingFileId = window.section.backingFileId;
    if (!backingFileId) {
      continue;
    }
    const backingBuffer = assets.sectionBackingBuffers.get(backingFileId);
    if (!backingBuffer) {
      continue;
    }

    const source = context.createBufferSource();
    const panner = context.createStereoPanner();
    panner.pan.value = backingPan;
    source.buffer = backingBuffer;
    source.connect(panner).connect(context.destination);
    source.start(window.startSec);
  }

  return await context.startRendering();
}

function audioBufferToWavBlob(buffer) {
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let channel = 0; channel < channelCount; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function validateRenderedTrack(built, timeline, clickDurationSec, backingDurationSec) {
  const checks = [];
  for (const section of built.sections || []) {
    if ((Number(section.bars) || 0) < 1) {
      checks.push(`Section ${section.name || "Unnamed"}: bars must be >= 1`);
    }
    const bpm = Number(section.bpm) || 0;
    if (bpm < 20 || bpm > 320) {
      checks.push(`Section ${section.name || "Unnamed"}: BPM out of range`);
    }
  }

  const expectedTimelineDurationSec = timeline.totalDurationSec;
  const expectedRenderDurationSec = timeline.totalDurationSec + RENDER_DURATION_PAD_SEC;
  const clickDeltaMs = Math.abs((clickDurationSec - expectedRenderDurationSec) * 1000);
  const backingDeltaMs = Math.abs((backingDurationSec - expectedRenderDurationSec) * 1000);
  const maxDeltaMs = Math.max(clickDeltaMs, backingDeltaMs);

  if (clickDeltaMs > RENDER_VALIDATION_TOLERANCE_MS) {
    checks.push(`Click stem duration delta ${Math.round(clickDeltaMs)}ms exceeds tolerance ${RENDER_VALIDATION_TOLERANCE_MS}ms`);
  }

  if (backingDeltaMs > RENDER_VALIDATION_TOLERANCE_MS) {
    checks.push(`Backing stem duration delta ${Math.round(backingDeltaMs)}ms exceeds tolerance ${RENDER_VALIDATION_TOLERANCE_MS}ms`);
  }

  return {
    ok: checks.length === 0,
    expectedDurationSec: roundMs(expectedTimelineDurationSec),
    expectedRenderDurationSec: roundMs(expectedRenderDurationSec),
    clickDurationSec: roundMs(clickDurationSec),
    backingDurationSec: roundMs(backingDurationSec),
    clickDeltaMs: roundMs(clickDeltaMs),
    backingDeltaMs: roundMs(backingDeltaMs),
    maxDeltaMs: roundMs(maxDeltaMs),
    checks
  };
}

function waitMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function decodeFileToAudioBuffer(context, file) {
  try {
    const fileData = await file.arrayBuffer();
    return await context.decodeAudioData(fileData.slice(0));
  } catch {
    return null;
  }
}

function scheduleClickCueAt(context, customBuffer, sample, pan, when, diagnostics = null, options = {}) {
  const playbackRate = Math.max(0.2, Number(options.playbackRate) || 1);
  const expectedStartWallMs = diagnostics?.clock ? expectedWallTimeMs(diagnostics.clock, when) : null;

  if (customBuffer) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const onsetOffset = getBufferOnsetOffset(customBuffer);
    const audibleDuration = Math.max(0.005, (customBuffer.duration - onsetOffset) / playbackRate);
    source.buffer = customBuffer;
    source.playbackRate.setValueAtTime(playbackRate, when);
    panner.pan.value = pan;
    gain.gain.setValueAtTime(1, when);
    source.connect(gain).connect(panner).connect(context.destination);
    source.onended = () => {
      if (!diagnostics || !diagnostics.clock) {
        return;
      }
      const expectedEndWallMs = expectedWallTimeMs(diagnostics.clock, when + audibleDuration);
      const actualEndWallMs = performance.now();
      recordDiagnosticEvent({
        sessionId: diagnostics.sessionId,
        label: diagnostics.label,
        source: "custom",
        onsetOffsetMs: roundMs(onsetOffset * 1000),
        expectedStartWallMs: roundMs(expectedStartWallMs),
        expectedEndWallMs: roundMs(expectedEndWallMs),
        actualEndWallMs: roundMs(actualEndWallMs),
        driftMs: roundMs(actualEndWallMs - expectedEndWallMs)
      });
    };
    source.start(when, onsetOffset);
    return;
  }

  playClick(context, sample || "beep", pan, when, diagnostics, options);
}

function playClick(context, sample, pan, when = context.currentTime, diagnostics = null, options = {}) {
  const playbackRate = Math.max(0.2, Number(options.playbackRate) || 1);
  const builtInBuffer = options.builtInBufferMap?.get(sample) || null;
  if (builtInBuffer) {
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    const onsetOffset = getBufferOnsetOffset(builtInBuffer);
    const audibleDuration = Math.max(0.005, (builtInBuffer.duration - onsetOffset) / playbackRate);
    source.buffer = builtInBuffer;
    source.playbackRate.setValueAtTime(playbackRate, when);
    panner.pan.value = pan;
    gain.gain.setValueAtTime(1, when);
    source.connect(gain).connect(panner).connect(context.destination);
    source.onended = () => {
      if (!diagnostics || !diagnostics.clock) {
        return;
      }
      const expectedEndWallMs = expectedWallTimeMs(diagnostics.clock, when + audibleDuration);
      const actualEndWallMs = performance.now();
      recordDiagnosticEvent({
        sessionId: diagnostics.sessionId,
        label: diagnostics.label,
        source: "builtin",
        expectedStartWallMs: roundMs(expectedWallTimeMs(diagnostics.clock, when)),
        expectedEndWallMs: roundMs(expectedEndWallMs),
        actualEndWallMs: roundMs(actualEndWallMs),
        driftMs: roundMs(actualEndWallMs - expectedEndWallMs)
      });
    };
    source.start(when, onsetOffset);
    return;
  }

  const osc = context.createOscillator();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  let toneFrequency = 1000;
  let toneType = "sine";

  if (sample === "wood") {
    toneType = "triangle";
    toneFrequency = 1200;
  } else if (sample === "rim") {
    toneType = "square";
    toneFrequency = 1800;
  } else {
    toneType = "sine";
    toneFrequency = 1000;
  }

  osc.type = toneType;
  osc.frequency.value = toneFrequency * playbackRate;

  panner.pan.value = pan;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.45, when + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);

  osc.connect(gain).connect(panner).connect(context.destination);
  osc.onended = () => {
    if (!diagnostics || !diagnostics.clock) {
      return;
    }
    const expectedEndWallMs = expectedWallTimeMs(diagnostics.clock, when + 0.085);
    const actualEndWallMs = performance.now();
    recordDiagnosticEvent({
      sessionId: diagnostics.sessionId,
      label: diagnostics.label,
      source: "synth",
      expectedStartWallMs: roundMs(expectedWallTimeMs(diagnostics.clock, when)),
      expectedEndWallMs: roundMs(expectedEndWallMs),
      actualEndWallMs: roundMs(actualEndWallMs),
      driftMs: roundMs(actualEndWallMs - expectedEndWallMs)
    });
  };
  osc.start(when);
  osc.stop(when + 0.085);
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function getBufferOnsetOffset(buffer) {
  if (BUFFER_ONSET_CACHE.has(buffer)) {
    return BUFFER_ONSET_CACHE.get(buffer);
  }

  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  let onsetIndex = 0;

  for (let i = 0; i < length; i += 1) {
    let peak = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const channelData = buffer.getChannelData(channel);
      const amplitude = Math.abs(channelData[i]);
      if (amplitude > peak) {
        peak = amplitude;
      }
    }
    if (peak >= CLICK_ONSET_THRESHOLD) {
      onsetIndex = i;
      break;
    }
  }

  const onsetOffset = onsetIndex / sampleRate;
  BUFFER_ONSET_CACHE.set(buffer, onsetOffset);
  return onsetOffset;
}

function panValue(channel) {
  if (channel === "left") {
    return -1;
  }
  if (channel === "right") {
    return 1;
  }
  return 0;
}

function isAssetBackedBuiltInSample(sample) {
  return !!BUILTIN_CLICK_ASSET_PATHS[sample];
}

function resolveStrongBeatSpecForBuiltTrack(built) {
  const mainSample = built.mainClickSample || built.clickSample || "beep";
  const hasCustomStrongBeat = !!built.customStrongBeatFileId;

  if (!!built.strongBeatEnabled && !hasCustomStrongBeat && STRONG_BEAT_AUTO_BY_MAIN_SAMPLE[mainSample]) {
    return STRONG_BEAT_AUTO_BY_MAIN_SAMPLE[mainSample];
  }

  return {
    sample: built.strongBeatClickSample || "rim",
    playbackRate: 1
  };
}

async function getBuiltInSampleArrayBuffer(sample) {
  const path = BUILTIN_CLICK_ASSET_PATHS[sample];
  if (!path) {
    return null;
  }

  if (BUILTIN_CLICK_ASSET_ARRAY_BUFFER_CACHE.has(sample)) {
    return BUILTIN_CLICK_ASSET_ARRAY_BUFFER_CACHE.get(sample);
  }

  const response = await fetch(path);
  if (!response.ok) {
    return null;
  }

  const data = await response.arrayBuffer();
  BUILTIN_CLICK_ASSET_ARRAY_BUFFER_CACHE.set(sample, data);
  return data;
}

async function loadBuiltInSampleBuffersForContext(context, sampleIds) {
  const buffers = new Map();

  for (const sample of sampleIds || []) {
    if (!sample || !isAssetBackedBuiltInSample(sample)) {
      continue;
    }

    const data = await getBuiltInSampleArrayBuffer(sample);
    if (!data) {
      continue;
    }

    try {
      const decoded = await context.decodeAudioData(data.slice(0));
      if (decoded) {
        buffers.set(sample, decoded);
      }
    } catch {
      // Fallback to synth click if decode fails.
    }
  }

  return buffers;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  if (!window.isSecureContext) {
    return;
  }

  navigator.serviceWorker.register("./service-worker.js", { scope: "./" }).catch(() => {
    // Silent fallback for file:// mode where service workers are unsupported.
  });
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFileToDb(file) {
  const db = await openAudioDb();
  const id = crypto.randomUUID();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    tx.objectStore(AUDIO_STORE).put({ id, file });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  db.close();
  return id;
}

async function getFileById(id) {
  if (!id) {
    return null;
  }

  const db = await openAudioDb();
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readonly");
    const req = tx.objectStore(AUDIO_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();

  return row?.file || null;
}

async function deleteFileFromDb(id) {
  if (!id) {
    return;
  }

  const db = await openAudioDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, "readwrite");
    tx.objectStore(AUDIO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
