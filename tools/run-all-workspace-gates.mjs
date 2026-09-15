#!/usr/bin/env node
// Workspace-audit gate runner (V2 §七).
//
// The hand-written `npm run test -w X && npm run test -w Y …` chains in the
// root package.json drifted from the workspace list (six workspaces were
// never tested). This runner derives the gate set from the npm workspaces
// declared in the root package.json, so a new workspace is gated the moment
// it exists:
//   - `test` gate: runs `npm test -w <name>` for every workspace whose test
//     script exists and does not launch electron-builder (desktop packaging
//     is release.yml's job, not the unit-test gate).
//   - `typecheck` gate: runs `npm run typecheck -w <name>` for every
//     workspace that defines it.
// A workspace that ends up gated by NEITHER check is reported as a gap and
// fails the run, so the matrix can never silently shrink.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

// Repo root = parent of tools/ (independent of the invocation cwd)
const ROOT = path.resolve(import.meta.dirname, "..");

function expandWorkspaces(patterns) {
  const dirs = [];
  for (const pattern of patterns) {
    const absolute = path.join(ROOT, pattern);
    if (pattern.includes("*")) {
      const parent = path.dirname(absolute);
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(parent, entry.name);
        if (existsSync(path.join(candidate, "package.json"))) dirs.push(candidate);
      }
    } else if (existsSync(path.join(absolute, "package.json"))) {
      dirs.push(absolute);
    }
  }
  return [...new Set(dirs)].sort();
}

// Desktop packaging in a test script would make the unit gate build installers.
function testScriptIsUnitGate(script) {
  return script !== undefined && !/electron-builder/.test(script);
}

function runGate(gate, workspaceName) {
  // Fixed command shape with a validated workspace name (npm package names
  // cannot contain shell metacharacters); shell:true keeps this portable on
  // Windows without the argv+shell deprecation path.
  const result = spawnSync(`npm run ${gate} -w "${workspaceName}"`, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  return result.status === 0 ? "pass" : "FAIL";
}

const gates = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const requested = gates.length > 0 ? gates : ["test", "typecheck"];
const invalid = requested.filter((g) => !["test", "typecheck"].includes(g));
if (invalid.length > 0) {
  console.error(`run-all-workspace-gates: unknown gate(s): ${invalid.join(", ")}`);
  process.exit(1);
}

const rootManifest = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const workspaceDirs = expandWorkspaces(rootManifest.workspaces ?? []);
if (workspaceDirs.length === 0) {
  console.error("run-all-workspace-gates: no workspaces resolved — check root workspaces field");
  process.exit(1);
}

const rows = [];
for (const dir of workspaceDirs) {
  const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const row = {
    name: manifest.name ?? path.basename(dir),
    // Coverage under the full gate set, regardless of what this run requests:
    // a workspace covered by neither test nor typecheck is an audit gap.
    gated: false,
    test: "n/a",
    typecheck: "n/a",
  };
  const hasTestScript = manifest.scripts?.test !== undefined;
  const testIsUnitGate = hasTestScript && testScriptIsUnitGate(manifest.scripts.test);
  const hasTypecheck = manifest.scripts?.typecheck !== undefined;
  row.gated = testIsUnitGate || hasTypecheck;
  if (requested.includes("test")) {
    if (!hasTestScript) row.test = "no script";
    else if (!testIsUnitGate) row.test = "excluded (packaging)";
    else row.test = runGate("test", row.name);
  }
  if (requested.includes("typecheck")) {
    row.typecheck = hasTypecheck ? runGate("typecheck", row.name) : "no script";
  }
  rows.push(row);
}

const width = Math.max(...rows.map((r) => r.name.length), "workspace".length);
console.log(`\n=== workspace gate matrix (${requested.join(" + ")}) ===`);
console.log(`${"workspace".padEnd(width)}  ${requested.map((g) => g.padEnd(20)).join("  ")}`);
for (const row of rows) {
  const cells = requested.map((g) => row[g].padEnd(20)).join("  ");
  const failedHere = requested.some((g) => row[g].endsWith("FAIL"));
  console.log(`${row.name.padEnd(width)}  ${cells}  ${failedHere ? "!!" : "ok"}`);
}
console.log(`total workspaces: ${rows.length}`);

const failed = rows.filter((row) => requested.some((g) => row[g].endsWith("FAIL")));
if (failed.length > 0) {
  console.error(`\nrun-all-workspace-gates: FAIL — ${failed.length} workspace(s) failed: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
const ungated = rows.filter((row) => !row.gated);
if (ungated.length > 0) {
  console.error(`\nrun-all-workspace-gates: FAIL — ${ungated.length} workspace(s) covered by neither test nor typecheck: ${ungated.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
console.log("\nrun-all-workspace-gates: PASS — every workspace is gated and green.");
