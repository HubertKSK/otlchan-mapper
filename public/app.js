import {
  DIRECTIONS,
  connectRooms,
  createEmptyProject,
  normalizeDirection,
} from "./map-core.js";
import { Terminal } from "/vendor/@xterm/xterm/lib/xterm.mjs";

const THEME_KEY = "otchlan-automapper-theme";
const WORKSPACE_KEY = "otchlan-automapper-workspace-mode";
const DESCRIPTION_VISIBLE_KEY = "otchlan-automapper-description-visible";
const ROOM_TAGS_VISIBLE_KEY = "otchlan-automapper-room-tags-visible";
const ROOM_NOTES_VISIBLE_KEY = "otchlan-automapper-room-notes-visible";
const MOBS_VISIBLE_KEY = "otchlan-automapper-mobs-visible";
const NOTES_VISIBLE_KEY = "otchlan-automapper-notes-visible";
const STATS_VISIBLE_KEY = "otchlan-automapper-stats-visible";
const UPDATE_TOAST_VERSION_KEY = "otchlan-automapper-update-toast-version";
const TERMINAL_FONT_SIZE_KEY = "otchlan-automapper-terminal-font-size";
const ACTIVE_MAPPER_KEY = "otchlan-automapper-active-instance";
const INSTANCE_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const TERMINAL_COLS = 120;
const TERMINAL_ROWS = 48;
const TERMINAL_DEFAULT_FONT_SIZE = 14;
const TERMINAL_MIN_FONT_SIZE = 10;
const TERMINAL_MAX_FONT_SIZE = 18;
const DEFAULT_STAT_VISIBILITY = Object.freeze({
  hp: true,
  mana: true,
  mv: true,
  gold: true,
  exp: true,
  statuses: true,
  clock: true,
  date: true
});
const TERMINAL_SCROLLBACK_LINES = 120;
const TERMINAL_PARSE_WINDOW_LINES = 100;
const SERVER_AUTOSAVE_MS = 120000;
const SERVER_SAVE_DEBOUNCE_MS = 250;
const DOCUMENTATION_DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
const UI_PERF_MODE = new URLSearchParams(window.location.search).get("perf") === "1";
const DOCUMENTATION_DEMO_FOCUS_WORLD_KEY = "miasto.are:285,338,13";
const ACTIVE_TTL_MS = 3000;
const MAP_ZOOM_MIN = 0.35;
const MAP_ZOOM_MAX = 2.8;
const PLAYER_TRAVEL_ANIMATION_MS = 320;
const els = {
  appShell: document.querySelector("#appShell"),
  statusText: document.querySelector("#statusText"),
  mapTitle: document.querySelector("#mapTitle"),
  mapCount: document.querySelector("#mapCount"),
  mapSvg: document.querySelector("#mapSvg"),
  mapPlayerLayer: document.querySelector("#mapPlayerLayer"),
  mapLevelTransitionOverlay: document.querySelector("#mapLevelTransitionOverlay"),
  mapDebugBtn: document.querySelector("#mapDebugBtn"),
  mapZDownBtn: document.querySelector("#mapZDownBtn"),
  mapZUpBtn: document.querySelector("#mapZUpBtn"),
  centerMapBtn: document.querySelector("#centerMapBtn"),
  followPlayerBtn: document.querySelector("#followPlayerBtn"),
  roomContext: document.querySelector("#roomContext"),
  roomDescriptionField: document.querySelector("#roomDescriptionField"),
  roomTagsField: document.querySelector("#roomTagsField"),
  roomNotesField: document.querySelector("#roomNotesField"),
  roomTitleInput: document.querySelector("#roomTitleInput"),
  roomTagsInput: document.querySelector("#roomTagsInput"),
  roomDescriptionInput: document.querySelector("#roomDescriptionInput"),
  roomNotesInput: document.querySelector("#roomNotesInput"),
  globalNotesPages: document.querySelector("#globalNotesPages"),
  globalNotesInput: document.querySelector("#globalNotesInput"),
  addGlobalNotePageBtn: document.querySelector("#addGlobalNotePageBtn"),
  deleteGlobalNotePageBtn: document.querySelector("#deleteGlobalNotePageBtn"),
  gameStatus: document.querySelector("#gameStatus"),
  gameOutput: document.querySelector("#gameOutput"),
  terminalStage: document.querySelector(".terminal-stage"),
  characterVitals: document.querySelector("#characterVitals"),
  hpValue: document.querySelector("#hpValue"),
  hpBar: document.querySelector("#hpBar"),
  manaValue: document.querySelector("#manaValue"),
  manaBar: document.querySelector("#manaBar"),
  mvValue: document.querySelector("#mvValue"),
  mvBar: document.querySelector("#mvBar"),
  goldValue: document.querySelector("#goldValue"),
  goldBankValue: document.querySelector("#goldBankValue"),
  levelValue: document.querySelector("#levelValue"),
  expBar: document.querySelector("#expBar"),
  gameTimeValue: document.querySelector("#gameTimeValue"),
  journeyDayValue: document.querySelector("#journeyDayValue"),
  activeEffectsList: document.querySelector("#activeEffectsList"),
  workspaceButtons: document.querySelectorAll("[data-workspace-target]"),
  menuBtn: document.querySelector("#menuBtn"),
  menuPanel: document.querySelector("#appMenuPanel"),
  themeBtn: document.querySelector("#themeBtn"),
  toggleDescriptionBtn: document.querySelector("#toggleDescriptionBtn"),
  toggleRoomTagsBtn: document.querySelector("#toggleRoomTagsBtn"),
  toggleRoomNotesBtn: document.querySelector("#toggleRoomNotesBtn"),
  toggleMobsBtn: document.querySelector("#toggleMobsBtn"),
  toggleNotesBtn: document.querySelector("#toggleNotesBtn"),
  terminalFontSizeDownBtn: document.querySelector("#terminalFontSizeDownBtn"),
  terminalFontSizeUpBtn: document.querySelector("#terminalFontSizeUpBtn"),
  terminalFontSizeValue: document.querySelector("#terminalFontSizeValue"),
  statVisibilityButtons: document.querySelectorAll("[data-stat-toggle]"),
  worldSetupWelcome: document.querySelector("#worldSetupWelcome"),
  worldCacheStatus: document.querySelector("#worldCacheStatus"),
  worldAtlasStatus: document.querySelector("#worldAtlasStatus"),
  extractWorldBtn: document.querySelector("#extractWorldBtn"),
  buildWorldAtlasBtn: document.querySelector("#buildWorldAtlasBtn"),
  welcomeExtractWorldBtn: document.querySelector("#welcomeExtractWorldBtn"),
  welcomeBuildAtlasBtn: document.querySelector("#welcomeBuildAtlasBtn"),
  updateStatusText: document.querySelector("#updateStatusText"),
  updateReleaseLink: document.querySelector("#updateReleaseLink"),
  debugRecordBtn: document.querySelector("#debugRecordBtn"),
  debugSettingsSection: document.querySelector(".settings-section.debug-only"),
  resetConfirmModal: document.querySelector("#resetConfirmModal"),
  cancelResetBtn: document.querySelector("#cancelResetBtn"),
  confirmResetBtn: document.querySelector("#confirmResetBtn"),
  toastStack: document.querySelector("#toastStack")
};

let project = createEmptyProject();
let zoom = 1;
let mapDebugAll = false;
let debugMapZ = null;
let mapView = { x: 41, y: 41, z: 0, area: "" };
let mapDrag = null;
let suppressNextMapClick = false;
let mapHitTargets = [];
let lastRenderedMapCoords = new Map();
let lastRenderedWorldRenderIds = new Map();
let lastRenderedMapCell = 82;
let lastRenderedMapZ = null;
let selectedRoomId = project.selectedRoomId || project.currentRoomId;
let selectedRoomPreview = null;
let selectedWorldPreview = null;
let playerRoomId = project.playerRoomId || project.currentRoomId;
let playerPositionKnown = false;
let pendingGameMemoryPosition = null;
let pendingPlayerTravelAnimation = null;
let followPlayer = project.followPlayer !== false;
let descriptionVisible = true;
let roomTagsVisible = true;
let roomNotesVisible = true;
let mobsVisible = true;
let notesVisible = true;
let statVisibility = { ...DEFAULT_STAT_VISIBILITY };
let editingGlobalNotesPageId = null;
let serverActiveMapperId = null;
let gameRunning = false;
let serverSaveDirty = false;
let serverSaveInFlight = false;
let serverSaveRevision = 0;
let serverSaveTimer = null;
let serverSavePromise = null;
let lastServerErrorToast = { message: "", at: 0 };
let terminalResizeObserver = null;
let terminalStagePinnedToBottom = true;
let gameInputSendQueue = Promise.resolve();
let mapperLogSeq = 0;
let worldCache = null;
let worldAtlas = null;
let worldSetupStatus = null;
let lastGameStats = null;
let lastStatDeltaValues = null;
let currentGameMobs = [];
let currentGameMobAreaFile = "";
let currentGameMobSignature = "";
let currentGameMobVisibilityKey = "";
let playerTravelAnimationId = 0;
let activePlayerTravelAnimationId = "";
let mapViewAnimationId = 0;
let lastAppliedMapViewContext = null;
let lastRenderedMapLevel = null;
let mapLevelTransitionId = 0;
let mapLevelTransitionTimer = null;
let mapViewportRenderFrame = null;
let worldRoomsByKey = new Map();
let atlasRoomsByKey = new Map();
let uiPerf = null;

ensureProjectState();
initUiPerfProbe();
const term = new Terminal({
  cols: TERMINAL_COLS,
  rows: TERMINAL_ROWS,
  cursorBlink: true,
  convertEol: false,
  fontFamily: "Consolas, 'Courier New', monospace",
  fontSize: TERMINAL_DEFAULT_FONT_SIZE,
  scrollback: TERMINAL_SCROLLBACK_LINES,
  theme: terminalTheme("light")
});
const parserTerm = term;

bindEvents();
applySavedWorkspace();
applySavedDescriptionVisibility();
applySavedRoomTagsVisibility();
applySavedRoomNotesVisibility();
applySavedMobsVisibility();
applySavedNotesVisibility();
applySavedTerminalFontSize();
applySavedStatVisibility();
initXterm();
checkAppUpdateStatus();
initMapperActivation();
applySavedTheme();
if (DOCUMENTATION_DEMO_MODE) {
  initDocumentationDemo();
} else {
  connectEventStream();
  initWorldSetup();
  initDebugControls();
  initServerAutosave();
  centerMapOnPlayer();
  render();
}

async function initWorldSetup() {
  const setupStatus = await refreshWorldSetupStatus();
  if (setupStatus?.cache?.exists) {
    await initWorldCache({ loadAtlas: setupStatus?.atlas?.exists !== false });
  }
}

async function initDocumentationDemo() {
  document.body.classList.add("documentation-demo");
  els.statusText.textContent = "Tryb prezentacyjny";
  els.gameStatus.textContent = "demo";
  els.gameStatus.classList.add("running");

  const loadedFromUserLayer = await loadDocumentationDemoUserLayer();
  if (!loadedFromUserLayer) {
    project = createDocumentationDemoProject();
  }

  const focusRoom = project.rooms.find((room) => room.worldKey === DOCUMENTATION_DEMO_FOCUS_WORLD_KEY)
    || project.rooms.find((room) => room.worldKey)
    || project.rooms[0];
  playerRoomId = focusRoom?.id || project.playerRoomId || project.currentRoomId;
  selectedRoomId = playerRoomId;
  playerPositionKnown = true;
  followPlayer = true;
  mapDebugAll = false;
  debugMapZ = null;
  project.playerRoomId = playerRoomId;
  project.selectedRoomId = selectedRoomId;
  project.currentRoomId = playerRoomId;
  project.followPlayer = followPlayer;
  lastGameStats = createDocumentationDemoStats();
  lastStatDeltaValues = collectStatDeltaValues(lastGameStats);
  currentGameMobs = createDocumentationDemoMobs();
  currentGameMobAreaFile = "miasto.are";
  currentGameMobSignature = "documentation-demo";
  currentGameMobVisibilityKey = "documentation-demo";
  worldRoomsByKey = new Map(project.rooms.map((room) => [room.worldKey, room]));
  atlasRoomsByKey = new Map(project.rooms.map((room) => [room.worldKey, room]));

  term.clear();
  term.write(createDocumentationDemoTerminalText());
  renderCharacterVitals();
  centerMapOnPlayer();
  render();
}

function createDocumentationDemoTerminalText() {
  const reset = "\x1b[0m";
  const title = "\x1b[1;32m";
  const exits = "\x1b[38;5;141m";
  const command = "\x1b[37m";
  const promptHp = "\x1b[38;5;203m";
  const promptMana = "\x1b[38;5;250m";
  const promptMv = "\x1b[38;5;118m";
  const promptGold = "\x1b[38;5;221m";
  const promptXp = "\x1b[38;5;51m";
  const npc = "\x1b[31m";
  const prompt = (mv, cmd = "") => `${promptHp}<118/118 100%${reset} ${promptMana}187/187${reset} ${promptMv}${mv}/147${reset} ${promptGold}629g${reset} ${promptXp}48%${reset}>${command}${cmd}${reset}`;
  return [
    "a na południe ścianę.",
    "",
    prompt(141, "e"),
    `${title}Ulica Murna${reset}`,
    `${exits}Wyjścia: north south east west${reset}`,
    "Ulica Murna i Boczniejsza krzyżują się tutaj. Murna dalej biegnie wzdłuż",
    "murów, na północ, a Boczniejsza znika gdzieś na zachodzie. Na wschód widać",
    "kupę śmieci i wyrwę w murze. Na południe jest jakiś ślepy zaułek.",
    "",
    prompt(141, "n"),
    `${title}Ulica Murna${reset}`,
    `${exits}Wyjścia: north south${reset}`,
    "Ta ulica jest znana z tego, że biegnie wzdłuż wschodnich murów miasta.",
    "Na zachodzie ciągnie się rząd kamienic.",
    "",
    prompt(140, "n"),
    `${title}Ulica Murna${reset}`,
    `${exits}Wyjścia: north south${reset}`,
    "Ta ulica jest znana z tego, że biegnie wzdłuż wschodnich murów miasta.",
    "Na zachodzie ciągnie się rząd kamienic.",
    "",
    prompt(140, "n"),
    `${title}Ulica Murna${reset}`,
    `${exits}Wyjścia: west north south${reset}`,
    "Ta ulica biegnie wzdłuż muru wschodniego i ciągnie się na południe.",
    "Na zachód jest inna ulica, ale nie tak ładna jak ta. Eleganckie latarnie",
    "ciągną się wzdłuż niej, a kostka brukowa jest rzeźbiona w jakieś fantastyczne",
    "wzory.",
    "",
    prompt(140, "n"),
    `${title}Skrzyżowanie${reset}`,
    `${exits}Wyjścia: east west north south${reset}`,
    "Stoisz na skrzyżowaniu ulic, będącym jednocześnie dużym placem. Na zachód",
    "przechodzi on w niewielki targ, za którym stoi świątynia. Na południe",
    "niewielka uliczka biegnie wzdłuż muru. Na północ plac kończy się przy rzece,",
    "za którą stoi jakaś rezydencja.",
    "",
    prompt(139, "e"),
    `${title}Wschodnia brama Mantaru${reset}`,
    `${exits}Wyjścia: east west${reset}`,
    "Stoisz przy wschodniej bramie dużego miasta. Brama jest dość masywna - stalowe",
    "pasy łączone nitami wzmacniają dodatkowo drewniane skrzydła. Mury miasta",
    "ciągną się dalej na północ i południe. Nad bramą dostrzegasz wyryty napis.",
    `  ${npc}Zamiatacz macha tutaj miotłą.${reset}`,
    `  ${npc}Opancerzony strażnik pilnuje tutaj bramy.${reset}`,
    `  ${npc}Opancerzony strażnik pilnuje tutaj bramy.${reset}`,
    "",
    prompt(139)
  ].join("\r\n");
}

async function loadDocumentationDemoUserLayer() {
  try {
    await initWorldSetup();
    const payload = await fetchJson("/api/user-layer-demo")
      .catch(() => fetchJson("/api/user-layer"));
    applyUserLayerImport(payload);
    if (els.worldSetupWelcome) els.worldSetupWelcome.hidden = true;
    return project.rooms.some((room) => room.worldKey);
  } catch (error) {
    console.warn("[demo:warn] user-layer demo load failed", error);
    if (els.worldSetupWelcome) els.worldSetupWelcome.hidden = true;
    if (els.worldCacheStatus) {
      els.worldCacheStatus.textContent = "demo";
      els.worldCacheStatus.dataset.state = "ready";
    }
    if (els.worldAtlasStatus) {
      els.worldAtlasStatus.textContent = "demo";
      els.worldAtlasStatus.dataset.state = "ready";
    }
    return false;
  }
}

