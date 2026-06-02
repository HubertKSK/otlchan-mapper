import { createServer } from "node:http";
import { spawn as spawnProcess } from "node:child_process";
import pty from "@homebridge/node-pty-prebuilt-multiarch";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_GAME_DIR = "C:\\Program Files (x86)\\Otchlan 1.3";
const GAME_DIR = process.env.OTCHLAN_DIR || DEFAULT_GAME_DIR;
const PORT = Number(process.env.PORT || 5173);
const LOG_DIR = path.join(__dirname, "logs");
const SERVER_LOG_FILE = path.join(__dirname, "server.log");
const APP_LOG_FILE = path.join(LOG_DIR, "automapper.log");
const LOG_SCHEMA = "otchlan-log-v1";
const LOG_ROTATE_MAX_BYTES = Number(process.env.OTCHLAN_LOG_MAX_BYTES || 1024 * 1024);
const LOG_ROTATE_KEEP = Number(process.env.OTCHLAN_LOG_KEEP || 5);
const WORLD_CACHE_FILE = path.join(__dirname, "world-cache.json");
const WORLD_ATLAS_FILE = path.join(__dirname, "world-atlas.json");
const USER_LAYER_FILE = path.join(__dirname, "user-layer.json");
const USER_LAYER_DEMO_FILE = path.join(__dirname, "user-layer-demo.json");
const DEBUG_ENABLED = process.argv.includes("--debug") || isTruthyEnv(process.env.OTCHLAN_DEBUG) || isTruthyEnv(process.env.DEBUG_TERMINAL);
const TERMINAL_DEBUG_FILE = path.join(LOG_DIR, "terminal-output-debug.jsonl");
const OTCHLAN_POSITION_READER = path.join(__dirname, "scripts", "read-otchlan-position.ps1");
const OTCHLAN_RELEASE_POSITION_READER = path.join(__dirname, "bin", "OtchlanMemoryReader.exe");
const OTCHLAN_DEV_POSITION_READER = path.join(__dirname, "src", "OtchlanMemoryReader", "bin", "Release", "net8.0", "OtchlanMemoryReader.exe");
const OTCHLAN_POSITION_POLL_MS = Number(process.env.OTCHLAN_POSITION_POLL_MS || 100);
const OTCHLAN_MOB_POLL_MS = Number(process.env.OTCHLAN_MOB_POLL_MS || 1000);
const GAME_POSITION_LOG_INTERVAL_MS = Number(process.env.OTCHLAN_POSITION_LOG_INTERVAL_MS || 5000);
const DEFAULT_TERMINAL_COLS = Number(process.env.OTCHLAN_TERMINAL_COLS || 120);
const TERMINAL_ROWS = Number(process.env.OTCHLAN_TERMINAL_ROWS || 48);

