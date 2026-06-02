import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("terminal keeps only a small technical scrollback", () => {
  assert.match(appSource, /const TERMINAL_SCROLLBACK_LINES = 200;/);
  assert.match(appSource, /scrollback: TERMINAL_SCROLLBACK_LINES/);
});

test("process memory position is the only mapper position sync", () => {
  assert.match(appSource, /source\.addEventListener\("game-position", \(event\) => receiveGameMemoryPosition\(JSON\.parse\(event\.data\)\)\);/);
  assert.match(appSource, /function applyGameMemoryPosition\(position = \{\}\) \{/);
  assert.match(appSource, /const worldRoom = worldRoomsByKey\.get\(worldKey\);/);
  assert.match(appSource, /ensureProjectRoomForWorldRoom\(worldRoom, \{\}\)/);
  assert.match(appSource, /logMapper\("game-position-memory-applied"/);
  assert.match(appSource, /saveProject\(\{ immediateServerSave: true, positionOnly: !layerChanged \}\);/);
});

test("refresh waits for process memory before showing player position", () => {
  assert.match(appSource, /let playerPositionKnown = false;/);
  assert.match(appSource, /let pendingGameMemoryPosition = null;/);
  assert.match(appSource, /function receiveGameMemoryPosition\(position = \{\}\) \{/);
  assert.match(appSource, /if \(!worldRoomsByKey\.size\) \{[\s\S]*pendingGameMemoryPosition = position;[\s\S]*return;/);
  assert.match(appSource, /function applyPendingGameMemoryPosition\(\) \{/);
  assert.match(appSource, /applyPendingGameMemoryPosition\(\);/);
  assert.match(appSource, /function shouldShowWaitingForPlayerPosition\(\) \{/);
  assert.match(appSource, /Pozycja postaci nieznana/);
  assert.match(appSource, /if \(!playerPositionKnown\) return null;/);
  assert.match(appSource, /playerPositionKnown && item\.id === playerRoomId/);
});

test("terminal output no longer drives mapper position", () => {
  assert.match(appSource, /term\.write\(text\);/);
  assert.doesNotMatch(appSource, /processTerminalText/);
  assert.doesNotMatch(appSource, /processTerminalSnapshot/);
  assert.doesNotMatch(appSource, /readRoomObservationsFromTerminal/);
  assert.doesNotMatch(appSource, /rememberCoordinateVerification/);
});

test("client does not parse or capture terminal input commands", () => {
  assert.match(appSource, /term\.onData\(\(data\) => \{[\s\S]*sendQueuedGameInput\(data\);[\s\S]*\}\);/);
  assert.doesNotMatch(appSource, /trackLocalCommandInput/);
  assert.doesNotMatch(appSource, /rememberCapturedPlayerCommand/);
  assert.doesNotMatch(appSource, /game-command-diagnostic-only/);
  assert.doesNotMatch(appSource, /rememberPlayerCommand/);
  assert.doesNotMatch(appSource, /rememberGameCommand/);
  assert.doesNotMatch(appSource, /applyCommandToMap/);
  assert.doesNotMatch(appSource, /parseMovementCommand/);
  assert.doesNotMatch(appSource, /atlas-travel-applied/);
  assert.doesNotMatch(appSource, /queued-travel/);
});

test("memory sync can infer adjacent map links without trusting commands", () => {
  assert.match(appSource, /function inferAdjacentWorldDirection\(fromWorldRoom, toWorldRoom\) \{/);
  assert.match(appSource, /for \(const \[direction, vector\] of Object\.entries\(DIRECTIONS\)\)/);
  assert.match(appSource, /connectRooms\(project, previousRoom\.id, room\.id, inferredDirection\);/);
});

test("terminal footer renders process-memory character vitals", () => {
  assert.match(htmlSource, /id="characterVitals"/);
  assert.match(htmlSource, /id="hpValue"/);
  assert.match(htmlSource, /id="manaValue"/);
  assert.match(htmlSource, /id="mvValue"/);
  assert.match(htmlSource, /id="goldValue"/);
  assert.match(htmlSource, /id="goldBankValue"/);
  assert.match(htmlSource, /id="levelValue"/);
  assert.doesNotMatch(htmlSource, /id="expValue"/);
  assert.match(htmlSource, /id="expBar"/);
  assert.match(htmlSource, /id="gameTimeValue"/);
  assert.match(htmlSource, /id="journeyDayValue"/);
  assert.match(htmlSource, /id="activeEffectsList"/);
  assert.match(cssSource, /\.character-vitals/);
  assert.match(cssSource, /\.active-effects/);
  assert.match(cssSource, /\.game-time/);
  assert.match(cssSource, /\.active-effect\.condition-warning/);
  assert.match(cssSource, /\.stat-change/);
  assert.match(cssSource, /@keyframes stat-change-float/);
  assert.match(appSource, /function applyGameMemoryStats\(position = \{\}\) \{/);
  assert.match(appSource, /function showCharacterStatChanges\(previous, current\) \{/);
  assert.match(appSource, /function showStatChange\(target, delta, label = ""\) \{/);
  assert.match(appSource, /renderVitalMeter\("hp", vitals\.hp, vitals\.hpMax\);/);
  assert.match(appSource, /els\.goldValue\.textContent = formatInteger\(economy\.gold\);/);
  assert.match(appSource, /els\.goldBankValue\.textContent = formatInteger\(economy\.goldBank\);/);
  assert.match(appSource, /els\.levelValue\.textContent = economy\.level > 0 \? formatInteger\(economy\.level\) : "--";/);
  assert.match(appSource, /function renderGameTime\(time = \{\}\) \{/);
  assert.match(appSource, /els\.gameTimeValue\.textContent/);
  assert.match(appSource, /els\.journeyDayValue\.textContent/);
  assert.match(appSource, /function renderExpMeter\(economy = \{\}\) \{/);
  assert.doesNotMatch(appSource, /expValue/);
  assert.match(appSource, /function renderActiveEffects\(effects = \[\], conditions = \[\]\) \{/);
  assert.match(appSource, /function formatConditionStatusName\(condition = \{\}\) \{/);
});

test("debug map renders only rooms near current viewport", () => {
  assert.match(appSource, /function getMapGridRenderWindow\(cell, paddingCells = 2\) \{/);
  assert.match(appSource, /function isMapItemInRenderWindow\(item, window\) \{/);
  assert.match(appSource, /allMapItems\.filter\(\(item\) => isMapItemInRenderWindow\(item, debugRenderWindow\)\)/);
  assert.match(appSource, /getDebugWorldBaseRooms\(z, canCullDebugSourceRooms \? debugRenderWindow : null\)/);
  assert.match(appSource, /function scheduleDebugMapViewportRender\(\) \{/);
  assert.match(appSource, /scheduleDebugMapViewportRender\(\);/);
  assert.match(appSource, /for \(const worldKey of worldRenderIds\.keys\(\)\)/);
});

test("desync light and lost-state code are removed from the client", () => {
  assert.doesNotMatch(appSource, /atlasDesyncPending/);
  assert.doesNotMatch(appSource, /pendingLocationAudit/);
  assert.doesNotMatch(appSource, /pendingDesyncMovement/);
  assert.doesNotMatch(htmlSource, /atlasSyncBtn/);
  assert.doesNotMatch(cssSource, /atlas-sync/);
});