function createDocumentationDemoProject() {
  const now = new Date().toISOString();
  const rooms = [
    documentationDemoRoom("miasto.are:284,337,13", "Ul. Nadbrzeżna", "miasto.are", 284, 337, 13, ["s", "w"], {
      w: "miasto.are:283,337,13",
      s: "miasto.are:284,338,13",
      d: "underdes.are:284,337,12"
    }, "Ta niewielka ulica biegnie wzdłuż rzeczki, stąd jej nazwa. Rzeczka jest koloru raczej podejrzanego i lepiej się w niej nie taplać.", [], ""),
    documentationDemoRoom("las.are:286,337,13", "Łąka", "las.are", 286, 337, 13, ["n", "s", "e"], {
      e: "las.are:287,337,13",
      n: "las.are:286,336,13",
      s: "miasto.are:286,338,13"
    }, "Stoisz na krańcu niezbyt szerokiego pasa łąki, ograniczonego od północy rzeką, zaś od południa traktem. Tuż obok jest wschodnia brama miasta.", [], ""),
    documentationDemoRoom("miasto.are:283,338,13", "Plac targowy", "miasto.are", 283, 338, 13, ["n", "s", "e", "w"], {
      e: "miasto.are:284,338,13",
      w: "miasto.are:282,338,13",
      n: "miasto.are:283,337,13",
      s: "miasto.are:283,339,13"
    }, "Niesamowity tłok! Ludzie pchają się na Ciebie i próbują sprzedać co mają; rzędy straganów ciągną się z obu stron placu.", ["handel"], ""),
    documentationDemoRoom("miasto.are:284,338,13", "Skrzyżowanie", "miasto.are", 284, 338, 13, ["n", "s", "e", "w"], {
      e: "miasto.are:285,338,13",
      w: "miasto.are:283,338,13",
      n: "miasto.are:284,337,13",
      s: "miasto.are:284,339,13"
    }, "Stoisz na skrzyżowaniu ulic, będącym jednocześnie dużym placem. Na zachód przechodzi on w niewielki targ, za którym stoi świątynia.", ["punkt-orientacyjny"], ""),
    documentationDemoRoom("miasto.are:285,338,13", "Wschodnia brama Mantaru", "miasto.are", 285, 338, 13, ["e", "w"], {
      e: "miasto.are:286,338,13",
      w: "miasto.are:284,338,13",
      u: "miasto.are:285,338,14"
    }, "Stoisz przy wschodniej bramie dużego miasta. Brama jest dość masywna - stalowe pasy łączone nitami wzmacniają dodatkowo drewniane skrzydła. Mury miasta ciągną się dalej na północ i południe.", ["brama", "mantar"], "Dobre miejsce kontrolne do testowania synchronizacji pozycji."),
    documentationDemoRoom("miasto.are:286,338,13", "Droga", "miasto.are", 286, 338, 13, ["n", "s", "e", "w"], {
      e: "las.are:287,338,13",
      w: "miasto.are:285,338,13",
      n: "las.are:286,337,13",
      s: "miasto.are:286,339,13"
    }, "Stoisz na szerokiej i bardzo zakurzonej drodze. Na zachód widzisz miasto, a na wschód droga ciągnie się dalej ku widocznemu skrzyżowaniu.", [], ""),
    documentationDemoRoom("las.are:287,338,13", "Droga", "las.are", 287, 338, 13, ["n", "e", "w"], {
      e: "las.are:288,338,13",
      w: "miasto.are:286,338,13",
      n: "las.are:287,337,13"
    }, "Stoisz na szerokiej i bardzo zakurzonej drodze. Na zachód trochę dalej rozciąga się miasto Mantar, a na wschód droga ciągnie się dalej ku skrzyżowaniu.", [], ""),
    documentationDemoRoom("miasto.are:284,339,13", "Ulica Murna", "miasto.are", 284, 339, 13, ["n", "s", "w"], {
      w: "miasto.are:283,339,13",
      n: "miasto.are:284,338,13",
      s: "miasto.are:284,340,13"
    }, "Ta ulica biegnie wzdłuż muru wschodniego i ciągnie się na południe. Eleganckie latarnie ciągną się wzdłuż niej.", [], ""),
    documentationDemoRoom("miasto.are:286,339,13", "Dróżka", "miasto.are", 286, 339, 13, ["n", "s"], {
      n: "miasto.are:286,338,13",
      s: "miasto.are:286,340,13"
    }, "Wędrujesz wąską dróżką biegnącą wzdłuż muru. Mur jest porośnięty winoroślą, która pnie się aż po jego krawędź.", [], ""),
    documentationDemoRoom("miasto.are:285,338,14", "Nad bramą", "miasto.are", 285, 338, 14, ["d"], {
      d: "miasto.are:285,338,13"
    }, "Wdrapałeś się nad bramę i trochę głupio wyglądasz tak wisząc...", ["poziom-z"], "")
  ];
  const demoProject = {
    version: 1,
    currentRoomId: "miasto.are:285,338,13",
    playerRoomId: "miasto.are:285,338,13",
    selectedRoomId: "miasto.are:285,338,13",
    nextRoomNumber: 20,
    areas: [{ id: "miasto.are", name: "Mantar" }, { id: "las.are", name: "Okolice Mantaru" }],
    rooms,
    exits: [],
    sessions: [{ id: "s-demo", startedAt: now }],
    globalNotes: "",
    globalNotesPages: [
      {
        id: "global-note-1",
        title: "Aktualne zadanie",
        body: "Wschodnia brama Mantaru - sprawdzić napis nad bramą\nPlac targowy - wrócić po zakupy przed wyjściem z miasta",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "global-note-2",
        title: "Przedmioty",
        body: "Latarnia, mapa okolic Mantaru, monety na zapas",
        createdAt: now,
        updatedAt: now
      }
    ],
    activeGlobalNotesPageId: "global-note-1",
    notes: []
  };
  for (const [from, direction, to] of [
    ["miasto.are:284,338,13", "n", "miasto.are:284,337,13"],
    ["miasto.are:284,338,13", "w", "miasto.are:283,338,13"],
    ["miasto.are:284,338,13", "e", "miasto.are:285,338,13"],
    ["miasto.are:284,338,13", "s", "miasto.are:284,339,13"],
    ["miasto.are:285,338,13", "e", "miasto.are:286,338,13"],
    ["miasto.are:286,338,13", "n", "las.are:286,337,13"],
    ["miasto.are:286,338,13", "e", "las.are:287,338,13"],
    ["miasto.are:286,338,13", "s", "miasto.are:286,339,13"],
    ["miasto.are:285,338,13", "u", "miasto.are:285,338,14"]
  ]) {
    connectRooms(demoProject, from, to, direction);
  }
  return demoProject;
}

function documentationDemoRoom(worldKey, title, areaFile, x, y, z, visibleExits, links, description, tags = [], notes = "") {
  const now = new Date().toISOString();
  const coord = { x, y, z };
  const room = {
    id: worldKey,
    area: areaFile,
    areaFile,
    coord,
    worldKey,
    key: worldKey,
    x,
    y,
    z,
    title,
    description,
    descriptionHash: "",
    exitsSeen: visibleExits,
    visibleExits,
    specialExitsSeen: [],
    blockedExitsSeen: [],
    tags,
    notes,
    confidence: "demo",
    links,
    createdAt: now,
    updatedAt: now
  };
  return room;
}

function createDocumentationDemoStats() {
  return {
    vitals: {
      hp: 113,
      hpMax: 118,
      mana: 149,
      manaMax: 187,
      mv: 126,
      mvMax: 147
    },
    economy: {
      gold: 629,
      goldBank: 3239,
      level: 7,
      exp: 4820,
      minExp: 4200,
      expLimit: 5600
    },
    time: {
      hour: 20,
      minute: 12,
      day: 22
    },
    effects: [
      { number: 12, name: "Laska blyskawic", duration: 24, count: 1 }
    ],
    conditions: [
      { key: "hunger", name: "glod", level: "state" }
    ],
    environment: {
      canObserveMobs: true
    }
  };
}

function createDocumentationDemoMobs() {
  return [
    demoMob(964, "Kapłan", 281, 338, 13, -4, 0, 4, "w", "miasto.are"),
    demoMob(244, "Zamiatacz", 285, 338, 13, 0, 0, 0, "here", "miasto.are"),
    demoMob(245, "Opancerzony strażnik", 285, 338, 13, 0, 0, 0, "here", "miasto.are"),
    demoMob(246, "Opancerzony strażnik", 285, 338, 13, 0, 0, 0, "here", "miasto.are")
  ];
}

function demoMob(id, name, x, y, z, dx, dy, distance, direction, areaFile) {
  return {
    id,
    name,
    x,
    y,
    z,
    dx,
    dy,
    distance,
    direction,
    visibleCardinal4: true,
    source: "demo",
    areaFile,
    worldKey: `${areaFile}:${x},${y},${z}`
  };
}

async function refreshWorldSetupStatus() {
  try {
    const status = await fetchJson("/api/world/status");
    updateWorldSetupStatus(status);
    return status;
  } catch (error) {
    logMapper("world-status-load-failed", { message: String(error?.message || error) }, "warn");
    return null;
  }
}

function updateWorldSetupStatus(status = {}) {
  worldSetupStatus = status;
  const cacheReady = Boolean(status.cache?.ready);
  const atlasReady = Boolean(status.atlas?.ready);
  const busy = Boolean(status.busy);
  if (els.worldCacheStatus) {
    els.worldCacheStatus.textContent = getWorldFileStatusText(status.cache);
    els.worldCacheStatus.dataset.state = getWorldFileStatusState(status.cache);
  }
  if (els.worldAtlasStatus) {
    els.worldAtlasStatus.textContent = getWorldFileStatusText(status.atlas);
    els.worldAtlasStatus.dataset.state = getWorldFileStatusState(status.atlas);
  }
  if (els.worldSetupWelcome) {
    els.worldSetupWelcome.hidden = cacheReady && atlasReady;
  }
  const extractButtons = [els.extractWorldBtn, els.welcomeExtractWorldBtn].filter(Boolean);
  const atlasButtons = [els.buildWorldAtlasBtn, els.welcomeBuildAtlasBtn].filter(Boolean);
  for (const button of extractButtons) {
    button.disabled = busy;
    button.textContent = busy && status.runningStep === "extract" ? "Ekstrahuje..." : "Ekstrahuj dane gry";
  }
  for (const button of atlasButtons) {
    button.disabled = busy || !cacheReady;
    button.textContent = busy && status.runningStep === "atlas" ? "Buduje..." : "Zbuduj atlas";
  }
}

async function checkAppUpdateStatus() {
  try {
    const status = await fetchJson("/api/app/update-status");
    updateAppUpdateStatus(status);
  } catch (error) {
    updateAppUpdateStatus({ error: String(error?.message || error) });
    logMapper("app-update-check-failed", { message: String(error?.message || error) }, "warn");
  }
}

function updateAppUpdateStatus(status = {}) {
  const currentVersion = status.currentVersion || "";
  const latestVersion = status.latestVersion || "";
  const releaseUrl = status.releaseUrl || "https://github.com/HubertKSK/otchlan-mapper/releases/latest";
  if (els.updateReleaseLink) {
    els.updateReleaseLink.href = releaseUrl;
    els.updateReleaseLink.hidden = !status.updateAvailable;
  }
  if (els.updateStatusText) {
    if (status.updateAvailable && latestVersion) {
      els.updateStatusText.textContent = `Dostepna wersja ${formatReleaseVersion(latestVersion)}.`;
    } else if (status.error) {
      els.updateStatusText.textContent = "Nie udalo sie sprawdzic aktualizacji.";
    } else {
      els.updateStatusText.textContent = `Masz aktualna wersje ${currentVersion || "aplikacji"}.`;
    }
  }
  maybeShowUpdateToast(status);
}

function maybeShowUpdateToast(status = {}) {
  if (!status.updateAvailable || !status.latestVersion) return;
  const latestVersion = normalizeReleaseVersion(status.latestVersion);
  const toastKey = `v${latestVersion}`;
  if (localStorage.getItem(UPDATE_TOAST_VERSION_KEY) === toastKey) return;
  localStorage.setItem(UPDATE_TOAST_VERSION_KEY, toastKey);
  showToast(`Dostepna nowa wersja: ${toastKey}.`, "success");
}

function formatReleaseVersion(version) {
  const normalized = normalizeReleaseVersion(version);
  return normalized ? `v${normalized}` : "";
}

function normalizeReleaseVersion(version) {
  return String(version || "").trim().replace(/^v/i, "");
}

function getWorldFileStatusText(fileStatus = {}) {
  if (fileStatus.ready) return "gotowy";
  if (fileStatus.stale) return "nieaktualny";
  return "brak";
}

function getWorldFileStatusState(fileStatus = {}) {
  if (fileStatus.ready) return "ready";
  if (fileStatus.stale) return "stale";
  return "missing";
}

async function runWorldSetupStep(step) {
  const actionLabel = step === "extract" ? "Ekstrakcja danych gry" : "Budowa atlasu";
  try {
    updateWorldSetupStatus({
      ...(worldSetupStatus || {}),
      busy: true,
      runningStep: step
    });
    const status = await postJson(step === "extract" ? "/api/world/extract" : "/api/world/atlas", {});
    updateWorldSetupStatus(status);
    showToast(`${actionLabel} zakonczona.`, "success");
    if (status.cache?.exists) {
      await initWorldCache({ loadAtlas: status.atlas?.exists !== false });
      repairProjectRoomsFromWorldData();
      applyPendingGameMemoryPosition();
      render();
    }
  } catch (error) {
    await refreshWorldSetupStatus();
    showToast(`${actionLabel} nie powiodla sie.`, "error");
    logMapper("world-setup-step-failed", { step, message: String(error?.message || error) }, "warn");
  }
}

async function initWorldCache(options = {}) {
  try {
    const payload = await fetchJson("/api/world-cache");
    if (!Array.isArray(payload.rooms)) {
      logMapper("world-cache-unavailable", { message: payload.message || "missing cache" }, "warn");
      return;
    }
    worldCache = payload;
    worldRoomsByKey = new Map(worldCache.rooms.map((room) => [room.key, room]));
    if (options.loadAtlas !== false) await initWorldAtlas();
    repairProjectRoomsFromWorldData();
    await loadProjectFromServer({ silentMissing: true });
    applyPendingGameMemoryPosition();
    logMapper("world-cache-loaded", {
      rooms: worldCache.rooms.length,
      areas: worldCache.areas?.length || 0,
      zLayers: worldCache.zLayers?.length || 0
    });
  } catch (error) {
    logMapper("world-cache-load-failed", { message: String(error?.message || error) }, "warn");
  }
}

async function initWorldAtlas() {
  try {
    const payload = await fetchJson("/api/world-atlas");
    if (!Array.isArray(payload.rooms)) {
      logMapper("world-atlas-unavailable", { message: payload.message || "missing atlas" }, "warn");
      return;
    }
    worldAtlas = payload;
    atlasRoomsByKey = new Map(worldAtlas.rooms.map((room) => [room.key, room]));
    logMapper("world-atlas-loaded", {
      rooms: worldAtlas.rooms.length,
      zLayers: worldAtlas.zLayers?.length || 0,
      warnings: worldAtlas.warnings?.length || 0
    });
  } catch (error) {
    logMapper("world-atlas-load-failed", { message: String(error?.message || error) }, "warn");
  }
}

function initXterm() {
  term.open(els.gameOutput);
  scrollTerminalToBottom();
  scheduleTerminalFit();
  if (window.ResizeObserver) {
    terminalResizeObserver = new ResizeObserver(() => scheduleTerminalFit());
    terminalResizeObserver.observe(els.gameOutput);
    terminalResizeObserver.observe(els.terminalStage);
  } else {
    window.addEventListener("resize", scheduleTerminalFit);
  }
  term.onData((data) => {
    claimMapperActivation("terminal-input");
    terminalStagePinnedToBottom = true;
    scrollTerminalToBottom();
    if (DOCUMENTATION_DEMO_MODE) return;
    sendQueuedGameInput(data);
  });
  els.terminalStage?.addEventListener("scroll", () => {
    terminalStagePinnedToBottom = isTerminalStageNearBottom();
  }, { passive: true });
}

function sendQueuedGameInput(data) {
  gameInputSendQueue = gameInputSendQueue
    .catch(() => {})
    .then(() => postJson("/api/game/input", { data, instanceId: INSTANCE_ID }));
}

function scheduleTerminalFit() {
  window.requestAnimationFrame(() => fitTerminalToPanel());
}

function fitTerminalToPanel() {
  if (!els.gameOutput || !term.element) return;
  if (term.cols !== TERMINAL_COLS || term.rows !== TERMINAL_ROWS) {
    term.resize(TERMINAL_COLS, TERMINAL_ROWS);
  }
  fitAtlasTerminalPreview();
  if (terminalStagePinnedToBottom) scrollTerminalToBottom();
}

function isTerminalStageNearBottom() {
  const stage = els.terminalStage;
  if (!stage) return true;
  return stage.scrollHeight - stage.clientHeight - stage.scrollTop < 24;
}

function scrollTerminalToBottom() {
  window.requestAnimationFrame(() => {
    term.scrollToBottom();
    if (els.terminalStage) {
      els.terminalStage.scrollTop = els.terminalStage.scrollHeight;
    }
  });
}

function fitAtlasTerminalPreview() {
  if (!els.appShell || !els.gameOutput || !els.terminalStage || !term.element) return;
  if (els.appShell.dataset.workspace !== "atlas") {
    els.gameOutput.style.removeProperty("--terminal-preview-scale");
    return;
  }

  const stageWidth = els.terminalStage.clientWidth;
  const stageHeight = els.terminalStage.clientHeight;
  const terminalWidth = term.element.scrollWidth || term.element.getBoundingClientRect().width;
  const terminalHeight = term.element.scrollHeight || term.element.getBoundingClientRect().height;
  if (!stageWidth || !stageHeight || !terminalWidth || !terminalHeight) return;

  const scale = Math.min(stageWidth / terminalWidth, stageHeight / terminalHeight);
  els.gameOutput.style.setProperty("--terminal-preview-scale", String(Math.max(0.25, Math.min(1, scale))));
}

function bindEvents() {
  [
    els.roomTagsInput,
    els.roomNotesInput
  ].forEach((input) => input.addEventListener("input", autosaveCurrentRoom));
  els.globalNotesInput.addEventListener("input", autosaveGlobalNotes);
  els.addGlobalNotePageBtn?.addEventListener("click", addGlobalNotePage);
  els.deleteGlobalNotePageBtn?.addEventListener("click", deleteActiveGlobalNotePage);
  els.menuBtn.addEventListener("click", () => setAppMenuOpen(els.menuPanel.hidden));
  document.addEventListener("click", (event) => {
    if (els.menuPanel.hidden) return;
    if (event.target.closest(".app-menu")) return;
    setAppMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.resetConfirmModal && !els.resetConfirmModal.hidden) {
      closeResetConfirmModal();
      return;
    }
    if (event.key === "Escape") setAppMenuOpen(false);
  });
  window.addEventListener("focus", () => claimMapperActivationIfVisible("window-focus"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") claimMapperActivationIfVisible("visibility-visible");
  });
  els.gameOutput.addEventListener("pointerdown", () => claimMapperActivationIfVisible("terminal-focus"));
  document.querySelector("#exportBtn").addEventListener("click", () => {
    exportProject();
    showToast("Backup wyeksportowany.", "success");
    setAppMenuOpen(false);
  });
  document.querySelector("#importInput").addEventListener("change", async (event) => {
    const imported = await importProject(event);
    if (imported) showToast("Backup zaimportowany.", "success");
    setAppMenuOpen(false);
  });
  document.querySelector("#resetBtn").addEventListener("click", () => {
    openResetConfirmModal();
  });
  els.cancelResetBtn?.addEventListener("click", closeResetConfirmModal);
  els.resetConfirmModal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-confirm-close]")) closeResetConfirmModal();
  });
  els.confirmResetBtn?.addEventListener("click", () => {
    closeResetConfirmModal();
    resetProject();
  });
  document.querySelector("#zoomInBtn").addEventListener("click", () => {
    zoom = clampMapZoom(zoom * 1.2);
    renderMap("ui-zoom-in");
  });
  document.querySelector("#zoomOutBtn").addEventListener("click", () => {
    zoom = clampMapZoom(zoom / 1.2);
    renderMap("ui-zoom-out");
  });
  els.mapDebugBtn.addEventListener("click", () => {
    mapDebugAll = !mapDebugAll;
    if (!mapDebugAll) selectedWorldPreview = null;
    debugMapZ = getRenderMapZ(getPlayerRoom(), getSelectedRoom());
    renderMapScopeState();
    renderMap("ui-debug-toggle");
  });
  els.mapZDownBtn.addEventListener("click", () => shiftDebugMapZ(-1));
  els.mapZUpBtn.addEventListener("click", () => shiftDebugMapZ(1));
  els.centerMapBtn.addEventListener("click", () => {
    centerMapOnPlayer();
    renderMap("ui-center-player");
  });
  els.followPlayerBtn.addEventListener("click", () => {
    followPlayer = !followPlayer;
    if (followPlayer) {
      selectedRoomId = playerRoomId;
      selectedRoomPreview = null;
      selectedWorldPreview = null;
      project.selectedRoomId = selectedRoomId;
      centerMapOnPlayer();
    }
    project.followPlayer = followPlayer;
    saveProject();
    render("ui-follow-toggle");
  });
  initMapDragging();
  document.querySelector("#startGameBtn").addEventListener("click", async () => {
    if (gameRunning) {
      await postJson("/api/game/stop", {});
      term.focus();
      return;
    }
    claimMapperActivation("start-game");
    await postJson("/api/game/resize", { cols: TERMINAL_COLS, rows: TERMINAL_ROWS });
    await postJson("/api/game/start", { instanceId: INSTANCE_ID });
    term.focus();
  });
  els.workspaceButtons.forEach((button) => {
    button.addEventListener("click", () => setWorkspaceMode(button.dataset.workspaceTarget));
  });
  els.themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
  });
  els.toggleDescriptionBtn?.addEventListener("click", () => {
    setDescriptionVisibility(!descriptionVisible);
    showToast(descriptionVisible ? "Opis lokacji wlaczony." : "Opis lokacji ukryty.", "success");
  });
  els.toggleRoomTagsBtn?.addEventListener("click", () => {
    setRoomTagsVisibility(!roomTagsVisible);
    showToast(roomTagsVisible ? "Tagi pola wlaczone." : "Tagi pola ukryte.", "success");
  });
  els.toggleRoomNotesBtn?.addEventListener("click", () => {
    setRoomNotesVisibility(!roomNotesVisible);
    showToast(roomNotesVisible ? "Notatki pola wlaczone." : "Notatki pola ukryte.", "success");
  });
  els.toggleMobsBtn?.addEventListener("click", () => {
    setMobsVisibility(!mobsVisible);
    showToast(mobsVisible ? "Moby na mapie wlaczone." : "Moby na mapie ukryte.", "success");
  });
  els.toggleNotesBtn?.addEventListener("click", () => {
    setNotesVisibility(!notesVisible);
    showToast(notesVisible ? "Notes wlaczony." : "Notes ukryty.", "success");
  });
  els.terminalFontSizeDownBtn?.addEventListener("click", () => {
    const fontSize = setTerminalFontSize(Number(term.options.fontSize) - 1);
    showToast(`Czcionka terminala: ${fontSize}px.`, "success");
  });
  els.terminalFontSizeUpBtn?.addEventListener("click", () => {
    const fontSize = setTerminalFontSize(Number(term.options.fontSize) + 1);
    showToast(`Czcionka terminala: ${fontSize}px.`, "success");
  });
  els.extractWorldBtn?.addEventListener("click", () => runWorldSetupStep("extract"));
  els.welcomeExtractWorldBtn?.addEventListener("click", () => runWorldSetupStep("extract"));
  els.buildWorldAtlasBtn?.addEventListener("click", () => runWorldSetupStep("atlas"));
  els.welcomeBuildAtlasBtn?.addEventListener("click", () => runWorldSetupStep("atlas"));
  els.statVisibilityButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.statToggle;
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_STAT_VISIBILITY, key)) return;
      setStatVisibility(key, !statVisibility[key]);
      showToast(`${getStatVisibilityLabel(key)} ${statVisibility[key] ? "widoczne" : "ukryte"}.`, "success");
    });
  });
  els.debugRecordBtn.addEventListener("click", toggleTerminalRecording);
}

