import { spawnSync } from "node:child_process";

const files = [
  "server.js",
  "public/app.js",
  "public/map-core.js",
  "scripts/extract-world.mjs",
  "test/map-core.test.js",
  "scripts/smoke-server.mjs"
];

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
}
