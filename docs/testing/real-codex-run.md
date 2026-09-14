# Real Codex Build Acceptance Run (P18.08 / P14.16 / P14.16 evidence)

> Executed 2026-09-15 locally with the user's ChatGPT-backed Codex login.

## Environment

| Item | Value |
| --- | --- |
| Codex CLI | upgraded `0.144.1` → **`0.154.0`** during acceptance (account's default model requires ≥ this version; P10.19 version-range note updated) |
| Workspace | `fixtures/samples/web-research-agent/generated` (generated app from the committed sample) |
| Sandbox | `-s workspace-write`, `--skip-git-repo-check`, `--json` event capture |
| Task | "Add a visible footer element to the Home page (src/pages/HomePage.tsx) displaying 'Powered by MDT' centered at the bottom. Keep all existing elements unchanged. No new dependencies." |

## Result: PASS

1. **Real agent turn** — thread `01a0a22d-b914-7151-99f9-8f2269f822c6`; the
   agent read the page, edited `src/pages/HomePage.tsx` (footer at line 66),
   and self-verified with an assertion script:
   `PASS: footer added with bottom-center styles; all existing page content unchanged.`
2. **Token usage** — 168,609 input (150,272 cached) / 1,044 output.
3. **Quality gate re-run manually after the turn** — `npm run build`
   (vite, strict TS) → `✓ built in 632ms`. The footer ships in the bundle.
4. Raw JSONL event capture retained in the acceptance records
   (`/tmp/codex-live-run.jsonl` at run time; key events quoted below).

## Notable events (verbatim excerpts)

- `{"type":"thread.started","thread_id":"01a0a22d-b914-7151-99f9-8f2269f822c6"}`
- `{"type":"item.completed","item":{…,"type":"fileChange",…}}` (footer edit)
- `{"type":"item.completed","item":{…,"exit_code":0,… "PASS: footer added with bottom-center styles; all existing page content unchanged."}}`
- `{"type":"turn.completed","usage":{"input_tokens":168609,…,"output_tokens":1044}}`

## Findings fed back into MDT

1. **CLI drift is real**: 0.144.1 could not run the account's default
   model (`gpt-6-astra` requires a newer CLI) — the first attempt failed
   with HTTP 400. MDT's version check (P10.19) now treats `0.144.1` as
   degraded and recommends upgrade; VERIFIED range updated.
2. **Sandbox `spawn EPERM` for git** under workspace-write on Windows —
   Codex itself flagged that it could not run `git show` inside the
   sandbox and verified by direct file assertion instead. MDT's build
   gates run outside the Codex sandbox precisely so this class of failure
   does not block applies.
