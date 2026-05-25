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
const CHANNEL_CYCLE = ["left", "right", "both"];
const QUICK_PICKER_FIELD_SELECTOR = "#masterCountInBeatsInput,#masterCountInBpmInput,#masterMainClickBpmInput,#masterMainClickTimeSignatureInput,#countInBeatsInput,#countInBpmInput,#loopCountInBeatsInput,#loopCountInBpmInput,#loopBpmInput,#loopTimeSignatureInput,#masterClickSampleInput,#masterMainClickSampleInput,#masterStrongBeatClickSampleInput,#clickSampleInput,#mainClickSampleInput,#strongBeatClickSampleInput,#loopClickSampleInput,#loopMainClickSampleInput,#loopStrongBeatClickSampleInput,.section-bpm,.section-bars,.section-time-signature";
const QUICK_PICKER_SOUND_FIELD_IDS = new Set([
  "masterClickSampleInput",
  "masterMainClickSampleInput",
  "masterStrongBeatClickSampleInput",
  "clickSampleInput",
  "mainClickSampleInput",
  "strongBeatClickSampleInput",
  "loopClickSampleInput",
  "loopMainClickSampleInput",
  "loopStrongBeatClickSampleInput"
]);
const QUICK_PICKER_HOLD_MS = 220;
const QUICK_PICKER_STEP_PX = 44;
const TRACK_DRAG_HOLD_MS = 300;
const TRACK_DRAG_CANCEL_TOLERANCE_PX = 18;

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
    pointerType: "",
    sourceIndex: -1,
    targetIndex: -1,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    holdTimerId: null,
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
  },
  backingEditor: {
    activeSlotKey: "",
    pendingFiles: {},
    pendingNames: {},
    pendingChannels: {},
    pendingDeletes: {},
    modalDraft: {
      file: null,
      name: "",
      channel: "both",
      clearExisting: false
    },
    recorder: {
      mediaRecorder: null,
      stream: null,
      chunks: [],
      timerId: null,
      startedAt: 0,
      audio: null
    }
  },
  masterAudioEditor: {
    draftFile: null,
    draftName: "",
    clearExisting: false,
    previewAudio: null,
    recorder: {
      mediaRecorder: null,
      stream: null,
      chunks: [],
      timerId: null,
      startedAt: 0
    }
  },
  trackSave: {
    active: false,
    token: null
  },
  quickPicker: {
    active: false,
    transient: false,
    field: null,
    kind: "",
    min: 0,
    max: 0,
    step: 1,
    options: [],
    selectedIndex: 0,
    startY: 0,
    gestureStartSelection: 0,
    pointerId: null,
    holdTimerId: null,
    pendingPointerId: null,
    pendingField: null,
    pendingStartY: 0,
    movedBeforeHold: false,
    suppressClickUntil: 0
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
  trackModalTitle: document.getElementById("trackModalTitle"),
  trackSaveModal: document.getElementById("trackSaveModal"),
  trackSaveStatus: document.getElementById("trackSaveStatus"),
  trackSaveProgressFill: document.getElementById("trackSaveProgressFill"),
  trackSaveCancelBtn: document.getElementById("trackSaveCancelBtn"),
  playModal: document.getElementById("playModal"),
  loadModal: document.getElementById("loadModal"),
  saveModal: document.getElementById("saveModal"),
  saveSetForm: document.getElementById("saveSetForm"),
  saveSetNameInput: document.getElementById("saveSetNameInput"),
  saveSetCancelBtn: document.getElementById("saveSetCancelBtn"),
  saveSetConfirmBtn: document.getElementById("saveSetConfirmBtn"),
  saveToDeviceBtn: document.getElementById("saveToDeviceBtn"),
  confirmModal: document.getElementById("confirmModal"),
  contextMenu: document.getElementById("contextMenu"),
  typeMasterBtn: document.getElementById("typeMasterBtn"),
  typeBuiltBtn: document.getElementById("typeBuiltBtn"),
  typeLoopBtn: document.getElementById("typeLoopBtn"),
  trackForm: document.getElementById("trackForm"),
  trackNameInput: document.getElementById("trackNameInput"),
  mainAudioInput: document.getElementById("mainAudioInput"),
  mainAudioFileState: document.getElementById("mainAudioFileState"),
  masterCountInInput: document.getElementById("masterCountInInput"),
  masterCountInBeatsInput: document.getElementById("masterCountInBeatsInput"),
  masterCountInBpmInput: document.getElementById("masterCountInBpmInput"),
  masterClickSampleInput: document.getElementById("masterClickSampleInput"),
  masterCountInBacking1EnabledInput: document.getElementById("masterCountInBacking1EnabledInput"),
  masterCountInBacking2EnabledInput: document.getElementById("masterCountInBacking2EnabledInput"),
  masterCountInBacking1AudioBtn: document.getElementById("masterCountInBacking1AudioBtn"),
  masterCountInBacking2AudioBtn: document.getElementById("masterCountInBacking2AudioBtn"),
  masterCountInBacking1ChannelBtn: document.getElementById("masterCountInBacking1ChannelBtn"),
  masterCountInBacking2ChannelBtn: document.getElementById("masterCountInBacking2ChannelBtn"),
  masterMainClickChannelBtn: document.getElementById("masterMainClickChannelBtn"),
  masterMainClickEnabledInput: document.getElementById("masterMainClickEnabledInput"),
  masterMainClickSampleInput: document.getElementById("masterMainClickSampleInput"),
  masterMainClickBpmInput: document.getElementById("masterMainClickBpmInput"),
  masterMainClickTimeSignatureInput: document.getElementById("masterMainClickTimeSignatureInput"),
  masterStrongBeatEnabledInput: document.getElementById("masterStrongBeatEnabledInput"),
  masterStrongBeatClickSampleInput: document.getElementById("masterStrongBeatClickSampleInput"),
  masterRecordBtn: document.getElementById("masterRecordBtn"),
  masterRecordPlayBtn: document.getElementById("masterRecordPlayBtn"),
  masterRecordStopBtn: document.getElementById("masterRecordStopBtn"),
  masterRecordTimer: document.getElementById("masterRecordTimer"),
  masterUploadBtn: document.getElementById("masterUploadBtn"),
  masterDeleteBtn: document.getElementById("masterDeleteBtn"),
  masterAudioChannelBtn: document.getElementById("masterAudioChannelBtn"),
  masterUploadLabel: document.getElementById("masterUploadLabel"),
  masterPlaybackProgressFill: document.getElementById("masterPlaybackProgressFill"),
  countInInput: document.getElementById("countInInput"),
  countInBeatsInput: document.getElementById("countInBeatsInput"),
  countInBpmInput: document.getElementById("countInBpmInput"),
  clickSampleInput: document.getElementById("clickSampleInput"),
  countInBacking1EnabledInput: document.getElementById("countInBacking1EnabledInput"),
  countInBacking2EnabledInput: document.getElementById("countInBacking2EnabledInput"),
  countInBacking1AudioBtn: document.getElementById("countInBacking1AudioBtn"),
  countInBacking2AudioBtn: document.getElementById("countInBacking2AudioBtn"),
  countInBacking1ChannelBtn: document.getElementById("countInBacking1ChannelBtn"),
  countInBacking2ChannelBtn: document.getElementById("countInBacking2ChannelBtn"),
  customCountInFileInput: document.getElementById("customCountInFileInput"),
  customCountInFileState: document.getElementById("customCountInFileState"),
  mainClickSampleInput: document.getElementById("mainClickSampleInput"),
  mainClickChannelBtn: document.getElementById("mainClickChannelBtn"),
  customMainClickFileInput: document.getElementById("customMainClickFileInput"),
  customMainClickFileState: document.getElementById("customMainClickFileState"),
  strongBeatEnabledInput: document.getElementById("strongBeatEnabledInput"),
  strongBeatRow: document.getElementById("strongBeatRow"),
  strongBeatClickSampleInput: document.getElementById("strongBeatClickSampleInput"),
  customStrongBeatFileInput: document.getElementById("customStrongBeatFileInput"),
  customStrongBeatFileState: document.getElementById("customStrongBeatFileState"),
  loopCountInInput: document.getElementById("loopCountInInput"),
  loopCountInBeatsInput: document.getElementById("loopCountInBeatsInput"),
  loopCountInBpmInput: document.getElementById("loopCountInBpmInput"),
  loopClickSampleInput: document.getElementById("loopClickSampleInput"),
  loopCountInBacking1EnabledInput: document.getElementById("loopCountInBacking1EnabledInput"),
  loopCountInBacking2EnabledInput: document.getElementById("loopCountInBacking2EnabledInput"),
  loopCountInBacking1AudioBtn: document.getElementById("loopCountInBacking1AudioBtn"),
  loopCountInBacking2AudioBtn: document.getElementById("loopCountInBacking2AudioBtn"),
  loopCountInBacking1ChannelBtn: document.getElementById("loopCountInBacking1ChannelBtn"),
  loopCountInBacking2ChannelBtn: document.getElementById("loopCountInBacking2ChannelBtn"),
  loopMainClickChannelBtn: document.getElementById("loopMainClickChannelBtn"),
  loopMainClickSampleInput: document.getElementById("loopMainClickSampleInput"),
  loopStrongBeatEnabledInput: document.getElementById("loopStrongBeatEnabledInput"),
  loopStrongBeatClickSampleInput: document.getElementById("loopStrongBeatClickSampleInput"),
  loopBpmInput: document.getElementById("loopBpmInput"),
  loopTimeSignatureInput: document.getElementById("loopTimeSignatureInput"),
  splitOutputInput: document.getElementById("splitOutputInput"),
  clickChannelInput: document.getElementById("clickChannelInput"),
  backingChannelInput: document.getElementById("backingChannelInput"),
  addSectionBtn: document.getElementById("addSectionBtn"),
  sectionList: document.getElementById("sectionList"),
  playTrackName: document.getElementById("playTrackName"),
  playTrackMeta: document.getElementById("playTrackMeta"),
  setSearchInput: document.getElementById("setSearchInput"),
  setSortInput: document.getElementById("setSortInput"),
  importSetBtn: document.getElementById("importSetBtn"),
  importSetFileInput: document.getElementById("importSetFileInput"),
  savedSetList: document.getElementById("savedSetList"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn"),
  backingModal: document.getElementById("backingModal"),
  backingRecordBtn: document.getElementById("backingRecordBtn"),
  backingRecordPlayBtn: document.getElementById("backingRecordPlayBtn"),
  backingRecordStopBtn: document.getElementById("backingRecordStopBtn"),
  backingRecordTimer: document.getElementById("backingRecordTimer"),
  backingUploadBtn: document.getElementById("backingUploadBtn"),
  backingDeleteBtn: document.getElementById("backingDeleteBtn"),
  backingUploadLabel: document.getElementById("backingUploadLabel"),
  backingPlaybackProgressFill: document.getElementById("backingPlaybackProgressFill"),
  backingModalChannelBtn: document.getElementById("backingModalChannelBtn"),
  backingModalCancelBtn: document.getElementById("backingModalCancelBtn"),
  backingModalOkBtn: document.getElementById("backingModalOkBtn"),
  backingModalFileInput: document.getElementById("backingModalFileInput"),
  quickPickerOverlay: document.getElementById("quickPickerOverlay"),
  quickPickerCard: document.getElementById("quickPickerCard"),
  quickPickerRows: document.getElementById("quickPickerRows")
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

function beginTrackSaveSession() {
  const token = { id: crypto.randomUUID(), cancelled: false };
  appState.trackSave.active = true;
  appState.trackSave.token = token;

  if (els.trackSaveStatus) {
    els.trackSaveStatus.textContent = "Preparing save...";
  }
  if (els.trackSaveProgressFill) {
    els.trackSaveProgressFill.style.width = "0%";
  }
  if (els.trackSaveCancelBtn) {
    els.trackSaveCancelBtn.disabled = false;
  }

  openModal(els.trackSaveModal);
  return token;
}

function endTrackSaveSession(token) {
  if (!token || appState.trackSave.token !== token) {
    return;
  }

  appState.trackSave.active = false;
  appState.trackSave.token = null;
  closeModal(els.trackSaveModal);

  if (els.trackSaveCancelBtn) {
    els.trackSaveCancelBtn.disabled = false;
  }
}

function updateTrackSaveProgress(token, percent, message = "") {
  if (!token || appState.trackSave.token !== token) {
    return;
  }

  const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (els.trackSaveProgressFill) {
    els.trackSaveProgressFill.style.width = `${clamped}%`;
  }
  if (els.trackSaveStatus && message) {
    els.trackSaveStatus.textContent = message;
  }
}

function createTrackSaveCancelledError() {
  const error = new Error("Track save cancelled");
  error.name = "TrackSaveCancelled";
  return error;
}

function throwIfTrackSaveCancelled(token) {
  if (!token || appState.trackSave.token !== token || token.cancelled) {
    throw createTrackSaveCancelledError();
  }
}

function isTrackSaveCancelledError(error) {
  return error?.name === "TrackSaveCancelled";
}

function requestTrackSaveCancel() {
  const token = appState.trackSave.token;
  if (!token) {
    return;
  }

  token.cancelled = true;
  if (els.trackSaveStatus) {
    els.trackSaveStatus.textContent = "Cancelling...";
  }
  if (els.trackSaveCancelBtn) {
    els.trackSaveCancelBtn.disabled = true;
  }

  endTrackSaveSession(token);
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
  bind(els.typeLoopBtn, "click", () => setTrackType("loop"));
  bind(els.trackForm, "submit", onSubmitTrack);
  bind(els.addSectionBtn, "click", () => addSectionRow());

  bind(els.masterCountInInput, "change", syncCountInControls);
  bind(els.masterCountInBacking1EnabledInput, "change", syncCountInControls);
  bind(els.masterCountInBacking2EnabledInput, "change", syncCountInControls);
  bind(els.masterMainClickEnabledInput, "change", syncCountInControls);
  bind(els.masterStrongBeatEnabledInput, "change", syncCountInControls);
  bind(els.countInInput, "change", syncCountInControls);
  bind(els.countInBacking1EnabledInput, "change", syncCountInControls);
  bind(els.countInBacking2EnabledInput, "change", syncCountInControls);
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
  bind(els.mainAudioInput, "change", onMasterAudioFilePicked);
  bind(els.strongBeatEnabledInput, "change", syncCountInControls);
  bind(els.mainClickSampleInput, "change", syncCountInControls);
  bind(els.mainClickChannelBtn, "click", () => cycleMainClickChannel());
  bind(els.masterMainClickChannelBtn, "click", () => cycleChannelButton(els.masterMainClickChannelBtn));
  bind(els.masterAudioChannelBtn, "click", () => cycleChannelButton(els.masterAudioChannelBtn));
  bind(els.loopMainClickChannelBtn, "click", () => cycleChannelButton(els.loopMainClickChannelBtn));
  bind(els.countInBacking1AudioBtn, "click", () => openBackingModal("countIn:1"));
  bind(els.countInBacking2AudioBtn, "click", () => openBackingModal("countIn:2"));
  bind(els.countInBacking1ChannelBtn, "click", () => cycleBackingChannel("countIn:1"));
  bind(els.countInBacking2ChannelBtn, "click", () => cycleBackingChannel("countIn:2"));
  bind(els.masterCountInBacking1AudioBtn, "click", () => openBackingModal("masterCountIn:1"));
  bind(els.masterCountInBacking2AudioBtn, "click", () => openBackingModal("masterCountIn:2"));
  bind(els.masterCountInBacking1ChannelBtn, "click", () => cycleBackingChannel("masterCountIn:1"));
  bind(els.masterCountInBacking2ChannelBtn, "click", () => cycleBackingChannel("masterCountIn:2"));
  bind(els.loopCountInInput, "change", syncCountInControls);
  bind(els.loopCountInBacking1EnabledInput, "change", syncCountInControls);
  bind(els.loopCountInBacking2EnabledInput, "change", syncCountInControls);
  bind(els.loopCountInBacking1AudioBtn, "click", () => openBackingModal("loopCountIn:1"));
  bind(els.loopCountInBacking2AudioBtn, "click", () => openBackingModal("loopCountIn:2"));
  bind(els.loopCountInBacking1ChannelBtn, "click", () => cycleBackingChannel("loopCountIn:1"));
  bind(els.loopCountInBacking2ChannelBtn, "click", () => cycleBackingChannel("loopCountIn:2"));
  bind(els.loopStrongBeatEnabledInput, "change", syncCountInControls);
  bind(els.loopMainClickSampleInput, "change", syncCountInControls);
  bind(els.masterUploadBtn, "click", () => {
    els.mainAudioInput.click();
  });
  bind(els.masterDeleteBtn, "click", onMasterAudioDelete);
  bind(els.masterRecordBtn, "click", onStartMasterRecording);
  bind(els.masterRecordStopBtn, "click", onStopMasterRecording);
  bind(els.masterRecordPlayBtn, "click", onPlayMasterPreview);

  bind(els.sectionList, "click", (event) => {
    const audioBtn = event.target.closest(".audio-btn[data-backing-slot]");
    if (audioBtn) {
      openBackingModal(audioBtn.dataset.backingSlot);
      return;
    }

    const channelBtn = event.target.closest(".channel-cycle-btn[data-backing-slot]");
    if (channelBtn) {
      cycleBackingChannel(channelBtn.dataset.backingSlot);
      return;
    }

    const removeBtn = event.target.closest(".remove-section");
    if (removeBtn) {
      removeBtn.closest(".section-row")?.remove();
      refreshSectionSlotKeys();
    }
  });

  bind(els.backingUploadBtn, "click", () => {
    els.backingModalFileInput.click();
  });
  bind(els.backingDeleteBtn, "click", onBackingModalDelete);
  bind(els.backingModalFileInput, "change", onBackingModalUploadFile);
  bind(els.backingModalChannelBtn, "click", onBackingModalCycleChannel);
  bind(els.backingModalCancelBtn, "click", onBackingModalCancel);
  bind(els.backingModalOkBtn, "click", onBackingModalConfirm);
  bind(els.backingRecordBtn, "click", onStartBackingRecording);
  bind(els.backingRecordStopBtn, "click", onStopBackingRecording);
  bind(els.backingRecordPlayBtn, "click", onPlayBackingPreview);
  bind(els.trackSaveCancelBtn, "click", requestTrackSaveCancel);
  bind(els.trackModal, "pointerdown", onQuickPickerFieldPointerDown);
  bind(els.trackModal, "click", onQuickPickerFieldClick);
  bind(document, "pointermove", onQuickPickerPointerMove);
  bind(document, "pointerup", onQuickPickerPointerUp);
  bind(document, "pointercancel", onQuickPickerPointerCancel);
  bind(els.quickPickerOverlay, "pointerdown", onQuickPickerOverlayPointerDown);
  bind(els.quickPickerOverlay, "click", onQuickPickerOverlayClick);
  if (els.quickPickerOverlay) {
    els.quickPickerOverlay.addEventListener("wheel", onQuickPickerWheel, { passive: false });
  }

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
  bind(els.saveSetForm, "submit", onSaveSetSubmit);
  bind(els.saveSetCancelBtn, "click", () => closeModal(els.saveModal));
  bind(els.saveToDeviceBtn, "click", onSaveSetToDevice);
  bind(els.importSetBtn, "click", () => {
    els.importSetFileInput?.click();
  });
  bind(els.importSetFileInput, "change", onImportSetFilePicked);

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
      if (appState.trackSave.active) {
        return;
      }
      const id = button.getAttribute("data-close");
      const modal = document.getElementById(id);
      if (id === "backingModal") {
        stopBackingRecorder(false);
        clearBackingModalDraft();
      }
      if (id === "trackModal") {
        closeQuickPicker();
        stopMasterPreviewAudio(true);
        stopMasterRecorder(true);
      }
      closeModal(modal);
    });
  });

  document.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal")) {
      if (event.target.id === "trackSaveModal") {
        return;
      }
      if (appState.trackSave.active) {
        return;
      }
      if (event.target.id === "trackModal") {
        closeQuickPicker();
        stopMasterPreviewAudio(true);
        stopMasterRecorder(true);
      }
      if (event.target.id === "backingModal") {
        stopBackingRecorder(false);
        clearBackingModalDraft();
      }
      closeModal(event.target);
    }
  });

  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".track-row") || appState.dragReorder.active) {
      event.preventDefault();
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

function isMasterMainClickEnabled(track) {
  if (!track || track.type !== "master") {
    return false;
  }
  const enabled = track.masterCountIn?.mainClick?.enabled;
  return enabled ?? true;
}

function isCurrentSetRenderedFully() {
  const renderableTracks = (appState.currentSet.tracks || []).filter((track) => {
    if (track.type === "built" || track.type === "loop") {
      return true;
    }
    return isMasterMainClickEnabled(track);
  });
  if (!renderableTracks.length) {
    return false;
  }
  return renderableTracks.every((track) => {
    if (track.type === "master") {
      const rendered = track.masterRendered;
      const validation = track.masterRenderValidation;
      return !!rendered?.ready && !!rendered?.clickFileId && !!rendered?.backingFileId && validation?.ok !== false;
    }

    if (track.type === "built") {
      const rendered = track.built?.rendered;
      const validation = track.built?.renderValidation;
      return !!rendered?.ready && !!rendered?.clickFileId && !!rendered?.backingFileId && validation?.ok !== false;
    }

    const rendered = track.loop?.rendered;
    const validation = track.loop?.renderValidation;
    return !!rendered?.ready && !!rendered?.loopFileId && validation?.ok !== false;
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
    const trackDuration = track.type === "loop"
      ? "LOOP"
      : formatDuration(playbackState.remainingSec);
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

  if (track.type === "loop" && !!appState.playingHandle && index === appState.playingTrackIndex) {
    return {
      playing: true,
      progressRatio: 0,
      remainingSec: baseDurationSec
    };
  }

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
  const visible = !!visual.active && visual.phase === "countin";

  if (!visible) {
    els.playbackCueOverlay.hidden = true;
    els.playbackCueOverlay.classList.remove("visible");
    els.playbackCueNumber.textContent = "";
    return;
  }

  els.playbackCueOverlay.hidden = false;
  els.playbackCueOverlay.classList.add("visible");
  els.playbackCueNumber.textContent = visual.countDisplay > 0 ? String(visual.countDisplay) : "";
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
    const isActiveLoopRow = !!appState.playingHandle
      && row.dataset.trackId === appState.currentSet.tracks[appState.playingTrackIndex]?.id
      && appState.currentSet.tracks[appState.playingTrackIndex]?.type === "loop";
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

    if (isActiveLoopRow) {
      row.classList.add("playing");
      row.style.removeProperty("--play-progress");
      const timeEl = row.querySelector(".track-time");
      if (timeEl) {
        timeEl.textContent = "LOOP";
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

  if (track.type !== "built") {
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

  if (track.type === "loop") {
    const bpm = Number(track.loop?.bpm) || 0;
    return bpm > 0 ? Math.round(bpm) : "-";
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
    const beatsPerBar = beatsPerBarFromSignature(section.timeSignature);
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
  appState.playbackVisual.phase = trackStartMs > nowMs ? "countin" : "track";
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

  if (nowMs < visual.trackStartMs) {
    visual.phase = "countin";
    if (visual.countInBeats <= 0) {
      visual.countDisplay = 0;
      visual.progressRatio = 0;
      visual.remainingSec = visual.trackDurationSec;
      updatePlaybackVisualUI();
      return;
    }

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

  if (track.type === "master") {
    if (!isMasterMainClickEnabled(track)) {
      return { label: "AUDIO", className: "render-chip-master" };
    }

    const rendered = track.masterRendered;
    const validation = track.masterRenderValidation;
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

  const rendered = track.type === "built" ? track.built?.rendered : track.loop?.rendered;
  const validation = track.type === "built" ? track.built?.renderValidation : track.loop?.renderValidation;

  if (track.type === "loop") {
    if (rendered?.ready && validation?.ok !== false) {
      return { label: "LOOP READY", className: "render-chip-ok" };
    }
    if (rendered?.ready && validation?.ok === false) {
      return { label: "LOOP WARN", className: "render-chip-warn" };
    }
    if (rendered?.fallbackMode === "live") {
      return { label: "LOOP LIVE", className: "render-chip-warn" };
    }
    return { label: "NEEDS RENDER", className: "render-chip-pending" };
  }

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
  drag.pointerType = event.pointerType || "mouse";
  drag.sourceIndex = index;
  drag.targetIndex = index;
  drag.startX = event.clientX;
  drag.startY = event.clientY;
  drag.sourceRow = row;

  if (drag.pointerType === "touch" || drag.pointerType === "pen") {
    // Prevent touch gestures (including pull-to-refresh) from hijacking hold-to-drag.
    row.style.touchAction = "none";
    drag.holdTimerId = window.setTimeout(() => {
      if (!drag.sourceRow || drag.pointerId !== event.pointerId || drag.active) {
        return;
      }
      startFloatingDragAt(drag.startX, drag.startY);
    }, TRACK_DRAG_HOLD_MS);
  }

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

  const touchLikePointer = drag.pointerType === "touch" || drag.pointerType === "pen";
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  if (!drag.active && touchLikePointer) {
    if (distance > TRACK_DRAG_CANCEL_TOLERANCE_PX) {
      clearTrackDragHoldTimer();
    }
    return;
  }

  if (!drag.active && distance < 8) {
    return;
  }

  if (!drag.active) {
    startFloatingDragAt(event.clientX, event.clientY);
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
  const insertBefore = shouldInsertPlaceholderBeforeTarget(event, targetRect);
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

  const wasActive = drag.active;

  if (drag.active && drag.sourceIndex !== drag.targetIndex) {
    reorderTrackByIndex(drag.sourceIndex, drag.targetIndex);
    render();
  }

  if (wasActive) {
    drag.suppressClick = true;
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
  clearTrackDragHoldTimer();

  if (drag.sourceRow) {
    drag.sourceRow.classList.remove("dragging", "floating-drag");
    drag.sourceRow.style.left = "";
    drag.sourceRow.style.top = "";
    drag.sourceRow.style.width = "";
    drag.sourceRow.style.height = "";
    drag.sourceRow.style.touchAction = "";
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
  drag.pointerType = "";
  drag.sourceIndex = -1;
  drag.targetIndex = -1;
  drag.startX = 0;
  drag.startY = 0;
  drag.offsetX = 0;
  drag.offsetY = 0;
  drag.holdTimerId = null;
  drag.sourceRow = null;
  drag.placeholder = null;
}

function shouldInsertPlaceholderBeforeTarget(event, targetRect) {
  if (!els.trackList) {
    return event.clientY < targetRect.top + (targetRect.height / 2);
  }

  const columns = trackListColumnCount();
  if (columns > 1) {
    return event.clientX < targetRect.left + (targetRect.width / 2);
  }

  return event.clientY < targetRect.top + (targetRect.height / 2);
}

function trackListColumnCount() {
  if (!els.trackList) {
    return 1;
  }

  const template = window.getComputedStyle(els.trackList).gridTemplateColumns || "";
  if (!template || template === "none") {
    return 1;
  }

  return Math.max(1, template.split(" ").filter(Boolean).length);
}

function clearTrackDragHoldTimer() {
  const drag = appState.dragReorder;
  if (drag.holdTimerId) {
    clearTimeout(drag.holdTimerId);
    drag.holdTimerId = null;
  }
}

function startFloatingDragAt(clientX, clientY) {
  const drag = appState.dragReorder;
  if (!drag.sourceRow || !els.trackList) {
    return;
  }

  clearTrackDragHoldTimer();

  const rowRect = drag.sourceRow.getBoundingClientRect();
  drag.offsetX = clientX - rowRect.left;
  drag.offsetY = clientY - rowRect.top;

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
  drag.sourceRow.style.left = `${Math.round(clientX - drag.offsetX)}px`;
  drag.sourceRow.style.top = `${Math.round(clientY - drag.offsetY)}px`;
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
  if (!els.saveModal || !els.saveSetNameInput) {
    return;
  }

  const existingName = (appState.currentSet.name || "").trim();
  els.saveSetNameInput.value = existingName && existingName !== "UNTITLED SET" ? existingName : "";
  openModal(els.saveModal);

  // Focus and select when reopening so renaming is quick on desktop and mobile keyboards.
  requestAnimationFrame(() => {
    if (!els.saveSetNameInput) {
      return;
    }
    els.saveSetNameInput.focus();
    els.saveSetNameInput.select();
  });
}

function persistCurrentSet() {
  appState.currentSet.lastUsedAt = Date.now();

  const existingIndex = appState.savedSets.findIndex((item) => item.id === appState.currentSet.id);
  if (existingIndex >= 0) {
    appState.savedSets[existingIndex] = structuredClone(appState.currentSet);
  } else {
    appState.savedSets.push(structuredClone(appState.currentSet));
  }

  persistSavedSets();
}

function onSaveSetSubmit(event) {
  event.preventDefault();
  if (!els.saveSetNameInput) {
    return;
  }

  const setName = (els.saveSetNameInput.value || "").trim();
  if (!setName) {
    window.alert("Please enter a set name.");
    return;
  }

  appState.currentSet.name = setName.toUpperCase();
  persistCurrentSet();
  closeModal(els.saveModal);
  render();
  queueEnsureCurrentSetRendered({ forceAll: false });
}

function normalizeSetName(rawName) {
  const trimmed = String(rawName || "").trim();
  return trimmed ? trimmed.toUpperCase() : "";
}

function fileSafeSetName(rawName) {
  const normalized = normalizeSetName(rawName) || "SET";
  return normalized
    .replace(/[^A-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 48) || "SET";
}

function serializeCurrentSetForExport(setName) {
  const exportedSet = structuredClone(appState.currentSet);
  if (setName) {
    exportedSet.name = normalizeSetName(setName);
  }
  exportedSet.lastUsedAt = Date.now();
  return {
    schema: "setlist-builder-set",
    version: 1,
    exportedAt: Date.now(),
    set: exportedSet
  };
}

async function onSaveSetToDevice() {
  if (!els.saveSetNameInput) {
    return;
  }

  const setName = normalizeSetName(els.saveSetNameInput.value);
  if (!setName) {
    window.alert("Please enter a set name.");
    return;
  }

  appState.currentSet.name = setName;
  const exportPayload = serializeCurrentSetForExport(setName);
  const json = JSON.stringify(exportPayload, null, 2);
  const fileName = `${fileSafeSetName(setName)}.setlist.json`;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: "Setlist Builder Set",
          accept: { "application/json": [".json"] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      closeModal(els.saveModal);
      render();
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      // Fall through to download fallback when picker fails.
    }
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  closeModal(els.saveModal);
  render();
}

function normalizeImportedSetCandidate(payload) {
  const source = payload?.schema === "setlist-builder-set" ? payload.set : payload;
  if (!source || typeof source !== "object" || !Array.isArray(source.tracks)) {
    return null;
  }

  const set = structuredClone(source);
  if (!set.id) {
    set.id = crypto.randomUUID();
  }
  set.name = normalizeSetName(set.name) || "IMPORTED SET";
  set.continuousPlay = !!set.continuousPlay;
  set.lastUsedAt = Date.now();
  return set;
}

async function onImportSetFilePicked() {
  const file = els.importSetFileInput?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const importedSet = normalizeImportedSetCandidate(parsed);
    if (!importedSet) {
      window.alert("That file is not a valid Setlist Builder set.");
      return;
    }

    stopPlayback();
    appState.currentSet = importedSet;
    appState.renderStatusByTrackId = {};
    appState.selectedTrackIndex = appState.currentSet.tracks.length ? 0 : -1;
    appState.playingTrackIndex = -1;
    persistCurrentSet();
    closeModal(els.loadModal);
    render();
    queueEnsureCurrentSetRendered({ forceAll: false });
  } catch {
    window.alert("Unable to import that file. Make sure it is a valid JSON set export.");
  } finally {
    if (els.importSetFileInput) {
      els.importSetFileInput.value = "";
    }
  }
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

  const renderableTracks = (appState.currentSet.tracks || []).filter((track) => {
    if (track.type === "built" || track.type === "loop") {
      return true;
    }
    return isMasterMainClickEnabled(track);
  });
  appState.renderStatusByTrackId = {};
  appState.renderProgress.active = true;
  appState.renderProgress.total = renderableTracks.length;
  appState.renderProgress.done = 0;
  appState.renderProgress.showBanner = !!options.showBanner;
  appState.renderProgress.currentTrackId = null;
  appState.renderProgress.currentTrackName = "Preparing...";
  appState.renderProgress.queuedTrackIds = renderableTracks.map((track) => track.id);
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
    if (track.type !== "built" && track.type !== "loop" && track.type !== "master") {
      continue;
    }
    if (track.type === "master" && !isMasterMainClickEnabled(track)) {
      continue;
    }

    appState.renderProgress.currentTrackId = track.id;
    appState.renderProgress.currentTrackName = track.displayName || (track.type === "loop"
      ? "Loop Track"
      : (track.type === "master" ? "Master Slate" : "Build Track"));
    render();

    const stepStartMs = performance.now();
    const result = track.type === "master"
      ? await ensureMasterTrackRendered(track, options)
      : (track.type === "loop"
        ? await ensureLoopTrackRendered(track, options)
        : await ensureBuiltTrackRendered(track, options));
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

async function ensureLoopTrackRendered(track, options = { forceAll: false }) {
  const forceAll = !!options.forceAll;
  const rendered = track.loop?.rendered;
  const validation = track.loop?.renderValidation;
  let needsRender = forceAll || !rendered?.ready || !rendered?.loopFileId || validation?.ok === false;

  if (!needsRender) {
    const loopFile = await getFileById(rendered.loopFileId);
    needsRender = !loopFile;
  }

  if (!needsRender) {
    delete appState.renderStatusByTrackId[track.id];
    return { changed: false };
  }

  appState.renderStatusByTrackId[track.id] = "rendering";
  render();

  try {
    const rerender = await renderAndPersistLoopTrackAssets(track.loop);
    track.loop.rendered = rerender.rendered;
    track.loop.renderValidation = rerender.validation;
    delete appState.renderStatusByTrackId[track.id];
    return { changed: true };
  } catch {
    appState.renderStatusByTrackId[track.id] = "error";
    return { changed: false };
  }
}

async function ensureMasterTrackRendered(track, options = { forceAll: false }) {
  const forceAll = !!options.forceAll;
  const rendered = track.masterRendered;
  const validation = track.masterRenderValidation;
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
    const rerender = await renderAndPersistMasterTrackAssets(track);
    track.masterRendered = rerender.rendered;
    track.masterRenderValidation = rerender.validation;
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
      persistCurrentSet();
      closeModal(els.loadModal);
      render();
      queueEnsureCurrentSetRendered({ forceAll: false });
    });

    return row;
  });

  els.savedSetList.replaceChildren(...rows);
}

function openTrackModal(mode, trackId = null) {
  if (els.trackModalTitle) {
    els.trackModalTitle.textContent = "Add/Edit Track";
  }

  appState.editingTrackId = mode === "edit" ? trackId : null;
  appState.activeType = "master";
  resetBackingDraftState();

  els.trackForm.reset();
  els.customCountInFileInput.dataset.existing = "";
  els.customCountInFileInput.dataset.existingName = "";
  els.customMainClickFileInput.dataset.existing = "";
  els.customMainClickFileInput.dataset.existingName = "";
  els.customStrongBeatFileInput.dataset.existing = "";
  els.customStrongBeatFileInput.dataset.existingName = "";
  els.sectionList.innerHTML = "";
  addSectionRow({ name: "Verse", bpm: 120, timeSignature: "4/4", bars: 8 });
  addSectionRow({ name: "Chorus", bpm: 120, timeSignature: "4/4", bars: 8 });
  els.loopBpmInput.value = 120;
  els.loopTimeSignatureInput.value = "4/4";
  els.mainClickChannelBtn.dataset.channel = "right";
  els.mainClickChannelBtn.textContent = "R";
  els.masterMainClickChannelBtn.dataset.channel = "right";
  els.masterMainClickChannelBtn.textContent = "R";
  els.masterMainClickEnabledInput.checked = false;
  els.masterAudioChannelBtn.dataset.channel = "left";
  els.masterAudioChannelBtn.textContent = "L";
  els.masterMainClickBpmInput.value = 120;
  els.masterMainClickTimeSignatureInput.value = "4/4";
  els.loopMainClickChannelBtn.dataset.channel = "right";
  els.loopMainClickChannelBtn.textContent = "R";
  els.countInInput.checked = false;
  els.masterCountInInput.checked = false;
  els.loopCountInInput.checked = false;
  els.countInBacking1EnabledInput.checked = false;
  els.countInBacking2EnabledInput.checked = false;
  els.masterCountInBacking1EnabledInput.checked = false;
  els.masterCountInBacking2EnabledInput.checked = false;
  els.loopCountInBacking1EnabledInput.checked = false;
  els.loopCountInBacking2EnabledInput.checked = false;
  setBackingSlotMeta("countIn:1", "", "", "left");
  setBackingSlotMeta("countIn:2", "", "", "both");
  setBackingSlotMeta("masterCountIn:1", "", "", "left");
  setBackingSlotMeta("masterCountIn:2", "", "", "both");
  setBackingSlotMeta("loopCountIn:1", "", "", "left");
  setBackingSlotMeta("loopCountIn:2", "", "", "both");
  setBackingSlotChannel("countIn:1", "left");
  setBackingSlotChannel("countIn:2", "both");
  setBackingSlotChannel("masterCountIn:1", "left");
  setBackingSlotChannel("masterCountIn:2", "both");
  setBackingSlotChannel("loopCountIn:1", "left");
  setBackingSlotChannel("loopCountIn:2", "both");
  clearMasterAudioDraft();
  syncCountInControls();

  if (mode === "edit") {
    const track = appState.currentSet.tracks.find((item) => item.id === trackId);
    if (!track) {
      return;
    }

    els.trackNameInput.value = track.displayName;
    setTrackType(track.type);

    if (track.type === "master") {
      const countIn = track.masterCountIn || {};
      const masterMainClick = countIn.mainClick || {};
      els.mainAudioInput.dataset.existingName = track.audioName || "";
      els.masterCountInInput.checked = !!countIn.clickEnabled;
      els.masterCountInBeatsInput.value = countIn.beats || 4;
      els.masterCountInBpmInput.value = countIn.bpm || 120;
      els.masterClickSampleInput.value = countIn.clickSample || "beep";
      els.masterCountInBacking1EnabledInput.checked = !!countIn.backing1?.enabled;
      els.masterCountInBacking2EnabledInput.checked = !!countIn.backing2?.enabled;
      setBackingSlotMeta("masterCountIn:1", countIn.backing1?.fileId || "", countIn.backing1?.fileName || "", countIn.backing1?.channel || "left");
      setBackingSlotMeta("masterCountIn:2", countIn.backing2?.fileId || "", countIn.backing2?.fileName || "", countIn.backing2?.channel || "both");
      els.masterMainClickSampleInput.value = masterMainClick.sample || "beep";
      els.masterMainClickEnabledInput.checked = masterMainClick.enabled ?? true;
      els.masterMainClickChannelBtn.dataset.channel = masterMainClick.channel || "right";
      els.masterMainClickChannelBtn.textContent = channelLabel(masterMainClick.channel || "right");
      els.masterMainClickBpmInput.value = Number(masterMainClick.bpm) || Number(track.lockedMeta?.bpm) || 120;
      els.masterMainClickTimeSignatureInput.value = masterMainClick.timeSignature || track.lockedMeta?.timeSignature || "4/4";
      els.masterStrongBeatEnabledInput.checked = !!masterMainClick.strongBeatEnabled;
      els.masterStrongBeatClickSampleInput.value = masterMainClick.strongBeatSample || "rim";
      els.splitOutputInput.checked = !!track.masterSplitOutput?.enabled;
      const masterAudioChannel = track.masterSplitOutput?.audioChannel || "left";
      els.masterAudioChannelBtn.dataset.channel = masterAudioChannel;
      els.masterAudioChannelBtn.textContent = channelLabel(masterAudioChannel);
    } else if (track.type === "built") {
      const built = normalizeBuiltTrack(track.built || {});
      els.mainAudioInput.dataset.existingName = "";
      els.countInInput.checked = !!built.countIn.clickEnabled;
      els.countInBeatsInput.value = built.countIn.beats;
      els.countInBpmInput.value = built.countIn.bpm;
      els.clickSampleInput.value = built.countIn.clickSample;
      els.mainClickSampleInput.value = built.mainClick.sample;
      els.strongBeatEnabledInput.checked = !!built.mainClick.strongBeatEnabled;
      els.strongBeatClickSampleInput.value = built.mainClick.strongBeatSample;
      els.splitOutputInput.checked = !!built.splitOutput.enabled;
      els.mainClickChannelBtn.dataset.channel = built.mainClick.channel;
      els.mainClickChannelBtn.textContent = channelLabel(built.mainClick.channel);

      const countInBacking1 = built.countIn.backing1;
      const countInBacking2 = built.countIn.backing2;
      els.countInBacking1EnabledInput.checked = !!countInBacking1.enabled;
      els.countInBacking2EnabledInput.checked = !!countInBacking2.enabled;
      setBackingSlotMeta("countIn:1", countInBacking1.fileId, countInBacking1.fileName, countInBacking1.channel);
      setBackingSlotMeta("countIn:2", countInBacking2.fileId, countInBacking2.fileName, countInBacking2.channel);

      els.sectionList.innerHTML = "";
      built.sections.forEach((section) => addSectionRow(section));
      if (!built.sections.length) {
        addSectionRow({ name: "Section", bpm: 120, timeSignature: "4/4", bars: 8 });
      }
      refreshSectionSlotKeys();
    } else {
      const loop = normalizeLoopTrack(track.loop || {});
      els.mainAudioInput.dataset.existingName = "";
      els.loopMainClickSampleInput.value = loop.mainClick.sample;
      els.loopMainClickChannelBtn.dataset.channel = loop.mainClick.channel;
      els.loopMainClickChannelBtn.textContent = channelLabel(loop.mainClick.channel);
      els.loopStrongBeatEnabledInput.checked = !!loop.mainClick.strongBeatEnabled;
      els.loopStrongBeatClickSampleInput.value = loop.mainClick.strongBeatSample;
      els.loopBpmInput.value = Number(loop.bpm) || 120;
      els.loopTimeSignatureInput.value = loop.timeSignature || "4/4";
      els.loopCountInInput.checked = !!loop.countIn.clickEnabled;
      els.loopCountInBeatsInput.value = loop.countIn.beats;
      els.loopCountInBpmInput.value = loop.countIn.bpm;
      els.loopClickSampleInput.value = loop.countIn.clickSample;
      els.loopCountInBacking1EnabledInput.checked = !!loop.countIn.backing1.enabled;
      els.loopCountInBacking2EnabledInput.checked = !!loop.countIn.backing2.enabled;
      setBackingSlotMeta("loopCountIn:1", loop.countIn.backing1.fileId, loop.countIn.backing1.fileName, loop.countIn.backing1.channel);
      setBackingSlotMeta("loopCountIn:2", loop.countIn.backing2.fileId, loop.countIn.backing2.fileName, loop.countIn.backing2.channel);
    }
  } else {
    els.mainAudioInput.dataset.existingName = "";
    setTrackType("master");
    refreshSectionSlotKeys();
  }

  syncCountInControls();
  syncFilePresenceIndicators();
  updateBackingButtonsFromState();

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
  if (els.masterUploadLabel) {
    const draftName = appState.masterAudioEditor.draftName || "";
    const label = draftName || mainAudioName || "No audio selected";
    els.masterUploadLabel.textContent = label;
  }
  if (els.masterUploadBtn) {
    const hasMasterAudio = !!appState.masterAudioEditor.draftFile || !!mainAudioName;
    els.masterUploadBtn.classList.toggle("has-audio", hasMasterAudio);
  }

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

  updateBackingButtonsFromState();
}

function setMasterPlaybackProgress(ratio) {
  if (!els.masterPlaybackProgressFill) {
    return;
  }
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  els.masterPlaybackProgressFill.style.width = `${Math.round(clamped * 100)}%`;
}

function setMasterPreviewPlayingState(playing) {
  if (!els.masterRecordPlayBtn) {
    return;
  }
  els.masterRecordPlayBtn.classList.toggle("is-playing", !!playing);
}

function setMasterRecordingState(recording) {
  if (!els.masterRecordBtn) {
    return;
  }
  els.masterRecordBtn.classList.toggle("is-recording", !!recording);
}

function stopMasterPreviewAudio(resetProgress = false) {
  const previewAudio = appState.masterAudioEditor.previewAudio;
  if (previewAudio) {
    previewAudio.pause();
    appState.masterAudioEditor.previewAudio = null;
  }
  setMasterPreviewPlayingState(false);
  if (resetProgress) {
    setMasterPlaybackProgress(0);
  }
}

function stopMasterRecorder(resetTimer = false) {
  const recorderState = appState.masterAudioEditor.recorder;
  if (recorderState.mediaRecorder) {
    try {
      if (recorderState.mediaRecorder.state !== "inactive") {
        recorderState.mediaRecorder.stop();
      }
    } catch {
      // Ignore stop errors for already-finished recorder states.
    }
    recorderState.mediaRecorder = null;
  }

  if (recorderState.stream) {
    recorderState.stream.getTracks().forEach((track) => track.stop());
    recorderState.stream = null;
  }

  if (recorderState.timerId) {
    clearInterval(recorderState.timerId);
    recorderState.timerId = null;
  }

  recorderState.chunks = [];
  recorderState.startedAt = 0;
  setMasterRecordingState(false);

  if (resetTimer && els.masterRecordTimer) {
    els.masterRecordTimer.textContent = "00:00";
  }
}

function clearMasterAudioDraft() {
  stopMasterPreviewAudio(true);
  stopMasterRecorder(true);
  appState.masterAudioEditor.draftFile = null;
  appState.masterAudioEditor.draftName = "";
  appState.masterAudioEditor.clearExisting = false;
  if (els.mainAudioInput) {
    els.mainAudioInput.value = "";
  }
  syncFilePresenceIndicators();
}

function onMasterAudioFilePicked() {
  if (els.mainAudioInput.files?.length) {
    appState.masterAudioEditor.draftFile = null;
    appState.masterAudioEditor.draftName = "";
    appState.masterAudioEditor.clearExisting = false;
  }
  stopMasterPreviewAudio(true);
  syncFilePresenceIndicators();
}

function onMasterAudioDelete() {
  stopMasterPreviewAudio(true);
  stopMasterRecorder(true);
  appState.masterAudioEditor.draftFile = null;
  appState.masterAudioEditor.draftName = "";
  appState.masterAudioEditor.clearExisting = true;
  if (els.mainAudioInput) {
    els.mainAudioInput.value = "";
    els.mainAudioInput.dataset.existingName = "";
  }
  syncFilePresenceIndicators();
}

async function onStartMasterRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
    window.alert("Recording is not supported on this device/browser.");
    return;
  }

  stopMasterPreviewAudio(true);
  stopMasterRecorder(true);

  const recorderState = appState.masterAudioEditor.recorder;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    recorderState.stream = stream;
    recorderState.mediaRecorder = mediaRecorder;
    recorderState.chunks = [];
    recorderState.startedAt = Date.now();
    setMasterRecordingState(true);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        recorderState.chunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", () => {
      const blob = recorderState.chunks.length
        ? new Blob(recorderState.chunks, { type: mediaRecorder.mimeType || "audio/webm" })
        : null;

      if (blob && blob.size > 0) {
        const ext = (blob.type || "").includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `master-slate-${Date.now()}.${ext}`, { type: blob.type || "audio/webm" });
        appState.masterAudioEditor.draftFile = file;
        appState.masterAudioEditor.draftName = file.name;
        appState.masterAudioEditor.clearExisting = false;
        if (els.mainAudioInput) {
          els.mainAudioInput.value = "";
          els.mainAudioInput.dataset.existingName = "";
        }
      }

      stopMasterRecorder(false);
      if (els.masterRecordTimer) {
        els.masterRecordTimer.textContent = "00:00";
      }
      syncFilePresenceIndicators();
    });

    recorderState.timerId = setInterval(() => {
      if (!els.masterRecordTimer) {
        return;
      }
      const elapsedSec = Math.max(0, Math.floor((Date.now() - recorderState.startedAt) / 1000));
      const mins = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const secs = String(elapsedSec % 60).padStart(2, "0");
      els.masterRecordTimer.textContent = `${mins}:${secs}`;
    }, 200);

    mediaRecorder.start();
  } catch {
    stopMasterRecorder(true);
    window.alert("Could not start recording. Please check microphone permissions.");
  }
}

function onStopMasterRecording() {
  const recorderState = appState.masterAudioEditor.recorder;
  if (!recorderState.mediaRecorder || recorderState.mediaRecorder.state === "inactive") {
    return;
  }
  recorderState.mediaRecorder.stop();
}

async function onPlayMasterPreview() {
  stopMasterPreviewAudio(true);
  stopMasterRecorder(false);

  const draftFile = appState.masterAudioEditor.draftFile;
  const selectedInputFile = els.mainAudioInput.files?.[0] || null;
  const existingTrack = getEditingTrack();
  const existingMasterFile = existingTrack?.type === "master" ? await getFileById(existingTrack.audioFileId) : null;
  const previewFile = draftFile || selectedInputFile || existingMasterFile;

  if (!previewFile) {
    return;
  }

  const url = URL.createObjectURL(previewFile);
  const audio = new Audio(url);
  appState.masterAudioEditor.previewAudio = audio;
  setMasterPreviewPlayingState(true);
  setMasterPlaybackProgress(0);

  const updateProgress = () => {
    if (!audio.duration || !Number.isFinite(audio.duration)) {
      return;
    }
    setMasterPlaybackProgress(audio.currentTime / audio.duration);
    if (!audio.paused) {
      requestAnimationFrame(updateProgress);
    }
  };

  audio.addEventListener("ended", () => {
    URL.revokeObjectURL(url);
    if (appState.masterAudioEditor.previewAudio === audio) {
      appState.masterAudioEditor.previewAudio = null;
    }
    setMasterPreviewPlayingState(false);
    setMasterPlaybackProgress(0);
  });

  audio.addEventListener("pause", () => {
    if (audio.currentTime < audio.duration) {
      setMasterPreviewPlayingState(false);
    }
  });

  try {
    await audio.play();
    updateProgress();
  } catch {
    URL.revokeObjectURL(url);
    if (appState.masterAudioEditor.previewAudio === audio) {
      appState.masterAudioEditor.previewAudio = null;
    }
    setMasterPreviewPlayingState(false);
    setMasterPlaybackProgress(0);
  }
}

function setTrackType(type) {
  appState.activeType = type;
  const isMaster = type === "master";
  const isBuilt = type === "built";
  const isLoop = type === "loop";

  els.typeMasterBtn.classList.toggle("active", isMaster);
  els.typeBuiltBtn.classList.toggle("active", isBuilt);
  els.typeLoopBtn.classList.toggle("active", isLoop);

  const masterOnlyNodes = document.querySelectorAll(".master-only");
  masterOnlyNodes.forEach((node) => {
    node.style.display = isMaster ? "block" : "none";
  });

  const builtOnlyNodes = document.querySelectorAll(".built-only");
  builtOnlyNodes.forEach((node) => {
    node.style.display = isBuilt ? "block" : "none";
  });

  const loopOnlyNodes = document.querySelectorAll(".loop-only");
  loopOnlyNodes.forEach((node) => {
    node.style.display = isLoop ? "block" : "none";
  });

  const splitOnlyNodes = document.querySelectorAll(".build-split-only");
  splitOnlyNodes.forEach((node) => {
    node.style.display = (isBuilt || isMaster) ? "flex" : "none";
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
  els.masterClickSampleInput.disabled = !masterCountInEnabled;

  const masterStrongBeatEnabled = !!els.masterStrongBeatEnabledInput.checked;
  const masterMainClickEnabled = !!els.masterMainClickEnabledInput.checked;
  els.masterMainClickChannelBtn.disabled = !masterMainClickEnabled;
  els.masterMainClickSampleInput.disabled = !masterMainClickEnabled;
  els.masterMainClickBpmInput.disabled = !masterMainClickEnabled;
  els.masterMainClickTimeSignatureInput.disabled = !masterMainClickEnabled;
  els.masterStrongBeatEnabledInput.disabled = !masterMainClickEnabled;
  els.masterStrongBeatClickSampleInput.disabled = !masterMainClickEnabled || !masterStrongBeatEnabled;

  const builtCountInEnabled = !!els.countInInput.checked;
  els.clickSampleInput.disabled = !builtCountInEnabled;

  const strongBeatEnabled = !!els.strongBeatEnabledInput.checked;
  els.strongBeatClickSampleInput.disabled = !strongBeatEnabled;

  const loopCountInEnabled = !!els.loopCountInInput.checked;
  els.loopCountInBeatsInput.disabled = !loopCountInEnabled;
  els.loopCountInBpmInput.disabled = !loopCountInEnabled;
  els.loopClickSampleInput.disabled = !loopCountInEnabled;

  const loopStrongBeatEnabled = !!els.loopStrongBeatEnabledInput.checked;
  els.loopStrongBeatClickSampleInput.disabled = !loopStrongBeatEnabled;
}

function getQuickPickerField(target) {
  if (!target || !els.trackModal || !els.trackModal.contains(target)) {
    return null;
  }
  const field = target.closest(QUICK_PICKER_FIELD_SELECTOR);
  if (!field || field.disabled) {
    return null;
  }
  return field;
}

function clearQuickPickerHoldTimer() {
  const picker = appState.quickPicker;
  if (picker.holdTimerId) {
    clearTimeout(picker.holdTimerId);
    picker.holdTimerId = null;
  }
}

function closeQuickPicker() {
  const picker = appState.quickPicker;
  clearQuickPickerHoldTimer();
  picker.active = false;
  picker.transient = false;
  picker.field = null;
  picker.kind = "";
  picker.options = [];
  picker.pointerId = null;
  picker.pendingPointerId = null;
  picker.pendingField = null;
  picker.pendingStartY = 0;
  picker.movedBeforeHold = false;
  picker.startY = 0;
  picker.gestureStartSelection = 0;
  if (els.quickPickerRows) {
    els.quickPickerRows.replaceChildren();
  }
  if (els.quickPickerOverlay) {
    els.quickPickerOverlay.classList.add("hidden");
    els.quickPickerOverlay.setAttribute("aria-hidden", "true");
  }
  if (els.quickPickerCard) {
    els.quickPickerCard.classList.remove("sound-mode");
  }
}

function isQuickPickerSoundField(field) {
  return !!field && QUICK_PICKER_SOUND_FIELD_IDS.has(field.id || "");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildQuickPickerOptionsForField(field) {
  if (!field) {
    return null;
  }

  if (field.tagName === "SELECT") {
    const options = [...field.options].map((option, index) => ({
      value: option.value,
      label: option.textContent || option.value,
      index
    }));
    const selectedIndex = clamp(field.selectedIndex >= 0 ? field.selectedIndex : 0, 0, Math.max(0, options.length - 1));
    return {
      kind: "select",
      selectedIndex,
      options
    };
  }

  const minRaw = Number(field.min);
  const maxRaw = Number(field.max);
  const stepRaw = Number(field.step);
  const min = Number.isFinite(minRaw) ? minRaw : 0;
  const max = Number.isFinite(maxRaw) ? maxRaw : min + 100;
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 1;
  const valueRaw = Number(field.value);
  let selectedValue = Number.isFinite(valueRaw) ? valueRaw : min;
  selectedValue = clamp(Math.round(selectedValue / step) * step, min, max);

  return {
    kind: "number",
    selectedIndex: selectedValue,
    min,
    max,
    step,
    options: []
  };
}

function applyQuickPickerSelectionToField() {
  const picker = appState.quickPicker;
  const field = picker.field;
  if (!field) {
    return;
  }

  if (picker.kind === "select") {
    const option = picker.options[picker.selectedIndex];
    if (!option) {
      return;
    }
    if (field.value !== option.value) {
      field.value = option.value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  const nextValue = String(picker.selectedIndex);
  if (field.value !== nextValue) {
    field.value = nextValue;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function quickPickerVisibleRows() {
  const picker = appState.quickPicker;
  const rows = [];
  if (picker.kind === "select") {
    const total = picker.options.length;
    const center = picker.selectedIndex;
    for (let offset = -2; offset <= 2; offset += 1) {
      const index = center + offset;
      if (index < 0 || index >= total) {
        rows.push({ empty: true, label: "", index: -1 });
      } else {
        rows.push({
          empty: false,
          label: picker.options[index].label,
          index
        });
      }
    }
    return rows;
  }

  const { min, max, step } = picker;
  for (let offset = -2; offset <= 2; offset += 1) {
    const value = picker.selectedIndex + (offset * step);
    if (value < min || value > max) {
      rows.push({ empty: true, label: "", value: null });
    } else {
      rows.push({ empty: false, label: String(value), value });
    }
  }
  return rows;
}

function renderQuickPickerRows() {
  if (!els.quickPickerRows) {
    return;
  }

  const rows = quickPickerVisibleRows();
  const nodes = rows.map((row) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `quick-picker-row${row.empty ? " empty" : ""}`;
    button.textContent = row.label;
    if (!row.empty) {
      if (typeof row.index === "number") {
        button.dataset.index = String(row.index);
      }
      if (row.value !== undefined && row.value !== null) {
        button.dataset.value = String(row.value);
      }
    }
    return button;
  });

  els.quickPickerRows.replaceChildren(...nodes);
}

function openQuickPicker(field, options = {}) {
  const model = buildQuickPickerOptionsForField(field);
  if (!model || !els.quickPickerOverlay) {
    return;
  }

  const picker = appState.quickPicker;
  picker.active = true;
  picker.transient = !!options.transient;
  picker.field = field;
  picker.kind = model.kind;
  picker.options = model.options;
  picker.selectedIndex = model.selectedIndex;
  picker.min = model.min ?? 0;
  picker.max = model.max ?? 0;
  picker.step = model.step ?? 1;
  picker.pointerId = options.pointerId ?? null;
  picker.startY = Number(options.startY) || 0;
  picker.gestureStartSelection = model.selectedIndex;

  if (els.quickPickerCard) {
    els.quickPickerCard.classList.toggle("sound-mode", isQuickPickerSoundField(field));
  }

  applyQuickPickerSelectionToField();
  renderQuickPickerRows();

  els.quickPickerOverlay.classList.remove("hidden");
  els.quickPickerOverlay.setAttribute("aria-hidden", "false");
}

function setQuickPickerSelectionFromDelta(deltaSteps) {
  const picker = appState.quickPicker;
  if (!picker.active) {
    return;
  }

  if (picker.kind === "select") {
    const next = clamp(
      picker.gestureStartSelection + deltaSteps,
      0,
      Math.max(0, picker.options.length - 1)
    );
    if (next !== picker.selectedIndex) {
      picker.selectedIndex = next;
      applyQuickPickerSelectionToField();
      renderQuickPickerRows();
    }
    return;
  }

  const raw = picker.gestureStartSelection + (deltaSteps * picker.step);
  const snapped = clamp(Math.round(raw / picker.step) * picker.step, picker.min, picker.max);
  if (snapped !== picker.selectedIndex) {
    picker.selectedIndex = snapped;
    applyQuickPickerSelectionToField();
    renderQuickPickerRows();
  }
}

function nudgeQuickPickerSelection(deltaSteps) {
  const picker = appState.quickPicker;
  if (!picker.active || !Number.isFinite(deltaSteps) || deltaSteps === 0) {
    return;
  }

  if (picker.kind === "select") {
    const next = clamp(
      picker.selectedIndex + deltaSteps,
      0,
      Math.max(0, picker.options.length - 1)
    );
    if (next !== picker.selectedIndex) {
      picker.selectedIndex = next;
      applyQuickPickerSelectionToField();
      renderQuickPickerRows();
    }
    return;
  }

  const nextRaw = picker.selectedIndex + (deltaSteps * picker.step);
  const snapped = clamp(Math.round(nextRaw / picker.step) * picker.step, picker.min, picker.max);
  if (snapped !== picker.selectedIndex) {
    picker.selectedIndex = snapped;
    applyQuickPickerSelectionToField();
    renderQuickPickerRows();
  }
}

function onQuickPickerFieldPointerDown(event) {
  const field = getQuickPickerField(event.target);
  if (!field) {
    return;
  }

  const pointerType = event.pointerType || "mouse";
  if (pointerType !== "touch" && pointerType !== "pen") {
    return;
  }

  event.preventDefault();

  closeQuickPicker();

  const picker = appState.quickPicker;
  picker.pendingPointerId = event.pointerId;
  picker.pendingField = field;
  picker.pendingStartY = event.clientY;
  picker.movedBeforeHold = false;

  clearQuickPickerHoldTimer();
  picker.holdTimerId = window.setTimeout(() => {
    if (picker.pendingPointerId !== event.pointerId || !picker.pendingField) {
      return;
    }
    openQuickPicker(picker.pendingField, {
      transient: true,
      pointerId: event.pointerId,
      startY: picker.pendingStartY
    });
  }, QUICK_PICKER_HOLD_MS);
}

function onQuickPickerFieldClick(event) {
  const field = getQuickPickerField(event.target);
  if (!field) {
    return;
  }

  if (Date.now() < appState.quickPicker.suppressClickUntil) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  openQuickPicker(field, { transient: false });
}

function onQuickPickerPointerMove(event) {
  const picker = appState.quickPicker;
  if (!picker.active || picker.pointerId !== event.pointerId) {
    return;
  }

  const deltaSteps = Math.round((picker.startY - event.clientY) / QUICK_PICKER_STEP_PX);
  if (deltaSteps !== 0) {
    picker.suppressClickUntil = Date.now() + 220;
  }
  setQuickPickerSelectionFromDelta(deltaSteps);
}

function onQuickPickerPointerUp(event) {
  const picker = appState.quickPicker;
  if (picker.pendingPointerId === event.pointerId) {
    const field = picker.pendingField;
    clearQuickPickerHoldTimer();
    picker.pendingPointerId = null;
    picker.pendingField = null;
    picker.pendingStartY = 0;
    picker.movedBeforeHold = false;

    if (!picker.active && field) {
      openQuickPicker(field, { transient: false });
      picker.suppressClickUntil = Date.now() + 380;
      return;
    }
  }

  if (!picker.active || picker.pointerId !== event.pointerId) {
    return;
  }

  if (picker.transient) {
    picker.suppressClickUntil = Date.now() + 280;
    closeQuickPicker();
    return;
  }

  picker.pointerId = null;
}

function onQuickPickerPointerCancel(event) {
  const picker = appState.quickPicker;
  if (picker.pendingPointerId === event.pointerId) {
    clearQuickPickerHoldTimer();
    picker.pendingPointerId = null;
    picker.pendingField = null;
    picker.pendingStartY = 0;
    picker.movedBeforeHold = false;
  }

  if (picker.active && picker.pointerId === event.pointerId) {
    picker.suppressClickUntil = Date.now() + 280;
    closeQuickPicker();
  }
}

function onQuickPickerOverlayPointerDown(event) {
  const picker = appState.quickPicker;
  if (!picker.active) {
    return;
  }

  const pointerType = event.pointerType || "mouse";
  if (pointerType !== "touch" && pointerType !== "pen") {
    return;
  }

  if (!event.target.closest("#quickPickerCard")) {
    return;
  }

  if (picker.pointerId !== null && picker.pointerId !== event.pointerId) {
    return;
  }

  picker.pointerId = event.pointerId;
  picker.startY = event.clientY;
  picker.gestureStartSelection = picker.selectedIndex;
  event.preventDefault();
}

function onQuickPickerOverlayClick(event) {
  if (!appState.quickPicker.active) {
    return;
  }

  const picker = appState.quickPicker;
  if (Date.now() < picker.suppressClickUntil) {
    event.preventDefault();
    return;
  }

  if (!picker.transient) {
    const row = event.target.closest(".quick-picker-row");
    if (row && !row.classList.contains("empty")) {
      if (picker.kind === "select" && row.dataset.index) {
        picker.selectedIndex = Number(row.dataset.index);
      } else if (picker.kind === "number" && row.dataset.value) {
        picker.selectedIndex = Number(row.dataset.value);
      }
      applyQuickPickerSelectionToField();
      renderQuickPickerRows();
      closeQuickPicker();
      return;
    }
  }

  if (!event.target.closest("#quickPickerCard")) {
    closeQuickPicker();
  }
}

function onQuickPickerWheel(event) {
  if (!appState.quickPicker.active) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY > 0 ? 1 : -1;
  nudgeQuickPickerSelection(direction);
}

function addSectionRow(section = {}) {
  const {
    name = "Section",
    bpm = 120,
    timeSignature = "4/4",
    bars = 8,
    backing1 = {},
    backing2 = {}
  } = section;

  const row = document.createElement("div");
  row.className = "section-row";
  row.innerHTML = `
    <div class="section-cell name">
      <div class="section-field-label">Section Name</div>
      <input type="text" class="section-name" value="${escapeAttr(name)}" maxlength="32" placeholder="Section name">
    </div>
    <div class="section-cell">
      <div class="section-field-label">BPM</div>
      <input type="number" class="section-bpm" value="${Number(bpm) || 120}" min="20" max="320" placeholder="BPM">
    </div>
    <div class="section-cell">
      <div class="section-field-label">Meter</div>
      <select class="section-time-signature">
        <option value="4/4" ${timeSignature === "4/4" ? "selected" : ""}>4/4</option>
        <option value="3/4" ${timeSignature === "3/4" ? "selected" : ""}>3/4</option>
        <option value="6/8" ${timeSignature === "6/8" ? "selected" : ""}>6/8</option>
        <option value="7/8" ${timeSignature === "7/8" ? "selected" : ""}>7/8</option>
      </select>
    </div>
    <div class="section-cell">
      <div class="section-field-label">Bars</div>
      <input type="number" class="section-bars" value="${Number(bars) || 8}" min="1" max="256" placeholder="Bars">
    </div>
    <div class="section-cell backing">
      <div class="section-field-label">Backing 1</div>
      <div class="section-backing-controls">
        <button class="audio-btn" type="button" data-backing-slot="section:0:1" aria-label="Configure section backing 1 audio">
          <img src="assets/audio-icon.png" alt="Audio">
        </button>
        <button class="channel-cycle-btn" type="button" data-backing-slot="section:0:1">L</button>
      </div>
    </div>
    <div class="section-cell backing">
      <div class="section-field-label">Backing 2</div>
      <div class="section-backing-controls">
        <button class="audio-btn" type="button" data-backing-slot="section:0:2" aria-label="Configure section backing 2 audio">
          <img src="assets/audio-icon.png" alt="Audio">
        </button>
        <button class="channel-cycle-btn" type="button" data-backing-slot="section:0:2">B</button>
      </div>
    </div>
  `;

  els.sectionList.appendChild(row);
  refreshSectionSlotKeys();

  const rowIndex = [...els.sectionList.querySelectorAll(".section-row")].indexOf(row);
  setBackingSlotMeta(`section:${rowIndex}:1`, backing1.fileId || "", backing1.fileName || "", backing1.channel || "left");
  setBackingSlotMeta(`section:${rowIndex}:2`, backing2.fileId || "", backing2.fileName || "", backing2.channel || "both");
}

function normalizeBuiltTrack(built) {
  const normalizedSections = (built.sections || []).map((section) => {
    const fallbackBacking = {
      fileId: section.backingFileId || "",
      fileName: section.backingName || "",
      channel: section.backing1?.channel || built.splitOutput?.backingChannel || "right"
    };
    return {
      name: section.name || "Section",
      bpm: Number(section.bpm) || 120,
      timeSignature: section.timeSignature || "4/4",
      bars: Number(section.bars) || 1,
      backing1: {
        fileId: section.backing1?.fileId || fallbackBacking.fileId,
        fileName: section.backing1?.fileName || fallbackBacking.fileName,
        channel: section.backing1?.channel || fallbackBacking.channel || "left"
      },
      backing2: {
        fileId: section.backing2?.fileId || "",
        fileName: section.backing2?.fileName || "",
        channel: section.backing2?.channel || "both"
      }
    };
  });

  const countInBacking1 = built.countInBacking1 || built.countInConfig?.backing1 || {
    fileId: "",
    fileName: "",
    channel: "left",
    enabled: false
  };
  const countInBacking2 = built.countInBacking2 || built.countInConfig?.backing2 || {
    fileId: "",
    fileName: "",
    channel: "both",
    enabled: false
  };

  return {
    countIn: {
      clickEnabled: built.countInConfig?.clickEnabled ?? !!built.countIn,
      beats: Number(built.countInConfig?.beats ?? built.countInBeats) || 4,
      bpm: Number(built.countInConfig?.bpm ?? built.countInBpm) || 120,
      clickSample: built.countInConfig?.clickSample || built.countInClickSample || "beep",
      backing1: {
        fileId: countInBacking1.fileId || "",
        fileName: countInBacking1.fileName || "",
        channel: countInBacking1.channel || "left",
        enabled: countInBacking1.enabled ?? !!countInBacking1.fileId
      },
      backing2: {
        fileId: countInBacking2.fileId || "",
        fileName: countInBacking2.fileName || "",
        channel: countInBacking2.channel || "both",
        enabled: countInBacking2.enabled ?? !!countInBacking2.fileId
      }
    },
    mainClick: {
      sample: built.mainClick?.sample || built.mainClickSample || "beep",
      channel: built.mainClick?.channel || built.mainClickChannel || built.splitOutput?.clickChannel || "right",
      strongBeatEnabled: built.mainClick?.strongBeatEnabled ?? !!built.strongBeatEnabled,
      strongBeatSample: built.mainClick?.strongBeatSample || built.strongBeatClickSample || "rim"
    },
    sections: normalizedSections,
    splitOutput: {
      enabled: !!built.splitOutput?.enabled
    }
  };
}

function normalizeLoopTrack(loop) {
  const countInBacking1 = loop.countInConfig?.backing1 || loop.countInBacking1 || {
    fileId: "",
    fileName: "",
    channel: "left",
    enabled: false
  };
  const countInBacking2 = loop.countInConfig?.backing2 || loop.countInBacking2 || {
    fileId: "",
    fileName: "",
    channel: "both",
    enabled: false
  };

  return {
    bpm: Number(loop.bpm) || 120,
    timeSignature: loop.timeSignature || "4/4",
    countIn: {
      clickEnabled: loop.countInConfig?.clickEnabled ?? !!loop.countIn,
      beats: Number(loop.countInConfig?.beats ?? loop.countInBeats) || 4,
      bpm: Number(loop.countInConfig?.bpm ?? loop.countInBpm) || 120,
      clickSample: loop.countInConfig?.clickSample || loop.countInClickSample || "beep",
      backing1: {
        fileId: countInBacking1.fileId || "",
        fileName: countInBacking1.fileName || "",
        channel: countInBacking1.channel || "left",
        enabled: countInBacking1.enabled ?? !!countInBacking1.fileId
      },
      backing2: {
        fileId: countInBacking2.fileId || "",
        fileName: countInBacking2.fileName || "",
        channel: countInBacking2.channel || "both",
        enabled: countInBacking2.enabled ?? !!countInBacking2.fileId
      }
    },
    mainClick: {
      sample: loop.mainClick?.sample || loop.mainClickSample || "beep",
      channel: loop.mainClick?.channel || loop.mainClickChannel || "right",
      strongBeatEnabled: loop.mainClick?.strongBeatEnabled ?? !!loop.strongBeatEnabled,
      strongBeatSample: loop.mainClick?.strongBeatSample || loop.strongBeatClickSample || "rim"
    },
    rendered: loop.rendered || null,
    renderValidation: loop.renderValidation || null
  };
}

function isLoopCountInWindowEnabled(loop) {
  return !!loop.countIn.clickEnabled
    || !!loop.countIn.backing1.enabled
    || !!loop.countIn.backing2.enabled;
}

function isBuiltCountInWindowEnabled(normalizedBuilt) {
  return !!normalizedBuilt.countIn.clickEnabled
    || !!normalizedBuilt.countIn.backing1.enabled
    || !!normalizedBuilt.countIn.backing2.enabled;
}

function resetBackingDraftState() {
  appState.backingEditor.activeSlotKey = "";
  appState.backingEditor.pendingFiles = {};
  appState.backingEditor.pendingNames = {};
  appState.backingEditor.pendingChannels = {};
  appState.backingEditor.pendingDeletes = {};
  clearBackingModalDraft();
  stopBackingRecorder(true);
}

function channelLabel(channel) {
  if (channel === "left") {
    return "L";
  }
  if (channel === "right") {
    return "R";
  }
  return "B";
}

function nextChannel(channel) {
  const currentIndex = CHANNEL_CYCLE.indexOf(channel);
  if (currentIndex < 0) {
    return CHANNEL_CYCLE[0];
  }
  return CHANNEL_CYCLE[(currentIndex + 1) % CHANNEL_CYCLE.length];
}

function getBackingButtonPair(slotKey) {
  if (slotKey === "masterCountIn:1") {
    return { audioBtn: els.masterCountInBacking1AudioBtn, channelBtn: els.masterCountInBacking1ChannelBtn };
  }
  if (slotKey === "masterCountIn:2") {
    return { audioBtn: els.masterCountInBacking2AudioBtn, channelBtn: els.masterCountInBacking2ChannelBtn };
  }
  if (slotKey === "countIn:1") {
    return { audioBtn: els.countInBacking1AudioBtn, channelBtn: els.countInBacking1ChannelBtn };
  }
  if (slotKey === "countIn:2") {
    return { audioBtn: els.countInBacking2AudioBtn, channelBtn: els.countInBacking2ChannelBtn };
  }
  if (slotKey === "loopCountIn:1") {
    return { audioBtn: els.loopCountInBacking1AudioBtn, channelBtn: els.loopCountInBacking1ChannelBtn };
  }
  if (slotKey === "loopCountIn:2") {
    return { audioBtn: els.loopCountInBacking2AudioBtn, channelBtn: els.loopCountInBacking2ChannelBtn };
  }

  const audioBtn = els.sectionList.querySelector(`.audio-btn[data-backing-slot="${slotKey}"]`);
  const channelBtn = els.sectionList.querySelector(`.channel-cycle-btn[data-backing-slot="${slotKey}"]`);
  return { audioBtn, channelBtn };
}

function setBackingSlotMeta(slotKey, fileId, fileName, channel = "both") {
  const { audioBtn, channelBtn } = getBackingButtonPair(slotKey);
  if (audioBtn) {
    audioBtn.dataset.existingFileId = fileId || "";
    audioBtn.dataset.existingFileName = fileName || "";
  }
  setBackingSlotChannel(slotKey, channel);
}

function setBackingSlotChannel(slotKey, channel) {
  const { channelBtn } = getBackingButtonPair(slotKey);
  if (channelBtn) {
    channelBtn.dataset.channel = channel || "both";
    channelBtn.textContent = channelLabel(channel || "both");
  }
}

function updateBackingButtonsFromState() {
  const allAudioButtons = [
    els.masterCountInBacking1AudioBtn,
    els.masterCountInBacking2AudioBtn,
    els.countInBacking1AudioBtn,
    els.countInBacking2AudioBtn,
    els.loopCountInBacking1AudioBtn,
    els.loopCountInBacking2AudioBtn,
    ...els.sectionList.querySelectorAll(".audio-btn[data-backing-slot]")
  ].filter(Boolean);

  allAudioButtons.forEach((button) => {
    const slotKey = button.dataset.backingSlot;
    const pendingFile = appState.backingEditor.pendingFiles[slotKey];
    const pendingDelete = !!appState.backingEditor.pendingDeletes[slotKey];
    const existingId = button.dataset.existingFileId;
    const hasAudio = !!pendingFile || (!pendingDelete && !!existingId);
    button.classList.toggle("has-audio", hasAudio);
  });
}

function refreshSectionSlotKeys() {
  const rows = [...els.sectionList.querySelectorAll(".section-row")];
  rows.forEach((row, index) => {
    const controls = row.querySelectorAll(".section-backing-controls");
    controls.forEach((control, laneIndex) => {
      const lane = laneIndex + 1;
      const nextSlot = `section:${index}:${lane}`;
      const audioBtn = control.querySelector(".audio-btn");
      const channelBtn = control.querySelector(".channel-cycle-btn");

      const prevSlot = audioBtn.dataset.backingSlot;
      if (prevSlot !== nextSlot) {
        if (appState.backingEditor.pendingFiles[prevSlot]) {
          appState.backingEditor.pendingFiles[nextSlot] = appState.backingEditor.pendingFiles[prevSlot];
          delete appState.backingEditor.pendingFiles[prevSlot];
        }
        if (appState.backingEditor.pendingNames[prevSlot]) {
          appState.backingEditor.pendingNames[nextSlot] = appState.backingEditor.pendingNames[prevSlot];
          delete appState.backingEditor.pendingNames[prevSlot];
        }
        if (appState.backingEditor.pendingChannels[prevSlot]) {
          appState.backingEditor.pendingChannels[nextSlot] = appState.backingEditor.pendingChannels[prevSlot];
          delete appState.backingEditor.pendingChannels[prevSlot];
        }
        if (appState.backingEditor.pendingDeletes[prevSlot]) {
          appState.backingEditor.pendingDeletes[nextSlot] = appState.backingEditor.pendingDeletes[prevSlot];
          delete appState.backingEditor.pendingDeletes[prevSlot];
        }
      }

      audioBtn.dataset.backingSlot = nextSlot;
      channelBtn.dataset.backingSlot = nextSlot;
    });
  });

  updateBackingButtonsFromState();
}

function cycleBackingChannel(slotKey) {
  const { channelBtn } = getBackingButtonPair(slotKey);
  if (!channelBtn) {
    return;
  }
  const next = nextChannel(channelBtn.dataset.channel || "both");
  channelBtn.dataset.channel = next;
  channelBtn.textContent = channelLabel(next);
  appState.backingEditor.pendingChannels[slotKey] = next;
}

function cycleMainClickChannel() {
  const current = els.mainClickChannelBtn.dataset.channel || "right";
  const next = nextChannel(current);
  els.mainClickChannelBtn.dataset.channel = next;
  els.mainClickChannelBtn.textContent = channelLabel(next);
}

function cycleChannelButton(button) {
  if (!button) {
    return;
  }
  const current = button.dataset.channel || "right";
  const next = nextChannel(current);
  button.dataset.channel = next;
  button.textContent = channelLabel(next);
}

function clearBackingModalDraft() {
  appState.backingEditor.modalDraft.file = null;
  appState.backingEditor.modalDraft.name = "";
  appState.backingEditor.modalDraft.channel = "both";
  appState.backingEditor.modalDraft.clearExisting = false;
  if (els.backingUploadLabel) {
    els.backingUploadLabel.textContent = "No audio selected";
  }
  if (els.backingUploadBtn) {
    els.backingUploadBtn.classList.remove("has-audio");
  }
  setBackingPlaybackProgress(0);
  setBackingPreviewPlayingState(false);
  setBackingRecordingState(false);
}

function setBackingPlaybackProgress(ratio) {
  if (!els.backingPlaybackProgressFill) {
    return;
  }
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  els.backingPlaybackProgressFill.style.width = `${Math.round(clamped * 100)}%`;
}

function setBackingPreviewPlayingState(playing) {
  if (!els.backingRecordPlayBtn) {
    return;
  }
  els.backingRecordPlayBtn.classList.toggle("is-playing", !!playing);
}

function setBackingRecordingState(recording) {
  if (!els.backingRecordBtn) {
    return;
  }
  els.backingRecordBtn.classList.toggle("is-recording", !!recording);
}

function stopBackingPreviewAudio(resetProgress = false) {
  const recorderState = appState.backingEditor.recorder;
  if (recorderState.audio) {
    recorderState.audio.pause();
    recorderState.audio = null;
  }
  setBackingPreviewPlayingState(false);
  if (resetProgress) {
    setBackingPlaybackProgress(0);
  }
}

function refreshBackingModalUploadUI() {
  const slotKey = appState.backingEditor.activeSlotKey;
  if (!slotKey) {
    clearBackingModalDraft();
    return;
  }

  const draft = appState.backingEditor.modalDraft;
  const { audioBtn } = getBackingButtonPair(slotKey);
  const pendingDelete = !!appState.backingEditor.pendingDeletes[slotKey];
  const fallbackName = pendingDelete || draft.clearExisting
    ? ""
    : (audioBtn?.dataset.existingFileName || appState.backingEditor.pendingNames[slotKey] || "");
  const name = draft.name || fallbackName || "No audio selected";
  const hasAudio = !!draft.file || (!pendingDelete && !draft.clearExisting && !!audioBtn?.dataset.existingFileId) || !!appState.backingEditor.pendingFiles[slotKey];

  els.backingUploadLabel.textContent = name;
  els.backingUploadBtn.classList.toggle("has-audio", hasAudio);
}

function onBackingModalCancel() {
  stopBackingPreviewAudio(true);
  stopBackingRecorder(false);
  clearBackingModalDraft();
  closeModal(els.backingModal);
}

function onBackingModalConfirm() {
  const slotKey = appState.backingEditor.activeSlotKey;
  if (!slotKey) {
    closeModal(els.backingModal);
    return;
  }

  const draft = appState.backingEditor.modalDraft;
  if (draft.file) {
    appState.backingEditor.pendingFiles[slotKey] = draft.file;
    appState.backingEditor.pendingNames[slotKey] = draft.name;
    appState.backingEditor.pendingDeletes[slotKey] = false;
  } else if (draft.clearExisting) {
    delete appState.backingEditor.pendingFiles[slotKey];
    delete appState.backingEditor.pendingNames[slotKey];
    appState.backingEditor.pendingDeletes[slotKey] = true;
  }
  appState.backingEditor.pendingChannels[slotKey] = draft.channel;
  setBackingSlotChannel(slotKey, draft.channel);
  updateBackingButtonsFromState();

  stopBackingPreviewAudio(true);
  stopBackingRecorder(false);
  clearBackingModalDraft();
  closeModal(els.backingModal);
}

function openBackingModal(slotKey) {
  appState.backingEditor.activeSlotKey = slotKey;
  const { channelBtn, audioBtn } = getBackingButtonPair(slotKey);
  const draft = appState.backingEditor.modalDraft;
  const pendingDelete = !!appState.backingEditor.pendingDeletes[slotKey];
  draft.file = pendingDelete ? null : (appState.backingEditor.pendingFiles[slotKey] || null);
  draft.name = pendingDelete ? "" : (appState.backingEditor.pendingNames[slotKey] || audioBtn?.dataset.existingFileName || "");
  draft.channel = appState.backingEditor.pendingChannels[slotKey] || channelBtn?.dataset.channel || "both";
  draft.clearExisting = pendingDelete;

  els.backingModalChannelBtn.dataset.channel = draft.channel;
  els.backingModalChannelBtn.textContent = channelLabel(draft.channel);
  els.backingRecordTimer.textContent = "00:00";
  els.backingModalFileInput.value = "";
  setBackingPlaybackProgress(0);
  setBackingPreviewPlayingState(false);
  setBackingRecordingState(false);
  refreshBackingModalUploadUI();
  openModal(els.backingModal);
}

async function onBackingModalUploadFile() {
  const file = els.backingModalFileInput.files?.[0];
  if (!file) {
    return;
  }

  const slotKey = appState.backingEditor.activeSlotKey;
  if (!slotKey) {
    return;
  }

  appState.backingEditor.modalDraft.file = file;
  appState.backingEditor.modalDraft.name = file.name;
  appState.backingEditor.modalDraft.clearExisting = false;
  setBackingPlaybackProgress(0);
  refreshBackingModalUploadUI();
}

function onBackingModalDelete() {
  const slotKey = appState.backingEditor.activeSlotKey;
  if (!slotKey) {
    return;
  }

  stopBackingPreviewAudio(true);
  stopBackingRecorder(true);
  appState.backingEditor.modalDraft.file = null;
  appState.backingEditor.modalDraft.name = "";
  appState.backingEditor.modalDraft.clearExisting = true;
  refreshBackingModalUploadUI();
}

function onBackingModalCycleChannel() {
  const slotKey = appState.backingEditor.activeSlotKey;
  if (!slotKey) {
    return;
  }
  const next = nextChannel(els.backingModalChannelBtn.dataset.channel || "both");
  els.backingModalChannelBtn.dataset.channel = next;
  els.backingModalChannelBtn.textContent = channelLabel(next);
  appState.backingEditor.modalDraft.channel = next;
}

async function onStartBackingRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
    window.alert("Recording is not supported on this device/browser.");
    return;
  }

  const recorderState = appState.backingEditor.recorder;
  stopBackingPreviewAudio(true);
  stopBackingRecorder(true);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    recorderState.stream = stream;
    recorderState.mediaRecorder = mediaRecorder;
    recorderState.chunks = [];
    recorderState.startedAt = Date.now();
    setBackingRecordingState(true);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        recorderState.chunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", () => {
      if (!recorderState.chunks.length) {
        return;
      }
      const blob = new Blob(recorderState.chunks, { type: "audio/webm" });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: "audio/webm" });
      const slotKey = appState.backingEditor.activeSlotKey;
      if (slotKey) {
        appState.backingEditor.modalDraft.file = file;
        appState.backingEditor.modalDraft.name = file.name;
        appState.backingEditor.modalDraft.clearExisting = false;
      }
      setBackingPlaybackProgress(0);
      refreshBackingModalUploadUI();
      recorderState.chunks = [];
    });

    mediaRecorder.start();
    recorderState.timerId = setInterval(() => {
      const elapsedSec = Math.max(0, Math.floor((Date.now() - recorderState.startedAt) / 1000));
      const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
      const ss = String(elapsedSec % 60).padStart(2, "0");
      els.backingRecordTimer.textContent = `${mm}:${ss}`;
    }, 250);
  } catch {
    window.alert("Microphone access was denied or unavailable.");
  }
}

function onStopBackingRecording() {
  stopBackingRecorder(false);
}

function stopBackingRecorder(resetTimer = false) {
  const recorderState = appState.backingEditor.recorder;
  if (recorderState.timerId) {
    clearInterval(recorderState.timerId);
    recorderState.timerId = null;
  }
  if (resetTimer && els.backingRecordTimer) {
    els.backingRecordTimer.textContent = "00:00";
  }

  if (recorderState.mediaRecorder && recorderState.mediaRecorder.state !== "inactive") {
    recorderState.mediaRecorder.stop();
  }
  recorderState.mediaRecorder = null;
  setBackingRecordingState(false);

  if (recorderState.stream) {
    recorderState.stream.getTracks().forEach((track) => track.stop());
    recorderState.stream = null;
  }

  stopBackingPreviewAudio(resetTimer);
}

async function onPlayBackingPreview() {
  const slotKey = appState.backingEditor.activeSlotKey;
  if (!slotKey) {
    return;
  }

  const recorderState = appState.backingEditor.recorder;
  stopBackingPreviewAudio(true);

  const pendingFile = appState.backingEditor.modalDraft.file || appState.backingEditor.pendingFiles[slotKey];
  const { audioBtn } = getBackingButtonPair(slotKey);
  const pendingDelete = !!appState.backingEditor.pendingDeletes[slotKey] || !!appState.backingEditor.modalDraft.clearExisting;
  const existingId = audioBtn?.dataset.existingFileId || "";
  const existingFile = (!pendingDelete && existingId) ? await getFileById(existingId) : null;
  const fileToPlay = pendingFile || existingFile;
  if (!fileToPlay) {
    return;
  }

  const url = URL.createObjectURL(fileToPlay);
  const audio = new Audio(url);
  recorderState.audio = audio;
  setBackingPreviewPlayingState(true);

  const updateProgress = () => {
    if (recorderState.audio !== audio) {
      return;
    }
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      setBackingPlaybackProgress(0);
      return;
    }
    setBackingPlaybackProgress(audio.currentTime / audio.duration);
  };

  const cleanup = (completed = false) => {
    if (completed) {
      setBackingPlaybackProgress(1);
    }
    URL.revokeObjectURL(url);
    setBackingPreviewPlayingState(false);
    if (recorderState.audio === audio) {
      recorderState.audio = null;
    }
  };

  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("ended", () => {
    cleanup(true);
  });
  audio.addEventListener("pause", () => {
    if (audio.ended) {
      return;
    }
    cleanup(false);
  });
  audio.addEventListener("error", () => {
    setBackingPlaybackProgress(0);
    cleanup(false);
  });

  try {
    await audio.play();
    updateProgress();
  } catch {
    setBackingPlaybackProgress(0);
    URL.revokeObjectURL(url);
    setBackingPreviewPlayingState(false);
    if (recorderState.audio === audio) {
      recorderState.audio = null;
    }
  }
}

async function persistBackingSlot(slotKey, fallback = null, options = {}) {
  options.throwIfCancelled?.();
  const pendingFile = appState.backingEditor.pendingFiles[slotKey] || null;
  const pendingDelete = !!appState.backingEditor.pendingDeletes[slotKey];
  const { audioBtn, channelBtn } = getBackingButtonPair(slotKey);

  let fileId = pendingDelete ? "" : (audioBtn?.dataset.existingFileId || fallback?.fileId || "");
  let fileName = pendingDelete ? "" : (audioBtn?.dataset.existingFileName || fallback?.fileName || "");
  const previousFileId = audioBtn?.dataset.existingFileId || fallback?.fileId || "";

  if (pendingDelete && previousFileId) {
    await deleteFileFromDb(previousFileId);
    options.throwIfCancelled?.();
  }

  if (pendingFile) {
    const replacingFileId = fileId;
    fileId = await saveFileToDb(pendingFile);
    options.throwIfCancelled?.();
    fileName = pendingFile.name;
    if (replacingFileId && replacingFileId !== fileId) {
      await deleteFileFromDb(replacingFileId);
      options.throwIfCancelled?.();
    }
  }

  const channel = appState.backingEditor.pendingChannels[slotKey]
    || channelBtn?.dataset.channel
    || fallback?.channel
    || "both";

  return {
    fileId,
    fileName,
    channel,
    enabled: !!fileId
  };
}

async function onSubmitTrack(event) {
  event.preventDefault();

  if (appState.trackSave.active) {
    return;
  }

  const displayName = els.trackNameInput.value.trim();
  if (!displayName) {
    return;
  }

  const saveToken = beginTrackSaveSession();
  const saveOptions = {
    onProgress: (percent, message) => updateTrackSaveProgress(saveToken, percent, message),
    throwIfCancelled: () => throwIfTrackSaveCancelled(saveToken)
  };

  try {
    updateTrackSaveProgress(saveToken, 4, "Collecting track settings...");

    let nextTrack;
    if (appState.activeType === "master") {
      nextTrack = await buildMasterTrack(displayName, saveOptions);
    } else if (appState.activeType === "built") {
      nextTrack = await buildBuiltTrack(displayName, saveOptions);
    } else {
      nextTrack = await buildLoopTrack(displayName, saveOptions);
    }

    throwIfTrackSaveCancelled(saveToken);

    if (!nextTrack) {
      endTrackSaveSession(saveToken);
      return;
    }

    updateTrackSaveProgress(saveToken, 96, "Finalizing track...");
    throwIfTrackSaveCancelled(saveToken);

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

    updateTrackSaveProgress(saveToken, 100, "Track saved.");
    endTrackSaveSession(saveToken);
    closeModal(els.trackModal);
    render();
  } catch (error) {
    if (!isTrackSaveCancelledError(error)) {
      endTrackSaveSession(saveToken);
      window.alert("Unable to save this track. Please try again.");
    }
  }
}

async function buildMasterTrack(displayName, options = {}) {
  options.throwIfCancelled?.();
  options.onProgress?.(12, "Preparing master audio...");

  const editingTrack = getEditingTrack();
  const clearExistingAudio = !!appState.masterAudioEditor.clearExisting;
  const selectedFile = appState.masterAudioEditor.draftFile || els.mainAudioInput.files[0];
  const selectedAudio = selectedFile
    || (editingTrack && editingTrack.type === "master" && !clearExistingAudio ? await getFileById(editingTrack.audioFileId) : null);

  if (!selectedAudio) {
    window.alert("Master Slate requires an audio file.");
    return null;
  }

  const audioFileId = selectedFile
    ? await saveFileToDb(selectedFile)
    : editingTrack.audioFileId;
  options.throwIfCancelled?.();

  if (selectedFile && editingTrack?.type === "master" && editingTrack.audioFileId && editingTrack.audioFileId !== audioFileId) {
    await deleteFileFromDb(editingTrack.audioFileId);
    options.throwIfCancelled?.();
  }

  options.onProgress?.(34, "Reading audio metadata...");
  const meta = await getAudioMetadata(selectedAudio);
  options.throwIfCancelled?.();

  const previousCountIn = editingTrack?.masterCountIn || {};
  options.onProgress?.(52, "Saving count-in backing audio...");
  const countInBacking1 = await persistBackingSlot("masterCountIn:1", previousCountIn.backing1 || null, options);
  const countInBacking2 = await persistBackingSlot("masterCountIn:2", previousCountIn.backing2 || null, options);
  options.throwIfCancelled?.();
  countInBacking1.enabled = !!els.masterCountInBacking1EnabledInput.checked;
  countInBacking2.enabled = !!els.masterCountInBacking2EnabledInput.checked;

  options.onProgress?.(76, "Building track data...");

  const masterClickEnabled = !!els.masterCountInInput.checked;
  const masterMainClickEnabled = !!els.masterMainClickEnabledInput.checked;
  const masterMainClickChannel = els.masterMainClickChannelBtn.dataset.channel || "right";
  const masterAudioChannel = els.masterAudioChannelBtn.dataset.channel || "left";
  const masterStrongBeatEnabled = !!els.masterStrongBeatEnabledInput.checked;

  const draftMaster = {
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
    masterSplitOutput: {
      enabled: !!els.splitOutputInput.checked,
      audioChannel: masterAudioChannel
    },
    masterCountIn: {
      enabled: masterClickEnabled || !!countInBacking1.enabled || !!countInBacking2.enabled,
      clickEnabled: masterClickEnabled,
      beats: Number(els.masterCountInBeatsInput.value) || 4,
      bpm: Number(els.masterCountInBpmInput.value) || 120,
      clickSample: els.masterClickSampleInput.value,
      backing1: countInBacking1,
      backing2: countInBacking2,
      mainClick: {
        enabled: masterMainClickEnabled,
        sample: els.masterMainClickSampleInput.value || "beep",
        channel: masterMainClickChannel,
        bpm: Number(els.masterMainClickBpmInput.value) || 120,
        timeSignature: els.masterMainClickTimeSignatureInput.value || "4/4",
        strongBeatEnabled: masterStrongBeatEnabled,
        strongBeatSample: els.masterStrongBeatClickSampleInput.value || "rim"
      }
    }
  };

  if (editingTrack?.type === "master") {
    draftMaster.masterRendered = editingTrack.masterRendered || null;
    draftMaster.masterRenderValidation = editingTrack.masterRenderValidation || null;
  } else {
    draftMaster.masterRendered = null;
    draftMaster.masterRenderValidation = null;
  }

  if (masterMainClickEnabled) {
    options.onProgress?.(84, "Rendering master stems...");
    const renderResult = await renderAndPersistMasterTrackAssets(draftMaster, options);
    draftMaster.masterRendered = renderResult.rendered;
    draftMaster.masterRenderValidation = renderResult.validation;
  } else if (draftMaster.masterRendered?.clickFileId || draftMaster.masterRendered?.backingFileId) {
    const previousClickId = draftMaster.masterRendered.clickFileId;
    const previousBackingId = draftMaster.masterRendered.backingFileId;
    if (previousClickId) {
      await deleteFileFromDb(previousClickId);
      options.throwIfCancelled?.();
    }
    if (previousBackingId) {
      await deleteFileFromDb(previousBackingId);
      options.throwIfCancelled?.();
    }
    draftMaster.masterRendered = null;
    draftMaster.masterRenderValidation = null;
  }

  return draftMaster;
}

async function buildBuiltTrack(displayName, options = {}) {
  options.throwIfCancelled?.();
  options.onProgress?.(10, "Preparing sections...");

  const sectionRows = [...els.sectionList.querySelectorAll(".section-row")];
  const editingTrack = getEditingTrack();
  const editingBuilt = normalizeBuiltTrack(editingTrack?.built || {});

  const sections = [];
  for (let index = 0; index < sectionRows.length; index += 1) {
    options.throwIfCancelled?.();
    const row = sectionRows[index];
    const backing1 = await persistBackingSlot(`section:${index}:1`, editingBuilt.sections[index]?.backing1 || null, options);
    const backing2 = await persistBackingSlot(`section:${index}:2`, editingBuilt.sections[index]?.backing2 || null, options);

    sections.push({
      name: row.querySelector(".section-name").value.trim() || "Section",
      bpm: Number(row.querySelector(".section-bpm").value) || 120,
      timeSignature: row.querySelector(".section-time-signature").value || "4/4",
      bars: Number(row.querySelector(".section-bars").value) || 1,
      backingFileId: backing1.fileId,
      backingName: backing1.fileName,
      backing1,
      backing2
    });

    const sectionProgress = 10 + Math.round(((index + 1) / Math.max(1, sectionRows.length)) * 36);
    options.onProgress?.(sectionProgress, "Saving section audio...");
  }

  if (!sections.length) {
    window.alert("Build Track requires at least one section.");
    return null;
  }

  options.onProgress?.(50, "Saving count-in backing audio...");
  const countInBacking1 = await persistBackingSlot("countIn:1", editingBuilt.countIn.backing1 || null, options);
  const countInBacking2 = await persistBackingSlot("countIn:2", editingBuilt.countIn.backing2 || null, options);
  options.throwIfCancelled?.();
  countInBacking1.enabled = !!els.countInBacking1EnabledInput.checked;
  countInBacking2.enabled = !!els.countInBacking2EnabledInput.checked;
  const mainClickChannel = els.mainClickChannelBtn.dataset.channel || "right";
  const countInClickEnabled = !!els.countInInput.checked;
  const strongBeatEnabled = !!els.strongBeatEnabledInput.checked;

  const draftBuilt = {
    countIn: countInClickEnabled,
    countInBeats: Number(els.countInBeatsInput.value) || 4,
    countInBpm: Number(els.countInBpmInput.value) || 120,
    countInClickSample: els.clickSampleInput.value,
    countInBacking1,
    countInBacking2,
    mainClickSample: els.mainClickSampleInput.value,
    mainClickChannel,
    strongBeatEnabled,
    strongBeatClickSample: els.strongBeatClickSampleInput.value,
    sections,
    countInConfig: {
      clickEnabled: countInClickEnabled,
      beats: Number(els.countInBeatsInput.value) || 4,
      bpm: Number(els.countInBpmInput.value) || 120,
      clickSample: els.clickSampleInput.value,
      backing1: countInBacking1,
      backing2: countInBacking2
    },
    mainClick: {
      sample: els.mainClickSampleInput.value,
      channel: mainClickChannel,
      strongBeatEnabled,
      strongBeatSample: els.strongBeatClickSampleInput.value
    },
    splitOutput: {
      enabled: !!els.splitOutputInput.checked
    },
    rendered: editingTrack?.type === "built" ? editingTrack.built?.rendered : null
  };

  options.onProgress?.(60, "Rendering track stems...");
  const renderResult = await renderAndPersistBuiltTrackAssets(draftBuilt, options);
  options.throwIfCancelled?.();

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

async function buildLoopTrack(displayName, options = {}) {
  options.throwIfCancelled?.();
  options.onProgress?.(12, "Preparing loop settings...");

  const editingTrack = getEditingTrack();
  const previousLoop = normalizeLoopTrack(editingTrack?.loop || {});
  options.onProgress?.(36, "Saving count-in backing audio...");
  const countInBacking1 = await persistBackingSlot("loopCountIn:1", previousLoop.countIn.backing1 || null, options);
  const countInBacking2 = await persistBackingSlot("loopCountIn:2", previousLoop.countIn.backing2 || null, options);
  options.throwIfCancelled?.();
  countInBacking1.enabled = !!els.loopCountInBacking1EnabledInput.checked;
  countInBacking2.enabled = !!els.loopCountInBacking2EnabledInput.checked;

  const countInClickEnabled = !!els.loopCountInInput.checked;
  const loopMainClickChannel = els.loopMainClickChannelBtn.dataset.channel || "right";
  const loopStrongBeatEnabled = !!els.loopStrongBeatEnabledInput.checked;

  const draftLoop = {
    bpm: Number(els.loopBpmInput.value) || 120,
    timeSignature: els.loopTimeSignatureInput.value || "4/4",
    countIn: countInClickEnabled,
    countInBeats: Number(els.loopCountInBeatsInput.value) || 4,
    countInBpm: Number(els.loopCountInBpmInput.value) || 120,
    countInClickSample: els.loopClickSampleInput.value || "beep",
    countInBacking1,
    countInBacking2,
    countInConfig: {
      clickEnabled: countInClickEnabled,
      beats: Number(els.loopCountInBeatsInput.value) || 4,
      bpm: Number(els.loopCountInBpmInput.value) || 120,
      clickSample: els.loopClickSampleInput.value || "beep",
      backing1: countInBacking1,
      backing2: countInBacking2
    },
    mainClickSample: els.loopMainClickSampleInput.value || "beep",
    mainClickChannel: loopMainClickChannel,
    strongBeatEnabled: loopStrongBeatEnabled,
    strongBeatClickSample: els.loopStrongBeatClickSampleInput.value || "rim",
    mainClick: {
      sample: els.loopMainClickSampleInput.value || "beep",
      channel: loopMainClickChannel,
      strongBeatEnabled: loopStrongBeatEnabled,
      strongBeatSample: els.loopStrongBeatClickSampleInput.value || "rim"
    },
    customMainClickFileId: null,
    customMainClickFileName: "",
    customStrongBeatFileId: null,
    customStrongBeatFileName: "",
    rendered: editingTrack?.type === "loop" ? editingTrack.loop?.rendered : null
  };

  options.onProgress?.(60, "Rendering loop audio...");
  const renderResult = await renderAndPersistLoopTrackAssets(draftLoop, options);
  options.throwIfCancelled?.();

  if (editingTrack?.type === "loop") {
    if (editingTrack.loop?.customMainClickFileId) {
      await deleteFileFromDb(editingTrack.loop.customMainClickFileId);
      options.throwIfCancelled?.();
    }
    if (editingTrack.loop?.customStrongBeatFileId) {
      await deleteFileFromDb(editingTrack.loop.customStrongBeatFileId);
      options.throwIfCancelled?.();
    }
  }

  return {
    id: crypto.randomUUID(),
    type: "loop",
    displayName,
    loop: {
      ...draftLoop,
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
  } else if (track.type === "loop") {
    await playLoopTrack(track, sessionId);
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
  if (isMasterMainClickEnabled(track) && track.masterRendered?.ready) {
    const renderedOk = await playMasterTrackRendered(track, sessionId);
    if (renderedOk) {
      return;
    }
  }

  const file = await getFileById(track.audioFileId);
  if (!file) {
    window.alert("Audio file is missing. Use Replace Audio to relink the file.");
    return;
  }

  let cancelled = false;
  const timers = [];
  const activeAudios = [];
  let countInContext = null;
  let mainClickIntervalId = null;
  let audio = null;
  let audioUrl = null;
  let masterAudioSource = null;
  let masterAudioPanner = null;
  let diagDumped = false;
  const countInConfig = track.masterCountIn || {};
  const splitOutputConfig = track.masterSplitOutput || {};
  const splitOutputEnabled = !!splitOutputConfig.enabled;
  const masterMainClickEnabled = isMasterMainClickEnabled(track);
  const masterAudioPan = splitOutputEnabled ? panValue(splitOutputConfig.audioChannel || "left") : 0;
  const countInClickEnabled = countInConfig.clickEnabled ?? !!countInConfig.enabled;
  const countInBeats = countInClickEnabled ? (Number(countInConfig.beats) || 4) : 0;
  const countInBpm = Number(countInConfig.bpm) || 120;
  const durationSec = Number(track.lockedMeta?.lengthSec) || totalTrackSeconds(track);
  let playbackVisualStarted = false;

  const stop = () => {
    cancelled = true;
    timers.forEach((timerId) => clearTimeout(timerId));
    if (mainClickIntervalId !== null) {
      clearInterval(mainClickIntervalId);
      mainClickIntervalId = null;
    }
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
    if (masterAudioSource) {
      masterAudioSource.disconnect();
      masterAudioSource = null;
    }
    if (masterAudioPanner) {
      masterAudioPanner.disconnect();
      masterAudioPanner = null;
    }
    activeAudios.forEach(({ audio: extraAudio, url }) => {
      extraAudio.pause();
      extraAudio.currentTime = 0;
      URL.revokeObjectURL(url);
    });
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

  const masterCountInBacking1 = countInConfig.backing1 || {};
  const masterCountInBacking2 = countInConfig.backing2 || {};
  const countInWindowEnabled = countInClickEnabled || !!masterCountInBacking1.enabled || !!masterCountInBacking2.enabled;

  if (countInWindowEnabled) {
    countInContext = new (window.AudioContext || window.webkitAudioContext)();
    if (countInContext.state === "suspended") {
      await countInContext.resume();
    }

    const countInSample = countInConfig.clickSample || "beep";
    const builtInClickBuffers = await loadBuiltInSampleBuffersForContext(countInContext, [countInSample]);
    const countInResolvedBuffer = builtInClickBuffers.get(countInSample) || null;

    const beatDuration = 60 / (Number(countInConfig.bpm) || 120);
    const beatTotal = countInClickEnabled ? (Number(countInConfig.beats) || 4) : 0;
    const timelineStartAt = countInContext.currentTime + (PLAY_SYNC_PREP_MS / 1000);
    const firstBeatAt = countInClickEnabled ? timelineStartAt + (COUNT_IN_PREROLL_MS / 1000) : null;
    const countInClock = makeContextClock(countInContext);

    if (countInClickEnabled && firstBeatAt !== null) {
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
    }

    const backingStartAt = countInClickEnabled && firstBeatAt !== null ? firstBeatAt : timelineStartAt;
    const countInLaneRuntime = [];
    for (const lane of [masterCountInBacking1, masterCountInBacking2]) {
      if (!lane.enabled || !lane.fileId) {
        continue;
      }
      const laneFile = await getFileById(lane.fileId);
      if (!laneFile) {
        continue;
      }
      const laneMeta = await getAudioMetadata(laneFile);
      countInLaneRuntime.push({
        lane,
        file: laneFile,
        durationSec: Math.max(0, Number(laneMeta.durationSec) || 0)
      });
    }

    const clickCountInDurationSec = countInClickEnabled && beatTotal > 0
      ? (COUNT_IN_PREROLL_MS / 1000) + beatTotal * beatDuration
      : 0;
    const backingCountInDurationSec = countInLaneRuntime.reduce((maxSec, entry) => Math.max(maxSec, entry.durationSec), 0);
    const countInDurationSec = Math.max(clickCountInDurationSec, backingCountInDurationSec);

    for (const entry of countInLaneRuntime) {
      const delayMs = Math.max(0, (backingStartAt - countInContext.currentTime) * 1000);
      const timer = setTimeout(() => {
        if (cancelled || !countInContext || countInContext.state === "closed") {
          return;
        }
        const url = URL.createObjectURL(entry.file);
        const laneAudio = new Audio(url);
        const source = countInContext.createMediaElementSource(laneAudio);
        const panner = countInContext.createStereoPanner();
        panner.pan.value = panValue(entry.lane.channel || "both");
        source.connect(panner).connect(countInContext.destination);
        laneAudio.play();
        activeAudios.push({ audio: laneAudio, url });
      }, delayMs);
      timers.push(timer);
    }

    const countInEndsAt = timelineStartAt + countInDurationSec;
    startPlaybackVisual(track, sessionId, {
      countInBeats: countInClickEnabled ? countInBeats : 0,
      countInBpm,
      trackDurationSec: durationSec,
      countInStartWallMs: countInDurationSec > 0
        ? expectedWallTimeMs(countInClock, countInClickEnabled && firstBeatAt !== null ? firstBeatAt : timelineStartAt)
        : null,
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

  if (!countInContext || countInContext.state === "closed") {
    countInContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (countInContext.state === "suspended") {
    await countInContext.resume();
  }

  if (masterMainClickEnabled) {
    const masterMainClick = countInConfig.mainClick || {};
    const masterMainClickBpm = Math.max(20, Number(masterMainClick.bpm) || 120);
    const masterMainClickBeatDurationSec = 60 / masterMainClickBpm;
    const masterMainClickBeatsPerBar = beatsPerBarFromSignature(masterMainClick.timeSignature || "4/4");
    const masterMainClickSample = masterMainClick.sample || "beep";
    const masterStrongBeatSpec = resolveStrongBeatSpec(
      masterMainClickSample,
      masterMainClick.strongBeatSample || "rim",
      false
    );
    const masterMainClickPan = splitOutputEnabled ? panValue(masterMainClick.channel || "right") : 0;
    const masterMainClickBuffers = await loadBuiltInSampleBuffersForContext(
      countInContext,
      [masterMainClickSample, masterStrongBeatSpec.sample]
    );
    const masterMainClickClock = makeContextClock(countInContext);
    let masterMainClickNextBeatAt = 0;
    let masterMainClickBeatIndex = 0;
    let masterMainClickStarted = false;

    const scheduleMasterMainClick = () => {
      if (cancelled || !countInContext || countInContext.state === "closed") {
        return;
      }

      while (masterMainClickNextBeatAt < countInContext.currentTime + 0.2) {
        const isStrongBeat = !!masterMainClick.strongBeatEnabled
          && (masterMainClickBeatIndex % masterMainClickBeatsPerBar) === 0;
        if (isStrongBeat) {
          scheduleClickCueAt(
            countInContext,
            masterMainClickBuffers.get(masterStrongBeatSpec.sample) || null,
            masterStrongBeatSpec.sample,
            masterMainClickPan,
            masterMainClickNextBeatAt,
            {
              sessionId,
              label: "master main strong beat",
              clock: masterMainClickClock
            },
            { playbackRate: masterStrongBeatSpec.playbackRate }
          );
        } else {
          scheduleClickCueAt(
            countInContext,
            masterMainClickBuffers.get(masterMainClickSample) || null,
            masterMainClickSample,
            masterMainClickPan,
            masterMainClickNextBeatAt,
            {
              sessionId,
              label: "master main click beat",
              clock: masterMainClickClock
            }
          );
        }

        masterMainClickNextBeatAt += masterMainClickBeatDurationSec;
        masterMainClickBeatIndex += 1;
      }
    };

    audio.addEventListener("playing", () => {
      if (masterMainClickStarted || cancelled || !countInContext || countInContext.state === "closed") {
        return;
      }
      masterMainClickStarted = true;
      masterMainClickNextBeatAt = countInContext.currentTime + 0.02;
      scheduleMasterMainClick();
      mainClickIntervalId = setInterval(scheduleMasterMainClick, 60);
    }, { once: true });
  }

  masterAudioSource = countInContext.createMediaElementSource(audio);
  masterAudioPanner = countInContext.createStereoPanner();
  masterAudioPanner.pan.value = masterAudioPan;
  masterAudioSource.connect(masterAudioPanner).connect(countInContext.destination);

  audio.addEventListener("ended", () => {
    if (mainClickIntervalId !== null) {
      clearInterval(mainClickIntervalId);
      mainClickIntervalId = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
    if (masterAudioSource) {
      masterAudioSource.disconnect();
      masterAudioSource = null;
    }
    if (masterAudioPanner) {
      masterAudioPanner.disconnect();
      masterAudioPanner = null;
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

async function playMasterTrackRendered(track, sessionId) {
  let cancelled = false;
  const activeAudios = [];
  const rendered = track.masterRendered || {};

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

  const durationSec = Number(rendered.durationSec)
    || Number(track.lockedMeta?.lengthSec)
    || totalTrackSeconds(track);
  const countInConfig = track.masterCountIn || {};
  const countInClickEnabled = !!countInConfig.clickEnabled;
  const countInWindowEnabled = countInClickEnabled
    || !!countInConfig.backing1?.enabled
    || !!countInConfig.backing2?.enabled;
  const countInBeats = countInClickEnabled && countInWindowEnabled ? (Number(countInConfig.beats) || 4) : 0;
  const countInBpm = Number(countInConfig.bpm) || 120;
  const renderedCountInDurationSec = Number(rendered.countInDurationSec);
  const countInDurationMs = countInWindowEnabled
    ? (Number.isFinite(renderedCountInDurationSec)
      ? Math.max(0, renderedCountInDurationSec * 1000)
      : (countInBeats > 0 ? countInBeats * (60000 / countInBpm) : 0))
    : 0;

  const playbackStartWallMs = performance.now();
  startPlaybackVisual(track, sessionId, {
    countInBeats,
    countInBpm,
    trackDurationSec: durationSec,
    countInStartWallMs: countInDurationMs > 0 ? playbackStartWallMs : null,
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
    label: "master-rendered-playback-start",
    source: "rendered",
    expectedStartWallMs: roundMs(performance.now()),
    expectedEndWallMs: roundMs(performance.now() + durationSec * 1000),
    actualEndWallMs: null,
    driftMs: null
  });

  return true;
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
  const built = normalizeBuiltTrack(track.built || {});
  const countInWindowEnabled = isBuiltCountInWindowEnabled(built);
  const countInClickEnabled = !!built.countIn.clickEnabled;
  const countInBeats = countInClickEnabled && countInWindowEnabled ? (Number(built.countIn.beats) || 4) : 0;
  const countInBpm = Number(built.countIn.bpm) || 120;
  const renderedCountInDurationSec = Number(rendered.countInDurationSec);
  const countInDurationMs = countInWindowEnabled
    ? (Number.isFinite(renderedCountInDurationSec)
      ? Math.max(0, renderedCountInDurationSec * 1000)
      : (countInBeats > 0 ? COUNT_IN_PREROLL_MS + (countInBeats * (60000 / countInBpm)) : 0))
    : 0;
  const playbackStartWallMs = performance.now();
  startPlaybackVisual(track, sessionId, {
    countInBeats,
    countInBpm,
    trackDurationSec: totalTrackSeconds(track),
    countInStartWallMs: countInDurationMs > 0
      ? (countInClickEnabled && countInBeats > 0 ? playbackStartWallMs + COUNT_IN_PREROLL_MS : playbackStartWallMs)
      : null,
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
  const built = normalizeBuiltTrack(track.built || {});
  const context = new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") {
    await context.resume();
  }

  let cancelled = false;
  const timers = [];
  const activeAudios = [];
  const durationSec = totalTrackSeconds(track);
  const sections = built.sections || [];

  const clickPan = built.splitOutput.enabled ? panValue(built.mainClick.channel) : 0;

  let countInClip = track.built.customCountInFileId ? await getFileById(track.built.customCountInFileId) : null;
  let countInBuffer = null;
  if (countInClip) {
    countInBuffer = await decodeFileToAudioBuffer(context, countInClip);
  }

  let customMainClickClip = track.built.customMainClickFileId ? await getFileById(track.built.customMainClickFileId) : null;
  let customMainClickBuffer = null;
  if (customMainClickClip) {
    customMainClickBuffer = await decodeFileToAudioBuffer(context, customMainClickClip);
  }

  let customStrongBeatClip = track.built.customStrongBeatFileId ? await getFileById(track.built.customStrongBeatFileId) : null;
  let customStrongBeatBuffer = null;
  if (customStrongBeatClip) {
    customStrongBeatBuffer = await decodeFileToAudioBuffer(context, customStrongBeatClip);
  }

  const countInSample = built.countIn.clickSample || "beep";
  const mainClickSample = built.mainClick.sample || "beep";
  const strongSpec = resolveStrongBeatSpec(mainClickSample, built.mainClick.strongBeatSample, !!track.built.customStrongBeatFileId);
  const builtInClickBuffers = await loadBuiltInSampleBuffersForContext(context, [countInSample, mainClickSample, strongSpec.sample]);

  const countInWindowEnabled = isBuiltCountInWindowEnabled(built);
  const countInClickEnabled = !!built.countIn.clickEnabled;
  const countInBpm = Number(built.countIn.bpm) || 120;
  const countInBeats = countInClickEnabled && countInWindowEnabled ? (Number(built.countIn.beats) || 4) : 0;
  const clickCountInDurationSec = countInBeats > 0
    ? (COUNT_IN_PREROLL_MS / 1000) + countInBeats * (60 / countInBpm)
    : 0;

  const countInLaneRuntime = [];
  for (const lane of [built.countIn.backing1, built.countIn.backing2]) {
    if (!lane.enabled || !lane.fileId) {
      continue;
    }
    const laneFile = await getFileById(lane.fileId);
    if (!laneFile) {
      continue;
    }
    const laneMeta = await getAudioMetadata(laneFile);
    countInLaneRuntime.push({
      lane,
      file: laneFile,
      durationSec: Math.max(0, Number(laneMeta.durationSec) || 0)
    });
  }

  const backingCountInDurationSec = countInLaneRuntime.reduce((maxSec, entry) => Math.max(maxSec, entry.durationSec), 0);
  const countInDurationSec = countInWindowEnabled
    ? Math.max(clickCountInDurationSec, backingCountInDurationSec)
    : 0;

  const timelineStartAt = context.currentTime + (PLAY_SYNC_PREP_MS / 1000);
  const sectionStartAt = timelineStartAt + countInDurationSec;
  const contextClock = makeContextClock(context);
  const firstCountBeatAt = countInClickEnabled && countInBeats > 0
    ? timelineStartAt + (COUNT_IN_PREROLL_MS / 1000)
    : null;
  const countInBackingStartAt = countInClickEnabled ? (firstCountBeatAt || timelineStartAt) : timelineStartAt;

  if (countInClickEnabled && countInWindowEnabled) {
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

  for (const entry of countInLaneRuntime) {
    const delayMs = Math.max(0, (countInBackingStartAt - context.currentTime) * 1000);
    const timer = setTimeout(() => {
      if (cancelled) {
        return;
      }
      const url = URL.createObjectURL(entry.file);
      const audio = new Audio(url);
      const source = context.createMediaElementSource(audio);
      const panner = context.createStereoPanner();
      panner.pan.value = built.splitOutput.enabled ? panValue(entry.lane.channel) : 0;
      source.connect(panner).connect(context.destination);
      audio.play();
      activeAudios.push({ audio, url });
    }, delayMs);
    timers.push(timer);
  }

  startPlaybackVisual(track, sessionId, {
    countInBeats: countInWindowEnabled ? countInBeats : 0,
    countInBpm,
    trackDurationSec: durationSec,
    countInStartWallMs: countInDurationSec > 0
      ? (countInClickEnabled && firstCountBeatAt
        ? expectedWallTimeMs(contextClock, firstCountBeatAt)
        : expectedWallTimeMs(contextClock, timelineStartAt))
      : null,
    trackStartWallMs: expectedWallTimeMs(contextClock, sectionStartAt)
  });

  let sectionStartSec = 0;
  for (const section of sections) {
    const sectionBpm = Number(section.bpm) || 120;
    const beatsPerBar = beatsPerBarFromSignature(section.timeSignature);
    const sectionBeats = (Number(section.bars) || 1) * beatsPerBar;
    const beatDuration = 60 / sectionBpm;

    for (let beat = 0; beat < sectionBeats; beat += 1) {
      const when = sectionStartAt + sectionStartSec + beat * beatDuration;
      const strongBeat = !!built.mainClick.strongBeatEnabled && beat % beatsPerBar === 0;
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

    const sectionLanes = [section.backing1, section.backing2];
    for (const lane of sectionLanes) {
      if (!lane.fileId) {
        continue;
      }
      const laneFile = await getFileById(lane.fileId);
      if (!laneFile) {
        continue;
      }
      const when = sectionStartAt + sectionStartSec;
      const delayMs = Math.max(0, (when - context.currentTime) * 1000);
      const timer = setTimeout(() => {
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(laneFile);
        const audio = new Audio(url);
        const source = context.createMediaElementSource(audio);
        const panner = context.createStereoPanner();
        panner.pan.value = built.splitOutput.enabled ? panValue(lane.channel) : 0;
        source.connect(panner).connect(context.destination);
        audio.play();
        activeAudios.push({ audio, url });
      }, delayMs);
      timers.push(timer);
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

async function playLoopTrack(track, sessionId) {
  const renderedReady = !!track.loop?.rendered?.ready;
  if (renderedReady) {
    const renderedOk = await playLoopTrackRendered(track, sessionId);
    if (renderedOk) {
      return;
    }
  }

  await playLoopTrackLive(track, sessionId);
}

async function playLoopTrackRendered(track, sessionId) {
  const rendered = track.loop?.rendered || {};
  const loopConfig = normalizeLoopTrack(track.loop || {});
  const loopFile = rendered.loopFileId ? await getFileById(rendered.loopFileId) : null;
  if (!loopFile) {
    return false;
  }

  const context = new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") {
    await context.resume();
  }

  let source = null;
  let cancelled = false;
  const activeAudios = [];

  const stop = () => {
    cancelled = true;
    if (source) {
      try {
        source.stop();
      } catch {
        // Stop can throw when source already ended.
      }
      source.disconnect();
      source = null;
    }
    activeAudios.forEach(({ audio, url }) => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(url);
    });
    if (context.state !== "closed") {
      context.close();
    }
    appState.playingHandle = null;
    resetPlaybackVisual();
    dumpDiagnosticSummary(sessionId);
    render();
  };

  appState.playingHandle = { stop };
  render();

  try {
    const fileData = await loopFile.arrayBuffer();
    const loopBuffer = await context.decodeAudioData(fileData.slice(0));
    if (cancelled) {
      stop();
      return true;
    }

    const bpm = Math.max(20, Number(loopConfig.bpm) || 120);
    const countInClickEnabled = !!loopConfig.countIn.clickEnabled;
    const countInWindowEnabled = isLoopCountInWindowEnabled(loopConfig);
    const countInBeats = countInClickEnabled && countInWindowEnabled ? (Number(loopConfig.countIn.beats) || 4) : 0;
    const countInBpm = Number(loopConfig.countIn.bpm) || 120;
    const countInBeatDurationSec = 60 / countInBpm;
    const countInSample = loopConfig.countIn.clickSample || "beep";
    const builtInBuffers = await loadBuiltInSampleBuffersForContext(context, [countInSample]);

    const timelineStartAt = context.currentTime + (PLAY_SYNC_PREP_MS / 1000);
    const firstCountBeatAt = countInClickEnabled && countInBeats > 0
      ? timelineStartAt + (COUNT_IN_PREROLL_MS / 1000)
      : null;
    const clickPan = panValue(loopConfig.mainClick.channel || "right");

    const countInBackingRuntime = [];
    for (const lane of [loopConfig.countIn.backing1, loopConfig.countIn.backing2]) {
      if (!lane.enabled || !lane.fileId) {
        continue;
      }
      const laneFile = await getFileById(lane.fileId);
      if (!laneFile) {
        continue;
      }
      const laneMeta = await getAudioMetadata(laneFile);
      countInBackingRuntime.push({
        lane,
        file: laneFile,
        durationSec: Math.max(0, Number(laneMeta.durationSec) || 0)
      });
    }

    if (countInClickEnabled && firstCountBeatAt !== null) {
      const contextClock = makeContextClock(context);
      for (let beat = 0; beat < countInBeats; beat += 1) {
        const when = firstCountBeatAt + beat * countInBeatDurationSec;
        scheduleClickCueAt(
          context,
          builtInBuffers.get(countInSample) || null,
          countInSample,
          clickPan,
          when,
          {
            sessionId,
            label: `loop rendered count-in beat ${beat + 1}`,
            clock: contextClock
          }
        );
      }
    }

    const countInBackingStartAt = countInClickEnabled && firstCountBeatAt !== null ? firstCountBeatAt : timelineStartAt;
    for (const laneEntry of countInBackingRuntime) {
      const delayMs = Math.max(0, (countInBackingStartAt - context.currentTime) * 1000);
      setTimeout(() => {
        if (cancelled || context.state === "closed") {
          return;
        }
        const url = URL.createObjectURL(laneEntry.file);
        const laneAudio = new Audio(url);
        const sourceNode = context.createMediaElementSource(laneAudio);
        const panner = context.createStereoPanner();
        panner.pan.value = panValue(laneEntry.lane.channel || "both");
        sourceNode.connect(panner).connect(context.destination);
        laneAudio.play();
        activeAudios.push({ audio: laneAudio, url });
      }, delayMs);
    }

    const clickCountInDurationSec = countInBeats > 0
      ? (COUNT_IN_PREROLL_MS / 1000) + countInBeats * countInBeatDurationSec
      : 0;
    const backingCountInDurationSec = countInBackingRuntime.reduce((maxSec, lane) => Math.max(maxSec, lane.durationSec), 0);
    const countInDurationSec = countInWindowEnabled
      ? Math.max(clickCountInDurationSec, backingCountInDurationSec)
      : 0;
    const loopStartAt = timelineStartAt + countInDurationSec;

    source = context.createBufferSource();
    source.buffer = loopBuffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = Math.max(0.05, Number(rendered.loopDurationSec) || loopBuffer.duration);
    source.connect(context.destination);
    source.start(loopStartAt);
    return true;
  } catch {
    stop();
    return false;
  }
}

async function playLoopTrackLive(track, sessionId) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  if (context.state === "suspended") {
    await context.resume();
  }

  const loopConfig = normalizeLoopTrack(track.loop || {});
  const bpm = Math.max(20, Number(loopConfig.bpm) || 120);
  const beatDurationSec = 60 / bpm;
  const beatsPerBar = beatsPerBarFromSignature(loopConfig.timeSignature);
  const mainSample = loopConfig.mainClick.sample || "beep";
  const strongSpec = resolveStrongBeatSpec(
    mainSample,
    loopConfig.mainClick.strongBeatSample || "rim",
    false
  );
  const clickPan = panValue(loopConfig.mainClick.channel || "right");
  const countInClickEnabled = !!loopConfig.countIn.clickEnabled;
  const countInWindowEnabled = isLoopCountInWindowEnabled(loopConfig);
  const countInBpm = Number(loopConfig.countIn.bpm) || 120;
  const countInBeats = countInClickEnabled && countInWindowEnabled ? (Number(loopConfig.countIn.beats) || 4) : 0;
  const countInBeatDurationSec = 60 / countInBpm;

  const countInSample = loopConfig.countIn.clickSample || "beep";
  const builtInBuffers = await loadBuiltInSampleBuffersForContext(context, [mainSample, strongSpec.sample, countInSample]);

  let cancelled = false;
  const activeAudios = [];
  const lookaheadSec = 0.2;
  const scheduleIntervalMs = 60;
  const contextClock = makeContextClock(context);
  const timelineStartAt = context.currentTime + (PLAY_SYNC_PREP_MS / 1000);
  const firstCountBeatAt = countInClickEnabled && countInBeats > 0
    ? timelineStartAt + (COUNT_IN_PREROLL_MS / 1000)
    : null;

  const countInBackingRuntime = [];
  for (const lane of [loopConfig.countIn.backing1, loopConfig.countIn.backing2]) {
    if (!lane.enabled || !lane.fileId) {
      continue;
    }
    const laneFile = await getFileById(lane.fileId);
    if (!laneFile) {
      continue;
    }
    const laneMeta = await getAudioMetadata(laneFile);
    countInBackingRuntime.push({
      lane,
      file: laneFile,
      durationSec: Math.max(0, Number(laneMeta.durationSec) || 0)
    });
  }

  const clickCountInDurationSec = countInBeats > 0
    ? (COUNT_IN_PREROLL_MS / 1000) + countInBeats * countInBeatDurationSec
    : 0;
  const backingCountInDurationSec = countInBackingRuntime.reduce((maxSec, lane) => Math.max(maxSec, lane.durationSec), 0);
  const countInDurationSec = countInWindowEnabled
    ? Math.max(clickCountInDurationSec, backingCountInDurationSec)
    : 0;

  let nextBeatAt = timelineStartAt + countInDurationSec;
  let beatIndex = 0;

  if (countInClickEnabled && firstCountBeatAt !== null) {
    for (let beat = 0; beat < countInBeats; beat += 1) {
      const when = firstCountBeatAt + beat * countInBeatDurationSec;
      scheduleClickCueAt(
        context,
        builtInBuffers.get(countInSample) || null,
        countInSample,
        clickPan,
        when,
        {
          sessionId,
          label: `loop count-in beat ${beat + 1}`,
          clock: contextClock
        }
      );
    }
  }

  const countInBackingStartAt = countInClickEnabled && firstCountBeatAt !== null ? firstCountBeatAt : timelineStartAt;
  for (const laneEntry of countInBackingRuntime) {
    const delayMs = Math.max(0, (countInBackingStartAt - context.currentTime) * 1000);
    setTimeout(() => {
      if (cancelled || context.state === "closed") {
        return;
      }
      const url = URL.createObjectURL(laneEntry.file);
      const laneAudio = new Audio(url);
      const source = context.createMediaElementSource(laneAudio);
      const panner = context.createStereoPanner();
      panner.pan.value = panValue(laneEntry.lane.channel || "both");
      source.connect(panner).connect(context.destination);
      laneAudio.play();
      activeAudios.push({ audio: laneAudio, url });
    }, delayMs);
  }

  const scheduleBeats = () => {
    if (cancelled) {
      return;
    }

    while (nextBeatAt < context.currentTime + lookaheadSec) {
      const barBeatIndex = beatIndex % beatsPerBar;
      const isStrongBeat = !!loopConfig.mainClick.strongBeatEnabled && barBeatIndex === 0;
      if (isStrongBeat) {
        scheduleClickCueAt(
          context,
          builtInBuffers.get(strongSpec.sample) || null,
          strongSpec.sample,
          clickPan,
          nextBeatAt,
          {
            sessionId,
            label: "loop strong beat",
            clock: contextClock
          },
          { playbackRate: strongSpec.playbackRate }
        );
      } else {
        scheduleClickCueAt(
          context,
          builtInBuffers.get(mainSample) || null,
          mainSample,
          clickPan,
          nextBeatAt,
          {
            sessionId,
            label: "loop click beat",
            clock: contextClock
          }
        );
      }

      nextBeatAt += beatDurationSec;
      beatIndex += 1;
    }
  };

  const intervalId = setInterval(scheduleBeats, scheduleIntervalMs);
  scheduleBeats();

  const stop = () => {
    cancelled = true;
    clearInterval(intervalId);
    activeAudios.forEach(({ audio, url }) => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(url);
    });
    if (context.state !== "closed") {
      context.close();
    }
    appState.playingHandle = null;
    resetPlaybackVisual();
    dumpDiagnosticSummary(sessionId);
    render();
  };

  appState.playingHandle = { stop };
  render();
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

  if (track.type === "loop") {
    const loopValidation = track.loop?.renderValidation;
    const loopCheck = loopValidation?.checks?.[0];
    const loopValidationLine = loopValidation
      ? `Render validation: ${loopValidation.ok ? "OK" : "Needs attention"} (${loopCheck || `delta ${loopValidation.deltaMs ?? "n/a"}ms`})`
      : "Render validation: not available";
    window.alert(
      [
        `${track.displayName} (Loop Track)`,
        `BPM: ${Math.round(Number(track.loop?.bpm) || 120)}`,
        `Time Signature: ${track.loop?.timeSignature || "4/4"}`,
        `Strong beat: ${track.loop?.strongBeatEnabled ? "On" : "Off"}`,
        `Loop length: ${formatDuration(totalTrackSeconds(track))}`,
        loopValidationLine
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

    if (track.type === "loop") {
      window.alert("Loop tracks do not use backing audio files.");
      return;
    }

    const newId = await saveFileToDb(file);

    if (track.type === "master") {
      track.audioFileId = newId;
      track.audioName = file.name;
      const meta = await getAudioMetadata(file);
      track.lockedMeta.lengthSec = meta.durationSec;
      track.lockedMeta.bpm = Math.round(meta.estimatedBpm || track.lockedMeta.bpm || 120);
      if (isMasterMainClickEnabled(track)) {
        const rerender = await renderAndPersistMasterTrackAssets(track);
        track.masterRendered = rerender.rendered;
        track.masterRenderValidation = rerender.validation;
      }
    } else if (track.type === "built") {
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

    if (track.type === "master" && track.masterCountIn?.backing1?.fileId) {
      await deleteFileFromDb(track.masterCountIn.backing1.fileId);
    }

    if (track.type === "master" && track.masterCountIn?.backing2?.fileId) {
      await deleteFileFromDb(track.masterCountIn.backing2.fileId);
    }

    if (track.type === "master" && track.masterCountIn?.customFileId) {
      await deleteFileFromDb(track.masterCountIn.customFileId);
    }

    if (track.type === "master" && track.masterRendered?.clickFileId) {
      await deleteFileFromDb(track.masterRendered.clickFileId);
    }

    if (track.type === "master" && track.masterRendered?.backingFileId) {
      await deleteFileFromDb(track.masterRendered.backingFileId);
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
      const built = normalizeBuiltTrack(track.built || {});

      if (built.countIn.backing1.fileId) {
        await deleteFileFromDb(built.countIn.backing1.fileId);
      }

      if (built.countIn.backing2.fileId) {
        await deleteFileFromDb(built.countIn.backing2.fileId);
      }

      for (const section of track.built.sections || []) {
        if (section.backingFileId) {
          await deleteFileFromDb(section.backingFileId);
        }
        if (section.backing1?.fileId && section.backing1.fileId !== section.backingFileId) {
          await deleteFileFromDb(section.backing1.fileId);
        }
        if (section.backing2?.fileId) {
          await deleteFileFromDb(section.backing2.fileId);
        }
      }
    }

    if (track.type === "loop" && track.loop.countInConfig?.backing1?.fileId) {
      await deleteFileFromDb(track.loop.countInConfig.backing1.fileId);
    }

    if (track.type === "loop" && track.loop.countInConfig?.backing2?.fileId) {
      await deleteFileFromDb(track.loop.countInConfig.backing2.fileId);
    }

    if (track.type === "loop" && track.loop.customMainClickFileId) {
      await deleteFileFromDb(track.loop.customMainClickFileId);
    }

    if (track.type === "loop" && track.loop.customStrongBeatFileId) {
      await deleteFileFromDb(track.loop.customStrongBeatFileId);
    }

    if (track.type === "loop" && track.loop.rendered?.loopFileId) {
      await deleteFileFromDb(track.loop.rendered.loopFileId);
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

  if (track.type === "loop") {
    const bpm = Number(track.loop?.bpm) || 120;
    const beatsPerBar = beatsPerBarFromSignature(track.loop?.timeSignature);
    return beatsPerBar * (60 / bpm);
  }

  return (track.built.sections || []).reduce((sum, section) => {
    const beatsPerBar = beatsPerBarFromSignature(section.timeSignature);
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

async function renderAndPersistMasterTrackAssets(track, options = {}) {
  const masterFile = track?.audioFileId ? await getFileById(track.audioFileId) : null;
  if (!masterFile) {
    throw new Error("Missing master audio file");
  }

  const countInConfig = track.masterCountIn || {};
  const splitOutputConfig = track.masterSplitOutput || {};
  const splitOutputEnabled = !!splitOutputConfig.enabled;
  const mainClick = countInConfig.mainClick || {};
  const mainClickEnabled = isMasterMainClickEnabled(track);

  let decodeContext = null;
  try {
    options.throwIfCancelled?.();
    options.onProgress?.(86, "Decoding master assets...");
    decodeContext = new (window.AudioContext || window.webkitAudioContext)();

    const masterBuffer = await decodeFileToAudioBuffer(decodeContext, masterFile);
    if (!masterBuffer) {
      throw new Error("Unable to decode master audio");
    }

    const countInClickEnabled = !!countInConfig.clickEnabled;
    const countInBeats = countInClickEnabled ? (Number(countInConfig.beats) || 4) : 0;
    const countInBpm = Number(countInConfig.bpm) || 120;
    const countInBeatDurationSec = 60 / countInBpm;
    const countInClickDurationSec = countInClickEnabled ? countInBeats * countInBeatDurationSec : 0;

    const countInBacking1 = countInConfig.backing1 || {};
    const countInBacking2 = countInConfig.backing2 || {};

    const countInBacking1File = countInBacking1.enabled && countInBacking1.fileId
      ? await getFileById(countInBacking1.fileId)
      : null;
    const countInBacking2File = countInBacking2.enabled && countInBacking2.fileId
      ? await getFileById(countInBacking2.fileId)
      : null;
    const countInBacking1Buffer = countInBacking1File ? await decodeFileToAudioBuffer(decodeContext, countInBacking1File) : null;
    const countInBacking2Buffer = countInBacking2File ? await decodeFileToAudioBuffer(decodeContext, countInBacking2File) : null;

    const countInBackingDurationSec = Math.max(
      countInBacking1Buffer?.duration || 0,
      countInBacking2Buffer?.duration || 0
    );
    const countInWindowEnabled = countInClickEnabled || !!countInBacking1.enabled || !!countInBacking2.enabled;
    const countInDurationSec = countInWindowEnabled
      ? Math.max(countInClickDurationSec, countInBackingDurationSec)
      : 0;

    const mainClickBpm = Math.max(20, Number(mainClick.bpm) || 120);
    const mainClickBeatDurationSec = 60 / mainClickBpm;
    const mainClickBeatsPerBar = beatsPerBarFromSignature(mainClick.timeSignature || "4/4");
    const mainClickSample = mainClick.sample || "beep";
    const mainStrongSpec = resolveStrongBeatSpec(mainClickSample, mainClick.strongBeatSample || "rim", false);

    const builtInSampleIds = new Set();
    if (countInClickEnabled) {
      builtInSampleIds.add(countInConfig.clickSample || "beep");
    }
    if (mainClickEnabled) {
      builtInSampleIds.add(mainClickSample);
      if (mainClick.strongBeatEnabled) {
        builtInSampleIds.add(mainStrongSpec.sample);
      }
    }
    const builtInBuffers = await loadBuiltInSampleBuffersForContext(decodeContext, [...builtInSampleIds]);

    const masterDurationSec = Math.max(0, Number(track.lockedMeta?.lengthSec) || masterBuffer.duration || 0);
    const timelineDurationSec = countInDurationSec + masterDurationSec;
    const renderDurationSec = timelineDurationSec + RENDER_DURATION_PAD_SEC;
    const frameCount = Math.max(1, Math.ceil(renderDurationSec * RENDER_SAMPLE_RATE));

    options.onProgress?.(90, "Rendering master click stem...");
    const clickContext = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);
    const clickPan = splitOutputEnabled ? panValue(mainClick.channel || "right") : 0;
    const countInSample = countInConfig.clickSample || "beep";

    if (countInClickEnabled && countInBeats > 0) {
      for (let beat = 0; beat < countInBeats; beat += 1) {
        const when = beat * countInBeatDurationSec;
        scheduleClickCueAt(
          clickContext,
          builtInBuffers.get(countInSample) || null,
          countInSample,
          clickPan,
          when
        );
      }
    }

    if (mainClickEnabled && mainClickBeatDurationSec > 0.001 && masterDurationSec > 0) {
      const clickEndAt = countInDurationSec + masterDurationSec;
      for (let beat = 0, when = countInDurationSec; when < clickEndAt; beat += 1, when += mainClickBeatDurationSec) {
        const isStrongBeat = !!mainClick.strongBeatEnabled && (beat % mainClickBeatsPerBar) === 0;
        if (isStrongBeat) {
          scheduleClickCueAt(
            clickContext,
            builtInBuffers.get(mainStrongSpec.sample) || null,
            mainStrongSpec.sample,
            clickPan,
            when,
            null,
            { playbackRate: mainStrongSpec.playbackRate }
          );
        } else {
          scheduleClickCueAt(
            clickContext,
            builtInBuffers.get(mainClickSample) || null,
            mainClickSample,
            clickPan,
            when
          );
        }
      }
    }

    const clickBuffer = await clickContext.startRendering();
    options.throwIfCancelled?.();

    options.onProgress?.(94, "Rendering master backing stem...");
    const backingContext = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);

    const countInLanes = [
      { lane: countInBacking1, buffer: countInBacking1Buffer },
      { lane: countInBacking2, buffer: countInBacking2Buffer }
    ];
    for (const laneEntry of countInLanes) {
      if (!laneEntry.lane.enabled || !laneEntry.buffer) {
        continue;
      }
      const source = backingContext.createBufferSource();
      const panner = backingContext.createStereoPanner();
      panner.pan.value = splitOutputEnabled ? panValue(laneEntry.lane.channel || "both") : 0;
      source.buffer = laneEntry.buffer;
      source.connect(panner).connect(backingContext.destination);
      source.start(0);
      if (laneEntry.buffer.duration > countInDurationSec + 0.05) {
        source.stop(countInDurationSec + 0.05);
      }
    }

    if (masterDurationSec > 0) {
      const source = backingContext.createBufferSource();
      const panner = backingContext.createStereoPanner();
      panner.pan.value = splitOutputEnabled ? panValue(splitOutputConfig.audioChannel || "left") : 0;
      source.buffer = masterBuffer;
      source.connect(panner).connect(backingContext.destination);
      source.start(countInDurationSec);
    }

    const backingBuffer = await backingContext.startRendering();
    options.throwIfCancelled?.();

    options.onProgress?.(97, "Saving master rendered files...");
    const clickBlob = audioBufferToWavBlob(clickBuffer);
    const backingBlob = audioBufferToWavBlob(backingBuffer);
    const clickFileId = await saveFileToDb(new File([clickBlob], `master-click-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));
    const backingFileId = await saveFileToDb(new File([backingBlob], `master-backing-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));
    options.throwIfCancelled?.();

    const previousClickId = track.masterRendered?.clickFileId;
    const previousBackingId = track.masterRendered?.backingFileId;
    if (previousClickId && previousClickId !== clickFileId) {
      await deleteFileFromDb(previousClickId);
    }
    if (previousBackingId && previousBackingId !== backingFileId) {
      await deleteFileFromDb(previousBackingId);
    }

    const validation = validateMasterRenderedTrack(timelineDurationSec, clickBuffer.duration, backingBuffer.duration);
    return {
      rendered: {
        ready: true,
        clickFileId,
        backingFileId,
        durationSec: timelineDurationSec,
        countInDurationSec,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation
    };
  } catch {
    const fallbackDurationSec = Math.max(0, Number(track.lockedMeta?.lengthSec) || totalTrackSeconds(track));
    return {
      rendered: {
        ready: false,
        clickFileId: null,
        backingFileId: null,
        durationSec: fallbackDurationSec,
        countInDurationSec: 0,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation: {
        ok: false,
        expectedDurationSec: roundMs(fallbackDurationSec),
        clickDurationSec: 0,
        backingDurationSec: 0,
        maxDeltaMs: null,
        checks: ["Master render failed; live scheduler fallback will be used."]
      }
    };
  } finally {
    if (decodeContext && decodeContext.state !== "closed") {
      decodeContext.close();
    }
  }
}

async function renderAndPersistBuiltTrackAssets(built, options = {}) {
  const normalizedBuilt = normalizeBuiltTrack(built);

  let decodeContext = null;
  try {
    options.throwIfCancelled?.();
    options.onProgress?.(64, "Decoding audio assets...");
    decodeContext = new (window.AudioContext || window.webkitAudioContext)();
    const assets = await decodeBuiltTrackAssets(built, decodeContext);
    options.throwIfCancelled?.();

    const timeline = buildTrackTimeline(built, {
      countInBacking1DurationSec: assets.countInBacking1Buffer?.duration || 0,
      countInBacking2DurationSec: assets.countInBacking2Buffer?.duration || 0
    });
    const totalDurationSec = timeline.totalDurationSec + RENDER_DURATION_PAD_SEC;

    const clickPan = normalizedBuilt.splitOutput.enabled ? panValue(normalizedBuilt.mainClick.channel) : 0;

    options.onProgress?.(72, "Rendering click stem...");
    const clickBuffer = await renderClickStemBuffer(built, timeline, assets, totalDurationSec, clickPan);
    options.throwIfCancelled?.();

    options.onProgress?.(80, "Rendering backing stem...");
    const backingBuffer = await renderBackingStemBuffer(built, timeline, assets, totalDurationSec);
    options.throwIfCancelled?.();

    options.onProgress?.(88, "Saving rendered files...");
    const clickBlob = audioBufferToWavBlob(clickBuffer);
    const backingBlob = audioBufferToWavBlob(backingBuffer);
    const clickFileId = await saveFileToDb(new File([clickBlob], `click-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));
    const backingFileId = await saveFileToDb(new File([backingBlob], `backing-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));
    options.throwIfCancelled?.();

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
        countInDurationSec: timeline.countInDurationSec,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation
    };
  } catch {
    const fallbackTimeline = buildTrackTimeline(built);
    return {
      rendered: {
        ready: false,
        clickFileId: null,
        backingFileId: null,
        durationSec: fallbackTimeline.totalDurationSec,
        countInDurationSec: fallbackTimeline.countInDurationSec,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation: {
        ok: false,
        expectedDurationSec: fallbackTimeline.totalDurationSec,
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

async function renderAndPersistLoopTrackAssets(loop, options = {}) {
  const bpm = Math.max(20, Number(loop.bpm) || 120);
  const beatsPerBar = beatsPerBarFromSignature(loop.timeSignature);
  const loopDurationSec = beatsPerBar * (60 / bpm);
  const renderDurationSec = loopDurationSec + RENDER_DURATION_PAD_SEC;

  let decodeContext = null;
  try {
    options.throwIfCancelled?.();
    options.onProgress?.(66, "Decoding loop assets...");
    decodeContext = new (window.AudioContext || window.webkitAudioContext)();

    const customMainFile = loop.customMainClickFileId ? await getFileById(loop.customMainClickFileId) : null;
    const customStrongFile = loop.customStrongBeatFileId ? await getFileById(loop.customStrongBeatFileId) : null;

    const mainSample = loop.mainClickSample || "beep";
    const strongSpec = resolveStrongBeatSpec(
      mainSample,
      loop.strongBeatClickSample || "rim",
      !!loop.customStrongBeatFileId
    );

    const builtInBuffers = await loadBuiltInSampleBuffersForContext(decodeContext, [mainSample, strongSpec.sample]);
    const customMainBuffer = customMainFile ? await decodeFileToAudioBuffer(decodeContext, customMainFile) : null;
    const customStrongBuffer = customStrongFile ? await decodeFileToAudioBuffer(decodeContext, customStrongFile) : null;
    options.throwIfCancelled?.();

    const frameCount = Math.max(1, Math.ceil(renderDurationSec * RENDER_SAMPLE_RATE));
    const offlineContext = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);

    for (let beat = 0; beat < beatsPerBar; beat += 1) {
      const when = beat * (60 / bpm);
      const isStrongBeat = !!loop.strongBeatEnabled && beat === 0;
      if (isStrongBeat) {
        scheduleClickCueAt(
          offlineContext,
          customStrongBuffer || builtInBuffers.get(strongSpec.sample) || null,
          strongSpec.sample,
          0,
          when,
          null,
          { playbackRate: strongSpec.playbackRate }
        );
      } else {
        scheduleClickCueAt(
          offlineContext,
          customMainBuffer || builtInBuffers.get(mainSample) || null,
          mainSample,
          0,
          when
        );
      }
    }

    options.onProgress?.(82, "Rendering loop stem...");
    const loopBuffer = await offlineContext.startRendering();
    options.throwIfCancelled?.();

    options.onProgress?.(90, "Saving loop render...");
    const loopBlob = audioBufferToWavBlob(loopBuffer);
    const loopFileId = await saveFileToDb(new File([loopBlob], `loop-stem-${crypto.randomUUID()}.wav`, { type: "audio/wav" }));
    options.throwIfCancelled?.();

    const previousLoopFileId = loop.rendered?.loopFileId;
    if (previousLoopFileId && previousLoopFileId !== loopFileId) {
      await deleteFileFromDb(previousLoopFileId);
    }

    const validation = validateLoopRenderedTrack(loopDurationSec, loopBuffer.duration);
    return {
      rendered: {
        ready: true,
        loopFileId,
        loopDurationSec: roundMs(loopDurationSec),
        renderedDurationSec: roundMs(loopBuffer.duration),
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation
    };
  } catch {
    return {
      rendered: {
        ready: false,
        loopFileId: null,
        loopDurationSec: roundMs(loopDurationSec),
        renderedDurationSec: 0,
        renderedAt: Date.now(),
        fallbackMode: "live"
      },
      validation: {
        ok: false,
        expectedLoopDurationSec: roundMs(loopDurationSec),
        renderedDurationSec: 0,
        deltaMs: null,
        checks: ["Loop render failed; live scheduler fallback will be used."]
      }
    };
  } finally {
    if (decodeContext && decodeContext.state !== "closed") {
      decodeContext.close();
    }
  }
}

function validateLoopRenderedTrack(loopDurationSec, renderedDurationSec) {
  const expectedRenderDurationSec = loopDurationSec + RENDER_DURATION_PAD_SEC;
  const deltaMs = Math.abs((renderedDurationSec - expectedRenderDurationSec) * 1000);
  const checks = [];

  if (deltaMs > RENDER_VALIDATION_TOLERANCE_MS) {
    checks.push(`Loop render duration delta ${Math.round(deltaMs)}ms exceeds tolerance ${RENDER_VALIDATION_TOLERANCE_MS}ms`);
  }

  return {
    ok: checks.length === 0,
    expectedLoopDurationSec: roundMs(loopDurationSec),
    expectedRenderDurationSec: roundMs(expectedRenderDurationSec),
    renderedDurationSec: roundMs(renderedDurationSec),
    deltaMs: roundMs(deltaMs),
    checks
  };
}

function validateMasterRenderedTrack(timelineDurationSec, clickDurationSec, backingDurationSec) {
  const expectedRenderDurationSec = timelineDurationSec + RENDER_DURATION_PAD_SEC;
  const clickDeltaMs = Math.abs((clickDurationSec - expectedRenderDurationSec) * 1000);
  const backingDeltaMs = Math.abs((backingDurationSec - expectedRenderDurationSec) * 1000);
  const maxDeltaMs = Math.max(clickDeltaMs, backingDeltaMs);
  const checks = [];

  if (clickDeltaMs > RENDER_VALIDATION_TOLERANCE_MS) {
    checks.push(`Master click stem duration delta ${Math.round(clickDeltaMs)}ms exceeds tolerance ${RENDER_VALIDATION_TOLERANCE_MS}ms`);
  }

  if (backingDeltaMs > RENDER_VALIDATION_TOLERANCE_MS) {
    checks.push(`Master backing stem duration delta ${Math.round(backingDeltaMs)}ms exceeds tolerance ${RENDER_VALIDATION_TOLERANCE_MS}ms`);
  }

  return {
    ok: checks.length === 0,
    expectedDurationSec: roundMs(timelineDurationSec),
    expectedRenderDurationSec: roundMs(expectedRenderDurationSec),
    clickDurationSec: roundMs(clickDurationSec),
    backingDurationSec: roundMs(backingDurationSec),
    clickDeltaMs: roundMs(clickDeltaMs),
    backingDeltaMs: roundMs(backingDeltaMs),
    maxDeltaMs: roundMs(maxDeltaMs),
    checks
  };
}

function buildTrackTimeline(built, options = {}) {
  const normalized = normalizeBuiltTrack(built);
  const countInEnabled = isBuiltCountInWindowEnabled(normalized);
  const countInClickEnabled = !!normalized.countIn.clickEnabled;
  const countInBeats = countInEnabled && countInClickEnabled ? (Number(normalized.countIn.beats) || 4) : 0;
  const countInBpm = Number(normalized.countIn.bpm) || 120;
  const clickCountInDurationSec = countInBeats > 0 ? countInBeats * (60 / countInBpm) : 0;
  const countInBacking1DurationSec = normalized.countIn.backing1.enabled
    ? Math.max(0, Number(options.countInBacking1DurationSec) || 0)
    : 0;
  const countInBacking2DurationSec = normalized.countIn.backing2.enabled
    ? Math.max(0, Number(options.countInBacking2DurationSec) || 0)
    : 0;
  const backingCountInDurationSec = Math.max(countInBacking1DurationSec, countInBacking2DurationSec);
  const countInDurationSec = countInEnabled
    ? Math.max(clickCountInDurationSec, backingCountInDurationSec)
    : 0;

  let cursorSec = countInDurationSec;
  const sectionWindows = (normalized.sections || []).map((section) => {
    const bpm = Number(section.bpm) || 120;
    const beatsPerBar = beatsPerBarFromSignature(section.timeSignature);
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
  const normalizedBuilt = normalizeBuiltTrack(built);
  const countInFile = built.customCountInFileId ? await getFileById(built.customCountInFileId) : null;
  const mainClickFile = built.customMainClickFileId ? await getFileById(built.customMainClickFileId) : null;
  const strongBeatFile = built.customStrongBeatFileId ? await getFileById(built.customStrongBeatFileId) : null;

  const countInBacking1File = normalizedBuilt.countIn.backing1.fileId
    ? await getFileById(normalizedBuilt.countIn.backing1.fileId)
    : null;
  const countInBacking2File = normalizedBuilt.countIn.backing2.fileId
    ? await getFileById(normalizedBuilt.countIn.backing2.fileId)
    : null;

  const sectionBackingBuffers = new Map();
  for (const section of normalizedBuilt.sections || []) {
    for (const lane of [section.backing1, section.backing2]) {
      if (!lane.fileId || sectionBackingBuffers.has(lane.fileId)) {
        continue;
      }
      const backingFile = await getFileById(lane.fileId);
      if (!backingFile) {
        continue;
      }
      const backingBuffer = await decodeFileToAudioBuffer(decodeContext, backingFile);
      if (backingBuffer) {
        sectionBackingBuffers.set(lane.fileId, backingBuffer);
      }
    }
  }

  const strongSpec = resolveStrongBeatSpec(
    normalizedBuilt.mainClick.sample,
    normalizedBuilt.mainClick.strongBeatSample,
    !!built.customStrongBeatFileId
  );
  const builtInSampleIds = new Set();
  if (!built.customCountInFileId) {
    builtInSampleIds.add(normalizedBuilt.countIn.clickSample);
  }
  if (!built.customMainClickFileId) {
    builtInSampleIds.add(normalizedBuilt.mainClick.sample);
  }
  if (!!normalizedBuilt.mainClick.strongBeatEnabled && !built.customStrongBeatFileId) {
    builtInSampleIds.add(strongSpec.sample);
  }

  const builtInBuffers = await loadBuiltInSampleBuffersForContext(decodeContext, [...builtInSampleIds]);

  return {
    countInBuffer: countInFile ? await decodeFileToAudioBuffer(decodeContext, countInFile) : null,
    mainClickBuffer: mainClickFile ? await decodeFileToAudioBuffer(decodeContext, mainClickFile) : null,
    strongBeatBuffer: strongBeatFile ? await decodeFileToAudioBuffer(decodeContext, strongBeatFile) : null,
    countInBacking1Buffer: countInBacking1File ? await decodeFileToAudioBuffer(decodeContext, countInBacking1File) : null,
    countInBacking2Buffer: countInBacking2File ? await decodeFileToAudioBuffer(decodeContext, countInBacking2File) : null,
    builtInBuffers,
    sectionBackingBuffers
  };
}

async function renderClickStemBuffer(built, timeline, assets, durationSec, clickPan) {
  const normalizedBuilt = normalizeBuiltTrack(built);
  const frameCount = Math.max(1, Math.ceil(durationSec * RENDER_SAMPLE_RATE));
  const context = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);

  if (normalizedBuilt.countIn.clickEnabled && timeline.countInBeats > 0) {
    const beatDuration = 60 / timeline.countInBpm;
    const countInSample = normalizedBuilt.countIn.clickSample;
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

  const mainSample = normalizedBuilt.mainClick.sample;
  const strongSpec = resolveStrongBeatSpec(mainSample, normalizedBuilt.mainClick.strongBeatSample, !!built.customStrongBeatFileId);
  const mainBuffer = assets.mainClickBuffer || assets.builtInBuffers?.get(mainSample) || null;
  const strongBuffer = assets.strongBeatBuffer || assets.builtInBuffers?.get(strongSpec.sample) || null;

  for (const window of timeline.sectionWindows) {
    for (let beat = 0; beat < window.beats; beat += 1) {
      const when = window.startSec + beat * (60 / window.bpm);
      const strongBeat = !!normalizedBuilt.mainClick.strongBeatEnabled && beat % window.beatsPerBar === 0;
      if (strongBeat) {
        scheduleClickCueAt(context, strongBuffer, strongSpec.sample, clickPan, when, null, { playbackRate: strongSpec.playbackRate });
      } else {
        scheduleClickCueAt(context, mainBuffer, mainSample, clickPan, when);
      }
    }
  }

  return await context.startRendering();
}

async function renderBackingStemBuffer(built, timeline, assets, durationSec) {
  const normalizedBuilt = normalizeBuiltTrack(built);
  const frameCount = Math.max(1, Math.ceil(durationSec * RENDER_SAMPLE_RATE));
  const context = new OfflineAudioContext(2, frameCount, RENDER_SAMPLE_RATE);

  if (timeline.countInDurationSec > 0) {
    const countInLengthSec = timeline.countInDurationSec;

    const countInLanes = [
      { lane: normalizedBuilt.countIn.backing1, buffer: assets.countInBacking1Buffer },
      { lane: normalizedBuilt.countIn.backing2, buffer: assets.countInBacking2Buffer }
    ];

    for (const item of countInLanes) {
      if (!item.lane.enabled || !item.buffer) {
        continue;
      }

      const source = context.createBufferSource();
      const panner = context.createStereoPanner();
      panner.pan.value = normalizedBuilt.splitOutput.enabled ? panValue(item.lane.channel) : 0;
      source.buffer = item.buffer;
      source.connect(panner).connect(context.destination);
      source.start(0);

      if (item.buffer.duration > countInLengthSec + 0.05) {
        source.stop(countInLengthSec + 0.05);
      }
    }
  }

  for (const window of timeline.sectionWindows) {
    const lanes = [window.section.backing1, window.section.backing2];
    for (const lane of lanes) {
      if (!lane.fileId) {
        continue;
      }
      const backingBuffer = assets.sectionBackingBuffers.get(lane.fileId);
      if (!backingBuffer) {
        continue;
      }

      const source = context.createBufferSource();
      const panner = context.createStereoPanner();
      panner.pan.value = normalizedBuilt.splitOutput.enabled ? panValue(lane.channel) : 0;
      source.buffer = backingBuffer;
      source.connect(panner).connect(context.destination);
      source.start(window.startSec);
    }
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

function beatsPerBarFromSignature(timeSignature) {
  return Number(String(timeSignature || "4/4").split("/")[0]) || 4;
}

function isAssetBackedBuiltInSample(sample) {
  return !!BUILTIN_CLICK_ASSET_PATHS[sample];
}

function resolveStrongBeatSpecForBuiltTrack(built) {
  const mainSample = built.mainClickSample || built.clickSample || "beep";
  return resolveStrongBeatSpec(mainSample, built.strongBeatClickSample || "rim", !!built.customStrongBeatFileId);
}

function resolveStrongBeatSpec(mainSample, strongBeatClickSample, hasCustomStrongBeat) {
  if (!hasCustomStrongBeat && STRONG_BEAT_AUTO_BY_MAIN_SAMPLE[mainSample]) {
    return STRONG_BEAT_AUTO_BY_MAIN_SAMPLE[mainSample];
  }

  return {
    sample: strongBeatClickSample || "rim",
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