const clients = new Set();
const watchedDirs = new Map();
const trackedFiles = new Map();
const recentLines = [];
let gameProcess = null;
let userLayerWriteQueue = Promise.resolve();
let logWriteQueue = Promise.resolve();
let memoryReaderProcess = null;
let memoryReaderBuffer = "";
let lastGamePosition = null;
let lastGamePositionLogSignature = "";
let lastGamePositionLogAt = 0;
let worldBuildTask = null;
let terminalSize = {
  cols: DEFAULT_TERMINAL_COLS,
  rows: TERMINAL_ROWS
};
const gameOutput = [];
const gameState = {
  running: false,
  pid: null,
  exitCode: null,
  message: "Gra nie jest uruchomiona w aplikacji."
};
const mapperState = {
  activeInstanceId: null,
  reason: "",
  at: null
};
const debugState = {
  enabled: DEBUG_ENABLED,
  terminalRecording: false,
  terminalOutputFile: TERMINAL_DEBUG_FILE
};
const status = {
  gameDir: GAME_DIR,
  activeFiles: [],
  lastLineAt: null,
  lastScanAt: null,
  message: "Szukam logow Otchlani..."
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    await writeServerErrorLog(error, req).catch((logError) => {
      console.error("[server:error] failed to write server.log", logError);
    });
    console.error("[server:error]", error);
    sendServerError(res, error);
  }
});

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    const client = { res };
    clients.add(client);
    sendEvent(client, "status", status);
    sendEvent(client, "game-status", gameState);
    sendEvent(client, "mapper-active", mapperState);
    if (lastGamePosition) sendEvent(client, "game-position", lastGamePosition);
    sendEvent(client, "terminal-output-history-v3", gameOutput);
    sendEvent(client, "recent-lines", recentLines);
    writeServerLog({
      level: "info",
      event: "sse-client-connected",
      clients: clients.size
    }).catch((error) => console.error("[server:error] failed to write sse log", error));
    req.on("close", () => {
      clients.delete(client);
      writeServerLog({
        level: "info",
        event: "sse-client-disconnected",
        clients: clients.size
      }).catch((error) => console.error("[server:error] failed to write sse log", error));
    });
    return;
  }

  if (url.pathname === "/api/status") {
    sendJson(res, status);
    return;
  }

  if (url.pathname === "/api/world-cache") {
    await sendWorldCache(res);
    return;
  }

  if (url.pathname === "/api/world-atlas") {
    await sendWorldAtlas(res);
    return;
  }

  if (url.pathname === "/api/world/status") {
    sendJson(res, await getWorldBuildStatus());
    return;
  }

  if (url.pathname === "/api/world/extract" && req.method === "POST") {
    sendJson(res, await runWorldBuildStep("extract"));
    return;
  }

  if (url.pathname === "/api/world/atlas" && req.method === "POST") {
    sendJson(res, await runWorldBuildStep("atlas"));
    return;
  }

  if (url.pathname === "/api/user-layer" && req.method === "GET") {
    await sendUserLayer(res);
    return;
  }

  if (url.pathname === "/api/user-layer-demo" && req.method === "GET") {
    await sendJsonFile(res, USER_LAYER_DEMO_FILE, {
      message: "user-layer-demo.json nie istnieje jeszcze."
    });
    return;
  }

  if (url.pathname === "/api/user-layer" && req.method === "PUT") {
    const body = await readJsonBody(req);
    const result = await saveUserLayer(body);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/user-layer/position" && req.method === "PATCH") {
    const body = await readJsonBody(req);
    const result = await saveUserLayerPosition(body);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/log-files") {
    sendJson(res, Array.from(trackedFiles.values()).map((item) => ({
      path: item.file,
      size: item.size,
      offset: item.offset
    })));
    return;
  }

  if (url.pathname === "/api/game/status") {
    sendJson(res, gameState);
    return;
  }

  if (url.pathname === "/api/debug/status") {
    sendJson(res, getDebugStatus());
    return;
  }

  if (url.pathname === "/api/debug/terminal-recording" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = await setTerminalDebugRecording(Boolean(body?.recording));
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/game/output") {
    sendJson(res, gameOutput);
    return;
  }

  if (url.pathname === "/api/game/start" && req.method === "POST") {
    const body = await readJsonBody(req);
    claimMapper(body?.instanceId, "start-game");
    const result = startGame(body?.args);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/game/command" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = sendGameCommand(body?.command);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/game/input" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = sendGameInput(body?.data, body?.instanceId);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/game/resize" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = resizeGameTerminal(body?.cols, body?.rows);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/mapper/claim" && req.method === "POST") {
    const body = await readJsonBody(req);
    const result = claimMapper(body?.instanceId, body?.reason);
    sendJson(res, result);
    return;
  }

  if (url.pathname === "/api/app-log" && req.method === "POST") {
    const body = await readJsonBody(req);
    await writeAppLog(body);
    sendJson(res, { ok: true });
    return;
  }

  if (url.pathname === "/api/game/stop" && req.method === "POST") {
    const result = stopGame();
    sendJson(res, result);
    return;
  }

  const safePath = normalizeStaticPath(url.pathname);
  const baseDir = safePath.startsWith("vendor/") ? path.join(__dirname, "node_modules") : PUBLIC_DIR;
  const filePath = path.join(baseDir, safePath.startsWith("vendor/") ? safePath.replace(/^vendor\//, "") : safePath);
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

server.listen(PORT, () => {
  console.log(`Otchlan Mapper: http://localhost:${PORT}`);
  console.log(`Watching: ${GAME_DIR}`);
  writeServerLog({
    level: "info",
    event: "server-start",
    port: PORT,
    gameDir: GAME_DIR,
    pid: process.pid
  }).catch((error) => console.error("[server:error] failed to write server.log", error));
});

await startWatcher();

async function startWatcher() {
  if (!existsSync(GAME_DIR)) {
    updateStatus({ message: `Nie znaleziono katalogu gry. Domyslnie szukam w ${DEFAULT_GAME_DIR}. Jesli gra jest gdzie indziej, ustaw OTCHLAN_DIR i zrestartuj aplikacje.` });
    setInterval(scanForLogs, 4000);
    return;
  }

  await scanForLogs();
  watchDirectory(GAME_DIR);
  watchDirectory(path.join(GAME_DIR, "dat"));
  watchDirectory(path.join(GAME_DIR, "zapisy"));
  setInterval(scanForLogs, 2500);
  setInterval(pollTrackedFiles, 800);
}

function normalizeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  if (decoded === "/") return "index.html";
  return decoded.replace(/^\/+/, "");
}

function sendJson(res, payload, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function sendWorldCache(res) {
  try {
    const body = await readFile(WORLD_CACHE_FILE, "utf8");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: false,
      message: "world-cache.json nie istnieje. Uruchom npm.cmd run world:extract."
    }));
  }
}

async function sendWorldAtlas(res) {
  try {
    const body = await readFile(WORLD_ATLAS_FILE, "utf8");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: false,
      message: "world-atlas.json nie istnieje. Uruchom npm.cmd run world:atlas."
    }));
  }
}

async function getWorldBuildStatus(extra = {}) {
  const [cache, atlas] = await Promise.all([
    getLocalFileStatus(WORLD_CACHE_FILE),
    getLocalFileStatus(WORLD_ATLAS_FILE)
  ]);
  return {
    ok: true,
    gameDir: GAME_DIR,
    cache,
    atlas,
    ready: cache.exists && atlas.exists,
    busy: Boolean(worldBuildTask),
    runningStep: worldBuildTask?.step || null,
    ...extra
  };
}

async function getLocalFileStatus(file) {
  try {
    const info = await stat(file);
    return {
      exists: true,
      file: path.relative(__dirname, file),
      bytes: info.size,
      updatedAt: info.mtime.toISOString()
    };
  } catch {
    return {
      exists: false,
      file: path.relative(__dirname, file),
      bytes: 0,
      updatedAt: null
    };
  }
}

async function runWorldBuildStep(step) {
  if (worldBuildTask) {
    return {
      ok: false,
      error: "world-build-busy",
      message: `Trwa juz operacja: ${worldBuildTask.step}.`
    };
  }
  const scripts = {
    extract: path.join(__dirname, "scripts", "extract-world.mjs"),
    atlas: path.join(__dirname, "scripts", "build-world-atlas.mjs")
  };
  const script = scripts[step];
  if (!script) {
    return { ok: false, error: "unknown-world-build-step", message: "Nieznany krok przygotowania atlasu." };
  }
  worldBuildTask = { step, startedAt: new Date().toISOString() };
  try {
    const result = await runNodeScript(script, step);
    worldBuildTask = null;
    const status = await getWorldBuildStatus({ lastRun: result });
    return status;
  } finally {
    worldBuildTask = null;
  }
}

