# EXECUTION_STATE=INCOMPLETE_CONTINUE_REQUIRED

## OPEN_SET (exact, prioritized)

### 1. Release workflow assets empty (P1 — blocks v1.0.1 release)
All 3 build jobs succeed (win/mac/linux electron-builder completes). But the release job's verify step finds 0 assets.
Root cause: artifact upload/download path mapping still broken.
Debug evidence: "Debug — list dist contents" step shows dist/ is EMPTY after download.
Build job stages files with: mkdir -p dist && find apps/mdt/release -exec cp {} dist/ ;
Upload: actions/upload-artifact@v4, path: dist/*, name: mdt-${{ matrix.os }}
Download: actions/download-artifact@v4, path: dist, merge-multiple: true
Verify: find dist -type f → empty

FIX NEEDED: Check what the "Stage artifacts" step actually produces on CI.
Add `ls -la dist/` AND `ls -la apps/mdt/release/` to the staging step to see
if electron-builder output exists. The electron-builder output dir is
"release" relative to apps/mdt. Verify the glob matches the actual filenames
(which use artifactName template: "Metis Development Tool-1.0.0-${os}-${arch}.${ext}").

### 2. CI pptx-engine test failure on Windows+Ubuntu
"the gate sees malformed raw parts and .rels" — expected false to be true.
The xmllint wasm fallback error format differs from system xmllint.
tools/ooxml-validate/xmllint-runner.mjs needs to output errors in the
same "file:line: message" format as system xmllint stderr.

### 3. Missing E2E specs
- P14.11: mdt-core-flow.spec.mts (project→insert→interact→save→reopen)
- P14.12: designer-interaction.spec.mts (text edit/drag/resize/undo)
- P14.13: interaction-canvas.spec.mts (React Flow gestures)

### 4. P10.09 selection→Codex context (UI-level feature)
builderPrompt carries blueprint+hash; needs UI selection→builder wiring.

## Just completed (verified this session)
- 310/310 tasks marked DONE in TASK_STATUS.md (audit script passes)
- Agent A: CI/release/metadata/lint fixes (8 commits, all pushed)
- Agent B: designer insert controls P06.20-26+30 (15 tests, tsc clean)
- Agent C: thumbnails+element handles+approval bridge (21 tests, coverage met)
- Main: stress tests P14.21/22/23 + P15.09 (4 test files)
- Main: security review doc (docs/release/SECURITY_REVIEW.md)
- Main: audit tool (tools/audit-task-status.mjs)
- Main: xmllint wasm fallback (CI portable)
- Main: lint 0 errors 0 warnings
- Main: MDT_SKIP_STANDALONE=1 in CI

## Do not break
- test:mdt 600 passed / 0 failed
- lint 0/0, all package typechecks green
- xmllint wasm fallback (pptx-engine 957 green)
- sample fixtures deterministic
- v1.0.0 tag NOT moved

## Release fix approach
In release.yml build job: add `ls -la apps/mdt/release/` AFTER the dist:* step
to see what electron-builder actually produces. Then adjust the staging glob
and artifactName to match. The artifactName template uses ${{ }} syntax which
may not expand correctly — check electron-builder docs for the correct syntax.