function setAppMenuOpen(open) {
  els.menuPanel.hidden = !open;
  els.menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

function openResetConfirmModal() {
  if (!els.resetConfirmModal) return;
  setAppMenuOpen(false);
  els.resetConfirmModal.hidden = false;
  els.confirmResetBtn?.focus();
}

function closeResetConfirmModal() {
  if (!els.resetConfirmModal) return;
  els.resetConfirmModal.hidden = true;
}

function resetProject() {
  project = createEmptyProject();
  playerRoomId = "";
  playerPositionKnown = false;
  selectedRoomId = project.currentRoomId;
  selectedRoomPreview = null;
  selectedWorldPreview = null;
  followPlayer = true;
  centerMapOnPlayer();
  saveProject();
  render();
  showToast("Utworzono nowa mape.", "success");
}

async function initDebugControls() {
  try {
    const state = await fetchJson("/api/debug/status");
    applyDebugState(state);
  } catch (error) {
    console.warn("[debug:warn] debug status failed", error);
  }
}

async function toggleTerminalRecording() {
  const recording = els.debugRecordBtn.dataset.recording !== "true";
  els.debugRecordBtn.disabled = true;
  try {
    const state = await postJson("/api/debug/terminal-recording", { recording });
    applyDebugState(state);
  } catch (error) {
    console.warn("[debug:warn] terminal recording toggle failed", error);
  } finally {
    els.debugRecordBtn.disabled = false;
  }
}

function applyDebugState(state = {}) {
  if (!state.enabled) {
    if (els.debugSettingsSection) els.debugSettingsSection.hidden = true;
    els.debugRecordBtn.hidden = true;
    return;
  }
  if (els.debugSettingsSection) els.debugSettingsSection.hidden = false;
  els.debugRecordBtn.hidden = false;
  els.debugRecordBtn.dataset.recording = state.terminalRecording ? "true" : "false";
  els.debugRecordBtn.textContent = state.terminalRecording ? "Stop nagrywania" : "Nagrywaj terminal";
  els.debugRecordBtn.title = state.terminalOutputFile
    ? `Nagrywaj output terminala do ${state.terminalOutputFile}`
    : "Nagrywaj output terminala";
}

function initServerAutosave() {
  window.setInterval(() => {
    saveProjectToServer().catch((error) => console.warn("[mapper:warn] server autosave failed", error));
  }, SERVER_AUTOSAVE_MS);
}

function scheduleServerSave(options = {}) {
  if (options.immediate) {
    if (serverSaveTimer) {
      window.clearTimeout(serverSaveTimer);
      serverSaveTimer = null;
    }
    saveProjectToServer().catch((error) => console.warn("[mapper:warn] server save failed", error));
    return;
  }

  if (serverSaveTimer) return;
  serverSaveTimer = window.setTimeout(() => {
    serverSaveTimer = null;
    saveProjectToServer().catch((error) => console.warn("[mapper:warn] server save failed", error));
  }, SERVER_SAVE_DEBOUNCE_MS);
}

async function saveProjectToServer(options = {}) {
  if (!options.force && !serverSaveDirty) return null;
  if (serverSaveInFlight) return serverSavePromise;
  serverSaveInFlight = true;
  const saveRevision = serverSaveRevision;
  const saveMode = "layer";
  const payload = buildUserLayerExport();
  serverSavePromise = (async () => {
    const result = await putJson("/api/user-layer", payload);
    if (result?.ok) {
      if (serverSaveRevision <= saveRevision) {
        serverSaveDirty = false;
      }
      logMapper("server-user-layer-saved", {
        savedAt: result.savedAt,
        file: result.file,
        bytes: result.bytes,
        forced: Boolean(options.force),
        mode: saveMode,
        revision: saveRevision,
        latestRevision: serverSaveRevision
      });
    } else {
      console.warn("[mapper:warn] server save failed", result);
    }
    return result;
  })();

  try {
    return await serverSavePromise;
  } finally {
    serverSaveInFlight = false;
    serverSavePromise = null;
    if (serverSaveDirty && serverSaveRevision > saveRevision) scheduleServerSave({ immediate: true });
  }
}

async function loadProjectFromServer(options = {}) {
  try {
    const payload = await fetchJson("/api/user-layer");
    applyUserLayerImport(payload);
    centerMapOnPlayer();
    saveProject({ markServerDirty: false });
    serverSaveDirty = false;
    render();
    logMapper("server-user-layer-loaded", {
      savedAt: payload.savedAt || "",
      rooms: payload.rooms?.length || 0
    });
    return true;
  } catch (error) {
    if (!options.silentMissing) console.warn("[mapper:warn] server load failed", error);
    return false;
  }
}

function showToast(message, type = "info") {
  if (!els.toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  els.toastStack.append(toast);

  const remove = () => {
    toast.classList.add("toast-exit");
    window.setTimeout(() => toast.remove(), 180);
  };
  window.setTimeout(remove, type === "error" ? 5200 : 3200);
}

function initMapDragging() {
  els.mapSvg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const viewBox = getCurrentMapViewBox();
    mapDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      viewWidth: viewBox.width,
      viewHeight: viewBox.height,
      moved: false
    };
    els.mapSvg.setPointerCapture(event.pointerId);
  });

  els.mapSvg.addEventListener("pointermove", (event) => {
    if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
    const rect = els.mapSvg.getBoundingClientRect();
    const dx = event.clientX - mapDrag.lastX;
    const dy = event.clientY - mapDrag.lastY;
    if (Math.hypot(event.clientX - mapDrag.startX, event.clientY - mapDrag.startY) > 3) {
      mapDrag.moved = true;
      suppressNextMapClick = true;
    }
    mapView.x -= dx * (mapDrag.viewWidth / Math.max(rect.width, 1));
    mapView.y -= dy * (mapDrag.viewHeight / Math.max(rect.height, 1));
    mapDrag.lastX = event.clientX;
    mapDrag.lastY = event.clientY;
    applyMapViewBox();
    scheduleMapViewportRender();
  });

  els.mapSvg.addEventListener("pointerup", finishMapDrag);
  els.mapSvg.addEventListener("pointercancel", finishMapDrag);
  els.mapSvg.addEventListener("wheel", zoomMapWithWheel, { passive: false });
  els.mapSvg.addEventListener("click", handleMapSvgClick);
}

function handleMapSvgClick(event) {
  if (suppressNextMapClick) {
    suppressNextMapClick = false;
    return;
  }
  const room = findMapRoomAtClientPoint(event.clientX, event.clientY);
  if (!room) return;
  previewAtlasRoom(room);
  render();
}

function previewAtlasRoom(room) {
  if (!room) return;
  if (room.isWorldBase) {
    selectedRoomPreview = null;
    selectedWorldPreview = room;
    return;
  }
  const projectRoom = getRoomById(room.id) || room;
  selectedRoomId = projectRoom.id;
  selectedRoomPreview = projectRoom;
  selectedWorldPreview = null;
  project.selectedRoomId = selectedRoomId;
}

function findMapRoomAtClientPoint(clientX, clientY) {
  if (!els.mapSvg || !mapHitTargets.length) return null;
  const point = clientPointToSvgPoint(clientX, clientY);
  if (!point) return null;
  for (let i = mapHitTargets.length - 1; i >= 0; i -= 1) {
    const target = mapHitTargets[i];
    if (
      point.x >= target.x &&
      point.x <= target.x + target.width &&
      point.y >= target.y &&
      point.y <= target.y + target.height
    ) {
      return target.room;
    }
  }
  return null;
}

function clientPointToSvgPoint(clientX, clientY) {
  const matrix = els.mapSvg.getScreenCTM();
  if (!matrix) return null;
  const point = els.mapSvg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

function finishMapDrag(event) {
  if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
  if (mapDrag.moved) {
    setTimeout(() => {
      suppressNextMapClick = false;
    }, 80);
  }
  mapDrag = null;
}

function zoomMapWithWheel(event) {
  event.preventDefault();
  const rect = els.mapSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const viewBox = getCurrentMapViewBox();
  const pointerX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const pointerY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  const mapX = viewBox.x + pointerX * viewBox.width;
  const mapY = viewBox.y + pointerY * viewBox.height;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
  const nextZoom = clampMapZoom(zoom * Math.exp(-delta * 0.0015));
  if (nextZoom === zoom) return;

  zoom = nextZoom;
  const nextViewBox = getCurrentMapViewBox();
  mapView.x = mapX - pointerX * nextViewBox.width + nextViewBox.width / 2;
  mapView.y = mapY - pointerY * nextViewBox.height + nextViewBox.height / 2;
  applyMapViewBox();
  scheduleMapViewportRender();
}

function clampMapZoom(value) {
  return Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, value));
}

function connectEventStream() {
  const source = new EventSource("/events");
  source.addEventListener("status", (event) => {
    const status = JSON.parse(event.data);
    els.statusText.textContent = status.message || "Watcher aktywny.";
  });
  source.addEventListener("game-status", (event) => {
    const state = JSON.parse(event.data);
    applyGameStatus(state);
  });
  source.addEventListener("mapper-active", (event) => {
    const state = JSON.parse(event.data);
    serverActiveMapperId = state.activeInstanceId || null;
  });
  source.addEventListener("game-position", (event) => receiveGameMemoryPosition(JSON.parse(event.data)));
  source.addEventListener("terminal-output-history-v3", (event) => {
    for (const entry of JSON.parse(event.data)) addGameOutput(entry, false);
  });
  source.addEventListener("terminal-output-v3", (event) => addGameOutput(JSON.parse(event.data), true));
  source.onerror = () => {
    els.statusText.textContent = "Polaczenie z watcherem przerwane. Odwiezenie strony sprobuje ponownie.";
  };
}

function applySavedWorkspace() {
  setWorkspaceMode("game", { persist: false });
}

function setWorkspaceMode(mode, options = {}) {
  const next = mode === "atlas" ? "atlas" : "game";
  if (next !== "atlas") {
    selectedRoomPreview = null;
    selectedWorldPreview = null;
  }
  if (els.appShell) els.appShell.dataset.workspace = next;
  els.workspaceButtons.forEach((button) => {
    const active = button.dataset.workspaceTarget === next;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (options.persist !== false) localStorage.setItem(WORKSPACE_KEY, next);
  scheduleTerminalFit();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      centerMapOnFocus();
      renderMap("ui-workspace-change");
    });
  });
}

function addGameOutput(entry, live) {
  const shouldStickToBottom = terminalStagePinnedToBottom || isTerminalStageNearBottom();
  if (entry.source === "stdout") {
    const text = String(entry.text || "");
    term.write(text, () => {
      if (shouldStickToBottom) scrollTerminalToBottom();
    });
  } else {
    term.write(`${cleanTerminalText(entry.text || "")}\r\n`, () => {
      if (shouldStickToBottom) scrollTerminalToBottom();
    });
  }
}

function receiveGameMemoryPosition(position = {}) {
  pendingGameMemoryPosition = position;
  applyGameMemoryPosition(position);
}

function applyPendingGameMemoryPosition() {
  if (!pendingGameMemoryPosition) return;
  applyGameMemoryPosition(pendingGameMemoryPosition);
}

function applyGameMemoryPosition(position = {}) {
  if (hasGameMemoryStatsPayload(position)) applyGameMemoryStats(position);
  const mobsChanged = updateGameMobs(position);
  if (!worldRoomsByKey.size) {
    pendingGameMemoryPosition = position;
    return;
  }
  const worldKey = String(position.worldKey || "");
  if (!worldKey) return;
  const worldRoom = worldRoomsByKey.get(worldKey);
  if (!worldRoom) {
    logMapper("game-position-memory-unmapped", {
      position
    }, "warn");
    return;
  }

  const previousRoom = getPlayerRoom();
  if (playerPositionKnown && previousRoom?.worldKey === worldKey) {
    pendingGameMemoryPosition = null;
    if (mobsChanged && !renderMobOnlyMapUpdate("memory-same-room-mobs")) {
      renderMap("memory-same-room-mobs");
    }
    return;
  }

  const previousWorldRoom = previousRoom?.worldKey ? worldRoomsByKey.get(previousRoom.worldKey) : null;
  const previousPlayerRoomId = playerRoomId;
  const previousSelectedRoomId = selectedRoomId;
  const roomsBefore = project.rooms.length;
  const exitsBefore = project.exits.length;
  const room = ensureProjectRoomForWorldRoom(worldRoom, {});
  const inferredDirection = inferAdjacentWorldDirection(previousWorldRoom, worldRoom);
  if (previousRoom && inferredDirection) {
    connectRooms(project, previousRoom.id, room.id, inferredDirection);
  }
  syncDiscoveredWorldLinks(room);

  playerRoomId = room.id;
  playerPositionKnown = true;
  pendingGameMemoryPosition = null;
  project.playerRoomId = playerRoomId;
  project.currentRoomId = playerRoomId;
  if (followPlayer) {
    selectedRoomId = room.id;
    selectedRoomPreview = null;
    selectedWorldPreview = null;
    project.selectedRoomId = selectedRoomId;
    centerMapOnPlayer();
  }

  const positionChanged = previousPlayerRoomId !== playerRoomId || previousSelectedRoomId !== selectedRoomId;
  const layerChanged = project.rooms.length !== roomsBefore || project.exits.length !== exitsBefore;
  if (previousPlayerRoomId !== playerRoomId) {
    schedulePlayerTravelAnimation(previousRoom, room);
  }
  if (positionChanged || layerChanged || mobsChanged) {
    logMapper("game-position-memory-applied", {
      fromRoomId: previousRoom?.id || "",
      fromWorldKey: previousRoom?.worldKey || "",
      toRoomId: room.id,
      toWorldKey: worldRoom.key,
      areaFile: position.areaFile || worldRoom.areaFile || "",
      coord: position.coord || worldRoom.coord || null,
      inferredDirection: inferredDirection || "",
      source: position.source || "process-memory"
    });
    if (positionChanged || layerChanged) saveProject({ immediateServerSave: true, positionOnly: !layerChanged });
    const memoryRenderReason = [
      layerChanged ? "layer" : "",
      mobsChanged ? "mobs" : "",
      positionChanged ? "position" : ""
    ].filter(Boolean).join("+") || "memory";
    if (!layerChanged && positionChanged && renderPositionOnlyMapUpdate(previousPlayerRoomId, previousSelectedRoomId, "memory-position")) {
      const mobsUpdated = !mobsChanged || renderMobOnlyMapUpdate("memory-position-mobs");
      if (!mobsUpdated) {
        render(`memory-${memoryRenderReason}`);
        return;
      }
      renderFollowState();
      renderInspector();
    } else {
      render(`memory-${memoryRenderReason}`);
    }
  }
}

function updateGameMobs(position = {}) {
  if (!Array.isArray(position.mobs)) return false;
  const areaFile = String(position.areaFile || "");
  const mobs = normalizeClientGameMobs(position.mobs, areaFile);
  const visibilityKey = canRenderGameMobs() ? "visible" : "hidden";
  const visibleMobWorldKeys = getPlayerVisibleMobWorldKeys();
  const signatureMobs = canRenderGameMobs()
    ? mapDebugAll ? mobs : mobs.filter((mob) => visibleMobWorldKeys.has(mob.worldKey))
    : [];
  const signature = signatureMobs
    .map((mob) => `${mob.id}:${mob.worldKey}:${mob.name}`)
    .sort()
    .join("|");
  const changed = signature !== currentGameMobSignature
    || areaFile !== currentGameMobAreaFile
    || visibilityKey !== currentGameMobVisibilityKey;
  currentGameMobs = mobs;
  currentGameMobAreaFile = areaFile;
  currentGameMobSignature = signature;
  currentGameMobVisibilityKey = visibilityKey;
  return changed;
}

function hasGameMemoryStatsPayload(position = {}) {
  return Boolean(
    position.vitals ||
    position.economy ||
    position.time ||
    position.environment ||
    Array.isArray(position.effects) ||
    Array.isArray(position.conditions)
  );
}

function normalizeClientGameMobs(mobs = [], areaFile = "") {
  if (!Array.isArray(mobs) || !areaFile) return [];
  return mobs
    .map((mob) => {
      const id = finiteNumber(mob?.id);
      const x = finiteNumber(mob?.x);
      const y = finiteNumber(mob?.y);
      const z = finiteNumber(mob?.z);
      const worldKey = `${areaFile}:${x},${y},${z}`;
      return {
        id,
        name: String(mob?.name || `Mob #${id}`).trim() || `Mob #${id}`,
        x,
        y,
        z,
        dx: finiteNumber(mob?.dx),
        dy: finiteNumber(mob?.dy),
        distance: finiteNumber(mob?.distance),
        direction: String(mob?.direction || ""),
        visibleCardinal4: Boolean(mob?.visibleCardinal4),
        source: String(mob?.source || ""),
        worldKey
      };
    })
    .filter((mob) => mob.id > 0 && mob.x && mob.y && mob.z);
}

function schedulePlayerTravelAnimation(fromRoom, toRoom) {
  if (!fromRoom || !toRoom || fromRoom.id === toRoom.id) {
    pendingPlayerTravelAnimation = null;
    return;
  }
  pendingPlayerTravelAnimation = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    fromRoomId: fromRoom.id,
    toRoomId: toRoom.id,
    fromZ: Number(fromRoom.z || 0),
    toZ: Number(toRoom.z || 0),
    startedAt: 0,
    duration: PLAYER_TRAVEL_ANIMATION_MS
  };
}

function applyGameMemoryStats(position = {}) {
  const nextStats = {
    vitals: position.vitals || {},
    economy: position.economy || {},
    time: position.time || {},
    environment: position.environment || {},
    effects: Array.isArray(position.effects) ? position.effects : [],
    conditions: Array.isArray(position.conditions) ? position.conditions : []
  };
  showCharacterStatChanges(lastStatDeltaValues, collectStatDeltaValues(nextStats));
  lastGameStats = {
    vitals: nextStats.vitals,
    economy: nextStats.economy,
    time: nextStats.time,
    environment: nextStats.environment,
    effects: nextStats.effects,
    conditions: nextStats.conditions
  };
  lastStatDeltaValues = collectStatDeltaValues(nextStats);
  renderCharacterVitals();
}

