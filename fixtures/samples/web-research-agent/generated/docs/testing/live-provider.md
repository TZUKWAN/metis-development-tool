# Live Provider / Real Runtime Acceptance (P18.09, P18.08, P14.16)

Real-model and real-Codex acceptance runs are executed locally (never in
public CI) using a locally configured OpenAI-compatible endpoint.

## Configuration contract (variable NAMES only)

Generated apps read `.env` (git-ignored):

    MDT_PROVIDER_API_KEY_OPENAI=...   # key for the provider in modelPolicy
    MDT_LLM_BASE_URL=http://<host>:<port>/v1
    MDT_LLM_MODEL=<model id>
    MDT_PORT=8791

The values live ONLY in the untracked `.env` of each generated app.

## P18.09 — real Pi runtime turn (2026-09-15, PASSED)

- Target: `fixtures/samples/web-research-agent/generated` (Research Agent)
- Runtime: `@earendil-works/pi-agent-core@0.85.1` inside `server/pi-runtime.js`
- Endpoint: user-provided OpenAI-compatible service, model `Qwen3.6-35B-A3B`
- Command: `node server/index.js` then `POST /api/agent/<id>/run` (SSE)
- Result: 3,580 SSE events; thinking + text deltas streamed; final event
  `{"type":"run_end","stopReason":"completed"}` with a full correct answer
  (Rayleigh scattering explanation, in Chinese, from a Chinese prompt).
- Note: the prompt reached the model mojibake'd (Windows console encoding
  through curl) and the model still answered correctly — strong evidence
  of a genuine model round-trip.

## P18.08 / P14.16 — real Codex build acceptance

See `docs/testing/real-codex-run.md` (command, diff summary, gate output,
and build log path are recorded there after each run).
