import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("client forwards terminal input without parsing user commands", () => {
  assert.match(appSource, /let gameInputSendQueue = Promise\.resolve\(\);/);
  assert.match(appSource, /term\.onData\(\(data\) => \{[\s\S]*claimMapperActivation\("terminal-input"\);[\s\S]*sendQueuedGameInput\(data\);[\s\S]*\}\);/);
  assert.match(appSource, /function sendQueuedGameInput\(data\) \{[\s\S]*postJson\("\/api\/game\/input", \{ data, instanceId: INSTANCE_ID \}\)/);
  assert.doesNotMatch(appSource, /trackLocalCommandInput/);
  assert.doesNotMatch(appSource, /localCommandDraft/);
  assert.doesNotMatch(appSource, /rememberCapturedPlayerCommand/);
  assert.doesNotMatch(appSource, /source\.addEventListener\("game-command"/);
});

test("server forwards raw input without reconstructing commands", () => {
  assert.match(serverSource, /function sendGameInput\(data, instanceId\) \{[\s\S]*claimMapper\(instanceId, "terminal-input"\);[\s\S]*gameProcess\.write\(value\);[\s\S]*broadcast\("game-input"/);
  assert.doesNotMatch(serverSource, /gameInputCommandBuffers/);
  assert.doesNotMatch(serverSource, /trackGameInputCommand/);
  assert.doesNotMatch(serverSource, /commitTrackedGameCommand/);
  assert.doesNotMatch(serverSource, /event: "game-command-captured"/);
  assert.doesNotMatch(serverSource, /broadcast\("game-command"/);
});