function collectStatDeltaValues(stats = {}) {
  const vitals = stats.vitals || {};
  const economy = stats.economy || {};
  return {
    hp: Math.round(finiteNumber(vitals.hp)),
    mana: Math.round(finiteNumber(vitals.mana)),
    mv: Math.round(finiteNumber(vitals.mv)),
    gold: Math.round(finiteNumber(economy.gold)),
    goldBank: Math.round(finiteNumber(economy.goldBank))
  };
}

function showCharacterStatChanges(previous, current) {
  if (!previous || !current) return;
  showStatChange(els.hpValue, current.hp - previous.hp, "HP");
  showStatChange(els.manaValue, current.mana - previous.mana, "MANA");
  showStatChange(els.mvValue, current.mv - previous.mv, "MV");
  showStatChange(els.goldValue, current.gold - previous.gold);
  showStatChange(els.goldBankValue, current.goldBank - previous.goldBank);
}

function showStatChange(target, delta, label = "") {
  if (!target || !delta) return;
  const anchor = target.closest(".vital-meter, .resource-line, .resource-pill") || target;
  const badge = document.createElement("span");
  badge.className = `stat-change ${delta > 0 ? "positive" : "negative"}`;
  const sign = delta > 0 ? "+" : "";
  badge.textContent = `${sign}${formatInteger(delta)}${label ? ` ${label}` : ""}`;
  anchor.appendChild(badge);
  window.setTimeout(() => badge.remove(), 1100);
}

function renderCharacterVitals() {
  const vitals = lastGameStats?.vitals || {};
  const economy = lastGameStats?.economy || {};
  const time = lastGameStats?.time || {};
  renderVitalMeter("hp", vitals.hp, vitals.hpMax);
  renderVitalMeter("mana", vitals.mana, vitals.manaMax);
  renderVitalMeter("mv", vitals.mv, vitals.mvMax);
  if (els.goldValue) els.goldValue.textContent = formatInteger(economy.gold);
  if (els.goldBankValue) els.goldBankValue.textContent = formatInteger(economy.goldBank);
  if (els.levelValue) els.levelValue.textContent = economy.level > 0 ? formatInteger(economy.level) : "--";
  renderGameTime(time);
  renderExpMeter(economy);
  renderActiveEffects(lastGameStats?.effects || [], lastGameStats?.conditions || []);
}

function renderGameTime(time = {}) {
  const hour = Number(time.hour);
  const minute = Number(time.minute);
  const day = Number(time.day);
  if (els.gameTimeValue) {
    els.gameTimeValue.textContent = Number.isFinite(hour) && Number.isFinite(minute)
      ? `${padTimePart(hour)}:${padTimePart(roundGameMinuteToHalfHour(minute))}`
      : "--";
  }
  if (els.journeyDayValue) {
    els.journeyDayValue.textContent = Number.isFinite(day) && day > 0 ? formatInteger(day) : "--";
  }
}

function renderActiveEffects(effects = [], conditions = []) {
  if (!els.activeEffectsList) return;
  const activeEffects = effects.filter((effect) => Number(effect?.number || 0) || Number(effect?.duration || 0));
  const activeConditions = conditions.filter((condition) => String(condition?.key || condition?.name || "").trim());
  if (!canObserveGameMobs() && !activeConditions.some((condition) => condition.key === "darkness")) {
    activeConditions.push({ key: "darkness", name: "ciemność", level: "state" });
  }
  const statusItems = [
    ...activeEffects.map((effect) => ({
      className: "active-effect",
      text: formatEffectStatusName(effect),
      title: `Numer ${formatInteger(effect.number)}`
    })),
    ...activeConditions.map((condition) => ({
      className: `active-effect condition-${condition.level || "state"} condition-${condition.key || "custom"}`,
      text: formatConditionStatusName(condition),
      title: formatConditionStatusTitle(condition)
    }))
  ];
  if (!statusItems.length) {
    els.activeEffectsList.innerHTML = "<strong>--</strong>";
    return;
  }
  els.activeEffectsList.replaceChildren(...statusItems.map((status) => {
    const item = document.createElement("strong");
    item.className = status.className;
    item.textContent = status.text;
    if (status.title) item.title = status.title;
    return item;
  }));
}

function formatEffectStatusName(effect = {}) {
  const name = (String(effect.name || "").trim() || `Efekt ${formatInteger(effect.number)}`).toLocaleUpperCase("pl-PL");
  const count = finiteNumber(effect.count);
  return count > 1 ? `${name} x${formatInteger(count)}` : name;
}

function formatConditionStatusName(condition = {}) {
  const conditionLabels = {
    hunger: condition.level === "severe" ? "STRASZLIWIE GŁODNY" : "GŁODNY",
    thirst: condition.level === "severe" ? "STRASZLIWIE SPRAGNIONY" : "SPRAGNIONY",
    darkness: "CIEMNOŚĆ"
  };
  const name = conditionLabels[condition.key] || String(condition.name || "").trim() || "STATUS";
  return name.toLocaleUpperCase("pl-PL");
}

function formatConditionStatusTitle(condition = {}) {
  if (condition.key === "darkness") return "Ograniczona widocznosc: moby na mapie sa ukryte.";
  return condition.value ? `Wartosc ${formatInteger(condition.value)}` : "";
}

function renderVitalMeter(key, value, max) {
  const valueEl = els[`${key}Value`];
  const barEl = els[`${key}Bar`];
  const current = finiteNumber(value);
  const maximum = finiteNumber(max);
  if (valueEl) {
    valueEl.textContent = maximum > 0
      ? `${formatCompactNumber(current)}/${formatCompactNumber(maximum)}`
      : "--/--";
  }
  if (barEl) {
    const percent = maximum > 0 ? Math.max(0, Math.min(100, (current / maximum) * 100)) : 0;
    barEl.style.width = `${percent}%`;
  }
}

function renderExpMeter(economy = {}) {
  const exp = finiteNumber(economy.exp);
  const minExp = finiteNumber(economy.minExp);
  const expLimit = finiteNumber(economy.expLimit);
  if (els.expBar) {
    const span = Math.max(0, expLimit - minExp);
    const gained = Math.max(0, exp - minExp);
    const percent = span > 0 ? Math.max(0, Math.min(100, (gained / span) * 100)) : 0;
    els.expBar.style.width = `${percent}%`;
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatCompactNumber(value) {
  const number = finiteNumber(value);
  return String(Math.round(number));
}

function formatInteger(value) {
  if (!hasFiniteNumber(value)) return "--";
  const number = Number(value);
  return Math.round(number).toLocaleString("pl-PL");
}

function padTimePart(value) {
  return String(Math.max(0, Math.floor(finiteNumber(value)))).padStart(2, "0");
}

function roundGameMinuteToHalfHour(value) {
  return Math.floor(finiteNumber(value) / 30) * 30;
}

function inferAdjacentWorldDirection(fromWorldRoom, toWorldRoom) {
  if (!fromWorldRoom || !toWorldRoom || fromWorldRoom.key === toWorldRoom.key) return "";
  const from = fromWorldRoom.coord || {};
  const to = toWorldRoom.coord || {};
  for (const [direction, vector] of Object.entries(DIRECTIONS)) {
    if (
      Number(to.x) - Number(from.x) === vector.dx &&
      Number(to.y) - Number(from.y) === vector.dy &&
      Number(to.z) - Number(from.z) === vector.dz
    ) {
      return direction;
    }
  }
  return "";
}

function applyGameStatus(state = {}) {
  gameRunning = Boolean(state.running);
  if (els.gameStatus) {
    els.gameStatus.textContent = gameRunning ? `PID ${state.pid}` : "nie uruchomiona";
  }
  const button = document.querySelector("#startGameBtn");
  if (!button) return;
  button.classList.toggle("danger-action", gameRunning);
  button.title = gameRunning ? "Zatrzymaj gre" : "Uruchom gre";
  button.setAttribute("aria-label", gameRunning ? "Zatrzymaj gre" : "Uruchom gre");
}

let lastLocationCandidate = "";
let pendingPlainTitleCandidate = "";

function normalizeTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/�/g, "l")
    .replace(/�/g, "l");
}

function logMapper(event, details = {}, level = "info") {
  const entry = {
    level,
    event,
    details: {
      ...details,
      instanceId: INSTANCE_ID,
      playerRoomId,
      selectedRoomId,
      followPlayer
    }
  };
  console.log(`[mapper:${level}] ${event}`, entry.details);
  fetch("/api/app-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry)
  }).catch((error) => console.warn("[mapper:warn] app-log failed", error));
}

function updateRoomFromObservation(room, observation, options = {}) {
  if (!room) return;
  const preserveStatic = options.preserveStatic || Boolean(room.worldKey);
  if (!preserveStatic) {
    room.title = observation.title || room.title;
    room.description = observation.description || room.description || "";
    room.descriptionHash = observation.descriptionHash || room.descriptionHash || "";
    room.exitsSeen = Array.from(new Set([...(room.exitsSeen || []), ...(observation.exitsSeen || [])]));
    room.specialExitsSeen = Array.from(new Set([...(room.specialExitsSeen || []), ...(observation.specialExitsSeen || [])]));
    room.blockedExitsSeen = Array.from(new Set([...(room.blockedExitsSeen || []), ...(observation.blockedExitsSeen || [])]));
  }
  room.blockedExitsSeen = sanitizeBlockedExitsForRoom(room);
  room.updatedAt = new Date().toISOString();
}

function ensureProjectRoomForWorldRoom(worldRoom, observation = {}) {
  let room = project.rooms.find((item) => item.worldKey === worldRoom.key);
  const now = new Date().toISOString();
  const visibleExits = worldRoom.visibleExits || [];

  if (!room) {
    room = {
      id: `w:${worldRoom.key}`,
      worldKey: worldRoom.key,
      area: worldRoom.areaFile,
      x: Number(worldRoom.coord?.x || 0),
      y: Number(worldRoom.coord?.y || 0),
      z: Number(worldRoom.coord?.z || 0),
      title: worldRoom.title || observation.title || "Bez nazwy",
      description: worldRoom.description || observation.description || "",
      descriptionHash: "",
      exitsSeen: visibleExits,
      specialExitsSeen: [],
      blockedExitsSeen: [],
      tags: [],
      notes: "",
      confidence: "world",
      createdAt: now,
      updatedAt: now
    };
    project.rooms.push(room);
    ensureArea(room.area);
  } else {
    room.worldKey = worldRoom.key;
    room.area = worldRoom.areaFile;
    room.x = Number(worldRoom.coord?.x || room.x || 0);
    room.y = Number(worldRoom.coord?.y || room.y || 0);
    room.z = Number(worldRoom.coord?.z || room.z || 0);
    room.confidence = "world";
    room.title = worldRoom.title || room.title || observation.title || "Bez nazwy";
    room.description = worldRoom.description || room.description || observation.description || "";
    room.descriptionHash = "";
    room.exitsSeen = visibleExits;
    room.specialExitsSeen = [];
    room.blockedExitsSeen = [];
  }

  applyWorldRoomMetadata(room, worldRoom);
  room.exitsSeen = visibleExits;
  updateRoomFromObservation(room, {
    exitsSeen: visibleExits
  }, { preserveStatic: true });
  room.worldKey = worldRoom.key;
  room.updatedAt = now;
  return room;
}

function applyWorldRoomMetadata(room, worldRoom) {
  const atlasRoom = atlasRoomsByKey.get(worldRoom.key);
  room.worldKey = worldRoom.key;
  room.worldExits = atlasRoom?.exits || worldRoom.exits || [];
  room.visibleExits = atlasRoom?.visibleExits || worldRoom.visibleExits || [];
  room.hiddenExits = atlasRoom?.hiddenExits || worldRoom.hiddenExits || [];
  room.verticalExits = atlasRoom?.verticalExits || getWorldVerticalExits(worldRoom);
  room.wallDirections = getAtlasWallDirections(worldRoom.key) || getWorldWallDirections(worldRoom);
  room.flagTags = worldRoom.flagTags || [];
  room.exitBits = worldRoom.exitBits || "";
  room.blockedExitsSeen = sanitizeBlockedExitsForRoom(room);
}

function repairProjectRoomsFromWorldData() {
  if (!worldRoomsByKey.size) return;
  let repaired = 0;
  for (const room of project.rooms) {
    if (!room.worldKey) continue;
    const worldRoom = worldRoomsByKey.get(room.worldKey);
    if (!worldRoom) continue;
    const before = `${room.title || ""}|${room.description || ""}|${(room.exitsSeen || []).join(",")}`;
    room.title = worldRoom.title || room.title || "Bez nazwy";
    room.description = worldRoom.description || room.description || "";
    room.descriptionHash = "";
    room.area = worldRoom.areaFile;
    room.x = Number(worldRoom.coord?.x || room.x || 0);
    room.y = Number(worldRoom.coord?.y || room.y || 0);
    room.z = Number(worldRoom.coord?.z || room.z || 0);
    room.confidence = "world";
    applyWorldRoomMetadata(room, worldRoom);
    room.exitsSeen = room.visibleExits || worldRoom.visibleExits || [];
    room.specialExitsSeen = [];
    room.blockedExitsSeen = [];
    if (`${room.title || ""}|${room.description || ""}|${(room.exitsSeen || []).join(",")}` !== before) repaired += 1;
  }
  if (!repaired) return;
  saveProject();
  render();
  logMapper("world-room-static-data-repaired", { repaired });
}

function syncDiscoveredWorldLinks(room) {
  const worldRoom = worldRoomsByKey.get(room?.worldKey);
  const linkEntries = Object.entries(worldRoom?.links || {});
  if (!linkEntries.length) return;

  for (const [direction, targetWorldKey] of linkEntries) {
    if (!targetWorldKey) continue;
    const target = project.rooms.find((item) => item.worldKey === targetWorldKey);
    if (target) connectRooms(project, room.id, target.id, direction);
  }
}

function cleanTerminalText(text) {
  let clean = String(text || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  while (/.\x08/.test(clean)) clean = clean.replace(/.\x08/g, "");
  clean = clean.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  return clean;
}

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  setTheme(saved);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  els.themeBtn.textContent = theme === "dark" ? "Jasny tryb" : "Ciemny tryb";
  term.options.theme = terminalTheme(theme);
}

function applySavedDescriptionVisibility() {
  const saved = localStorage.getItem(DESCRIPTION_VISIBLE_KEY);
  setDescriptionVisibility(saved !== "false", { persist: false });
}

function setDescriptionVisibility(visible, options = {}) {
  descriptionVisible = Boolean(visible);
  document.body.classList.toggle("description-hidden", !descriptionVisible);
  if (els.roomDescriptionField) els.roomDescriptionField.hidden = !descriptionVisible;
  if (els.toggleDescriptionBtn) {
    els.toggleDescriptionBtn.classList.toggle("is-on", descriptionVisible);
    els.toggleDescriptionBtn.setAttribute("aria-pressed", descriptionVisible ? "true" : "false");
    els.toggleDescriptionBtn.title = descriptionVisible
      ? "Ukryj opis lokacji w panelu UI"
      : "Pokaz opis lokacji w panelu UI";
  }
  if (options.persist !== false) {
    localStorage.setItem(DESCRIPTION_VISIBLE_KEY, descriptionVisible ? "true" : "false");
  }
  updateLocationFieldsVisibilityState();
}

function applySavedRoomTagsVisibility() {
  const saved = localStorage.getItem(ROOM_TAGS_VISIBLE_KEY);
  setRoomTagsVisibility(saved !== "false", { persist: false });
}

function setRoomTagsVisibility(visible, options = {}) {
  roomTagsVisible = Boolean(visible);
  document.body.classList.toggle("room-tags-hidden", !roomTagsVisible);
  if (els.roomTagsField) els.roomTagsField.hidden = !roomTagsVisible;
  if (els.toggleRoomTagsBtn) {
    els.toggleRoomTagsBtn.classList.toggle("is-on", roomTagsVisible);
    els.toggleRoomTagsBtn.setAttribute("aria-pressed", roomTagsVisible ? "true" : "false");
    els.toggleRoomTagsBtn.title = roomTagsVisible ? "Ukryj tagi pola w panelu UI" : "Pokaz tagi pola w panelu UI";
  }
  if (options.persist !== false) {
    localStorage.setItem(ROOM_TAGS_VISIBLE_KEY, roomTagsVisible ? "true" : "false");
  }
  updateLocationFieldsVisibilityState();
}

function applySavedRoomNotesVisibility() {
  const saved = localStorage.getItem(ROOM_NOTES_VISIBLE_KEY);
  setRoomNotesVisibility(saved !== "false", { persist: false });
}

function setRoomNotesVisibility(visible, options = {}) {
  roomNotesVisible = Boolean(visible);
  document.body.classList.toggle("room-notes-hidden", !roomNotesVisible);
  if (els.roomNotesField) els.roomNotesField.hidden = !roomNotesVisible;
  if (els.toggleRoomNotesBtn) {
    els.toggleRoomNotesBtn.classList.toggle("is-on", roomNotesVisible);
    els.toggleRoomNotesBtn.setAttribute("aria-pressed", roomNotesVisible ? "true" : "false");
    els.toggleRoomNotesBtn.title = roomNotesVisible ? "Ukryj notatki pola w panelu UI" : "Pokaz notatki pola w panelu UI";
  }
  if (options.persist !== false) {
    localStorage.setItem(ROOM_NOTES_VISIBLE_KEY, roomNotesVisible ? "true" : "false");
  }
  updateLocationFieldsVisibilityState();
}

function updateLocationFieldsVisibilityState() {
  document.body.classList.toggle("location-fields-hidden", !descriptionVisible && !roomTagsVisible && !roomNotesVisible);
}

function applySavedMobsVisibility() {
  const saved = localStorage.getItem(MOBS_VISIBLE_KEY);
  setMobsVisibility(saved !== "false", { persist: false, render: false });
}

function setMobsVisibility(visible, options = {}) {
  mobsVisible = Boolean(visible);
  if (els.toggleMobsBtn) {
    els.toggleMobsBtn.classList.toggle("is-on", mobsVisible);
    els.toggleMobsBtn.setAttribute("aria-pressed", mobsVisible ? "true" : "false");
    els.toggleMobsBtn.title = mobsVisible ? "Ukryj moby na mapie" : "Pokaz moby na mapie";
  }
  if (options.persist !== false) {
    localStorage.setItem(MOBS_VISIBLE_KEY, mobsVisible ? "true" : "false");
  }
  currentGameMobSignature = "";
  currentGameMobVisibilityKey = "";
  if (options.render !== false) renderMap("ui-mobs-visibility");
}

function applySavedNotesVisibility() {
  const saved = localStorage.getItem(NOTES_VISIBLE_KEY);
  setNotesVisibility(saved !== "false", { persist: false });
}

function setNotesVisibility(visible, options = {}) {
  notesVisible = Boolean(visible);
  document.body.classList.toggle("notes-hidden", !notesVisible);
  if (els.toggleNotesBtn) {
    els.toggleNotesBtn.classList.toggle("is-on", notesVisible);
    els.toggleNotesBtn.setAttribute("aria-pressed", notesVisible ? "true" : "false");
    els.toggleNotesBtn.title = notesVisible ? "Ukryj panel notesu" : "Pokaz panel notesu";
  }
  if (options.persist !== false) {
    localStorage.setItem(NOTES_VISIBLE_KEY, notesVisible ? "true" : "false");
  }
}

