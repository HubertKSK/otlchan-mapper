import { spawn } from "node:child_process";

const PORT = Number(process.env.SMOKE_PORT || 5187);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 3000;

const server = spawn(process.execPath, ["server.js"], {
  env: {
    ...process.env,
    PORT: String(PORT)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForServer();
  await assertJson("/api/status", ["gameDir", "message"]);
  await assertJson("/api/game/status", ["running", "message"]);
  await assertJson("/api/debug/status", ["enabled", "terminalRecording"]);
  await assertJson("/api/game/output");
  await assertText("/", ["Otchlan Mapper", "./app.js"]);
  await assertText("/styles.css", ["game-output"]);
  await assertText("/app.js", ["connectEventStream", "Terminal"]);
  await assertText("/map-core.js", ["createEmptyProject", "normalizeDirection"]);
  await assertText("/vendor/@xterm/xterm/css/xterm.css", [".xterm"]);
  console.log(`Smoke OK: ${BASE_URL}`);
} finally {
  stopServer();
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited early with code ${server.exitCode}.\n${output}`);
    }

    try {
      const response = await request("/api/status");
      if (response.ok) return;
    } catch {
      await sleep(150);
    }
  }

  throw new Error(`Server did not respond within ${START_TIMEOUT_MS}ms.\n${output}`);
}

async function assertJson(path, requiredKeys = []) {
  const response = await request(path);
  assertStatus(path, response);
  const payload = await response.json();

  for (const key of requiredKeys) {
    if (!(key in payload)) {
      throw new Error(`${path} JSON is missing key "${key}".`);
    }
  }

  return payload;
}

async function assertText(path, needles) {
  const response = await request(path);
  assertStatus(path, response);
  const body = await response.text();

  for (const needle of needles) {
    if (!body.includes(needle)) {
      throw new Error(`${path} response is missing "${needle}".`);
    }
  }

  return body;
}

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function assertStatus(path, response) {
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
}

function stopServer() {
  if (server.exitCode === null) {
    server.kill();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