async function runNodeScript(script, step) {
  return await new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [script], {
      cwd: __dirname,
      env: process.env,
      windowsHide: true
    });
    const startedAt = new Date().toISOString();
    let stdout = "";
    let stderr = "";
    const appendOutput = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      return next.length > 12000 ? next.slice(-12000) : next;
    };
    child.stdout?.on("data", (chunk) => { stdout = appendOutput(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = appendOutput(stderr, chunk); });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      const finishedAt = new Date().toISOString();
      const record = {
        event: "world-build-step-finished",
        step,
        code,
        startedAt,
        finishedAt,
        stdout: stdout.trim().slice(-3000),
        stderr: stderr.trim().slice(-3000)
      };
      writeServerLog(record).catch((error) => console.error("[server:error] failed to write world build log", error));
      if (code === 0) {
        resolve({
          ok: true,
          step,
          code,
          startedAt,
          finishedAt,
          stdout: stdout.trim().slice(-3000),
          stderr: stderr.trim().slice(-3000)
        });
        return;
      }
      const error = new Error(`Krok ${step} zakonczyl sie kodem ${code}.`);
      error.payload = { ok: false, step, code, stdout, stderr };
      reject(error);
    });
  });
}

async function sendUserLayer(res) {
  await sendJsonFile(res, USER_LAYER_FILE, {
    message: "user-layer.json nie istnieje jeszcze. Zapisz mape na serwerze."
  });
}

async function sendJsonFile(res, file, fallback) {
  try {
    const body = await readFile(file, "utf8");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: false,
      ...fallback
    }));
  }
}

async function saveUserLayer(payload) {
  if (payload?.schema !== "otchlan-user-layer" || !Array.isArray(payload.rooms)) {
    return { ok: false, error: "invalid-user-layer" };
  }
  return queueUserLayerWrite(async () => {
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({
      ...payload,
      savedAt
    }, null, 2);
    await writeJsonFileAtomic(USER_LAYER_FILE, body);
    return {
      ok: true,
      savedAt,
      file: path.relative(__dirname, USER_LAYER_FILE),
      bytes: Buffer.byteLength(body, "utf8")
    };
  });
}

async function saveUserLayerPosition(payload) {
  if (payload?.schema !== "otchlan-user-layer-position" || typeof payload.playerWorldKey !== "string") {
    return { ok: false, error: "invalid-user-layer-position" };
  }

  return queueUserLayerWrite(async () => {
    let layer;
    try {
      layer = JSON.parse(await readFile(USER_LAYER_FILE, "utf8"));
    } catch {
      return { ok: false, error: "missing-user-layer" };
    }
    if (layer?.schema !== "otchlan-user-layer" || !Array.isArray(layer.rooms)) {
      return { ok: false, error: "invalid-user-layer" };
    }

    const savedAt = new Date().toISOString();
    layer.playerWorldKey = payload.playerWorldKey;
    layer.positionSavedAt = savedAt;
    layer.savedAt = savedAt;

    const body = JSON.stringify(layer, null, 2);
    await writeJsonFileAtomic(USER_LAYER_FILE, body);
    return {
      ok: true,
      savedAt,
      file: path.relative(__dirname, USER_LAYER_FILE),
      bytes: Buffer.byteLength(body, "utf8"),
      positionOnly: true
    };
  });
}

function queueUserLayerWrite(operation) {
  const run = userLayerWriteQueue.then(operation, operation);
  userLayerWriteQueue = run.catch(() => {});
  return run;
}