function applySavedTerminalFontSize() {
  const saved = Number(localStorage.getItem(TERMINAL_FONT_SIZE_KEY));
  setTerminalFontSize(saved, { persist: false });
}

function setTerminalFontSize(fontSize, options = {}) {
  const nextFontSize = normalizeTerminalFontSize(fontSize);
  term.options.fontSize = nextFontSize;
  if (els.terminalFontSizeValue) els.terminalFontSizeValue.textContent = String(nextFontSize);
  if (els.terminalFontSizeDownBtn) els.terminalFontSizeDownBtn.disabled = nextFontSize <= TERMINAL_MIN_FONT_SIZE;
  if (els.terminalFontSizeUpBtn) els.terminalFontSizeUpBtn.disabled = nextFontSize >= TERMINAL_MAX_FONT_SIZE;
  if (options.persist !== false) {
    localStorage.setItem(TERMINAL_FONT_SIZE_KEY, String(nextFontSize));
  }
  refreshTerminalLayoutAfterFontSizeChange();
  return nextFontSize;
}

function normalizeTerminalFontSize(fontSize) {
  const value = Number(fontSize);
  if (!Number.isFinite(value)) return TERMINAL_DEFAULT_FONT_SIZE;
  return Math.max(TERMINAL_MIN_FONT_SIZE, Math.min(TERMINAL_MAX_FONT_SIZE, Math.round(value)));
}

function refreshTerminalLayoutAfterFontSizeChange() {
  terminalStagePinnedToBottom = true;
  term.refresh(0, Math.max(0, term.rows - 1));
  scheduleTerminalFit();
  window.requestAnimationFrame(() => {
    term.refresh(0, Math.max(0, term.rows - 1));
    fitTerminalToPanel();
    window.requestAnimationFrame(() => {
      fitTerminalToPanel();
      scrollTerminalToBottom();
    });
  });
}

function applySavedStatVisibility() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STATS_VISIBLE_KEY) || "{}") || {};
  } catch {
    saved = {};
  }
  statVisibility = { ...DEFAULT_STAT_VISIBILITY, ...saved };
  applyStatVisibility({ persist: false });
}

function setStatVisibility(key, visible, options = {}) {
  statVisibility = {
    ...statVisibility,
    [key]: Boolean(visible)
  };
  applyStatVisibility(options);
}

function applyStatVisibility(options = {}) {
  for (const key of Object.keys(DEFAULT_STAT_VISIBILITY)) {
    const visible = statVisibility[key] !== false;
    document.body.classList.toggle(`stat-hidden-${key}`, !visible);
    const button = document.querySelector(`[data-stat-toggle="${key}"]`);
    if (button) {
      button.classList.toggle("is-on", visible);
      button.setAttribute("aria-pressed", visible ? "true" : "false");
      button.title = visible
        ? `Ukryj: ${getStatVisibilityLabel(key)}`
        : `Pokaz: ${getStatVisibilityLabel(key)}`;
    }
  }
  if (options.persist !== false) {
    localStorage.setItem(STATS_VISIBLE_KEY, JSON.stringify(statVisibility));
  }
}

function getStatVisibilityLabel(key) {
  const labels = {
    hp: "HP",
    mana: "Mana",
    mv: "MV",
    gold: "Zloto",
    exp: "Poziom/EXP",
    statuses: "Statusy",
    clock: "Zegar",
    date: "Data"
  };
  return labels[key] || key;
}

function initMapperActivation() {
  setInterval(() => {
    if (isMapperActive()) claimMapperActivation("heartbeat");
  }, 1000);
}

function claimMapperActivationIfVisible(reason) {
  if (document.visibilityState === "hidden") return;
  claimMapperActivation(reason);
}

function claimMapperActivation(reason) {
  localStorage.setItem(ACTIVE_MAPPER_KEY, JSON.stringify({
    id: INSTANCE_ID,
    at: Date.now(),
    reason
  }));
  serverActiveMapperId = INSTANCE_ID;
  postJson("/api/mapper/claim", { instanceId: INSTANCE_ID, reason })
    .catch((error) => console.warn("[mapper:warn] mapper claim failed", error));
}

function isMapperActive() {
  const active = readActiveMapper();
  return active.id === INSTANCE_ID && serverActiveMapperId === INSTANCE_ID;
}

function readActiveMapper() {
  try {
    return JSON.parse(localStorage.getItem(ACTIVE_MAPPER_KEY) || "{}");
  } catch {
    return {};
  }
}

function terminalTheme(theme) {
  if (theme === "dark") {
    return {
      background: "#050806",
      foreground: "#eaf0e6",
      cursor: "#d2a94a",
      selectionBackground: "#315c46"
    };
  }
  return {
    background: "#111612",
    foreground: "#eaf0e6",
    cursor: "#f0d48a",
    selectionBackground: "#3c6f90"
  };
}

function autosaveCurrentRoom() {
  const room = getSelectedRoom();
  if (!room || room.isWorldBase) return;
  room.tags = els.roomTagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  room.notes = els.roomNotesInput.value;
  room.updatedAt = new Date().toISOString();
  ensureArea(room.area);
  saveProject();
  renderMap("ui-room-edit");
}

function autosaveGlobalNotes() {
  const page = getActiveGlobalNotePage();
  if (!page) return;
  page.body = els.globalNotesInput.value;
  page.updatedAt = new Date().toISOString();
  project.globalNotes = page.body;
  saveProject();
}

