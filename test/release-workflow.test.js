import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowSource = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const ciWorkflowSource = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");
const readmeSource = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("package is prepared for 1.0 GitHub release", () => {
  const pkg = JSON.parse(packageSource);
  assert.equal(pkg.version, "1.0.0");
  assert.equal(pkg.scripts["release:build"], undefined);
  assert.equal(pkg.scripts.stop, "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-server.ps1");
});

test("GitHub Actions workflow builds and publishes Windows release", () => {
  assert.match(workflowSource, /name: Release/);
  assert.match(workflowSource, /tags:\s*\n\s*- "v\*"/);
  assert.match(workflowSource, /runs-on: windows-latest/);
  assert.match(workflowSource, /actions\/setup-node@v4/);
  assert.match(workflowSource, /actions\/setup-dotnet@v4/);
  assert.match(workflowSource, /dotnet publish src\/OtchlanMemoryReader\/OtchlanMemoryReader\.csproj/);
  assert.match(workflowSource, /--self-contained true/);
  assert.match(workflowSource, /-p:PublishSingleFile=true/);
  assert.match(workflowSource, /npm ci --omit=dev/);
  assert.match(workflowSource, /"stop\.cmd"/);
  assert.match(workflowSource, /Compress-Archive/);
  assert.match(workflowSource, /gh release create \$tag/);
});

test("GitHub Actions CI runs the full local verification suite", () => {
  assert.match(ciWorkflowSource, /name: CI/);
  assert.match(ciWorkflowSource, /pull_request:/);
  assert.match(ciWorkflowSource, /runs-on: windows-latest/);
  assert.match(ciWorkflowSource, /actions\/setup-node@v4/);
  assert.match(ciWorkflowSource, /actions\/setup-dotnet@v4/);
  assert.match(ciWorkflowSource, /npm ci/);
  assert.match(ciWorkflowSource, /npm run verify/);
});

test("README documents user-facing release package", () => {
  assert.match(readmeSource, /## Najprostsze Uruchomienie/);
  assert.match(readmeSource, /otchlan-mapper-1\.0\.0\.zip/);
  assert.match(readmeSource, /Uruchom `run\.cmd`/);
  assert.match(readmeSource, /Ekstrahuj dane gry/);
  assert.doesNotMatch(readmeSource, /git tag v1\.0\.0/);
  assert.doesNotMatch(readmeSource, /\.github\/workflows\/release\.yml/);
  assert.match(readmeSource, /stop\.cmd/);
  assert.match(readmeSource, /bin\\OtchlanMemoryReader\.exe/);
});