async function writeJsonFileAtomic(file, body) {
  const tempFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await writeFile(tempFile, body, "utf8");
    await renameWithWindowsRetry(tempFile, file);
  } catch (error) {
    await rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function renameWithWindowsRetry(from, to) {
  const retryCodes = new Set(["EPERM", "EACCES", "EBUSY"]);
  const delays = [25, 50, 100, 200, 400, 800];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (!retryCodes.has(error?.code) || attempt >= delays.length) throw error;
      await delay(delays[attempt]);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTruthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function getDebugStatus() {
  return {
    enabled: debugState.enabled,
    terminalRecording: debugState.terminalRecording,
    terminalOutputFile: path.relative(__dirname, debugState.terminalOutputFile)
  };
}

async function setTerminalDebugRecording(recording) {
  if (!debugState.enabled) {
    return { ok: false, error: "debug-disabled", ...getDebugStatus() };
  }
  debugState.terminalRecording = recording;
  await writeTerminalDebugMarker(recording ? "recording-started" : "recording-stopped");
  return { ok: true, ...getDebugStatus() };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function broadcast(type, payload) {
  for (const client of clients) sendEvent(client, type, payload);
}

function sendEvent(client, type, payload) {
  client.res.write(`event: ${type}\n`);
  client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendServerError(res, error) {
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, {
    ok: false,
    error: "server-error",
    message: String(error?.message || error || "Blad serwera.")
  }, 500);
}

async function writeServerErrorLog(error, req) {
  await writeServerLog({
    level: "error",
    event: "server-error",
    method: req?.method || "",
    url: req?.url || "",
    message: String(error?.message || error || "server-error"),
    code: error?.code || "",
    stack: error?.stack || ""
  });
}

async function writeServerLog(record) {
  await writeJsonLog(SERVER_LOG_FILE, {
    source: "server",
    ...record
  });
}

async function writeJsonLog(file, record) {
  logWriteQueue = logWriteQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await rotateLogFileIfNeeded(file);
      await appendFile(file, `${JSON.stringify({
        schema: LOG_SCHEMA,
        at: new Date().toISOString(),
        level: String(record.level || "info"),
        source: String(record.source || "server"),
        event: String(record.event || "log"),
        ...record
      })}\n`, "utf8");
    });
  return logWriteQueue;
}

async function rotateLogFileIfNeeded(file) {
  const maxBytes = Math.max(1024, LOG_ROTATE_MAX_BYTES);
  const keep = Math.max(1, LOG_ROTATE_KEEP);
  let info = null;
  try {
    info = await stat(file);
  } catch {
    return;
  }
  if (!info.isFile() || info.size < maxBytes) return;

  for (let index = keep - 1; index >= 1; index -= 1) {
    const from = `${file}.${index}`;
    const to = `${file}.${index + 1}`;
    if (!existsSync(from)) continue;
    await rm(to, { force: true }).catch(() => {});
    await renameWithWindowsRetry(from, to).catch(() => {});
  }
  const first = `${file}.1`;
  await rm(first, { force: true }).catch(() => {});
  await renameWithWindowsRetry(file, first).catch(() => {});
}

function updateStatus(patch) {
  Object.assign(status, patch, {
    activeFiles: Array.from(trackedFiles.keys()),
    lastScanAt: new Date().toISOString()
  });
  broadcast("status", status);
}

function updateGameState(patch) {
  Object.assign(gameState, patch);
  broadcast("game-status", gameState);
}

function claimMapper(instanceId, reason = "claim") {
  const id = String(instanceId || "").trim();
  if (!id) return { ok: false, error: "missing-instance-id", state: mapperState };
  mapperState.activeInstanceId = id;
  mapperState.reason = String(reason || "claim");
  mapperState.at = new Date().toISOString();
  broadcast("mapper-active", mapperState);
  return { ok: true, state: mapperState };
}

async function writeAppLog(entry = {}) {
  const record = {
    source: "mapper-ui",
    level: String(entry.level || "info"),
    event: String(entry.event || "app"),
    instanceId: String(entry.instanceId || entry.details?.instanceId || ""),
    seq: Number.isFinite(Number(entry.seq)) ? Number(entry.seq) : null,
    pageUrl: String(entry.pageUrl || ""),
    details: entry.details || {}
  };
  console.log(`[mapper:${record.level}] ${record.event}`, record.details);
  await writeJsonLog(APP_LOG_FILE, record);
}

async function writeTerminalDebugMarker(event) {
  const record = {
    source: "debug",
    level: "info",
    event,
    text: ""
  };
  await writeJsonLog(TERMINAL_DEBUG_FILE, record);
}

function startGame(args = ["/bezokien", "/nointro"]) {
  if (gameProcess) return { ok: true, status: gameState };
  lastGamePosition = null;
  const exePath = path.join(GAME_DIR, "otchlan.exe");
  if (!existsSync(exePath)) {
    updateGameState({ running: false, pid: null, message: "Nie znaleziono otchlan.exe." });
    return { ok: false, error: "missing-executable" };
  }

  const safeArgs = Array.isArray(args) ? args.map(String) : ["/bezokien", "/nointro"];
  try {
    gameProcess = pty.spawn(exePath, safeArgs, {
      cwd: GAME_DIR,
      cols: terminalSize.cols,
      rows: terminalSize.rows,
      encoding: null,
      name: "xterm-256color",
      useConpty: true
    });
  } catch (error) {
    updateGameState({ running: false, pid: null, message: `Nie udalo sie uruchomic gry: ${error.message}` });
    return { ok: false, error: error.message };
  }

  updateGameState({
    running: true,
    pid: gameProcess.pid,
    exitCode: null,
    message: `Otchlan uruchomiona w aplikacji (PID ${gameProcess.pid}).`
  });
  startGamePositionReader(gameProcess.pid);
  rememberGameOutput({ source: "system", text: `Start: otchlan.exe ${safeArgs.join(" ")}` });

  gameProcess.onData((chunk) => rememberGameOutput({ source: "stdout", text: decodeTerminalBytes(chunk) }));
  gameProcess.onExit(({ exitCode }) => {
    rememberGameOutput({ source: "system", text: `Gra zakonczona. Kod: ${exitCode ?? "brak"}` });
    gameProcess = null;
    lastGamePosition = null;
    stopGamePositionReader();
    updateGameState({ running: false, pid: null, exitCode, message: "Gra nie jest uruchomiona w aplikacji." });
  });

  return { ok: true, status: gameState };
}

function sendGameCommand(command) {
  const value = String(command || "").trim();
  if (!value) return { ok: false, error: "empty-command" };
  if (!gameProcess) return { ok: false, error: "game-not-running" };
  gameProcess.write(`${value}\r`);
  rememberGameOutput({ source: "command", text: `> ${value}` });
  writeServerLog({
    level: "info",
    event: "game-command-sent",
    command: value,
    sourceRoute: "/api/game/command"
  }).catch((error) => console.error("[server:error] failed to write command log", error));
  return { ok: true };
}

function sendGameInput(data, instanceId) {
  const value = String(data || "");
  if (!value) return { ok: false, error: "empty-input" };
  if (!gameProcess) return { ok: false, error: "game-not-running" };
  claimMapper(instanceId, "terminal-input");
  gameProcess.write(value);
  broadcast("game-input", { data: value, at: new Date().toISOString() });
  if (hasCommandSubmit(value)) {
    writeServerLog({
      level: "info",
      event: "game-input-submitted",
      instanceId: String(instanceId || ""),
      bytes: value.length,
      containsCarriageReturn: value.includes("\r"),
      containsLineFeed: value.includes("\n")
    }).catch((error) => console.error("[server:error] failed to write input log", error));
  }
  return { ok: true };
}

function hasCommandSubmit(value) {
  return String(value || "").includes("\r") || String(value || "").includes("\n");
}

function resizeGameTerminal(cols, rows) {
  const nextCols = clampTerminalDimension(cols, 40, 240, terminalSize.cols);
  const nextRows = clampTerminalDimension(rows, 10, 80, terminalSize.rows);
  terminalSize = { cols: nextCols, rows: nextRows };
  if (gameProcess) {
    try {
      gameProcess.resize(nextCols, nextRows);
    } catch (error) {
      return { ok: false, error: error.message, terminalSize };
    }
  }
  return { ok: true, terminalSize };
}

function clampTerminalDimension(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function stopGame() {
  if (!gameProcess) return { ok: true, status: gameState };
  gameProcess.kill();
  return { ok: true, status: gameState };
}

function startGamePositionReader(pid) {
  stopGamePositionReader();
  if (!pid) return;
  const nativeReaderPath = getNativePositionReaderPath();
  const nativeReaderAvailable = Boolean(nativeReaderPath);
  const powershellReaderAvailable = existsSync(OTCHLAN_POSITION_READER);
  if (!nativeReaderAvailable && !powershellReaderAvailable) return;
  memoryReaderBuffer = "";
  const readerKind = nativeReaderAvailable ? "native-dotnet" : "powershell";
  const readerCommand = nativeReaderAvailable ? nativeReaderPath : "powershell.exe";
  const readerArgs = nativeReaderAvailable
    ? [
        "-GamePid",
        String(pid),
        "-PollMs",
        String(OTCHLAN_POSITION_POLL_MS),
        "-MobPollMs",
        String(OTCHLAN_MOB_POLL_MS)
      ]
    : [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        OTCHLAN_POSITION_READER,
        "-GamePid",
        String(pid),
        "-PollMs",
        String(OTCHLAN_POSITION_POLL_MS)
      ];
  memoryReaderProcess = spawnProcess(readerCommand, readerArgs, {
    cwd: __dirname,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  writeServerLog({
    level: "info",
    event: "game-position-reader-started",
    pid,
    reader: readerKind,
    pollMs: OTCHLAN_POSITION_POLL_MS,
    mobPollMs: OTCHLAN_MOB_POLL_MS
  }).catch((error) => console.error("[server:error] failed to write position reader log", error));

  memoryReaderProcess.stdout.setEncoding("utf8");
  memoryReaderProcess.stdout.on("data", (chunk) => {
    memoryReaderBuffer += chunk;
    const lines = memoryReaderBuffer.split(/\r?\n/);
    memoryReaderBuffer = lines.pop() || "";
    for (const line of lines) handleGamePositionLine(line);
  });

  memoryReaderProcess.stderr.setEncoding("utf8");
  memoryReaderProcess.stderr.on("data", (chunk) => {
    const message = String(chunk || "").trim();
    if (!message) return;
    writeServerLog({
      level: "warn",
      event: "game-position-reader-stderr",
      pid,
      message
    }).catch((error) => console.error("[server:error] failed to write position reader stderr log", error));
  });

  memoryReaderProcess.on("exit", (code, signal) => {
    writeServerLog({
      level: code ? "warn" : "info",
      event: "game-position-reader-exit",
      pid,
      code,
      signal
    }).catch((error) => console.error("[server:error] failed to write position reader exit log", error));
    memoryReaderProcess = null;
    memoryReaderBuffer = "";
  });
}

function getNativePositionReaderPath() {
  for (const candidate of [OTCHLAN_RELEASE_POSITION_READER, OTCHLAN_DEV_POSITION_READER]) {
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

function stopGamePositionReader() {
  if (!memoryReaderProcess) return;
  const proc = memoryReaderProcess;
  memoryReaderProcess = null;
  memoryReaderBuffer = "";
  proc.kill();
}

function handleGamePositionLine(line) {
  const text = String(line || "").trim();
  if (!text) return;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    writeServerLog({
      level: "warn",
      event: "game-position-reader-parse-failed",
      line: text,
      error: error.message
    }).catch((logError) => console.error("[server:error] failed to write position parse log", logError));
    return;
  }
  if (!payload?.worldKey) return;
  const previousPosition = lastGamePosition || {};
  const hasVitals = payload.vitals && typeof payload.vitals === "object";
  const hasEconomy = payload.economy && typeof payload.economy === "object";
  const hasTime = payload.time && typeof payload.time === "object";
  const hasEnvironment = payload.environment && typeof payload.environment === "object";
  const hasEffects = Array.isArray(payload.effects);
  const hasConditions = Array.isArray(payload.conditions);
  const hasMobs = Array.isArray(payload.mobs);
  lastGamePosition = {
    source: "process-memory",
    at: payload.at || new Date().toISOString(),
    kind: String(payload.kind || (hasVitals || hasEconomy || hasTime || hasEnvironment || hasEffects || hasConditions || hasMobs ? "telemetry" : "position")),
    pid: Number(payload.pid || gameState.pid || 0),
    areaFile: String(payload.areaFile || ""),
    coord: {
      x: Number(payload.x),
      y: Number(payload.y),
      z: Number(payload.z)
    },
    worldKey: String(payload.worldKey || ""),
    vitals: hasVitals ? normalizeGameVitals(payload.vitals) : previousPosition.vitals,
    economy: hasEconomy ? normalizeGameEconomy(payload.economy) : previousPosition.economy,
    time: hasTime ? normalizeGameTime(payload.time) : previousPosition.time,
    environment: hasEnvironment ? normalizeGameEnvironment(payload.environment) : previousPosition.environment,
    effects: hasEffects ? normalizeGameEffects(payload.effects) : previousPosition.effects,
    conditions: hasConditions ? normalizeGameConditions(payload.conditions) : previousPosition.conditions,
    mobs: hasMobs ? normalizeGameMobs(payload.mobs) : previousPosition.mobs
  };
  broadcast("game-position", lastGamePosition);
  logGamePositionMemory(lastGamePosition);
}

function logGamePositionMemory(position) {
  const now = Date.now();
  const mobs = Array.isArray(position.mobs) ? position.mobs : [];
  const mobCount = mobs.length;
  const unknownMobCount = mobs.filter((mob) => mob.source === "unknown").length;
  const signature = `${position.worldKey}|${mobCount}|${unknownMobCount}|${position.kind || ""}`;
  if (signature === lastGamePositionLogSignature && now - lastGamePositionLogAt < GAME_POSITION_LOG_INTERVAL_MS) return;
  lastGamePositionLogSignature = signature;
  lastGamePositionLogAt = now;
  writeServerLog({
    level: "info",
    event: "game-position-memory",
    ...position,
    mobs: undefined,
    mobCount,
    unknownMobCount
  }).catch((error) => console.error("[server:error] failed to write position log", error));
}

function normalizeGameVitals(vitals = {}) {
  return {
    hp: finiteNumber(vitals.hp),
    hpMax: finiteNumber(vitals.hpMax),
    mana: finiteNumber(vitals.mana),
    manaMax: finiteNumber(vitals.manaMax),
    mv: finiteNumber(vitals.mv),
    mvMax: finiteNumber(vitals.mvMax)
  };
}

function normalizeGameEconomy(economy = {}) {
  return {
    level: finiteNumber(economy.level),
    exp: finiteNumber(economy.exp),
    minExp: finiteNumber(economy.minExp),
    expLimit: finiteNumber(economy.expLimit),
    gold: finiteNumber(economy.gold),
    goldBank: finiteNumber(economy.goldBank)
  };
}

function normalizeGameTime(time = {}) {
  const raw = finiteNumber(time.raw);
  const hour = finiteNumber(time.hour);
  const minute = finiteNumber(time.minute);
  return {
    raw,
    hour: hour >= 0 && hour < 24 ? hour : 0,
    minute: minute >= 0 && minute < 60 ? minute : 0,
    day: finiteNumber(time.day)
  };
}

function normalizeGameEnvironment(environment = {}) {
  const light = finiteNumber(environment.light);
  const hasLight = Boolean(environment.hasLight) || light > 0;
  const isNight = Boolean(environment.isNight);
  return {
    light,
    hasLight,
    isNight,
    canObserveMobs: environment.canObserveMobs !== false && (Boolean(environment.canObserveMobs) || hasLight || !isNight)
  };
}

function normalizeGameEffects(effects = []) {
  if (!Array.isArray(effects)) return [];
  return effects
    .map((effect) => ({
      slot: finiteNumber(effect?.slot),
      number: finiteNumber(effect?.number),
      duration: finiteNumber(effect?.duration),
      count: finiteNumber(effect?.count),
      skillIndex: finiteNumber(effect?.skillIndex),
      name: normalizeEffectName(String(effect?.name || "")),
      spell: finiteNumber(effect?.spell)
    }))
    .filter((effect) => effect.number || effect.duration || effect.count);
}

function normalizeGameConditions(conditions = []) {
  if (!Array.isArray(conditions)) return [];
  return conditions
    .map((condition) => ({
      key: String(condition?.key || ""),
      name: normalizeEffectName(String(condition?.name || "")),
      value: finiteNumber(condition?.value),
      level: String(condition?.level || "")
    }))
    .filter((condition) => condition.key || condition.name);
}

function normalizeGameMobs(mobs = []) {
  if (!Array.isArray(mobs)) return [];
  return mobs
    .map((mob) => {
      const id = finiteNumber(mob?.id);
      const x = finiteNumber(mob?.x);
      const y = finiteNumber(mob?.y);
      const z = finiteNumber(mob?.z);
      const dx = finiteNumber(mob?.dx);
      const dy = finiteNumber(mob?.dy);
      const distance = finiteNumber(mob?.distance);
      const direction = String(mob?.direction || "");
      return {
        id,
        name: normalizeEffectName(String(mob?.name || "")),
        x,
        y,
        z,
        dx,
        dy,
        distance,
        direction,
        visibleCardinal4: Boolean(mob?.visibleCardinal4),
        source: String(mob?.source || "")
      };
    })
    .filter((mob) => mob.id > 0 && mob.x && mob.y && mob.z);
}

function normalizeWindowsMojibake(text) {
  return String(text || "")
    .replaceAll("Ä„", "Ą")
    .replaceAll("Ä‡", "ć")
    .replaceAll("ÄĆ", "Ć")
    .replaceAll("Ä™", "ę")
    .replaceAll("ÄĘ", "Ę")
    .replaceAll("Ĺ‚", "ł")
    .replaceAll("Ĺ", "Ł")
    .replaceAll("Ĺ„", "ń")
    .replaceAll("ĹŃ", "Ń")
    .replaceAll("Ăł", "ó")
    .replaceAll("Ă“", "Ó")
    .replaceAll("Ĺ›", "ś")
    .replaceAll("Ĺš", "Ś")
    .replaceAll("ĹĽ", "ż")
    .replaceAll("Ĺ»", "Ż")
    .replaceAll("Ĺş", "ź")
    .replaceAll("Ĺą", "Ź");
}

function normalizeEffectName(text) {
  return String(text || "")
    .replaceAll("\u0139\u201a", "\u0142")
    .replaceAll("\u0139\u0081", "\u0141")
    .replaceAll("\u0139\u201e", "\u0144")
    .replaceAll("\u0139\u0192", "\u0143")
    .replaceAll("\u0139\u203a", "\u015b")
    .replaceAll("\u0139\u0160", "\u015a")
    .replaceAll("\u0139\u017c", "\u017c")
    .replaceAll("\u0139\u00bb", "\u017b")
    .replaceAll("\u0139\u017a", "\u017a")
    .replaceAll("\u0139\u00b9", "\u0179")
    .replaceAll("\u00c4\u201e", "\u0104")
    .replaceAll("\u00c4\u2021", "\u0107")
    .replaceAll("\u00c4\u2020", "\u0106")
    .replaceAll("\u00c4\u2122", "\u0119")
    .replaceAll("\u00c4\u02d8", "\u0118")
    .replaceAll("\u00c3\u00b3", "\u00f3")
    .replaceAll("\u00c3\u201c", "\u00d3");
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function rememberGameOutput(entry) {
  const item = { ...entry, at: new Date().toISOString() };
  gameOutput.push(item);
  if (gameOutput.length > 500) gameOutput.splice(0, gameOutput.length - 500);
  recordTerminalDebugOutput(item);
  broadcast("terminal-output-v3", item);
  return item;
}

function recordTerminalDebugOutput(item) {
  if (!debugState.enabled || !debugState.terminalRecording) return;
  mkdir(LOG_DIR, { recursive: true })
    .then(() => appendFile(TERMINAL_DEBUG_FILE, `${JSON.stringify(item)}\n`, "utf8"))
    .catch((error) => console.warn("[debug:warn] terminal output recording failed", error));
}

function decodeGameText(chunk) {
  if (typeof chunk === "string") {
    return chunk;
  }
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;
  const cp852 = decodeCp852(buffer);
  return scoreDecodedText(cp852) > scoreDecodedText(utf8) ? cp852 : utf8;
}

function scoreDecodedText(text) {
  let score = 0;
  for (const char of text) {
    if ("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ".includes(char)) score += 5;
    if ("ÇüéâäůćçëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤť×čş«»¤đĐĎËďŇÎěŢŮŔŕŰţ˝˛ˇ˘¨˙Řř".includes(char)) score -= 2;
    if (char === "�") score -= 6;
    if (char >= " " && char <= "~") score += 0.1;
  }
  return score;
}

function decodeCp852(buffer) {
  let text = "";
  for (const byte of buffer) {
    if (byte === 0) continue;
    if (byte < 128) {
      text += String.fromCharCode(byte);
    } else {
      text += CP852[byte - 128] || "?";
    }
  }
  return text;
}

const CP852 = [
  "Ç", "ü", "é", "â", "ä", "ů", "ć", "ç", "ł", "ë", "Ő", "ő", "î", "Ź", "Ä", "Ć",
  "É", "Ĺ", "ĺ", "ô", "ö", "Ľ", "ľ", "Ś", "ś", "Ö", "Ü", "Ť", "ť", "Ł", "×", "č",
  "á", "í", "ó", "ú", "Ą", "ą", "Ž", "ž", "Ę", "ę", "¬", "ź", "Č", "ş", "«", "»",
  "░", "▒", "▓", "│", "┤", "Á", "Â", "Ě", "Ş", "╣", "║", "╗", "╝", "Ż", "ż", "┐",
  "└", "┴", "┬", "├", "─", "┼", "Ă", "ă", "╚", "╔", "╩", "╦", "╠", "═", "╬", "¤",
  "đ", "Đ", "Ď", "Ë", "ď", "Ň", "Í", "Î", "ě", "┘", "┌", "█", "▄", "Ţ", "Ů", "▀",
  "Ó", "ß", "Ô", "Ń", "ń", "ň", "Š", "š", "Ŕ", "Ú", "ŕ", "Ű", "ý", "Ý", "ţ", "´",
  "­", "˝", "˛", "ˇ", "˘", "§", "÷", "¸", "°", "¨", "˙", "ű", "Ř", "ř", "■", " "
];

function decodeTerminalBytes(chunk) {
  if (typeof chunk === "string") {
    const cp852 = decodeCodePage852(encodeWindows1250String(chunk));
    return scoreTerminalText(cp852) > scoreTerminalText(chunk) ? cp852 : chunk;
  }
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  const cp852 = decodeCodePage852(buffer);
  return scoreTerminalText(cp852) > scoreTerminalText(utf8) ? cp852 : utf8;
}

function scoreTerminalText(text) {
  let score = 0;
  for (const char of text) {
    if ("\u0105\u0107\u0119\u0142\u0144\u00f3\u015b\u017a\u017c\u0104\u0106\u0118\u0141\u0143\u00d3\u015a\u0179\u017b".includes(char)) score += 5;
    if ("\u00c4\u00c5\u0102\u00c2\u0139\uFFFD\u0080\u0081\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089".includes(char)) score -= 3;
    if (char === "\uFFFD") score -= 6;
    if (char >= " " && char <= "~") score += 0.1;
  }
  return score;
}

function decodeCodePage852(buffer) {
  let text = "";
  for (const byte of buffer) {
    if (byte === 0) continue;
    text += byte < 128 ? String.fromCharCode(byte) : CP852_UNICODE[byte - 128];
  }
  return text;
}

function encodeWindows1250String(text) {
  const bytes = [];
  for (const char of text) {
    const byte = WINDOWS_1250_REVERSE.get(char);
    if (byte !== undefined) {
      bytes.push(byte);
      continue;
    }
    const code = char.codePointAt(0);
    bytes.push(code !== undefined && code <= 0xFF ? code : 0x3F);
  }
  return Buffer.from(bytes);
}

const CP852_UNICODE = [
  "\u00c7", "\u00fc", "\u00e9", "\u00e2", "\u00e4", "\u016f", "\u0107", "\u00e7", "\u0142", "\u00eb", "\u0150", "\u0151", "\u00ee", "\u0179", "\u00c4", "\u0106",
  "\u00c9", "\u0139", "\u013a", "\u00f4", "\u00f6", "\u013d", "\u013e", "\u015a", "\u015b", "\u00d6", "\u00dc", "\u0164", "\u0165", "\u0141", "\u00d7", "\u010d",
  "\u00e1", "\u00ed", "\u00f3", "\u00fa", "\u0104", "\u0105", "\u017d", "\u017e", "\u0118", "\u0119", "\u00ac", "\u017a", "\u010c", "\u015f", "\u00ab", "\u00bb",
  "\u2591", "\u2592", "\u2593", "\u2502", "\u2524", "\u00c1", "\u00c2", "\u011a", "\u015e", "\u2563", "\u2551", "\u2557", "\u255d", "\u017b", "\u017c", "\u2510",
  "\u2514", "\u2534", "\u252c", "\u251c", "\u2500", "\u253c", "\u0102", "\u0103", "\u255a", "\u2554", "\u2569", "\u2566", "\u2560", "\u2550", "\u256c", "\u00a4",
  "\u0111", "\u0110", "\u010e", "\u00cb", "\u010f", "\u0147", "\u00cd", "\u00ce", "\u011b", "\u2518", "\u250c", "\u2588", "\u2584", "\u0162", "\u016e", "\u2580",
  "\u00d3", "\u00df", "\u00d4", "\u0143", "\u0144", "\u0148", "\u0160", "\u0161", "\u0154", "\u00da", "\u0155", "\u0170", "\u00fd", "\u00dd", "\u0163", "\u00b4",
  "\u00ad", "\u02dd", "\u02db", "\u02c7", "\u02d8", "\u00a7", "\u00f7", "\u00b8", "\u00b0", "\u00a8", "\u02d9", "\u0171", "\u0158", "\u0159", "\u25a0", "\u00a0"
];

const WINDOWS_1250_REVERSE = buildSingleByteReverseMap("windows-1250");

function buildSingleByteReverseMap(encoding) {
  const decoder = new TextDecoder(encoding);
  const map = new Map();
  for (let byte = 0; byte < 256; byte += 1) {
    const char = byte < 128 ? String.fromCharCode(byte) : decoder.decode(Uint8Array.of(byte));
    if (char !== "\uFFFD" && !map.has(char)) map.set(char, byte);
  }
  return map;
}

function watchDirectory(dir) {
  if (watchedDirs.has(dir) || !existsSync(dir)) return;
  try {
    const watcher = watch(dir, { persistent: false }, () => {
      scanForLogs().catch((error) => updateStatus({ message: `Blad skanowania logow: ${error.message}` }));
    });
    watchedDirs.set(dir, watcher);
  } catch {
    // fs.watch can be unavailable for protected or missing directories. Polling still works.
  }
}

async function scanForLogs() {
  const candidates = await findLogCandidates(GAME_DIR);
  for (const file of candidates) {
    if (!trackedFiles.has(file)) await addTrackedFile(file);
  }
  updateStatus({
    message: trackedFiles.size ? "Obserwuje logi Otchlani." : "Brak aktywnego logu. Mozesz mapowac recznie."
  });
}

async function findLogCandidates(root) {
  if (!existsSync(root)) return [];
  const result = new Set();
  const directNames = ["flogfull.olg", "dat\\log.dat"];
  for (const name of directNames) {
    const file = path.join(root, name);
    if (existsSync(file)) result.add(file);
  }

  const dirs = [root, path.join(root, "dat"), path.join(root, "zapisy")];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".log" || ext === ".lgt" || ext === ".olg") {
          result.add(path.join(dir, entry.name));
        }
      }
    } catch {
      // Keep scanning other directories.
    }
  }
  return Array.from(result);
}

async function addTrackedFile(file) {
  try {
    const info = await stat(file);
    const item = { file, size: info.size, offset: info.size, decoder: new StringDecoder("utf8"), partial: "" };
    trackedFiles.set(file, item);
    if (info.size > 0) await readTail(file, Math.min(info.size, 8192));
  } catch {
    return;
  }
}

async function readTail(file, bytes) {
  const info = statSync(file);
  const start = Math.max(0, info.size - bytes);
  let data = "";
  await new Promise((resolve) => {
    const stream = createReadStream(file, { start, end: info.size - 1 });
    stream.on("data", (chunk) => { data += chunk.toString("utf8"); });
    stream.on("error", resolve);
    stream.on("end", resolve);
  });
  const lines = data.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).slice(-80);
  for (const line of lines) rememberLine(file, line, false);
}

async function pollTrackedFiles() {
  for (const item of trackedFiles.values()) {
    try {
      const info = await stat(item.file);
      if (info.size < item.offset) {
        item.offset = 0;
        item.partial = "";
      }
      if (info.size > item.offset) {
        await readNewBytes(item, info.size);
      }
      item.size = info.size;
    } catch {
      trackedFiles.delete(item.file);
      updateStatus({ message: "Log zniknal. Szukam ponownie..." });
    }
  }
}

async function readNewBytes(item, nextSize) {
  const chunks = [];
  await new Promise((resolve) => {
    const stream = createReadStream(item.file, { start: item.offset, end: nextSize - 1 });
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", resolve);
    stream.on("end", resolve);
  });
  item.offset = nextSize;
  const text = item.decoder.write(Buffer.concat(chunks));
  const pieces = (item.partial + text).split(/\r?\n/);
  item.partial = pieces.pop() || "";
  for (const line of pieces) rememberLine(item.file, line.trimEnd(), true);
}

function rememberLine(file, line, live) {
  if (!line) return;
  const entry = { file, line, live, at: new Date().toISOString() };
  recentLines.push(entry);
  if (recentLines.length > 200) recentLines.splice(0, recentLines.length - 200);
  status.lastLineAt = entry.at;
  broadcast("log-line", entry);
  broadcast("status", status);
}
