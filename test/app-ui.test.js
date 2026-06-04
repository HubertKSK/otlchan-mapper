import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("page branding uses Otchlan Mapper with a sword icon", () => {
  assert.match(htmlSource, /<title>Otchlan Mapper<\/title>/);
  assert.match(htmlSource, /<h1>Otchlan Mapper<\/h1>/);
  assert.match(htmlSource, /rel="icon" href="data:image\/svg\+xml/);
  assert.match(htmlSource, /class="brand-icon"/);
  assert.match(cssSource, /\.brand-icon\s*\{/);
});

test("documentation demo mode provides stable UI state without live server loops", () => {
  assert.match(appSource, /const DOCUMENTATION_DEMO_MODE = new URLSearchParams\(window\.location\.search\)\.get\("demo"\) === "1";/);
  assert.match(appSource, /if \(DOCUMENTATION_DEMO_MODE\) \{[\s\S]*initDocumentationDemo\(\);[\s\S]*\} else \{[\s\S]*connectEventStream\(\);[\s\S]*initServerAutosave\(\);/);
  assert.match(appSource, /function initDocumentationDemo\(\) \{/);
  assert.match(appSource, /function createDocumentationDemoProject\(\) \{/);
  assert.match(appSource, /function createDocumentationDemoStats\(\) \{/);
  assert.match(appSource, /function createDocumentationDemoMobs\(\) \{/);
  assert.match(appSource, /function createDocumentationDemoTerminalText\(\) \{/);
  assert.match(appSource, /term\.write\(createDocumentationDemoTerminalText\(\)\);/);
  assert.match(appSource, /Ulica Murna i Boczniejsza krzyżują się tutaj/);
  assert.match(appSource, /Skrzyżowanie/);
  assert.match(appSource, /Wschodnia brama Mantaru/);
  assert.match(appSource, /Opancerzony strażnik pilnuje tutaj bramy/);
  assert.match(appSource, /\\x1b\[38;5;51m/);
  assert.match(appSource, /fetchJson\("\/api\/user-layer-demo"\)/);
  assert.match(appSource, /\.catch\(\(\) => fetchJson\("\/api\/user-layer"\)\)/);
  assert.match(appSource, /const DOCUMENTATION_DEMO_FOCUS_WORLD_KEY = "miasto\.are:285,338,13";/);
  assert.match(appSource, /project\.rooms\.find\(\(room\) => room\.worldKey === DOCUMENTATION_DEMO_FOCUS_WORLD_KEY\)/);
  assert.doesNotMatch(appSource, /getRoomByWorldKey/);
  assert.match(appSource, /if \(DOCUMENTATION_DEMO_MODE && mob\.visibleCardinal4\) return true;/);
  assert.match(appSource, /if \(DOCUMENTATION_DEMO_MODE\) return;[\s\S]*sendQueuedGameInput\(data\);/);
  assert.doesNotMatch(appSource, /fixed terminal resize failed/);
});

test("game control lives in the terminal header as one dynamic button", () => {
  const terminalSection = htmlSource.match(/<section class="terminal-panel"[\s\S]*?<\/section>/)?.[0] || "";
  const menuPanel = htmlSource.match(/<div id="appMenuPanel"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";

  assert.match(terminalSection, /id="gameStatus"/);
  assert.match(terminalSection, /id="startGameBtn"/);
  assert.match(terminalSection, /class="[^"]*\bgame-toggle-btn\b[^"]*"/);
  assert.match(terminalSection, /game-start-icon/);
  assert.match(terminalSection, /game-stop-icon/);
  assert.doesNotMatch(menuPanel, /id="gameStatus"/);
  assert.doesNotMatch(htmlSource, /id="stopGameBtn"/);
});

test("game button switches between start and stop from game-status", () => {
  assert.match(appSource, /let gameRunning = false;/);
  assert.match(appSource, /function applyGameStatus\(state = \{\}\) \{/);
  assert.match(appSource, /button\.classList\.toggle\("danger-action", gameRunning\)/);
  assert.match(appSource, /if \(gameRunning\) \{\s*await postJson\("\/api\/game\/stop", \{\}\);/);
  assert.match(cssSource, /\.game-toggle-btn/);
  assert.match(cssSource, /\.game-toggle-btn \.game-stop-icon/);
});

test("follow player control uses a stable icon instead of text glyphs", () => {
  assert.match(htmlSource, /id="followPlayerBtn"[\s\S]*class="button-icon follow-player-icon"/);
  assert.doesNotMatch(appSource, /followPlayerBtn\.textContent/);
  assert.match(appSource, /followPlayerBtn\.setAttribute\("aria-label", followPlayer \? "Sledzenie gracza wlaczone" : "Sledz gracza"\)/);
});

test("editing a non-player map room targets the persisted project room", () => {
  assert.match(appSource, /const projectRoom = getRoomById\(room\.id\) \|\| room;/);
  assert.match(appSource, /selectedRoomId = projectRoom\.id;/);
  assert.match(appSource, /selectedRoomPreview = projectRoom;/);
  assert.match(appSource, /project\.selectedRoomId = selectedRoomId;/);
  const previewFunction = appSource.match(/function previewAtlasRoom\(room\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(previewFunction, /followPlayer = false/);
});

test("mapper claims activation before the first command after returning to the tab", () => {
  assert.match(appSource, /function claimMapperActivationIfVisible\(reason\) \{/);
  assert.match(appSource, /if \(document\.visibilityState === "hidden"\) return;/);
  assert.match(appSource, /window\.addEventListener\("focus", \(\) => claimMapperActivationIfVisible\("window-focus"\)\)/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange", \(\) => \{[\s\S]*claimMapperActivationIfVisible\("visibility-visible"\)/);
  assert.match(appSource, /els\.gameOutput\.addEventListener\("pointerdown", \(\) => claimMapperActivationIfVisible\("terminal-focus"\)\)/);
  assert.match(appSource, /term\.onData\(\(data\) => \{[\s\S]*claimMapperActivation\("terminal-input"\)/);
});

test("manual server save and load controls are not shown in settings", () => {
  assert.doesNotMatch(htmlSource, /id="saveServerBtn"/);
  assert.doesNotMatch(htmlSource, /Zapisz na serwerze/);
  assert.doesNotMatch(htmlSource, /id="loadServerBtn"/);
  assert.doesNotMatch(htmlSource, /Wczytaj z serwera/);
  assert.doesNotMatch(appSource, /saveServerBtn: document\.querySelector/);
  assert.doesNotMatch(appSource, /loadServerBtn: document\.querySelector/);
});

test("file import and export are labeled as backups", () => {
  assert.match(htmlSource, /Eksportuj backup/);
  assert.match(htmlSource, /Importuj backup/);
  assert.match(appSource, /link\.download = "otchlan-map-backup\.json"/);
  assert.match(appSource, /document\.body\.append\(link\)/);
  assert.match(appSource, /window\.setTimeout\(\(\) => \{[\s\S]*URL\.revokeObjectURL\(url\);[\s\S]*link\.remove\(\);/);
});

test("backup actions show bottom-right toast feedback", () => {
  assert.match(htmlSource, /id="toastStack"/);
  assert.match(cssSource, /\.toast-stack[\s\S]*right: 16px;[\s\S]*bottom: 16px;/);
  assert.match(appSource, /function showToast\(message, type = "info"\)/);
  assert.match(appSource, /showToast\("Backup wyeksportowany\.", "success"\)/);
  assert.match(appSource, /showToast\("Backup zaimportowany\.", "success"\)/);
});

test("new map action requires confirmation modal", () => {
  assert.match(htmlSource, /id="resetConfirmModal"[\s\S]*role="dialog"/);
  assert.match(htmlSource, /id="cancelResetBtn"/);
  assert.match(htmlSource, /id="confirmResetBtn"[\s\S]*Utworz nowa mape/);
  assert.match(appSource, /resetConfirmModal: document\.querySelector\("#resetConfirmModal"\)/);
  assert.match(appSource, /document\.querySelector\("#resetBtn"\)\.addEventListener\("click", \(\) => \{[\s\S]*openResetConfirmModal\(\);[\s\S]*\}\);/);
  assert.match(appSource, /els\.confirmResetBtn\?\.addEventListener\("click", \(\) => \{[\s\S]*resetProject\(\);[\s\S]*\}\);/);
  assert.match(appSource, /function openResetConfirmModal\(\) \{/);
  assert.match(appSource, /function closeResetConfirmModal\(\) \{/);
  assert.match(appSource, /function resetProject\(\) \{[\s\S]*project = createEmptyProject\(\);/);
  assert.match(cssSource, /\.confirm-modal\s*\{/);
  assert.match(cssSource, /\.confirm-modal\[hidden\]\s*\{[\s\S]*display: none;/);
});

test("server request failures show a bottom-right error toast", () => {
  assert.match(appSource, /let lastServerErrorToast = \{ message: "", at: 0 \};/);
  assert.match(appSource, /async function requestJson\(url, options = \{\}\) \{/);
  assert.match(appSource, /if \(!response\.ok \|\| payload\?\.ok === false\) \{/);
  assert.match(appSource, /function notifyServerError\(error, url\) \{/);
  assert.match(appSource, /if \(String\(url \|\| ""\)\.includes\("\/api\/app-log"\)\) return;/);
  assert.match(appSource, /showToast\(message, "error"\)/);
  assert.match(appSource, /return requestJson\(url, \{[\s\S]*method: "POST"/);
  assert.match(appSource, /return requestJson\(url, \{[\s\S]*method: "PUT"/);
  assert.match(appSource, /return requestJson\(url, \{[\s\S]*method: "PATCH"/);
});

test("location description visibility can be toggled from the app menu", () => {
  assert.match(htmlSource, /class="layout-column terminal-column"[\s\S]*class="terminal-panel"[\s\S]*class="location-panel"/);
  assert.match(htmlSource, /class="layout-column map-column"[\s\S]*class="map-panel"[\s\S]*class="global-notes-panel"/);
  assert.match(htmlSource, /id="toggleDescriptionBtn"/);
  assert.match(htmlSource, /id="toggleRoomTagsBtn"[\s\S]*Tagi pola/);
  assert.match(htmlSource, /id="toggleRoomNotesBtn"[\s\S]*Notatki pola/);
  assert.match(htmlSource, /class="setting-toggle"/);
  assert.match(htmlSource, /Opis lokacji/);
  assert.match(htmlSource, /class="toggle-switch"/);
  assert.match(htmlSource, /id="roomDescriptionField"[^>]*room-description-field/);
  assert.match(htmlSource, /id="roomTagsField"[^>]*room-tags-field/);
  assert.match(htmlSource, /id="roomNotesField"[^>]*room-notes-field/);
  assert.match(appSource, /const DESCRIPTION_VISIBLE_KEY = "otchlan-automapper-description-visible";/);
  assert.match(appSource, /const ROOM_TAGS_VISIBLE_KEY = "otchlan-automapper-room-tags-visible";/);
  assert.match(appSource, /const ROOM_NOTES_VISIBLE_KEY = "otchlan-automapper-room-notes-visible";/);
  assert.match(appSource, /function applySavedDescriptionVisibility\(\)/);
  assert.match(appSource, /function setDescriptionVisibility\(visible, options = \{\}\)/);
  assert.match(appSource, /function applySavedRoomTagsVisibility\(\)/);
  assert.match(appSource, /function setRoomTagsVisibility\(visible, options = \{\}\)/);
  assert.match(appSource, /function applySavedRoomNotesVisibility\(\)/);
  assert.match(appSource, /function setRoomNotesVisibility\(visible, options = \{\}\)/);
  assert.match(appSource, /function updateLocationFieldsVisibilityState\(\) \{/);
  assert.match(appSource, /setDescriptionVisibility\(!descriptionVisible\)/);
  assert.match(appSource, /setRoomTagsVisibility\(!roomTagsVisible\)/);
  assert.match(appSource, /setRoomNotesVisibility\(!roomNotesVisible\)/);
  assert.match(appSource, /classList\.toggle\("is-on", descriptionVisible\)/);
  assert.match(appSource, /classList\.toggle\("is-on", roomTagsVisible\)/);
  assert.match(appSource, /classList\.toggle\("is-on", roomNotesVisible\)/);
  assert.match(appSource, /classList\.toggle\("location-fields-hidden", !descriptionVisible && !roomTagsVisible && !roomNotesVisible\)/);
  assert.match(cssSource, /\.description-hidden \.room-description-field/);
  assert.match(cssSource, /\.room-tags-hidden \.room-tags-field/);
  assert.match(cssSource, /\.room-notes-hidden \.room-notes-field/);
  assert.match(cssSource, /\.location-fields-hidden \.location-panel/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.terminal-column\s*\{[\s\S]*grid-column: 1;/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.map-column\s*\{[\s\S]*grid-column: 2;/);
  assert.match(cssSource, /--app-max-width: 2560px;/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\]\s*\{[\s\S]*align-items: stretch;/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.layout-column\s*\{[\s\S]*height: 100%;[\s\S]*align-content: stretch;/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.terminal-column\s*\{[\s\S]*grid-template-rows: auto minmax\(0, 1fr\);/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.map-column\s*\{[\s\S]*grid-template-rows: minmax\(320px, 1fr\) minmax\(180px, 0\.34fr\);/);
  assert.match(cssSource, /@media \(min-width: 1680px\) \{[\s\S]*\.layout\[data-workspace="game"\]\s*\{[\s\S]*grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(cssSource, /@media \(min-width: 1680px\) \{[\s\S]*\.topbar,\s*[\s\S]*\.layout\s*\{[\s\S]*width: min\(100%, var\(--app-max-width\)\);[\s\S]*margin-inline: auto;/);
  assert.match(cssSource, /\.layout\[data-workspace="atlas"\] \.layout-column\s*\{[\s\S]*display: contents;/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.map-column > \.map-panel,\s*[\s\S]*\.layout\[data-workspace="game"\] \.map-column > \.global-notes-panel\s*\{[\s\S]*grid-column: 1;/);
  assert.match(cssSource, /\.layout\[data-workspace="game"\] \.location-panel\s*\{[\s\S]*align-self: start;/);
  assert.match(cssSource, /\.toggle-switch::after/);
});

test("global notes panel visibility can be toggled from settings", () => {
  assert.match(htmlSource, /id="toggleNotesBtn"[\s\S]*Notes/);
  assert.match(appSource, /const NOTES_VISIBLE_KEY = "otchlan-automapper-notes-visible";/);
  assert.match(appSource, /let notesVisible = true;/);
  assert.match(appSource, /function applySavedNotesVisibility\(\) \{/);
  assert.match(appSource, /function setNotesVisibility\(visible, options = \{\}\) \{/);
  assert.match(appSource, /document\.body\.classList\.toggle\("notes-hidden", !notesVisible\)/);
  assert.match(appSource, /setNotesVisibility\(!notesVisible\)/);
  assert.match(cssSource, /\.notes-hidden \.global-notes-panel\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /\.notes-hidden \.global-notes-panel\s*\{[\s\S]*display: none;/);
});

test("terminal font size can be changed from settings", () => {
  assert.match(htmlSource, /id="terminalFontSizeDownBtn"[\s\S]*-/);
  assert.match(htmlSource, /id="terminalFontSizeValue"[\s\S]*14/);
  assert.match(htmlSource, /id="terminalFontSizeUpBtn"[\s\S]*\+/);
  assert.match(appSource, /const TERMINAL_FONT_SIZE_KEY = "otchlan-automapper-terminal-font-size";/);
  assert.match(appSource, /const TERMINAL_DEFAULT_FONT_SIZE = 14;/);
  assert.match(appSource, /const TERMINAL_MIN_FONT_SIZE = 10;/);
  assert.match(appSource, /const TERMINAL_MAX_FONT_SIZE = 18;/);
  assert.match(appSource, /terminalFontSizeDownBtn: document\.querySelector\("#terminalFontSizeDownBtn"\)/);
  assert.match(appSource, /terminalFontSizeUpBtn: document\.querySelector\("#terminalFontSizeUpBtn"\)/);
  assert.match(appSource, /terminalFontSizeValue: document\.querySelector\("#terminalFontSizeValue"\)/);
  assert.match(appSource, /function applySavedTerminalFontSize\(\) \{/);
  assert.match(appSource, /function setTerminalFontSize\(fontSize, options = \{\}\) \{/);
  assert.match(appSource, /term\.options\.fontSize = nextFontSize;/);
  assert.match(appSource, /terminalFontSizeValue\.textContent = String\(nextFontSize\)/);
  assert.match(appSource, /terminalFontSizeDownBtn\.disabled = nextFontSize <= TERMINAL_MIN_FONT_SIZE/);
  assert.match(appSource, /terminalFontSizeUpBtn\.disabled = nextFontSize >= TERMINAL_MAX_FONT_SIZE/);
  assert.match(appSource, /localStorage\.setItem\(TERMINAL_FONT_SIZE_KEY, String\(nextFontSize\)\)/);
  assert.match(appSource, /function refreshTerminalLayoutAfterFontSizeChange\(\) \{/);
  assert.match(appSource, /term\.refresh\(0, Math\.max\(0, term\.rows - 1\)\)/);
  assert.match(appSource, /window\.requestAnimationFrame\(\(\) => \{[\s\S]*fitTerminalToPanel\(\);[\s\S]*scrollTerminalToBottom\(\);/);
  assert.match(cssSource, /\.stepper-control/);
  assert.match(cssSource, /\.stepper-control strong/);
});

test("app menu is structured as settings with map mob visibility toggle", () => {
  assert.match(htmlSource, /class="settings-panel"/);
  assert.match(htmlSource, /class="settings-head"[\s\S]*Ustawienia/);
  assert.match(htmlSource, /class="settings-section" aria-label="Interfejs"/);
  assert.match(htmlSource, /class="settings-section" aria-label="Mapa"/);
  assert.match(htmlSource, /id="toggleMobsBtn"[\s\S]*Moby na mapie/);
  assert.match(htmlSource, /class="settings-section" aria-label="Postac"/);
  assert.match(htmlSource, /class="settings-section" aria-label="Atlas swiata"/);
  assert.match(htmlSource, /class="settings-section" aria-label="Dane"/);
  assert.match(htmlSource, /class="settings-section debug-only" aria-label="Debug"/);
  assert.match(appSource, /const MOBS_VISIBLE_KEY = "otchlan-automapper-mobs-visible";/);
  assert.match(appSource, /let mobsVisible = true;/);
  assert.match(appSource, /function applySavedMobsVisibility\(\) \{/);
  assert.match(appSource, /function setMobsVisibility\(visible, options = \{\}\) \{/);
  assert.match(appSource, /setMobsVisibility\(!mobsVisible\)/);
  assert.match(appSource, /return mobsVisible && canObserveGameMobs\(\);/);
  assert.match(cssSource, /\.settings-panel/);
  assert.match(cssSource, /\.settings-section/);
});

test("world atlas setup can be managed from settings and onboarding", () => {
  assert.match(htmlSource, /id="worldSetupWelcome"/);
  assert.match(htmlSource, /id="worldCacheStatus"/);
  assert.match(htmlSource, /id="worldAtlasStatus"/);
  assert.match(htmlSource, /id="extractWorldBtn"/);
  assert.match(htmlSource, /id="buildWorldAtlasBtn"/);
  assert.match(htmlSource, /id="welcomeExtractWorldBtn"/);
  assert.match(htmlSource, /id="welcomeBuildAtlasBtn"/);
  assert.match(appSource, /worldSetupWelcome: document\.querySelector\("#worldSetupWelcome"\)/);
  assert.match(appSource, /async function initWorldSetup\(\) \{/);
  assert.match(appSource, /await fetchJson\("\/api\/world\/status"\)/);
  assert.match(appSource, /function updateWorldSetupStatus\(status = \{\}\) \{/);
  assert.match(appSource, /const cacheReady = Boolean\(status\.cache\?\.ready\);/);
  assert.match(appSource, /function getWorldFileStatusText\(fileStatus = \{\}\) \{/);
  assert.match(appSource, /if \(fileStatus\.stale\) return "nieaktualny";/);
  assert.match(appSource, /function getWorldFileStatusState\(fileStatus = \{\}\) \{/);
  assert.match(appSource, /els\.worldSetupWelcome\.hidden = cacheReady && atlasReady;/);
  assert.match(appSource, /runWorldSetupStep\("extract"\)/);
  assert.match(appSource, /runWorldSetupStep\("atlas"\)/);
  assert.match(appSource, /postJson\(step === "extract" \? "\/api\/world\/extract" : "\/api\/world\/atlas", \{\}\)/);
  assert.match(cssSource, /\.world-setup-welcome/);
  assert.match(cssSource, /\.world-file-status/);
});

test("character stat widgets can be toggled from settings", () => {
  for (const key of ["hp", "mana", "mv", "gold", "exp", "statuses", "clock", "date"]) {
    assert.match(htmlSource, new RegExp(`data-stat-toggle="${key}"`));
    assert.match(htmlSource, new RegExp(`data-stat-panel="${key}"`));
    assert.match(cssSource, new RegExp(`body\\.stat-hidden-${key} \\[data-stat-panel="${key}"\\]`));
  }
  assert.match(appSource, /const STATS_VISIBLE_KEY = "otchlan-automapper-stats-visible";/);
  assert.match(appSource, /const DEFAULT_STAT_VISIBILITY = Object\.freeze\(\{/);
  assert.match(appSource, /statVisibilityButtons: document\.querySelectorAll\("\[data-stat-toggle\]"\)/);
  assert.match(appSource, /function applySavedStatVisibility\(\) \{/);
  assert.match(appSource, /function setStatVisibility\(key, visible, options = \{\}\) \{/);
  assert.match(appSource, /document\.body\.classList\.toggle\(`stat-hidden-\$\{key\}`, !visible\)/);
  assert.match(appSource, /localStorage\.setItem\(STATS_VISIBLE_KEY, JSON\.stringify\(statVisibility\)\)/);
  assert.match(cssSource, /\.settings-toggle-grid/);
  assert.match(cssSource, /body\.stat-hidden-statuses\.stat-hidden-clock\.stat-hidden-date \.active-effects/);
});

test("wide game layout fits location details when description is visible", () => {
  assert.match(cssSource, /body:not\(\.description-hidden\) \.layout\[data-workspace="game"\] \.text-fields\s*\{[\s\S]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(220px, 0\.85fr\);/);
  assert.match(cssSource, /body:not\(\.description-hidden\) \.layout\[data-workspace="game"\] \.room-description-field\s*\{[\s\S]*grid-row: 1 \/ span 2;/);
  assert.match(cssSource, /\.text-fields \.editable-field:nth-of-type\(2\)\s*\{[\s\S]*grid-column: 2;/);
  assert.match(cssSource, /\.text-fields \.editable-field:nth-of-type\(3\)\s*\{[\s\S]*grid-column: 2;/);
});

test("app menu actions use consistent typography", () => {
  assert.match(cssSource, /button,\s*input,\s*textarea,\s*\.file-btn\s*\{\s*font: inherit;/);
  assert.match(cssSource, /\.menu-panel button,\s*\.menu-panel \.file-btn\s*\{[\s\S]*font-size: 13px;[\s\S]*font-weight: 400;[\s\S]*line-height: 1\.25;/);
});

test("global notes panel does not use bold typography", () => {
  assert.match(cssSource, /\.global-notes-panel \.full-label\s*\{[\s\S]*font-weight: 400;/);
  assert.match(cssSource, /\.global-notes-panel textarea\s*\{[\s\S]*font-weight: 400;/);
});

test("app UI uses the selected UI fonts while terminal keeps monospace", () => {
  assert.match(htmlSource, /family=IBM\+Plex\+Sans/);
  assert.match(htmlSource, /family=Silkscreen/);
  assert.match(cssSource, /--font-ui: "IBM Plex Sans", "Segoe UI", Tahoma, sans-serif;/);
  assert.match(cssSource, /--font-heading: "Silkscreen", var\(--font-ui\);/);
  assert.match(appSource, /fontFamily: "Consolas, 'Courier New', monospace"/);
});

test("player movement animation moves the player marker instead of a room rectangle", () => {
  assert.match(htmlSource, /id="mapSvg"[\s\S]*id="mapPlayerLayer"[\s\S]*id="mapLevelTransitionOverlay"/);
  assert.match(appSource, /mapPlayerLayer: document\.querySelector\("#mapPlayerLayer"\)/);
  assert.match(appSource, /function createPlayerLocationMarker\(point, cell, extraClass = ""\)/);
  assert.match(appSource, /function getPlayerMarkerCenter\(point, cell\) \{/);
  assert.match(appSource, /class: "player-location-marker-frame"/);
  assert.match(appSource, /const inset = 6;/);
  assert.match(appSource, /y: point\.y \+ cell \/ 2/);
  assert.match(appSource, /const \{ x: targetX, y: targetY \} = getPlayerMarkerCenter\(point, cell\);/);
  assert.doesNotMatch(appSource, /point\.y \+ cell - 13/);
  assert.match(appSource, /function renderPlayerMarkerLayer\(coords, cell, z\) \{/);
  assert.match(appSource, /function animateSvgMarkerTravel\(marker, fromX, fromY, toX, toY, duration, options = \{\}\)/);
  assert.match(appSource, /marker\.setAttribute\("transform", `translate\(\$\{x\}, \$\{y\}\)`\)/);
  assert.match(appSource, /let playerTravelAnimationId = 0;/);
  assert.match(appSource, /let activePlayerTravelAnimationId = "";/);
  assert.match(appSource, /let pendingPlayerTravelAnimation = null;/);
  assert.match(appSource, /function schedulePlayerTravelAnimation\(fromRoom, toRoom\) \{/);
  assert.match(appSource, /schedulePlayerTravelAnimation\(previousRoom, room\);/);
  assert.match(appSource, /els\.mapPlayerLayer\.querySelector\("\.player-location-marker"\)/);
  assert.match(appSource, /if \(activePlayerTravelAnimationId === pending\.id\) return;/);
  assert.match(appSource, /readSvgTranslate\(marker\)/);
  assert.match(appSource, /animateSvgMarkerTravel\(marker, fromX, fromY, toX, toY, PLAYER_TRAVEL_ANIMATION_MS/);
  assert.match(appSource, /els\.mapPlayerLayer\.classList\.add\("player-marker-animating"\)/);
  assert.match(appSource, /els\.mapPlayerLayer\?\.setAttribute\("viewBox"/);
  assert.match(cssSource, /\.map-player-layer/);
  assert.match(cssSource, /\.player-location-marker-frame\s*\{[\s\S]*stroke-dasharray: 5 4;/);
  assert.match(cssSource, /\.player-location-marker-frame\s*\{[\s\S]*stroke-width: 1\.6;/);
  assert.doesNotMatch(cssSource, /\.player-location-marker-ring/);
  assert.doesNotMatch(cssSource, /\.player-marker-animating \.room-node\.current \.player-location-marker/);
  assert.doesNotMatch(appSource, /class: "player-travel-marker player-travel-marker-moving"/);
  assert.doesNotMatch(cssSource, /player-travel-marker-pulse/);
});

test("map view follows player movement with animated viewBox panning", () => {
  assert.match(appSource, /let mapViewAnimationId = 0;/);
  assert.match(appSource, /let lastAppliedMapViewContext = null;/);
  assert.match(appSource, /applyMapViewBox\(\{ animate: true \}\)/);
  assert.match(appSource, /function animateMapViewBox\(from, to, duration\)/);
  assert.match(appSource, /lastAppliedMapViewContext\.z === context\.z/);
  assert.match(appSource, /setSvgViewBox\(\{[\s\S]*x: from\.x \+ \(to\.x - from\.x\) \* eased/);
});

test("position-only movement updates the map without rebuilding the SVG", () => {
  assert.match(appSource, /let lastRenderedMapCoords = new Map\(\);/);
  assert.match(appSource, /"data-room-id": item\.id/);
  assert.match(appSource, /function renderPositionOnlyMapUpdate\(previousPlayerRoomId, previousSelectedRoomId, reason = "position-only"\) \{/);
  assert.match(appSource, /if \(mapDebugAll\) return false;/);
  assert.match(appSource, /if \(!lastRenderedMapCoords\.has\(playerRoomId\)\) return false;/);
  assert.match(appSource, /updateRoomNodeState\(previousPlayerRoomId\);/);
  assert.match(appSource, /renderPlayerMarkerLayer\(lastRenderedMapCoords, lastRenderedMapCell, z\);/);
  assert.match(appSource, /renderPositionOnlyMapUpdate\(previousPlayerRoomId, previousSelectedRoomId, "memory-position"\)/);
});

test("UI performance profiler is opt-in through the perf query flag", () => {
  assert.match(appSource, /const UI_PERF_MODE = new URLSearchParams\(window\.location\.search\)\.get\("perf"\) === "1";/);
  assert.match(appSource, /function initUiPerfProbe\(\) \{/);
  assert.match(appSource, /if \(!UI_PERF_MODE\) return;/);
  assert.match(appSource, /window\.__otchlanPerf = probe;/);
  assert.match(appSource, /renderMapReasons: \{\}/);
  assert.match(appSource, /positionOnlyReasons: \{\}/);
  assert.match(appSource, /mobOnlyReasons: \{\}/);
  assert.match(appSource, /renderMapByReason: summarizePerfRecordsByReason\(probe\.renderMapRecords\)/);
  assert.match(appSource, /node\.id = "uiPerfReport";/);
  assert.match(appSource, /node\.textContent = JSON\.stringify\(probe\.report\(\)\);/);
  assert.match(appSource, /function recordUiRenderMapDuration\(startedAt, reason = "unknown"\) \{/);
  assert.match(appSource, /function recordUiPositionOnlyUpdate\(reason = "unknown"\) \{/);
  assert.match(appSource, /function recordUiMobOnlyUpdate\(reason = "unknown"\) \{/);
  assert.match(appSource, /recordUiRenderMapDuration\(renderStartedAt, reason\);/);
});

test("map renders process-memory mobs as a separate marker layer", () => {
  assert.match(appSource, /let currentGameMobs = \[\];/);
  assert.match(appSource, /let currentGameMobVisibilityKey = "";/);
  assert.match(appSource, /function updateGameMobs\(position = \{\}\) \{/);
  assert.match(appSource, /const visibilityKey = canRenderGameMobs\(\) \? "visible" : "hidden";/);
  assert.match(appSource, /function normalizeClientGameMobs\(mobs = \[\], areaFile = ""\) \{/);
  assert.match(appSource, /const worldKey = `\$\{areaFile\}:\$\{x\},\$\{y\},\$\{z\}`;/);
  assert.match(appSource, /const mobsChanged = updateGameMobs\(position\);/);
  assert.match(appSource, /if \(positionChanged \|\| layerChanged\) saveProject/);
  assert.match(appSource, /if \(mobsChanged && !renderMobOnlyMapUpdate\("memory-same-room-mobs"\)\)/);
  assert.match(appSource, /drawMobMarkers\(coords, worldRenderIds, cell, z\);/);
  assert.match(appSource, /function getMobMarkerLayer\(\) \{/);
  assert.match(appSource, /class: "mob-marker-layer"/);
  assert.match(appSource, /function renderMobOnlyMapUpdate\(reason = "mob-only"\) \{/);
  assert.match(appSource, /drawMobMarkers\(lastRenderedMapCoords, lastRenderedWorldRenderIds, lastRenderedMapCell, z\);/);
  assert.match(appSource, /recordUiMobOnlyUpdate\(reason\);/);
  assert.match(appSource, /function getRenderableMobs\(z\) \{/);
  assert.match(appSource, /if \(!canRenderGameMobs\(\)\) return \[\];/);
  assert.match(appSource, /function getPlayerVisibleMobWorldKeys\(\) \{/);
  assert.match(appSource, /for \(const direction of \["n", "e", "w", "s"\]\)/);
  assert.match(appSource, /for \(let distance = 0; distance < 4; distance \+= 1\)/);
  assert.match(appSource, /function isWorldSightOpen\(worldRoom, direction\) \{/);
  assert.match(appSource, /return mapDebugAll \|\| visibleMobWorldKeys\.has\(mob\.worldKey\);/);
  assert.match(appSource, /class: "mob-location-marker"/);
  assert.match(appSource, /const centerY = point\.y \+ cell - 12;/);
  assert.doesNotMatch(appSource, /const centerY = point\.y \+ 12;/);
  assert.match(appSource, /formatMobMarkerTitle\(mobs\)/);
  assert.match(cssSource, /\.mob-location-marker/);
  assert.match(cssSource, /\.mob-location-marker-count/);
});

test("mob markers use a different room slot than vertical level badges", () => {
  assert.match(appSource, /const centerX = point\.x \+ cell - 12;/);
  assert.match(appSource, /const centerY = point\.y \+ cell - 12;/);
  assert.match(appSource, /const y = point\.y \+ 6;/);
  assert.match(appSource, /class: `map-badge map-badge-\$\{badge\.kind\}`/);
});

test("mob layer respects darkness when player cannot look around", () => {
  assert.match(appSource, /position\.environment/);
  assert.match(appSource, /environment: position\.environment \|\| \{\}/);
  assert.match(appSource, /environment: nextStats\.environment/);
  assert.match(appSource, /function canObserveGameMobs\(\) \{/);
  assert.match(appSource, /return environment\.canObserveMobs !== false;/);
  assert.match(appSource, /activeConditions\.push\(\{ key: "darkness", name: "ciemność", level: "state" \}\);/);
  assert.match(appSource, /className: `active-effect condition-\$\{condition\.level \|\| "state"\} condition-\$\{condition\.key \|\| "custom"\}`/);
  assert.match(appSource, /function formatConditionStatusTitle\(condition = \{\}\) \{/);
  assert.match(appSource, /if \(condition\.key === "darkness"\) return "Ograniczona widocznosc: moby na mapie sa ukryte\.";/);
  assert.match(appSource, /darkness: "CIEMNOŚĆ"/);
  assert.match(cssSource, /\.active-effect\.condition-darkness/);
});

test("debug map discovery does not rename the map header", () => {
  assert.doesNotMatch(appSource, /mapTitle\.textContent = mapDebugAll \?/);
  assert.doesNotMatch(appSource, /Caly poziom|Ca.y poziom/);
});

test("map level changes use a crossfade overlay instead of player marker travel", () => {
  assert.match(htmlSource, /class="map-stage"[\s\S]*id="mapSvg"[\s\S]*id="mapPlayerLayer"[\s\S]*id="mapLevelTransitionOverlay"/);
  assert.match(appSource, /mapLevelTransitionOverlay: document\.querySelector\("#mapLevelTransitionOverlay"\)/);
  assert.match(appSource, /let lastRenderedMapLevel = null;/);
  assert.match(appSource, /const mapLevelChanged = Boolean\(previousMapLevel && Number\(previousMapLevel\.z\) !== Number\(z\)\)/);
  assert.match(appSource, /if \(mapLevelChanged\) startMapLevelTransition\(\{ fromZ: previousMapLevel\.z, toZ: z \}\);/);
  assert.match(appSource, /function startMapLevelTransition\(\{ fromZ, toZ \} = \{\}\) \{/);
  assert.match(appSource, /const oldMap = els\.mapSvg\.cloneNode\(true\);/);
  assert.match(appSource, /els\.mapLevelTransitionOverlay\.replaceChildren\(oldMap\);/);
  assert.match(appSource, /els\.mapSvg\.classList\.add\("map-level-transition-new-map"\)/);
  assert.match(appSource, /prefers-reduced-motion: reduce/);
  assert.match(appSource, /if \(pending\.fromZ !== pending\.toZ \|\| Number\(pending\.toZ\) !== Number\(z\)\) \{/);
  assert.match(appSource, /pendingPlayerTravelAnimation = null;\s*return;/);
  assert.match(cssSource, /\.map-level-transition-overlay/);
  assert.match(cssSource, /\.map-level-transition-old-map/);
  assert.match(cssSource, /#mapSvg\.map-level-transition-new-map/);
  assert.match(cssSource, /@keyframes map-level-old-fade-out/);
  assert.match(cssSource, /@keyframes map-level-new-fade-in/);
  assert.doesNotMatch(cssSource, /map-level-mist/);
  assert.doesNotMatch(appSource, /level-up|level-down/);
});

test("client autosaves user layer to the server every two minutes when dirty", () => {
  assert.match(appSource, /const SERVER_AUTOSAVE_MS = 120000;/);
  assert.match(appSource, /const SERVER_SAVE_DEBOUNCE_MS = 250;/);
  assert.match(appSource, /let serverSaveDirty = false;/);
  assert.doesNotMatch(appSource, /let serverPositionDirty = false;/);
  assert.match(appSource, /let serverSaveRevision = 0;/);
  assert.match(appSource, /function scheduleServerSave\(options = \{\}\) \{/);
  assert.match(appSource, /function initServerAutosave\(\) \{/);
  assert.match(appSource, /saveProjectToServer\(\)/);
  assert.match(appSource, /putJson\("\/api\/user-layer", payload\)/);
  assert.doesNotMatch(appSource, /patchJson\("\/api\/user-layer\/position", payload\)/);
  assert.match(appSource, /serverSaveDirty = true;/);
  assert.doesNotMatch(appSource, /serverPositionDirty = true;/);
  assert.match(appSource, /serverSaveRevision \+= 1;/);
  assert.match(appSource, /scheduleServerSave\(\{ immediate: Boolean\(options\.immediateServerSave\) \}\)/);
});

test("player movement does not save position-only mapper state", () => {
  assert.match(appSource, /saveProject\(\{ immediateServerSave: true, positionOnly: !layerChanged \}\);/);
  assert.match(appSource, /if \(options\.positionOnly\) return;/);
  assert.match(appSource, /if \(serverSaveDirty && serverSaveRevision > saveRevision\) scheduleServerSave\(\{ immediate: true \}\);/);
});

test("mapper layer export does not include player position", () => {
  assert.match(appSource, /function buildUserLayerExport\(\) \{/);
  const exportFunction = appSource.match(/function buildUserLayerExport\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(exportFunction, /playerWorldKey/);
  assert.doesNotMatch(exportFunction, /selectedWorldKey/);
  assert.doesNotMatch(exportFunction, /followPlayer/);
  assert.doesNotMatch(appSource, /function buildUserLayerPositionUpdate\(\) \{/);
});

test("server user-layer is the startup source of truth instead of browser local storage", () => {
  assert.match(appSource, /let project = createEmptyProject\(\);/);
  assert.match(appSource, /await loadProjectFromServer\(\{ silentMissing: true \}\);/);
  assert.doesNotMatch(appSource, /const STORAGE_KEY/);
  assert.doesNotMatch(appSource, /function loadProject\(\)/);
  assert.doesNotMatch(appSource, /localStorage\.setItem\(STORAGE_KEY/);
  assert.doesNotMatch(appSource, /localStorage\.getItem\(STORAGE_KEY/);
});
