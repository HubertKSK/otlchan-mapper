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
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer" && req\.method === "GET"/);
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer" && req\.method === "PUT"/);
  assert.match(serverSource, /url\.pathname === "\/api\/user-layer\/position" && req\.method === "PATCH"/);
  assert.match(serverSource, /async function sendUserLayer\(res\) \{/);
  assert.match(serverSource, /async function saveUserLayer\(payload\) \{/);
  assert.match(serverSource, /async function saveUserLayerPosition\(payload\) \{/);
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
