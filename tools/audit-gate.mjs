#!/usr/bin/env node
// npm audit release gate (V2 §九).
//
// `npm audit --audit-level=high` alone would fail on the two accepted
// image-size advisories, and `|| echo` swallowed real failures entirely.
// This gate runs `npm audit --json`, fails on any critical/high advisory
// that is not explicitly accepted in docs/release/audit-allowlist.json,
// and reports accepted ones so the decision stays visible in CI logs.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ALLOWLIST_PATH = path.resolve("docs/release/audit-allowlist.json");
const BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

function loadAllowlist() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  } catch (error) {
    console.error(`audit-gate: cannot read allowlist ${ALLOWLIST_PATH}: ${error.message}`);
    process.exit(1);
  }
  const entries = Array.isArray(raw.advisories) ? raw.advisories : [];
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function runNpmAudit() {
  // Single command string (not argv + shell) to avoid DEP0190; the command is
  // a fixed constant, so there is no injection surface.
  const result = spawnSync("npm audit --json", {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!result.stdout) {
    console.error(`audit-gate: npm audit produced no output (status ${result.status}).`);
    if (result.stderr) console.error(result.stderr);
    process.exit(1);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(`audit-gate: cannot parse npm audit output: ${error.message}`);
    process.exit(1);
  }
}

// npm audit reports each advisory as a `via` entry. Object entries carry the
// advisory itself (id lives at the end of `url`); string entries merely point
// at the package whose advisory is the real cause, so they add no new id.
function collectAdvisoryIds(vulnerabilities) {
  const advisories = new Map();
  for (const [pkgName, vuln] of Object.entries(vulnerabilities ?? {})) {
    if (!BLOCKING_SEVERITIES.has(vuln.severity)) continue;
    for (const via of vuln.via ?? []) {
      if (typeof via === "string") continue;
      const id = (via.url ?? "").split("/").pop();
      if (!id) continue;
      if (!advisories.has(id)) {
        advisories.set(id, {
          id,
          packages: new Set(),
          severity: via.severity ?? vuln.severity,
          title: via.title ?? "",
          range: via.range ?? "",
        });
      }
      advisories.get(id).packages.add(pkgName);
    }
  }
  return advisories;
}

function isExpired(expires) {
  if (!expires) return true;
  const today = new Date().toISOString().slice(0, 10);
  return today > expires;
}

const allowlist = loadAllowlist();
const advisories = collectAdvisoryIds(runNpmAudit().vulnerabilities);

console.log("audit-gate: npm audit critical/high advisories");
const blocked = [];
const accepted = [];
for (const advisory of [...advisories.values()].sort(
  (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
)) {
  const entry = allowlist.get(advisory.id);
  const allowed = entry !== undefined && !isExpired(entry.expires);
  const packages = [...advisory.packages].join(", ");
  if (allowed) {
    accepted.push(advisory.id);
    console.log(
      `  ACCEPTED [${advisory.severity}] ${advisory.id} in ${packages} ` +
        `(allowlisted until ${entry.expires}): ${advisory.title}`,
    );
  } else {
    blocked.push(advisory.id);
    const why =
      entry === undefined
        ? "not in allowlist"
        : `allowlist entry expired on ${entry.expires}`;
    console.log(`  BLOCKED  [${advisory.severity}] ${advisory.id} in ${packages} (${why}): ${advisory.title}`);
  }
}

if (advisories.size === 0) {
  console.log("  none found");
}

const today = new Date().toISOString().slice(0, 10);
for (const [id, entry] of allowlist) {
  if (entry.expires && today > entry.expires) {
    console.log(`audit-gate: WARNING allowlist entry ${id} expired on ${entry.expires} — re-triage required`);
  }
}

if (blocked.length > 0) {
  console.error(
    `\naudit-gate: FAIL — ${blocked.length} unaccepted critical/high advisory(ies). ` +
      `Fix them or add a justified, expiring entry to docs/release/audit-allowlist.json.`,
  );
  process.exit(1);
}

console.log(`\naudit-gate: PASS — no unaccepted critical/high advisories (${accepted.length} allowlisted).`);
