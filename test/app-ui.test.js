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

test("server map save controls are available from the app menu", () => {
  assert.match(htmlSource, /id="saveServerBtn"/);
  assert.match(htmlSource, /Zapisz na serwerze/);
  assert.match(htmlSource, /id="loadServerBtn"/);
  assert.match(htmlSource, /Wczytaj z serwera/);
});

test("file import and export are labeled as backups", () => {
  assert.match(htmlSource, /Eksportuj backup/);
  assert.match(htmlSource, /Importuj backup/);
  assert.match(appSource, /link\.download = "otchlan-map-backup\.json"/);
});

test("save, load, and backup actions show bottom-right toast feedback", () => {
  assert.match(htmlSource, /id="toastStack"/);
  assert.match(cssSource, /\.toast-stack[\s\S]*right: 16px;[\s\S]*bottom: 16px;/);
  assert.match(appSource, /function showToast\(message, type = "info"\)/);
  assert.match(appSource, /showToast\("Mapa zapisana na serwerze\.", "success"\)/);
  assert.match(appSource, /showToast\(loaded \? "Mapa wczytana z serwera\." : "Nie udalo sie wczytac mapy\."/);
  assert.match(appSource, /showToast\("Backup wyeksportowany\.", "success"\)/);
  assert.match(appSource, /showToast\("Backup zaimportowany\.", "success"\)/);
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
  assert.match(htmlSource, /id="toggleDescriptionBtn"/);
  assert.match(htmlSource, /class="setting-toggle"/);
  assert.match(htmlSource, /Opis lokacji/);
  assert.match(htmlSource, /class="toggle-switch"/);
  assert.match(htmlSource, /id="roomDescriptionField"[^>]*room-description-field/);
  assert.match(appSource, /const DESCRIPTION_VISIBLE_KEY = "otchlan-automapper-description-visible";/);
  assert.match(appSource, /function applySavedDescriptionVisibility\(\)/);
  assert.match(appSource, /function setDescriptionVisibility\(visible, options = \{\}\)/);
  assert.match(appSource, /setDescriptionVisibility\(!descriptionVisible\)/);
  assert.match(appSource, /classList\.toggle\("is-on", descriptionVisible\)/);
  assert.match(cssSource, /\.description-hidden \.room-description-field/);
  assert.match(cssSource, /\.toggle-switch::after/);
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
  assert.match(appSource, /function createPlayerLocationMarker\(point, cell, extraClass = ""\)/);
  assert.match(appSource, /createPlayerLocationMarker\(previous, cell, "player-travel-marker-moving"\)/);
  assert.match(appSource, /function animateSvgMarkerTravel\(marker, fromX, fromY, toX, toY, duration\)/);
  assert.match(appSource, /marker\.setAttribute\("transform", `translate\(\$\{x\}, \$\{y\}\)`\)/);
  assert.match(appSource, /let playerTravelAnimationId = 0;/);
  assert.match(appSource, /els\.mapSvg\.classList\.add\("player-marker-animating"\)/);
  assert.match(cssSource, /\.player-marker-animating \.room-node\.current \.player-location-marker:not\(\.player-travel-marker-moving\)/);
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

test("debug map discovery does not rename the map header", () => {
  assert.doesNotMatch(appSource, /mapTitle\.textContent = mapDebugAll \?/);
  assert.doesNotMatch(appSource, /Caly poziom|Ca.y poziom/);
});

test("map level changes use a crossfade overlay instead of player marker travel", () => {
  assert.match(htmlSource, /class="map-stage"[\s\S]*id="mapSvg"[\s\S]*id="mapLevelTransitionOverlay"/);
  assert.match(appSource, /mapLevelTransitionOverlay: document\.querySelector\("#mapLevelTransitionOverlay"\)/);
  assert.match(appSource, /let lastRenderedMapLevel = null;/);
  assert.match(appSource, /const mapLevelChanged = Boolean\(previousMapLevel && Number\(previousMapLevel\.z\) !== Number\(z\)\)/);
  assert.match(appSource, /if \(mapLevelChanged\) startMapLevelTransition\(\{ fromZ: previousMapLevel\.z, toZ: z \}\);/);
  assert.match(appSource, /function startMapLevelTransition\(\{ fromZ, toZ \} = \{\}\) \{/);
  assert.match(appSource, /const oldMap = els\.mapSvg\.cloneNode\(true\);/);
  assert.match(appSource, /els\.mapLevelTransitionOverlay\.replaceChildren\(oldMap\);/);
  assert.match(appSource, /els\.mapSvg\.classList\.add\("map-level-transition-new-map"\)/);
  assert.match(appSource, /prefers-reduced-motion: reduce/);
  assert.match(appSource, /if \(previous\.z !== current\.z \|\| previous\.area !== current\.area\) return;/);
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
