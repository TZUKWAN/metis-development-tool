# GenOffice Upstream Baseline

MDT (Metis Development Tool) is built on a legally reused, fixed snapshot of the
[GenOffice](https://github.com/genspark-ai/genoffice) Slides editor
(Apache-2.0, Copyright 2026 Mainfunc, Inc.).

## Immutable baseline

| Field | Value |
| --- | --- |
| Upstream repository | https://github.com/genspark-ai/genoffice.git |
| Baseline commit SHA | `e064f3ad686d0466408a15d91cf87efef158ee09` |
| Baseline commit date | 2026-09-14 19:04:22 +0800 |
| Baseline commit subject | `fix(dev): make npm run dev work on Windows (#374)` |
| Clone date | 2026-09-15 |
| Upstream license | Apache-2.0 |
| Upstream default branch | `main` |

## How the baseline was taken

```sh
git clone https://github.com/genspark-ai/genoffice.git metis-development-tool
cd metis-development-tool
git rev-parse HEAD   # e064f3ad686d0466408a15d91cf87efef158ee09
```

The full upstream history was cloned and is preserved inside this repository so
that every GenOffice-derived file keeps its provenance and Apache-2.0
attribution.

## Remote policy

- `origin` → https://github.com/TZUKWAN/metis-development-tool.git (the only push target)
- `genoffice-upstream` → https://github.com/genspark-ai/genoffice.git (**fetch only**;
  its push URL is set to the invalid `NO_PUSH_TO_GENOFFICE` and a `pre-push`
  hook rejects any URL containing `genoffice`/`genspark`).

Never create a pull request against GenOffice, never push a branch to
`genoffice-upstream`, and never merge upstream `main` wholesale over MDT.
See [UPDATE_GENOFFICE.md](./UPDATE_GENOFFICE.md) for the safe update procedure.
