import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

test("server defaults to the standard Otchlan 1.3 install directory", () => {
  assert.match(serverSource, /const DEFAULT_GAME_DIR = "C:\\\\Program Files \(x86\)\\\\Otchlan 1\.3";/);
  assert.match(serverSource, /const GAME_DIR = process\.env\.OTCHLAN_DIR \|\| DEFAULT_GAME_DIR;/);
  assert.match(serverSource, /Domyslnie szukam w \$\{DEFAULT_GAME_DIR\}/);
});

test("server exposes user-layer save and load endpoints", () => {
  assert.match(serverSource, /const USER_LAYER_FILE = path\.join\(__dirname, "user-layer\.json"\);/);
  assert.match(serverSource, /const USER_LAYER_DEMO_FILE = path\.join\(__dirname, "user-layer-demo\.json"\);/);
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer" && req\.method === "GET"/);
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer-demo" && req\.method === "GET"/);
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer" && req\.method === "PUT"/);
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer\/position" && req\.method === "PATCH"/);
  assert.match(serverSource, /async function sendUserLayer\(res\) \{/);
  assert.match(serverSource, /async function sendJsonFile\(res, file, fallback\) \{/);
  assert.match(serverSource, /async function saveUserLayer\(payload\) \{/);
  assert.match(serverSource, /async function saveUserLayerPosition\(payload\) \{/);
});

test("server exposes GitHub release update status endpoint", () => {
  assert.match(serverSource, /import \{ compareSemver, normalizeVersionTag \} from "\.\/app-update\.js";/);
  assert.match(serverSource, /const GITHUB_REPO = "HubertKSK\/otchlan-mapper";/);
  assert.match(serverSource, /const GITHUB_LATEST_RELEASE_URL = `https:\/\/api\.github\.com\/repos\/\$\{GITHUB_REPO\}\/releases\/latest`;/);
  assert.match(serverSource, /const UPDATE_STATUS_CACHE_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.match(serverSource, /let updateStatusCache = null;/);
  assert.match(serverSource, /url\.pathname === "\/api\/app\/update-status"/);
  assert.match(serverSource, /async function getAppUpdateStatus\(options = \{\}\) \{/);
  assert.match(serverSource, /fetchLatestGithubRelease\(options\.fetchImpl \|\| fetch\)/);
  assert.match(serverSource, /compareSemver\(latestVersion, APP_VERSION\) > 0/);
  assert.match(serverSource, /releaseUrl: release\.html_url \|\| `https:\/\/github\.com\/\$\{GITHUB_REPO\}\/releases\/latest`/);
  assert.match(serverSource, /error: String\(error\?\.message \|\| error\)/);
});

test("server exposes world extraction and atlas build endpoints", () => {
  assert.match(serverSource, /const PACKAGE_JSON = JSON\.parse\(readFileSync\(path\.join\(__dirname, "package\.json"\), "utf8"\)\);/);
  assert.match(serverSource, /const APP_VERSION = String\(PACKAGE_JSON\.version \|\| "0\.0\.0"\);/);
  assert.match(serverSource, /const WORLD_CACHE_FILE = path\.join\(__dirname, "world-cache\.json"\);/);
  assert.match(serverSource, /const WORLD_ATLAS_FILE = path\.join\(__dirname, "world-atlas\.json"\);/);
  assert.match(serverSource, /url\.pathname === "\/api\/world\/status"/);
  assert.match(serverSource, /url\.pathname === "\/api\/world\/extract" && req\.method === "POST"/);
  assert.match(serverSource, /url\.pathname === "\/api\/world\/atlas" && req\.method === "POST"/);
  assert.match(serverSource, /async function getWorldBuildStatus/);
  assert.match(serverSource, /async function runWorldBuildStep\(step\)/);
  assert.match(serverSource, /spawnProcess\(process\.execPath, \[script\]/);
  assert.match(serverSource, /world-build-step-finished/);
  assert.match(serverSource, /validateWorldFileVersion\(payload, label\);/);
  assert.match(serverSource, /error: "world-file-version-mismatch"/);
  assert.match(serverSource, /ready: cache\.ready && atlas\.ready/);
});

test("server prefers packaged memory reader before development build output", () => {
  assert.match(serverSource, /const OTCHLAN_RELEASE_POSITION_READER = path\.join\(__dirname, "bin", "OtchlanMemoryReader\.exe"\);/);
  assert.match(serverSource, /const OTCHLAN_DEV_POSITION_READER = path\.join\(__dirname, "src", "OtchlanMemoryReader", "bin", "Release", "net8\.0", "OtchlanMemoryReader\.exe"\);/);
  assert.match(serverSource, /function getNativePositionReaderPath\(\) \{/);
  assert.match(serverSource, /for \(const candidate of \[OTCHLAN_RELEASE_POSITION_READER, OTCHLAN_DEV_POSITION_READER\]\)/);
});

test("server writes root error log and returns json server errors", () => {
  assert.match(serverSource, /const SERVER_LOG_FILE = path\.join\(__dirname, "server\.log"\);/);
  assert.match(serverSource, /const LOG_SCHEMA = "otchlan-log-v1";/);
  assert.match(serverSource, /const LOG_ROTATE_MAX_BYTES = Number\(process\.env\.OTCHLAN_LOG_MAX_BYTES \|\| 1024 \* 1024\);/);
  assert.match(serverSource, /const LOG_ROTATE_KEEP = Number\(process\.env\.OTCHLAN_LOG_KEEP \|\| 5\);/);
  assert.match(serverSource, /event: "server-start"/);
  assert.match(serverSource, /port: PORT/);
  assert.match(serverSource, /gameDir: GAME_DIR/);
  assert.match(serverSource, /pid: process\.pid/);
  assert.match(serverSource, /await handleRequest\(req, res\);/);
  assert.match(serverSource, /await writeServerErrorLog\(error, req\)/);
  assert.match(serverSource, /function sendServerError\(res, error\) \{/);
  assert.match(serverSource, /sendJson\(res, \{[\s\S]*error: "server-error"[\s\S]*\}, 500\)/);
  assert.match(serverSource, /async function writeServerErrorLog\(error, req\) \{/);
  assert.match(serverSource, /async function writeServerLog\(record\) \{/);
  assert.match(serverSource, /async function writeJsonLog\(file, record\) \{/);
  assert.match(serverSource, /async function rotateLogFileIfNeeded\(file\) \{/);
  assert.match(serverSource, /schema: LOG_SCHEMA/);
  assert.match(serverSource, /at: new Date\(\)\.toISOString\(\)/);
  assert.match(serverSource, /await rotateLogFileIfNeeded\(file\);/);
  assert.match(serverSource, /appendFile\(file, `\$\{JSON\.stringify\(\{[\s\S]*\.\.\.record[\s\S]*\}\)\}\\n`, "utf8"\)/);
  assert.match(serverSource, /renameWithWindowsRetry\(file, first\)/);
});

test("server disables browser cache for local static files", () => {
  assert.match(serverSource, /"Cache-Control": "no-store"/);
});

test("server validates and atomically writes user-layer payloads", () => {
  assert.match(serverSource, /payload\?\.schema !== "otchlan-user-layer"/);
  assert.match(serverSource, /invalid-user-layer/);
  assert.match(serverSource, /function queueUserLayerWrite\(operation\) \{/);
  assert.match(serverSource, /async function writeJsonFileAtomic\(file, body\) \{/);
  assert.match(serverSource, /writeFile\(tempFile, body, "utf8"\)/);
  assert.match(serverSource, /renameWithWindowsRetry\(tempFile, file\)/);
  assert.match(serverSource, /async function renameWithWindowsRetry\(from, to\) \{/);
  assert.match(serverSource, /new Set\(\["EPERM", "EACCES", "EBUSY"\]\)/);
});

test("server position update only persists player world key", () => {
  assert.match(serverSource, /schema !== "otchlan-user-layer-position"/);
  assert.match(serverSource, /layer\.playerWorldKey = payload\.playerWorldKey;/);
  assert.doesNotMatch(serverSource, /layer\.selectedWorldKey = payload\.selectedWorldKey/);
  assert.doesNotMatch(serverSource, /layer\.followPlayer = payload\.followPlayer/);
  assert.match(serverSource, /positionOnly: true/);
});