function addGlobalNotePage() {
  normalizeGlobalNotesState();
  const now = new Date().toISOString();
  const page = {
    id: `global-note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `Strona ${project.globalNotesPages.length + 1}`,
    body: "",
    createdAt: now,
    updatedAt: now
  };
  project.globalNotesPages.push(page);
  project.activeGlobalNotesPageId = page.id;
  project.globalNotes = "";
  editingGlobalNotesPageId = page.id;
  saveProject();
  renderGlobalNotesPanel();
}

function deleteActiveGlobalNotePage() {
  normalizeGlobalNotesState();
  if (project.globalNotesPages.length <= 1) return;
  const activeId = project.activeGlobalNotesPageId;
  const activeIndex = project.globalNotesPages.findIndex((page) => page.id === activeId);
  project.globalNotesPages = project.globalNotesPages.filter((page) => page.id !== activeId);
  const nextIndex = Math.max(0, Math.min(project.globalNotesPages.length - 1, activeIndex));
  project.activeGlobalNotesPageId = project.globalNotesPages[nextIndex]?.id || project.globalNotesPages[0].id;
  project.globalNotes = getActiveGlobalNotePage()?.body || "";
  saveProject();
  renderGlobalNotesPanel();
}

function selectGlobalNotePage(pageId) {
  normalizeGlobalNotesState();
  if (!project.globalNotesPages.some((page) => page.id === pageId)) return;
  editingGlobalNotesPageId = null;
  project.activeGlobalNotesPageId = pageId;
  project.globalNotes = getActiveGlobalNotePage()?.body || "";
  saveProject();
  renderGlobalNotesPanel();
}

function editGlobalNotePageTitle(pageId) {
  normalizeGlobalNotesState();
  if (!project.globalNotesPages.some((page) => page.id === pageId)) return;
  project.activeGlobalNotesPageId = pageId;
  editingGlobalNotesPageId = pageId;
  renderGlobalNotesPanel();
}

function saveGlobalNotePageTitle(pageId, title) {
  const page = project.globalNotesPages.find((item) => item.id === pageId);
  if (!page) return;
  page.title = title.trim() || "Bez tytulu";
  page.updatedAt = new Date().toISOString();
  editingGlobalNotesPageId = null;
  saveProject();
  renderGlobalNotesPanel();
}

function getActiveGlobalNotePage() {
  return project.globalNotesPages.find((page) => page.id === project.activeGlobalNotesPageId)
    || project.globalNotesPages[0]
    || null;
}

function ensureArea(name) {
  if (!project.areas.some((area) => area.id === name)) {
    project.areas.push({ id: name, name });
  }
}

function ensureProjectState() {
  normalizeGlobalNotesState();
  dedupeObservedRooms();
  if (!project.playerRoomId || !project.rooms.some((room) => room.id === project.playerRoomId)) {
    project.playerRoomId = project.currentRoomId || project.rooms[0]?.id;
  }
  if (!project.selectedRoomId || !project.rooms.some((room) => room.id === project.selectedRoomId)) {
    project.selectedRoomId = project.playerRoomId || project.rooms[0]?.id;
  }
  if (project.followPlayer !== false && project.playerRoomId) {
    project.selectedRoomId = project.playerRoomId;
  }
  playerRoomId = project.playerRoomId;
  selectedRoomId = project.selectedRoomId;
  followPlayer = project.followPlayer !== false;
  project.currentRoomId = playerRoomId;
}

function normalizeGlobalNotesState() {
  const now = new Date().toISOString();
  const pages = Array.isArray(project.globalNotesPages)
    ? project.globalNotesPages
        .map((page, index) => ({
          id: String(page.id || `global-note-${index + 1}`),
          title: String(page.title || `Strona ${index + 1}`),
          body: String(page.body ?? page.notes ?? ""),
          createdAt: page.createdAt || now,
          updatedAt: page.updatedAt || now
        }))
        .filter((page) => page.id)
    : [];
  if (!pages.length) {
    pages.push({
      id: "global-note-1",
      title: "Aktualne zadanie",
      body: String(project.globalNotes || ""),
      createdAt: now,
      updatedAt: now
    });
  }
  project.globalNotesPages = pages;
  if (!project.activeGlobalNotesPageId || !pages.some((page) => page.id === project.activeGlobalNotesPageId)) {
    project.activeGlobalNotesPageId = pages[0].id;
  }
  project.globalNotes = getActiveGlobalNotePage()?.body || "";
}

function dedupeObservedRooms() {
  const canonicalByKey = new Map();
  const replacements = new Map();
  for (const room of project.rooms) {
    if (isFalseRoom(room)) {
      const fallback = project.rooms.find((candidate) =>
        candidate.id !== room.id &&
        !isFalseRoom(candidate)
      ) || project.rooms.find((candidate) => candidate.id !== room.id);
      if (fallback) replacements.set(room.id, fallback.id);
      continue;
    }
    const key = normalizedRoomKey(room);
    if (!key) continue;
    const canonical = canonicalByKey.get(key);
    if (!canonical) {
      canonicalByKey.set(key, room);
      continue;
    }
    canonical.notes = [canonical.notes, room.notes].filter(Boolean).join("\n");
    canonical.tags = Array.from(new Set([...(canonical.tags || []), ...(room.tags || [])]));
    canonical.exitsSeen = Array.from(new Set([...(canonical.exitsSeen || []), ...(room.exitsSeen || [])]));
    canonical.specialExitsSeen = Array.from(new Set([...(canonical.specialExitsSeen || []), ...(room.specialExitsSeen || [])]));
    canonical.blockedExitsSeen = Array.from(new Set([...(canonical.blockedExitsSeen || []), ...(room.blockedExitsSeen || [])]));
    replacements.set(room.id, canonical.id);
  }
  if (!replacements.size) return;
  for (const exit of project.exits) {
    if (replacements.has(exit.from)) exit.from = replacements.get(exit.from);
    if (replacements.has(exit.to)) exit.to = replacements.get(exit.to);
  }
  project.exits = project.exits.filter((exit, index, all) =>
    exit.from &&
    (exit.blocked || exit.to) &&
    (exit.blocked || exit.from !== exit.to) &&
    all.findIndex((other) => other.from === exit.from && other.to === exit.to && other.direction === exit.direction) === index
  );
  project.rooms = project.rooms.filter((room) => !replacements.has(room.id));
  if (replacements.has(project.playerRoomId)) project.playerRoomId = replacements.get(project.playerRoomId);
  if (replacements.has(project.selectedRoomId)) project.selectedRoomId = replacements.get(project.selectedRoomId);
  if (replacements.has(project.currentRoomId)) project.currentRoomId = replacements.get(project.currentRoomId);
}

function normalizedRoomKey(room) {
  if (room.worldKey) return `world:${room.worldKey}`;
  const description = String(room.description || "").replace(/\s+/g, " ").trim();
  if (!room.title) return "";
  if (!description && !room.notes) return `title:${room.title.trim().toLowerCase()}`;
  if (!description) return "";
  return `text:${room.title.trim().toLowerCase()}\n${description.toLowerCase()}`;
}

function isFalseRoom(room) {
  if (!room) return false;
  const title = String(room.title || "").trim();
  if (room.notes) return false;
  return /[.!?]$/.test(title) || /^tam niestety/i.test(title) || looksLikeMenuOrPromptLine(title) || looksLikeAsciiArtLine(title);
}

function looksLikeMenuOrPromptLine(line) {
  const clean = normalizeTitle(line);
  return (
    /^wybierz numer zapisu\b/.test(clean) ||
    /^otchlan\s+ver\b/.test(clean) ||
    /^wersja\s+\d/.test(clean) ||
    /^sprawdzanie plikow\b/.test(clean) ||
    /^inicjalizacja ustawien\b/.test(clean) ||
    /^deklaracja\b/.test(clean) ||
    /^\[[nzw]\]\s+/.test(clean) ||
    /^\d+\.\s+/.test(clean) ||
    /^menu$/.test(clean)
  );
}

function looksLikeAsciiArtLine(line) {
  const text = String(line || "").trim();
  if (!text) return false;
  if (/[$]{2,}|s\$s|\$s|\$S|\.S|S\$\$\$S/i.test(text)) return true;
  const symbolCount = (text.match(/[$'.,]/g) || []).length;
  return symbolCount >= 5 && /\s{2,}/.test(text);
}

function getRoomById(id) {
  return project.rooms.find((room) => room.id === id) || null;
}

function getSelectedRoom() {
  return selectedWorldPreview || selectedRoomPreview || getRoomById(selectedRoomId) || getPlayerRoom() || project.rooms[0] || null;
}

function getPlayerRoom() {
  if (!playerPositionKnown) return null;
  return getRoomById(playerRoomId) || project.rooms[0] || null;
}

function shouldShowWaitingForPlayerPosition() {
  return followPlayer && !playerPositionKnown && !selectedRoomPreview && !selectedWorldPreview;
}

function render(reason = "render") {
  renderFollowState();
  renderInspector();
  renderMap(reason);
}

function renderInspector() {
  if (shouldShowWaitingForPlayerPosition()) {
    els.roomContext.textContent = "Czekam na odczyt pozycji z gry.";
    els.roomContext.hidden = false;
    els.roomTitleInput.value = "Pozycja postaci nieznana";
    els.roomDescriptionInput.value = "Jesli gra jest uruchomiona, mapper uzupelni to pole po pierwszym odczycie pamieci procesu.";
    els.roomTagsInput.value = "";
    els.roomNotesInput.value = "";
    els.roomTagsInput.disabled = true;
    els.roomNotesInput.disabled = true;
    els.roomTagsInput.placeholder = "Dostepne po wybraniu lokacji";
    els.roomNotesInput.placeholder = "Dostepne po wybraniu lokacji";
    renderGlobalNotesPanel();
    els.mapTitle.textContent = "Mapa";
    els.mapCount.textContent = "Pozycja nieznana";
    return;
  }
  const room = getSelectedRoom();
  if (!room) return;
  const playerRoom = getPlayerRoom();
  const isWorldPreview = Boolean(room.isWorldBase);
  const isAtlasRoomPreview = Boolean(selectedRoomPreview && room.id === selectedRoomPreview.id && room.id !== playerRoomId);
  const contextText = isWorldPreview
    ? `Podglad atlasu | aktualnie w grze: ${playerRoom?.title || "brak"}`
    : isAtlasRoomPreview || room.id !== playerRoomId
    ? `Podglad lokacji | aktualnie w grze: ${playerRoom?.title || "brak"}`
    : "";
  els.roomContext.textContent = contextText;
  els.roomContext.hidden = !contextText;
  els.roomTitleInput.value = room.title || "";
  els.roomTagsInput.value = (room.tags || []).join(", ");
  els.roomDescriptionInput.value = room.description || "";
  els.roomNotesInput.value = room.notes || "";
  els.roomTagsInput.disabled = isWorldPreview;
  els.roomNotesInput.disabled = isWorldPreview;
  els.roomTagsInput.placeholder = isWorldPreview ? "Podglad atlasu bez zapisu tagow" : "sklep, quest, ukryte";
  els.roomNotesInput.placeholder = isWorldPreview ? "Podglad atlasu nie zapisuje notatek" : "Mob, sklep, zagadka, droga powrotna...";
  renderGlobalNotesPanel();
  els.mapTitle.textContent = "Mapa";
  els.mapCount.textContent = `Poziom ${room.z}`;
}

function renderGlobalNotesPanel() {
  normalizeGlobalNotesState();
  const activePage = getActiveGlobalNotePage();
  if (!els.globalNotesPages) {
    els.globalNotesInput.value = activePage?.body || "";
    return;
  }
  els.globalNotesPages.replaceChildren();
  for (const page of project.globalNotesPages) {
    if (page.id === editingGlobalNotesPageId) {
      const input = document.createElement("input");
      input.className = "notes-page-title-edit";
      input.value = page.title || "";
      input.setAttribute("aria-label", "Tytul strony notesu");
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") saveGlobalNotePageTitle(page.id, input.value);
        if (event.key === "Escape") {
          editingGlobalNotesPageId = null;
          renderGlobalNotesPanel();
        }
      });
      input.addEventListener("blur", () => saveGlobalNotePageTitle(page.id, input.value));
      els.globalNotesPages.append(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "notes-page-tab";
    button.dataset.notePageId = page.id;
    button.textContent = page.title || "Bez tytulu";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", page.id === activePage?.id ? "true" : "false");
    button.title = "Kliknij, aby wybrac. Dwuklik edytuje tytul.";
    button.addEventListener("click", (event) => {
      if (event.detail >= 2) {
        editGlobalNotePageTitle(page.id);
        return;
      }
      selectGlobalNotePage(page.id);
    });
    els.globalNotesPages.append(button);
  }
  els.globalNotesInput.value = activePage?.body || "";
  if (els.deleteGlobalNotePageBtn) els.deleteGlobalNotePageBtn.disabled = project.globalNotesPages.length <= 1;
}

function renderFollowState() {
  if (!els.followPlayerBtn) return;
  els.followPlayerBtn.classList.toggle("active", followPlayer);
  els.followPlayerBtn.setAttribute("aria-pressed", followPlayer ? "true" : "false");
  els.followPlayerBtn.setAttribute("aria-label", followPlayer ? "Sledzenie gracza wlaczone" : "Sledz gracza");
  els.followPlayerBtn.title = followPlayer
    ? "Mapa automatycznie wybiera i centruje aktualna lokacje gracza."
    : "Kliknij, aby ponownie wybierac i centrowac aktualna lokacje gracza.";
}

function renderMapScopeState() {
  if (!els.mapDebugBtn) return;
  els.mapDebugBtn.classList.toggle("active", mapDebugAll);
  els.mapDebugBtn.setAttribute("aria-pressed", mapDebugAll ? "true" : "false");
  els.mapDebugBtn.setAttribute("aria-label", mapDebugAll ? "Ukryj nieodkryte lokacje" : "Poka� ukryte lokacje");
  els.mapDebugBtn.title = mapDebugAll
    ? "Pokazuje tez ukryte lokacje. Kliknij, aby wrocic do odkrytych."
    : "Pokazuje tylko odkryte lokacje. Kliknij, aby pokazac ukryte.";
}

function renderMapZControls(z) {
  const levels = getAvailableDebugZLevels();
  const currentIndex = levels.indexOf(Number(z));
  const canGoDown = currentIndex > 0;
  const canGoUp = currentIndex >= 0 && currentIndex < levels.length - 1;
  els.mapZDownBtn.disabled = !canGoDown;
  els.mapZUpBtn.disabled = !canGoUp;
  els.mapZDownBtn.title = canGoDown ? "Pokaz ten sam obszar poziom nizej" : "Nie ma nizszego poziomu";
  els.mapZUpBtn.title = canGoUp ? "Pokaz ten sam obszar poziom wyzej" : "Nie ma wyzszego poziomu";
}

function initUiPerfProbe() {
  if (!UI_PERF_MODE) return;
  const probe = {
    startedAt: performance.now(),
    frames: [],
    renderMapMs: [],
    renderMapRecords: [],
    renderMapReasons: {},
    positionOnlyReasons: {},
    mobOnlyReasons: {},
    mutations: {
      mapViewBox: 0,
      playerViewBox: 0,
      playerTransform: 0,
      mapChildList: 0,
      playerChildList: 0
    },
    longTasks: [],
    report() {
      return buildUiPerfReport(probe);
    },
    reset() {
      probe.startedAt = performance.now();
      probe.frames.length = 0;
      probe.renderMapMs.length = 0;
      probe.renderMapRecords.length = 0;
      probe.longTasks.length = 0;
      probe.renderMapReasons = {};
      probe.positionOnlyReasons = {};
      probe.mobOnlyReasons = {};
      probe.mutations = {
        mapViewBox: 0,
        playerViewBox: 0,
        playerTransform: 0,
        mapChildList: 0,
        playerChildList: 0
      };
      return probe.report();
    }
  };
  uiPerf = probe;
  window.__otchlanPerf = probe;
  publishUiPerfReport(probe);
  window.setInterval(() => publishUiPerfReport(probe), 1000);
  startUiFrameProbe(probe);
  startUiMutationProbe(probe);
  startUiLongTaskProbe(probe);
  console.info("[otchlan-perf] UI profiler active. Use window.__otchlanPerf.report().");
}

function publishUiPerfReport(probe) {
  let node = document.querySelector("#uiPerfReport");
  if (!node) {
    node = document.createElement("script");
    node.id = "uiPerfReport";
    node.type = "application/json";
    node.hidden = true;
    document.body.append(node);
  }
  node.textContent = JSON.stringify(probe.report());
}

function startUiFrameProbe(probe) {
  let last = performance.now();
  const step = (now) => {
    probe.frames.push(now - last);
    last = now;
    if (probe.frames.length > 1200) probe.frames.splice(0, probe.frames.length - 1200);
    window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

function startUiMutationProbe(probe) {
  if (!window.MutationObserver) return;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        if (record.target === els.mapSvg || els.mapSvg?.contains(record.target)) probe.mutations.mapChildList += 1;
        if (record.target === els.mapPlayerLayer || els.mapPlayerLayer?.contains(record.target)) probe.mutations.playerChildList += 1;
        continue;
      }
      if (record.type !== "attributes") continue;
      if (record.target === els.mapSvg && record.attributeName === "viewBox") probe.mutations.mapViewBox += 1;
      if (record.target === els.mapPlayerLayer && record.attributeName === "viewBox") probe.mutations.playerViewBox += 1;
      if (els.mapPlayerLayer?.contains(record.target) && record.attributeName === "transform") probe.mutations.playerTransform += 1;
    }
  });
  if (els.mapSvg) observer.observe(els.mapSvg, { attributes: true, childList: true, subtree: true, attributeFilter: ["viewBox", "transform"] });
  if (els.mapPlayerLayer) observer.observe(els.mapPlayerLayer, { attributes: true, childList: true, subtree: true, attributeFilter: ["viewBox", "transform"] });
}

function startUiLongTaskProbe(probe) {
  if (!window.PerformanceObserver) return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longTasks.push(entry.duration);
      if (probe.longTasks.length > 200) probe.longTasks.splice(0, probe.longTasks.length - 200);
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long task API is optional and missing in some embedded browsers.
  }
}

function recordUiRenderMapDuration(startedAt, reason = "unknown") {
  if (!uiPerf) return;
  const duration = performance.now() - startedAt;
  uiPerf.renderMapMs.push(duration);
  uiPerf.renderMapRecords.push({ reason, duration });
  uiPerf.renderMapReasons[reason] = (uiPerf.renderMapReasons[reason] || 0) + 1;
  if (uiPerf.renderMapMs.length > 400) uiPerf.renderMapMs.splice(0, uiPerf.renderMapMs.length - 400);
  if (uiPerf.renderMapRecords.length > 400) uiPerf.renderMapRecords.splice(0, uiPerf.renderMapRecords.length - 400);
}

function recordUiPositionOnlyUpdate(reason = "unknown") {
  if (!uiPerf) return;
  uiPerf.positionOnlyReasons[reason] = (uiPerf.positionOnlyReasons[reason] || 0) + 1;
}

function recordUiMobOnlyUpdate(reason = "unknown") {
  if (!uiPerf) return;
  uiPerf.mobOnlyReasons[reason] = (uiPerf.mobOnlyReasons[reason] || 0) + 1;
}

function buildUiPerfReport(probe) {
  const frames = probe.frames.slice(1);
  return {
    seconds: Number(((performance.now() - probe.startedAt) / 1000).toFixed(1)),
    frames: summarizePerfValues(frames, [16.7, 33.4, 50]),
    renderMap: summarizePerfValues(probe.renderMapMs, [4, 8, 16]),
    renderMapReasons: { ...probe.renderMapReasons },
    renderMapByReason: summarizePerfRecordsByReason(probe.renderMapRecords),
    positionOnlyReasons: { ...probe.positionOnlyReasons },
    mobOnlyReasons: { ...probe.mobOnlyReasons },
    longTasks: {
      count: probe.longTasks.length,
      maxMs: Number(Math.max(0, ...probe.longTasks).toFixed(2))
    },
    mutations: { ...probe.mutations },
    nodes: {
      map: els.mapSvg?.querySelectorAll("*").length || 0,
      player: els.mapPlayerLayer?.querySelectorAll("*").length || 0
    }
  };
}

function summarizePerfRecordsByReason(records) {
  const grouped = {};
  for (const record of records) {
    if (!grouped[record.reason]) grouped[record.reason] = [];
    grouped[record.reason].push(record.duration);
  }
  return Object.fromEntries(Object.entries(grouped)
    .map(([reason, values]) => [reason, summarizePerfValues(values, [4, 8, 16])])
    .sort(([left], [right]) => left.localeCompare(right)));
}

function summarizePerfValues(values, thresholds) {
  const sorted = values.slice().sort((left, right) => left - right);
  const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))] || 0;
  return {
    count: sorted.length,
    avgMs: Number((sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)).toFixed(2)),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    p99Ms: Number(percentile(0.99).toFixed(2)),
    maxMs: Number((sorted[sorted.length - 1] || 0).toFixed(2)),
    over: Object.fromEntries(thresholds.map((threshold) => [String(threshold), sorted.filter((value) => value > threshold).length]))
  };
}

function renderMap(reason = "renderMap") {
  const renderStartedAt = uiPerf ? performance.now() : 0;
  const playerRoom = getPlayerRoom();
  const room = playerRoom || getSelectedRoom();
  const atlasWorkspaceActive = false;
  const z = getRenderMapZ(playerRoom, room);
  const cell = 82;
  const viewArea = mapDebugAll ? "__debug_all__" : "atlas";
  const previousMapLevel = lastRenderedMapLevel;
  const mapLevelChanged = Boolean(previousMapLevel && Number(previousMapLevel.z) !== Number(z));
  if (Number(mapView.z) !== Number(z)) {
    centerMapOnFocus();
  } else if (mapView.area !== viewArea) {
    mapView = {
      ...mapView,
      z,
      area: viewArea
    };
  }
  const viewportRenderWindow = getMapGridRenderWindow(cell, 3);
  const debugRenderWindow = mapDebugAll ? viewportRenderWindow : null;
  const normalRenderWindow = mapDebugAll ? null : viewportRenderWindow;
  const canCullDebugSourceRooms = Boolean(worldAtlas);
  const showAtlasPreviewRooms = mapDebugAll;
  const normalRooms = project.rooms
    .filter((item) => Number(item.z) === Number(z))
    .map((item) => getProjectAtlasRoom(item))
    .filter((item) => !normalRenderWindow || shouldRenderNormalMapRoom(item, normalRenderWindow));
  const debugWorldBaseRooms = showAtlasPreviewRooms
    ? getDebugWorldBaseRooms(z, canCullDebugSourceRooms ? debugRenderWindow : null)
    : [];
  const debugProjectRooms = mapDebugAll
    ? project.rooms
        .filter((item) => item.z === z)
        .map((item) => getProjectAtlasRoom(item))
        .filter((item) => !canCullDebugSourceRooms || !debugRenderWindow || isGridPointInRenderWindow({ x: item.x, y: item.y }, debugRenderWindow))
    : [];
  const allMapItems = mapDebugAll
    ? buildDebugMapItems([...debugWorldBaseRooms, ...debugProjectRooms], { preserveCoords: Boolean(worldAtlas) })
    : normalRooms.map((item) => ({ room: item, mapX: item.x, mapY: item.y, groupLabel: "" }));
  const activeRenderWindow = debugRenderWindow || normalRenderWindow;
  const mapItems = activeRenderWindow
    ? allMapItems.filter((item) => isMapItemInRenderWindow(item, activeRenderWindow) || shouldAlwaysRenderMapRoom(item.room))
    : allMapItems;
  const rooms = mapItems.map((item) => item.room);
  const corridorItems = getRenderAtlasCorridors(z, rooms, activeRenderWindow);
  const pad = 4;
  const xs = [...mapItems.map((item) => item.mapX), ...corridorItems.flatMap((item) => item.points.map((point) => point.x))];
  const ys = [...mapItems.map((item) => item.mapY), ...corridorItems.flatMap((item) => item.points.map((point) => point.y))];
  const minX = Math.min(...xs, -2) - pad;
  const maxX = Math.max(...xs, 2) + pad;
  const minY = Math.min(...ys, -2) - pad;
  const maxY = Math.max(...ys, 2) + pad;
  els.mapTitle.textContent = "Mapa";
  els.mapCount.textContent = `Poziom ${z}`;
  renderMapScopeState();
  renderMapZControls(z);
  if (mapLevelChanged) startMapLevelTransition({ fromZ: previousMapLevel.z, toZ: z });
  lastRenderedMapLevel = { z: Number(z), area: viewArea };
  applyMapViewBox({ animate: true });
  els.mapSvg.innerHTML = "";
  mapHitTargets = [];

  const coords = new Map();
  const worldRenderIds = new Map();
  if (!mapDebugAll) {
    const gridLimit = 2500;
    const gridCells = (maxX - minX + 1) * (maxY - minY + 1);
    if (gridCells <= gridLimit) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          els.mapSvg.append(svg("rect", {
            x: x * cell,
            y: y * cell,
            width: cell,
            height: cell,
            class: "map-grid-cell"
          }));
        }
      }
    }
  }

  for (const item of mapItems) {
    const x = item.mapX * cell;
    const y = item.mapY * cell;
    coords.set(item.room.id, { x, y });
    mapHitTargets.push({ room: item.room, x, y, width: cell, height: cell });
    if (item.room.worldKey) worldRenderIds.set(item.room.worldKey, item.room.id);
  }

  drawAtlasCorridors(corridorItems, coords, worldRenderIds, cell);

  if (mapDebugAll && !worldAtlas) {
    drawDebugStaticWorldLinks(coords, worldRenderIds, cell, z);
  }

  for (const mapItem of mapItems) {
    const item = mapItem.room;
    if (item.isWorldBase) {
      drawDebugWorldBaseRoom(mapItem, cell);
      continue;
    }
    const point = coords.get(item.id);
    const selectedForPreview = selectedRoomPreview?.id === item.id;
    const selectedForProject = !selectedRoomPreview && item.id === selectedRoomId;
    const group = svg("g", {
      class: `room-node ${playerPositionKnown && item.id === playerRoomId ? "current" : ""} ${selectedForPreview || selectedForProject ? "selected" : ""}`,
      "data-room-id": item.id
    });
    group.append(drawRoomHitTarget(point, cell));
    group.append(svg("rect", { x: point.x, y: point.y, width: cell, height: cell }));
    drawRoomLabel(group, item, point, cell);
    drawRoomMapBadges(group, item, point, cell);
    group.append(svg("title", {}, item.title || "Lokacja"));
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      if (suppressNextMapClick) {
        suppressNextMapClick = false;
        return;
      }
      previewAtlasRoom(item);
      render();
    });
    els.mapSvg.append(group);
  }

  drawMobMarkers(coords, worldRenderIds, cell, z);

  for (const item of rooms) {
    const blocked = new Set(getRenderBlockedDirections(item));
    for (const dir of blocked) drawBlockedBorder(item.id, dir, coords, cell);
  }
  lastRenderedMapCoords = coords;
  lastRenderedWorldRenderIds = worldRenderIds;
  lastRenderedMapCell = cell;
  lastRenderedMapZ = Number(z);
  renderPlayerMarkerLayer(coords, cell, z);
  recordUiRenderMapDuration(renderStartedAt, reason);
}

function drawMobMarkers(coords, worldRenderIds, cell, z) {
  const layer = getMobMarkerLayer();
  const visibleMobs = getRenderableMobs(z)
    .map((mob) => {
      const roomId = worldRenderIds.get(mob.worldKey);
      const point = roomId ? coords.get(roomId) : null;
      return point ? { ...mob, roomId, point } : null;
    })
    .filter(Boolean);
  if (!visibleMobs.length) return;

  const mobsByRoom = new Map();
  for (const mob of visibleMobs) {
    if (!mobsByRoom.has(mob.roomId)) mobsByRoom.set(mob.roomId, []);
    mobsByRoom.get(mob.roomId).push(mob);
  }

  for (const mobs of mobsByRoom.values()) {
    const point = mobs[0].point;
    const count = mobs.length;
    const group = svg("g", { class: "mob-location-marker" });
    const centerX = point.x + cell - 12;
    const centerY = point.y + cell - 12;
    group.append(svg("circle", {
      cx: centerX,
      cy: centerY,
      r: count > 1 ? 8 : 6.5,
      class: "mob-location-marker-ring"
    }));
    group.append(svg("circle", {
      cx: centerX,
      cy: centerY,
      r: count > 1 ? 5 : 3.8,
      class: "mob-location-marker-core"
    }));
    if (count > 1) {
      group.append(svg("text", {
        x: centerX,
        y: centerY + 3,
        class: "mob-location-marker-count",
        "text-anchor": "middle"
      }, String(Math.min(count, 9))));
    }
    group.append(svg("title", {}, formatMobMarkerTitle(mobs)));
    layer.append(group);
  }
}

function getMobMarkerLayer() {
  let layer = els.mapSvg.querySelector(".mob-marker-layer");
  if (layer) {
    layer.replaceChildren();
    return layer;
  }
  layer = svg("g", { class: "mob-marker-layer" });
  const blockedBorder = els.mapSvg.querySelector(".blocked-border");
  if (blockedBorder) {
    els.mapSvg.insertBefore(layer, blockedBorder);
  } else {
    els.mapSvg.append(layer);
  }
  return layer;
}

function renderMobOnlyMapUpdate(reason = "mob-only") {
  if (!lastRenderedMapCoords.size || !lastRenderedWorldRenderIds.size) return false;
  const playerRoom = getPlayerRoom();
  const selectedRoom = getSelectedRoom();
  const z = getRenderMapZ(playerRoom, selectedRoom);
  if (Number(z) !== Number(lastRenderedMapZ)) return false;
  drawMobMarkers(lastRenderedMapCoords, lastRenderedWorldRenderIds, lastRenderedMapCell, z);
  recordUiMobOnlyUpdate(reason);
  return true;
}

function getRenderableMobs(z) {
  if (!canRenderGameMobs()) return [];
  const visibleMobWorldKeys = getPlayerVisibleMobWorldKeys();
  return currentGameMobs.filter((mob) => {
    if (Number(mob.z) !== Number(z)) return false;
    if (DOCUMENTATION_DEMO_MODE && mob.visibleCardinal4) return true;
    return mapDebugAll || visibleMobWorldKeys.has(mob.worldKey);
  });
}

function canRenderGameMobs() {
  return mobsVisible && canObserveGameMobs();
}

function canObserveGameMobs() {
  const environment = lastGameStats?.environment;
  if (!environment || !Object.prototype.hasOwnProperty.call(environment, "canObserveMobs")) return true;
  return environment.canObserveMobs !== false;
}

function renderPositionOnlyMapUpdate(previousPlayerRoomId, previousSelectedRoomId, reason = "position-only") {
  if (mapDebugAll) return false;
  const playerRoom = getPlayerRoom();
  const selectedRoom = getSelectedRoom();
  const z = getRenderMapZ(playerRoom, selectedRoom);
  if (Number(z) !== Number(lastRenderedMapZ)) return false;
  if (!lastRenderedMapCoords.has(playerRoomId)) return false;
  updateRoomNodeState(previousPlayerRoomId);
  updateRoomNodeState(playerRoomId);
  updateRoomNodeState(previousSelectedRoomId);
  updateRoomNodeState(selectedRoomId);
  applyMapViewBox({ animate: true });
  renderPlayerMarkerLayer(lastRenderedMapCoords, lastRenderedMapCell, z);
  scheduleMapViewportRender();
  recordUiPositionOnlyUpdate(reason);
  return true;
}

function updateRoomNodeState(roomId) {
  if (!roomId) return;
  const node = els.mapSvg?.querySelector(`[data-room-id="${cssEscape(roomId)}"]`);
  if (!node) return;
  node.classList.toggle("current", playerPositionKnown && roomId === playerRoomId);
  const selectedForPreview = selectedRoomPreview?.id === roomId;
  const selectedForProject = !selectedRoomPreview && roomId === selectedRoomId;
  node.classList.toggle("selected", selectedForPreview || selectedForProject);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function getPlayerVisibleMobWorldKeys() {
  const playerRoom = getPlayerRoom();
  const playerWorldKey = playerRoom?.worldKey;
  if (!playerPositionKnown || !playerWorldKey) return new Set();
  const visible = new Set([playerWorldKey]);
  for (const direction of ["n", "e", "w", "s"]) {
    let currentWorldKey = playerWorldKey;
    for (let distance = 0; distance < 4; distance += 1) {
      const nextWorldKey = getSightNextWorldKey(currentWorldKey, direction);
      if (!nextWorldKey) break;
      visible.add(nextWorldKey);
      currentWorldKey = nextWorldKey;
    }
  }
  return visible;
}

function getSightNextWorldKey(worldKey, direction) {
  const worldRoom = worldRoomsByKey.get(worldKey);
  if (!worldRoom || !isWorldSightOpen(worldRoom, direction)) return "";
  const linkedWorldKey = worldRoom.links?.[direction];
  if (linkedWorldKey && worldRoomsByKey.has(linkedWorldKey)) return linkedWorldKey;
  const vector = DIRECTIONS[direction];
  const coord = worldRoom.coord || {};
  const fallbackWorldKey = `${worldRoom.areaFile}:${Number(coord.x || 0) + vector.dx},${Number(coord.y || 0) + vector.dy},${Number(coord.z || 0)}`;
  return worldRoomsByKey.has(fallbackWorldKey) ? fallbackWorldKey : "";
}

function isWorldSightOpen(worldRoom, direction) {
  const dir = normalizeDirection(direction);
  if (!dir) return false;
  const atlasRoom = atlasRoomsByKey.get(worldRoom.key);
  const wallDirections = getAtlasWallDirections(worldRoom.key) || getWorldWallDirections(worldRoom);
  if (Object.prototype.hasOwnProperty.call(wallDirections, dir) && wallDirections[dir]) return false;
  const visibleExits = new Set(atlasRoom?.visibleExits || worldRoom.visibleExits || []);
  return visibleExits.has(dir) || Boolean(worldRoom.links?.[dir]);
}

function formatMobMarkerTitle(mobs = []) {
  return mobs
    .map((mob) => `${mob.name}${mob.distance ? ` (${formatInteger(mob.distance)} pól)` : ""}`)
    .join("\n");
}

function scheduleMapViewportRender() {
  if (mapViewportRenderFrame) return;
  mapViewportRenderFrame = window.requestAnimationFrame(() => {
    mapViewportRenderFrame = null;
    renderMap(mapDebugAll ? "ui-debug-viewport" : "ui-map-viewport");
  });
}

function getMapGridRenderWindow(cell, paddingCells = 2) {
  const viewBox = getCurrentMapViewBox();
  return {
    minX: Math.floor(viewBox.x / cell) - paddingCells,
    maxX: Math.ceil((viewBox.x + viewBox.width) / cell) + paddingCells,
    minY: Math.floor(viewBox.y / cell) - paddingCells,
    maxY: Math.ceil((viewBox.y + viewBox.height) / cell) + paddingCells
  };
}

function isMapItemInRenderWindow(item, window) {
  if (!window) return true;
  return Number(item.mapX) >= window.minX
    && Number(item.mapX) <= window.maxX
    && Number(item.mapY) >= window.minY
    && Number(item.mapY) <= window.maxY;
}

function shouldRenderNormalMapRoom(room, window) {
  if (!window) return true;
  if (shouldAlwaysRenderMapRoom(room)) return true;
  return isGridPointInRenderWindow({ x: room.x, y: room.y }, window);
}

function shouldAlwaysRenderMapRoom(room) {
  if (!room) return false;
  return room.id === playerRoomId
    || room.id === selectedRoomId
    || room.id === selectedRoomPreview?.id
    || room.worldKey === selectedWorldPreview?.worldKey;
}

function createPlayerLocationMarker(point, cell, extraClass = "") {
  const { x: centerX, y: centerY } = getPlayerMarkerCenter(point, cell);
  const inset = 6;
  const size = cell - inset * 2;
  const marker = svg("g", {
    class: `player-location-marker ${extraClass}`.trim(),
    transform: `translate(${centerX}, ${centerY})`
  });
  marker.append(svg("rect", {
    x: -size / 2,
    y: -size / 2,
    width: size,
    height: size,
    rx: 4,
    class: "player-location-marker-wash"
  }));
  marker.append(svg("rect", {
    x: -size / 2,
    y: -size / 2,
    width: size,
    height: size,
    rx: 4,
    class: "player-location-marker-frame"
  }));
  return marker;
}

function getPlayerMarkerCenter(point, cell) {
  return {
    x: point.x + cell / 2,
    y: point.y + cell / 2
  };
}

function renderPlayerMarkerLayer(coords, cell, z) {
  if (!els.mapPlayerLayer) return;
  const point = coords.get(playerRoomId);
  if (!point || !playerPositionKnown) {
    activePlayerTravelAnimationId = "";
    pendingPlayerTravelAnimation = null;
    els.mapPlayerLayer.replaceChildren();
    return;
  }

  let marker = els.mapPlayerLayer.querySelector(".player-location-marker");
  if (!marker) {
    marker = createPlayerLocationMarker(point, cell);
    els.mapPlayerLayer.replaceChildren(marker);
  }

  const { x: targetX, y: targetY } = getPlayerMarkerCenter(point, cell);
  const pending = pendingPlayerTravelAnimation;
  if (!pending || pending.toRoomId !== playerRoomId) {
    activePlayerTravelAnimationId = "";
    marker.setAttribute("transform", `translate(${targetX}, ${targetY})`);
    marker.setAttribute("opacity", "0.95");
    return;
  }

  if (pending.fromZ !== pending.toZ || Number(pending.toZ) !== Number(z)) {
    activePlayerTravelAnimationId = "";
    pendingPlayerTravelAnimation = null;
    marker.setAttribute("transform", `translate(${targetX}, ${targetY})`);
    marker.setAttribute("opacity", "0.95");
    return;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    activePlayerTravelAnimationId = "";
    pendingPlayerTravelAnimation = null;
    marker.setAttribute("transform", `translate(${targetX}, ${targetY})`);
    marker.setAttribute("opacity", "0.95");
    return;
  }

  const fromPoint = coords.get(pending.fromRoomId);
  const toPoint = coords.get(pending.toRoomId);
  if (!fromPoint || !toPoint) {
    activePlayerTravelAnimationId = "";
    pendingPlayerTravelAnimation = null;
    marker.setAttribute("transform", `translate(${targetX}, ${targetY})`);
    marker.setAttribute("opacity", "0.95");
    return;
  }

  if (activePlayerTravelAnimationId === pending.id) return;
  activePlayerTravelAnimationId = pending.id;

  const currentTranslate = readSvgTranslate(marker);
  const fromCenter = getPlayerMarkerCenter(fromPoint, cell);
  const toCenter = getPlayerMarkerCenter(toPoint, cell);
  const fromX = currentTranslate?.x ?? fromCenter.x;
  const fromY = currentTranslate?.y ?? fromCenter.y;
  const toX = toCenter.x;
  const toY = toCenter.y;
  const animationId = ++playerTravelAnimationId;
  els.mapPlayerLayer.classList.add("player-marker-animating");
  animateSvgMarkerTravel(marker, fromX, fromY, toX, toY, PLAYER_TRAVEL_ANIMATION_MS, {
    fadeOut: false,
    animationId,
    onComplete: () => {
      if (playerTravelAnimationId !== animationId) return;
      els.mapPlayerLayer.classList.remove("player-marker-animating");
      activePlayerTravelAnimationId = "";
      if (pendingPlayerTravelAnimation?.id === pending.id) pendingPlayerTravelAnimation = null;
    }
  });
}

function readSvgTranslate(marker) {
  const transform = String(marker?.getAttribute("transform") || "");
  const match = transform.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
  if (!match) return null;
  return {
    x: Number(match[1]),
    y: Number(match[2])
  };
}

function startMapLevelTransition({ fromZ, toZ } = {}) {
  if (!els.mapLevelTransitionOverlay) return;
  if (Number(fromZ) === Number(toZ)) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

  const transitionId = ++mapLevelTransitionId;
  const oldMap = els.mapSvg.cloneNode(true);
  oldMap.removeAttribute("id");
  oldMap.setAttribute("aria-hidden", "true");
  oldMap.setAttribute("focusable", "false");
  oldMap.classList.add("map-level-transition-old-map");

  window.clearTimeout(mapLevelTransitionTimer);
  els.mapLevelTransitionOverlay.replaceChildren(oldMap);
  els.mapLevelTransitionOverlay.hidden = false;
  els.mapLevelTransitionOverlay.classList.remove("is-active");
  els.mapSvg.classList.remove("map-level-transition-new-map");
  void els.mapLevelTransitionOverlay.offsetWidth;
  els.mapLevelTransitionOverlay.classList.add("is-active");
  els.mapSvg.classList.add("map-level-transition-new-map");

  mapLevelTransitionTimer = window.setTimeout(() => {
    if (transitionId !== mapLevelTransitionId) return;
    els.mapLevelTransitionOverlay.classList.remove("is-active");
    els.mapLevelTransitionOverlay.replaceChildren();
    els.mapLevelTransitionOverlay.hidden = true;
    els.mapSvg.classList.remove("map-level-transition-new-map");
  }, 460);
}

function animateSvgMarkerTravel(marker, fromX, fromY, toX, toY, duration, options = {}) {
  const start = performance.now();
  const fadeOut = options.fadeOut !== false;
  const animationId = options.animationId ?? ++playerTravelAnimationId;
  const ease = (value) => 1 - Math.pow(1 - value, 3);

  const step = (now) => {
    if (playerTravelAnimationId !== animationId) return;
    const progress = Math.min(1, (now - start) / duration);
    const eased = ease(progress);
    const x = fromX + (toX - fromX) * eased;
    const y = fromY + (toY - fromY) * eased;
    const opacity = fadeOut && progress >= 0.82 ? 0.95 * (1 - (progress - 0.82) / 0.18) : 0.95;
    marker.setAttribute("transform", `translate(${x}, ${y})`);
    marker.setAttribute("opacity", String(Math.max(0, opacity)));
    if (progress < 1 && marker.isConnected) window.requestAnimationFrame(step);
    else options.onComplete?.();
  };

  marker.setAttribute("transform", `translate(${fromX}, ${fromY})`);
  marker.setAttribute("opacity", "0.95");
  window.requestAnimationFrame(step);
}

function drawRoomLabel(group, room, point, cell) {
  const lines = wrapMapLabel(room.title || "Lokacja");
  const lineHeight = 11;
  const startY = point.y + cell / 2 - ((lines.length - 1) * lineHeight) / 2 + 3;
  const textNode = svg("text", {
    x: point.x + cell / 2,
    y: startY,
    "text-anchor": "middle",
    class: "room-label"
  });
  lines.forEach((line, index) => {
    textNode.append(svg("tspan", {
      x: point.x + cell / 2,
      dy: index === 0 ? 0 : lineHeight
    }, line));
  });
  group.append(textNode);
}

function wrapMapLabel(title) {
  const maxLineLength = 14;
  const maxLines = 3;
  const source = String(title || "").trim();
  const words = tokenizeMapLabel(source);
  const lines = [];
  let current = "";
  let usedWords = 0;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxLineLength) {
      current = next;
      usedWords += 1;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxLineLength ? `${word.slice(0, maxLineLength - 3)}...` : word;
    usedWords += 1;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length && usedWords < words.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > maxLineLength - 3
      ? `${last.slice(0, maxLineLength - 3)}...`
      : `${last}...`;
  }
  return lines.length ? lines : ["Lokacja"];
}

function tokenizeMapLabel(title) {
  return String(title || "")
    .trim()
    .split(/\s+/)
    .flatMap((word) => {
      if (word.length <= 14 || !word.includes("-")) return [word];
      const tokens = [];
      let current = "";
      for (const part of word.split(/(-)/)) {
        if (part === "-") {
          current += part;
          continue;
        }
        const next = `${current}${part}`;
        if (!current || next.length <= 14) {
          current = next;
          continue;
        }
        tokens.push(current);
        current = part;
      }
      if (current) tokens.push(current);
      return tokens;
    });
}

function drawRoomMapBadges(group, room, point, cell) {
  const verticalBadges = getVerticalExitBadges(room);
  verticalBadges.forEach((badge, index) => {
    const size = 15;
    const x = point.x + cell - 6 - size * (index + 1) - 3 * index;
    const y = point.y + 6;
    group.append(svg("rect", {
      x,
      y,
      width: size,
      height: size,
      rx: 3,
      class: `map-badge map-badge-${badge.kind}`
    }));
    group.append(createVerticalExitIcon(badge.kind, x, y, size));
  });

  if (String(room.notes || "").trim()) {
    const size = 15;
    const x = point.x + 6;
    const y = point.y + 6;
    group.append(svg("rect", {
      x,
      y,
      width: size,
      height: size,
      rx: 3,
      class: "map-badge map-badge-note"
    }));
    group.append(svg("text", {
      x: x + size / 2,
      y: y + 11,
      "text-anchor": "middle",
      class: "map-badge-text"
    }, "N"));
  }

  const tags = (room.tags || []).map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 2);
  tags.forEach((tag, index) => {
    const label = tag.slice(0, 8);
    const width = Math.min(38, Math.max(18, label.length * 5 + 8));
    const x = point.x + 5 + index * 40;
    const y = point.y + cell - 19;
    group.append(svg("rect", {
      x,
      y,
      width,
      height: 14,
      rx: 3,
      class: "map-tag-badge"
    }));
    group.append(svg("text", {
      x: x + width / 2,
      y: y + 10,
      "text-anchor": "middle",
      class: "map-tag-text"
    }, label));
  });
}

function getVerticalExitBadges(room) {
  const visibleExits = new Set(room.verticalExits || getWorldVerticalExits(worldRoomsByKey.get(room.worldKey)) || []);
  const badges = [];
  if (visibleExits.has("u")) badges.push({ kind: "up" });
  if (visibleExits.has("d")) badges.push({ kind: "down" });
  return badges;
}

function createVerticalExitIcon(kind, x, y, size) {
  if (kind === "up") {
    return svg("path", {
      d: [
        `M ${x + size / 2} ${y + 4}`,
        `L ${x + size - 4} ${y + 9}`,
        `M ${x + size / 2} ${y + 4}`,
        `L ${x + 4} ${y + 9}`,
        `M ${x + size / 2} ${y + 4}`,
        `L ${x + size / 2} ${y + size - 4}`
      ].join(" "),
      class: "map-badge-icon"
    });
  }
  return svg("path", {
    d: [
      `M ${x + size / 2} ${y + size - 4}`,
      `L ${x + size - 4} ${y + 6}`,
      `M ${x + size / 2} ${y + size - 4}`,
      `L ${x + 4} ${y + 6}`,
      `M ${x + size / 2} ${y + size - 4}`,
      `L ${x + size / 2} ${y + 4}`
    ].join(" "),
    class: "map-badge-icon"
  });
}

function getWorldVerticalExits(worldRoom) {
  const visibleExits = new Set(worldRoom?.visibleExits || []);
  return ["u", "d"].filter((direction) => visibleExits.has(direction));
}

function getRenderBlockedDirections(room) {
  const blocked = new Set();
  const visibleExits = new Set(room.visibleExits || []);
  const wallDirections = room.wallDirections || getAtlasWallDirections(room.worldKey) || getWorldWallDirections(worldRoomsByKey.get(room.worldKey));
  for (const dir of ["n", "s", "e", "w"]) {
    const hasVisibleExit = visibleExits.has(dir);
    if (Object.prototype.hasOwnProperty.call(wallDirections, dir)) {
      if (wallDirections[dir]) blocked.add(dir);
      continue;
    }
    if (!hasVisibleExit) blocked.add(dir);
  }
  return [...blocked].filter((dir) => !isDirectionOpenInWorld(room, dir));
}

function sanitizeBlockedExitsForRoom(room) {
  return [];
}

function isDirectionOpenInWorld(room, direction) {
  const dir = normalizeDirection(direction);
  if (!dir) return false;
  if ((room?.visibleExits || []).includes(dir)) return true;
  const wallDirections = room?.wallDirections || getAtlasWallDirections(room?.worldKey) || getWorldWallDirections(worldRoomsByKey.get(room?.worldKey));
  if (Object.prototype.hasOwnProperty.call(wallDirections, dir)) return !wallDirections[dir];
  return false;
}

function getAtlasWallDirections(worldKey) {
  const atlasRoom = atlasRoomsByKey.get(worldKey);
  if (!atlasRoom) return null;
  if (atlasRoom.wallDirections) return { ...atlasRoom.wallDirections };
  if (Array.isArray(atlasRoom.walls)) {
    const walls = new Set(atlasRoom.walls);
    return Object.fromEntries(["n", "s", "e", "w", "u", "d"].map((dir) => [dir, walls.has(dir)]));
  }
  return null;
}

function getWorldWallDirections(worldRoom) {
  if (!worldRoom) return {};
  const visibleExits = new Set(worldRoom.visibleExits || []);
  for (const direction of worldRoom.hiddenExits || []) visibleExits.delete(direction);
  return Object.fromEntries(["n", "s", "e", "w", "u", "d"].map((dir) => [dir, !visibleExits.has(dir)]));
}

function centerMapOnPlayer() {
  const playerRoom = getPlayerRoom();
  if (!playerRoom) return;
  const playerZ = Number(playerRoom.z || 0);
  const levels = getAvailableDebugZLevels();
  debugMapZ = !levels.length || levels.includes(playerZ) ? playerZ : null;
  centerMapOnRoom(playerRoom);
}

function centerMapOnFocus() {
  centerMapOnRoom(getMapFocusRoom());
}

function getMapFocusRoom() {
  if (followPlayer) return getPlayerRoom();
  return getRoomById(selectedRoomId) || getPlayerRoom();
}

function centerMapOnRoom(room) {
  if (!room) return;
  const cell = 82;
  if (mapDebugAll) {
    const renderZ = getRenderMapZ(room, getSelectedRoom());
    const anchorRoom = room.worldKey
      ? getVerticalDebugAnchorRoom(room, renderZ)
      : null;
    const atlasRoom = anchorRoom
      ? getProjectAtlasRoom(anchorRoom)
      : room.worldKey
      ? getProjectAtlasRoom(room)
      : getFallbackAtlasCenterRoom(renderZ) || room;
    mapView = {
      x: Number(atlasRoom.x || 0) * cell + cell / 2,
      y: Number(atlasRoom.y || 0) * cell + cell / 2,
      z: renderZ,
      area: "__debug_all__"
    };
  } else {
    const atlasRoom = getProjectAtlasRoom(room);
    mapView = {
      x: Number(atlasRoom.x || 0) * cell + cell / 2,
      y: Number(atlasRoom.y || 0) * cell + cell / 2,
      z: atlasRoom.z || room.z || 0,
      area: "atlas"
    };
  }
}

function getVerticalDebugAnchorRoom(room, renderZ) {
  if (!room?.worldKey || Number(room.z) === Number(renderZ)) return room;
  const anchorWorldKey = findVerticalLinkedWorldKeyForZ(room.worldKey, renderZ);
  if (!anchorWorldKey) return null;
  const worldRoom = worldRoomsByKey.get(anchorWorldKey);
  if (!worldRoom) return null;
  return project.rooms.find((item) => item.worldKey === anchorWorldKey)
    || makeDebugWorldRoom(worldRoom);
}

function findVerticalLinkedWorldKeyForZ(worldKey, renderZ) {
  const seen = new Set();
  const queue = [worldKey];
  while (queue.length) {
    const key = queue.shift();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const room = worldRoomsByKey.get(key);
    if (!room) continue;
    if (Number(room.coord?.z) === Number(renderZ)) return key;
    for (const direction of ["u", "d"]) {
      const target = room.links?.[direction];
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return "";
}

function getRenderMapZ(playerRoom, selectedRoom) {
  const playerZ = Number(playerRoom?.z ?? selectedRoom?.z ?? 0);
  const levels = getAvailableDebugZLevels();
  if (debugMapZ !== null && levels.includes(Number(debugMapZ))) return Number(debugMapZ);
  if (!mapDebugAll) return playerZ;
  if (playerRoom?.worldKey && levels.includes(playerZ)) return playerZ;
  if (levels.includes(playerZ)) return playerZ;
  return levels[0] ?? playerZ;
}

function getFallbackAtlasCenterRoom(z) {
  const atlasRoom = [...atlasRoomsByKey.values()].find((room) => Number(room.atlas?.z) === Number(z));
  if (atlasRoom?.atlas) {
    return {
      x: Number(atlasRoom.atlas.x),
      y: Number(atlasRoom.atlas.y),
      z: Number(atlasRoom.atlas.z)
    };
  }

  const worldRoom = [...worldRoomsByKey.values()].find((room) => Number(room.coord?.z) === Number(z));
  if (!worldRoom) return null;
  return {
    x: Number(worldRoom.coord?.x || 0),
    y: Number(worldRoom.coord?.y || 0),
    z: Number(worldRoom.coord?.z || 0)
  };
}

function shiftDebugMapZ(delta) {
  const levels = getAvailableDebugZLevels();
  if (!levels.length) return;
  const current = debugMapZ ?? mapView.z ?? getPlayerRoom()?.z ?? levels[0];
  const currentIndex = Math.max(0, levels.indexOf(Number(current)));
  const nextIndex = Math.max(0, Math.min(levels.length - 1, currentIndex + delta));
  debugMapZ = levels[nextIndex];
  mapView = {
    ...mapView,
    z: debugMapZ,
    area: mapDebugAll ? "__debug_all__" : "atlas"
  };
  renderMap("ui-z-shift");
}

function getAvailableDebugZLevels() {
  const levels = new Set();
  for (const room of worldRoomsByKey.values()) levels.add(Number(room.coord?.z || 0));
  for (const room of project.rooms) levels.add(Number(room.z || 0));
  return [...levels].sort((left, right) => left - right);
}

function buildDebugMapItems(rooms, options = {}) {
  if (options.preserveCoords) {
    return rooms.map((room) => ({
      room,
      mapX: Number(room.x || 0),
      mapY: Number(room.y || 0),
      groupLabel: room.area || "Mantar",
      groupX: Number(room.x || 0),
      groupY: Number(room.y || 0)
    }));
  }

  const groups = new Map();
  for (const room of rooms) {
    const key = room.area || "Mantar";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(room);
  }

  const sortedGroups = [...groups.entries()]
    .map(([key, groupRooms]) => {
      const xs = groupRooms.map((room) => Number(room.x || 0));
      const ys = groupRooms.map((room) => Number(room.y || 0));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        key,
        label: key,
        rooms: groupRooms,
        minX,
        minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label, "pl"));

  const columns = Math.max(1, Math.ceil(Math.sqrt(sortedGroups.length || 1)));
  const gap = 5;
  const columnWidths = Array(columns).fill(0);
  const columnHeights = Array(columns).fill(0);
  const placed = [];

  for (const group of sortedGroups) {
    let column = 0;
    for (let index = 1; index < columns; index += 1) {
      if (columnHeights[index] < columnHeights[column]) column = index;
    }
    const offsetX = columnWidths.slice(0, column).reduce((sum, width) => sum + width + gap, 0);
    const offsetY = columnHeights[column];
    columnWidths[column] = Math.max(columnWidths[column], group.width);
    columnHeights[column] += group.height + gap + 1;
    placed.push({ ...group, offsetX, offsetY });
  }

  const items = [];
  for (const group of placed) {
    for (const room of group.rooms) {
      items.push({
        room,
        mapX: Number(room.x || 0) - group.minX + group.offsetX,
        mapY: Number(room.y || 0) - group.minY + group.offsetY + 1,
        groupLabel: group.label,
        groupX: group.offsetX,
        groupY: group.offsetY
      });
    }
  }
  return items;
}

function getRenderAtlasCorridors(z, rooms, renderWindow = null) {
  if (!worldAtlas?.corridors?.length) return [];
  const worldKeys = new Set(rooms.map((room) => room.worldKey).filter(Boolean));
  return worldAtlas.corridors
    .filter((corridor) => Number(corridor.z) === Number(z))
    .filter((corridor) => mapDebugAll
      ? worldKeys.has(corridor.from) || worldKeys.has(corridor.to)
      : worldKeys.has(corridor.from) && worldKeys.has(corridor.to))
    .map((corridor) => ({
      ...corridor,
      points: (corridor.points || []).map((point) => ({
        key: point.key || "",
        x: Number(point.x || 0),
        y: Number(point.y || 0),
        title: point.title || corridor.title || "",
        areaFile: point.areaFile || corridor.areaFile || ""
      }))
    }))
    .map((corridor) => renderWindow
      ? { ...corridor, points: corridor.points.filter((point) => isGridPointInRenderWindow(point, renderWindow)) }
      : corridor)
    .filter((corridor) => corridor.points.length || worldKeys.has(corridor.from) || worldKeys.has(corridor.to));
}

function isGridPointInRenderWindow(point, window) {
  if (!window) return true;
  return Number(point.x) >= window.minX
    && Number(point.x) <= window.maxX
    && Number(point.y) >= window.minY
    && Number(point.y) <= window.maxY;
}

function drawAtlasCorridors(corridors, coords, worldRenderIds, cell) {
  const occupied = new Set([...coords.values()].map((point) => `${point.x / cell},${point.y / cell}`));
  const drawn = new Set();
  for (const corridor of corridors) {
    for (const point of corridor.points) {
      const key = `${point.x},${point.y}`;
      if (occupied.has(key) || drawn.has(key)) continue;
      drawn.add(key);
      const rect = svg("rect", {
        x: point.x * cell,
        y: point.y * cell,
        width: cell,
        height: cell,
        class: "atlas-corridor-cell"
      });
      if (point.title) rect.append(svg("title", {}, point.title));
      els.mapSvg.append(rect);
    }
    drawAtlasCorridorConnector(corridor, coords, worldRenderIds, cell);
  }
}

function drawAtlasCorridorConnector(corridor, coords, worldRenderIds, cell) {
  const from = coords.get(worldRenderIds.get(corridor.from));
  const to = coords.get(worldRenderIds.get(corridor.to));
  if (!from || !to) return;
  els.mapSvg.append(svg("line", {
    x1: from.x + cell / 2,
    y1: from.y + cell / 2,
    x2: to.x + cell / 2,
    y2: to.y + cell / 2,
    class: "atlas-corridor-link"
  }));
}

function getDebugWorldBaseRooms(z, renderWindow = null) {
  if (!worldRoomsByKey.size) return [];
  const discoveredWorldKeys = new Set(project.rooms.map((room) => room.worldKey).filter(Boolean));
  return [...worldRoomsByKey.values()]
    .filter((worldRoom) => Number(worldRoom.coord?.z) === Number(z))
    .filter((worldRoom) => !discoveredWorldKeys.has(worldRoom.key))
    .filter((worldRoom) => !renderWindow || isGridPointInRenderWindow({
      x: Number(atlasRoomsByKey.get(worldRoom.key)?.atlas?.x ?? worldRoom.coord?.x ?? 0),
      y: Number(atlasRoomsByKey.get(worldRoom.key)?.atlas?.y ?? worldRoom.coord?.y ?? 0)
    }, renderWindow))
    .map((worldRoom) => makeDebugWorldRoom(worldRoom));
}

function getProjectAtlasRoom(room) {
  if (!room?.worldKey) return room;
  const atlasRoom = atlasRoomsByKey.get(room.worldKey);
  if (!atlasRoom?.atlas) return room;
  return {
    ...room,
    x: Number(atlasRoom.atlas.x),
    y: Number(atlasRoom.atlas.y),
    localX: room.x,
    localY: room.y,
    worldExits: atlasRoom.exits || room.worldExits || [],
    visibleExits: atlasRoom.visibleExits || room.visibleExits || [],
    hiddenExits: atlasRoom.hiddenExits || room.hiddenExits || [],
    verticalExits: atlasRoom.verticalExits || room.verticalExits || [],
    wallDirections: atlasRoom.wallDirections || room.wallDirections || {}
  };
}

function makeDebugWorldRoom(worldRoom) {
  const atlasRoom = atlasRoomsByKey.get(worldRoom.key);
  return {
      id: `world-base:${worldRoom.key}`,
      worldKey: worldRoom.key,
      area: worldRoom.areaFile,
      x: Number(atlasRoom?.atlas?.x ?? worldRoom.coord?.x ?? 0),
      y: Number(atlasRoom?.atlas?.y ?? worldRoom.coord?.y ?? 0),
      z: Number(worldRoom.coord?.z || 0),
      localX: Number(worldRoom.coord?.x || 0),
      localY: Number(worldRoom.coord?.y || 0),
      title: worldRoom.title || "",
      description: worldRoom.description || "",
      notes: "",
      tags: [],
      worldExits: atlasRoom?.exits || worldRoom.exits || [],
      visibleExits: atlasRoom?.visibleExits || worldRoom.visibleExits || [],
      hiddenExits: atlasRoom?.hiddenExits || worldRoom.hiddenExits || [],
      verticalExits: atlasRoom?.verticalExits || getWorldVerticalExits(worldRoom),
      wallDirections: atlasRoom?.wallDirections || getWorldWallDirections(worldRoom),
      isWorldBase: true
    };
}

function drawDebugWorldBaseRoom(mapItem, cell) {
  const item = mapItem.room;
  const point = {
    x: mapItem.mapX * cell,
    y: mapItem.mapY * cell
  };
  const selected = selectedWorldPreview?.worldKey === item.worldKey;
  const group = svg("g", { class: `room-node debug-world-node ${selected ? "selected" : ""}` });
  group.append(drawRoomHitTarget(point, cell));
  group.append(svg("rect", {
    x: point.x,
    y: point.y,
    width: cell,
    height: cell
  }));
  drawRoomLabel(group, item, point, cell);
  drawRoomMapBadges(group, item, point, cell);
  group.append(svg("title", {}, [
    item.title || "Lokacja",
    item.worldKey || "",
    item.visibleExits?.length ? `Wyjscia: ${item.visibleExits.join(" ")}` : ""
  ].filter(Boolean).join("\n")));
  group.addEventListener("click", (event) => {
    event.stopPropagation();
    if (suppressNextMapClick) {
      suppressNextMapClick = false;
      return;
    }
    previewAtlasRoom(item);
    render();
  });
  els.mapSvg.append(group);
}

function drawRoomHitTarget(point, cell) {
  return svg("rect", {
    x: point.x,
    y: point.y,
    width: cell,
    height: cell,
    class: "room-hit-target"
  });
}

function drawDebugStaticWorldLinks(coords, worldRenderIds, cell, z) {
  const drawn = new Set();
  for (const worldKey of worldRenderIds.keys()) {
    const room = worldRoomsByKey.get(worldKey);
    if (!room) continue;
    if (Number(room.coord?.z) !== Number(z)) continue;
    for (const [direction, targetWorldKey] of Object.entries(room.links || {})) {
      if (!targetWorldKey) continue;
      const target = worldRoomsByKey.get(targetWorldKey);
      if (!target || Number(target.coord?.z) !== Number(z)) continue;
      if (target.areaFile === room.areaFile) continue;
      const fromId = worldRenderIds.get(room.key);
      const toId = worldRenderIds.get(targetWorldKey);
      const from = coords.get(fromId);
      const to = coords.get(toId);
      if (!from || !to) continue;
      const key = [room.key, direction, targetWorldKey].join("|");
      const reverseKey = [targetWorldKey, DIRECTIONS[direction]?.opposite || "", room.key].join("|");
      if (drawn.has(key) || drawn.has(reverseKey)) continue;
      drawn.add(key);
      els.mapSvg.append(svg("line", {
        x1: from.x + cell / 2,
        y1: from.y + cell / 2,
        x2: to.x + cell / 2,
        y2: to.y + cell / 2,
        class: "debug-static-world-link"
      }));
    }
  }
}

function getCurrentMapViewBox() {
  const rect = els.mapSvg.getBoundingClientRect();
  const width = Math.max(320, rect.width || 640) / zoom;
  const height = Math.max(240, rect.height || 420) / zoom;
  return {
    x: mapView.x - width / 2,
    y: mapView.y - height / 2,
    width,
    height
  };
}

function applyMapViewBox(options = {}) {
  const viewBox = getCurrentMapViewBox();
  const context = {
    z: Number(mapView.z || 0),
    area: mapView.area || "",
    zoom
  };
  const currentViewBox = parseSvgViewBox(els.mapSvg.getAttribute("viewBox"));
  const canAnimate = Boolean(
    options.animate &&
    currentViewBox &&
    lastAppliedMapViewContext &&
    lastAppliedMapViewContext.z === context.z &&
    lastAppliedMapViewContext.area === context.area &&
    Math.abs(Number(lastAppliedMapViewContext.zoom || 1) - zoom) < 0.001 &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );

  lastAppliedMapViewContext = context;
  if (!canAnimate) {
    mapViewAnimationId += 1;
    setSvgViewBox(viewBox);
    return;
  }

  animateMapViewBox(currentViewBox, viewBox, 260);
}

function parseSvgViewBox(value) {
  const parts = String(value || "").trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function setSvgViewBox(viewBox) {
  els.mapSvg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  els.mapPlayerLayer?.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
}

function animateMapViewBox(from, to, duration) {
  const animationId = ++mapViewAnimationId;
  const start = performance.now();
  const ease = (value) => 1 - Math.pow(1 - value, 3);

  const step = (now) => {
    if (animationId !== mapViewAnimationId) return;
    const progress = Math.min(1, (now - start) / duration);
    const eased = ease(progress);
    setSvgViewBox({
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      width: from.width + (to.width - from.width) * eased,
      height: from.height + (to.height - from.height) * eased
    });
    if (progress < 1) window.requestAnimationFrame(step);
  };

  window.requestAnimationFrame(step);
}

function drawBlockedBorder(roomId, direction, coords, cell) {
  const point = coords.get(roomId);
  const dir = normalizeDirection(direction);
  if (!point || !DIRECTIONS[dir]) return;
  const inset = 3;
  const sides = {
    n: { x1: point.x + inset, y1: point.y + inset, x2: point.x + cell - inset, y2: point.y + inset },
    s: { x1: point.x + inset, y1: point.y + cell - inset, x2: point.x + cell - inset, y2: point.y + cell - inset },
    e: { x1: point.x + cell - inset, y1: point.y + inset, x2: point.x + cell - inset, y2: point.y + cell - inset },
    w: { x1: point.x + inset, y1: point.y + inset, x2: point.x + inset, y2: point.y + cell - inset }
  };
  els.mapSvg.append(svg("line", { ...sides[dir], class: "blocked-border" }));
}

function svg(name, attrs, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function exportProject() {
  saveProject({ markServerDirty: false });
  const blob = new Blob([JSON.stringify(buildUserLayerExport(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "otchlan-map-backup.json";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

async function importProject(event) {
  const file = event.target.files?.[0];
  if (!file) return false;
  try {
    const payload = JSON.parse(await file.text());
    applyUserLayerImport(payload);
    centerMapOnPlayer();
    saveProject();
    render();
    return true;
  } catch (error) {
    console.warn("[mapper:warn] import failed", error);
    showToast("Nie udalo sie zaimportowac backupu.", "error");
    return false;
  } finally {
    event.target.value = "";
  }
}

function buildUserLayerExport() {
  normalizeGlobalNotesState();
  const rooms = project.rooms
    .filter((room) => room.worldKey)
    .map((room) => ({
      worldKey: room.worldKey,
      visited: true,
      notes: room.notes || "",
      tags: room.tags || []
    }))
    .sort((left, right) => left.worldKey.localeCompare(right.worldKey));
  return {
    schema: "otchlan-user-layer",
    version: 1,
    exportedAt: new Date().toISOString(),
    globalNotes: project.globalNotes || "",
    globalNotesPages: project.globalNotesPages.map((page) => ({
      id: page.id,
      title: page.title,
      body: page.body || "",
      createdAt: page.createdAt || "",
      updatedAt: page.updatedAt || ""
    })),
    activeGlobalNotesPageId: project.activeGlobalNotesPageId || "",
    rooms
  };
}

function applyUserLayerImport(payload) {
  if (!worldRoomsByKey.size) {
    throw new Error("World cache is not loaded yet");
  }

  const layer = normalizeUserLayerImport(payload);
  project = createEmptyProject();
  project.globalNotes = layer.globalNotes || "";
  project.globalNotesPages = layer.globalNotesPages;
  project.activeGlobalNotesPageId = layer.activeGlobalNotesPageId;
  normalizeGlobalNotesState();

  for (const entry of layer.rooms) {
    const worldRoom = worldRoomsByKey.get(entry.worldKey);
    if (!worldRoom) continue;
    const room = ensureProjectRoomForWorldRoom(worldRoom, {});
    room.notes = String(entry.notes || "");
    room.tags = normalizeTags(entry.tags);
  }

  for (const room of project.rooms) {
    if (room.worldKey) syncDiscoveredWorldLinks(room);
  }

  const firstWorldRoom = project.rooms.find((room) => room.worldKey);
  playerRoomId = "";
  playerPositionKnown = false;
  selectedRoomId = firstWorldRoom?.id || project.currentRoomId;
  selectedRoomPreview = null;
  selectedWorldPreview = null;
  followPlayer = true;

  project.playerRoomId = playerRoomId;
  project.selectedRoomId = selectedRoomId;
  project.currentRoomId = "";
  project.followPlayer = followPlayer;
}

function normalizeUserLayerImport(payload) {
  if (payload?.schema === "otchlan-user-layer" && Array.isArray(payload.rooms)) {
    return {
      globalNotes: String(payload.globalNotes || ""),
      globalNotesPages: normalizeImportedGlobalNotePages(payload),
      activeGlobalNotesPageId: String(payload.activeGlobalNotesPageId || ""),
      rooms: payload.rooms
        .map((room) => ({
          worldKey: String(room.worldKey || ""),
          notes: room.notes || "",
          tags: normalizeTags(room.tags)
        }))
        .filter((room) => room.worldKey)
    };
  }

  if (Array.isArray(payload?.rooms)) {
    return {
      globalNotes: String(payload.globalNotes || ""),
      globalNotesPages: normalizeImportedGlobalNotePages(payload),
      activeGlobalNotesPageId: String(payload.activeGlobalNotesPageId || ""),
      rooms: payload.rooms
        .filter((room) => room.worldKey)
        .map((room) => ({
          worldKey: String(room.worldKey || ""),
          notes: room.notes || "",
          tags: normalizeTags(room.tags)
        }))
    };
  }

  throw new Error("Unsupported import format");
}

function normalizeImportedGlobalNotePages(payload) {
  const now = new Date().toISOString();
  if (!Array.isArray(payload?.globalNotesPages)) {
    return [{
      id: "global-note-1",
      title: "Aktualne zadanie",
      body: String(payload?.globalNotes || ""),
      createdAt: now,
      updatedAt: now
    }];
  }
  const pages = payload.globalNotesPages
    .map((page, index) => ({
      id: String(page.id || `global-note-${index + 1}`),
      title: String(page.title || `Strona ${index + 1}`),
      body: String(page.body ?? page.notes ?? ""),
      createdAt: page.createdAt || now,
      updatedAt: page.updatedAt || now
    }))
    .filter((page) => page.id);
  return pages.length ? pages : [{
    id: "global-note-1",
    title: "Aktualne zadanie",
    body: String(payload?.globalNotes || ""),
    createdAt: now,
    updatedAt: now
  }];
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  }
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function saveProject(options = {}) {
  project.playerRoomId = playerRoomId;
  project.selectedRoomId = selectedRoomId;
  project.followPlayer = followPlayer;
  project.currentRoomId = playerRoomId;
  if (options.markServerDirty !== false) {
    if (options.positionOnly) return;
    serverSaveDirty = true;
    serverSaveRevision += 1;
    scheduleServerSave({ immediate: Boolean(options.immediateServerSave) });
  }
}

async function postJson(url, payload) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function putJson(url, payload) {
  return requestJson(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function patchJson(url, payload) {
  return requestJson(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function fetchJson(url) {
  return requestJson(url);
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const payload = await readJsonResponse(response);
    if (!response.ok || payload?.ok === false) {
      const error = new Error(getServerErrorMessage(payload, response));
      error.payload = payload;
      error.status = response.status;
      notifyServerError(error, url);
      error.serverNotified = true;
      throw error;
    }
    return payload;
  } catch (error) {
    if (!error.serverNotified) notifyServerError(error, url);
    throw error;
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, message: text };
  }
}

function getServerErrorMessage(payload, response) {
  return String(
    payload?.message ||
    payload?.error ||
    `${response.status} ${response.statusText}` ||
    "Blad serwera."
  );
}

function notifyServerError(error, url) {
  if (String(url || "").includes("/api/app-log")) return;
  const message = `Blad serwera: ${String(error?.message || "nieznany blad")}`;
  const now = Date.now();
  if (lastServerErrorToast.message === message && now - lastServerErrorToast.at < 4000) return;
  lastServerErrorToast = { message, at: now };
  showToast(message, "error");
}
