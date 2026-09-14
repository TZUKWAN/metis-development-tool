# ADR-0001: Apache-2.0 license + fetch-only GenOffice vendoring

- Status: Accepted
- Date: 2026-09-15
- Deciders: MDT main agent (per MDT_1.0_TASKLIST §0.4)

## Context

MDT reuses the GenOffice Slides editor (Apache-2.0, © Mainfunc, Inc.) as its
PowerPoint-style design surface. MDT must be permanently open source on a
public GitHub repository, must never push code or PRs to GenOffice, and must
remain license-compatible with its other foundations: Codex (Apache-2.0), Pi
Agent Core (MIT), React Flow (MIT).

## Decision

1. MDT's project license is **Apache-2.0** (`LICENSE`).
2. GenOffice is vendored via a one-time clone; the exact baseline commit
   (`e064f3ad686d0466408a15d91cf87efef158ee09`) is recorded in
   `docs/upstream/GENOFFICE_BASELINE.md` and the full upstream history stays
   in this repository for provenance.
3. `genoffice-upstream` remote is **fetch-only**: push URL set to an invalid
   value and a `pre-push` hook rejects any push whose URL contains
   `genoffice`/`genspark`.
4. `NOTICE` credits Mainfunc, Inc. and GenOffice; `THIRD_PARTY_NOTICES.md`
   lists all reused/depended-on third-party components.

## Alternatives

- *MIT for MDT*: simpler, but loses the explicit patent grant that matters
  when vendoring a large Apache-2.0 codebase; Apache-2.0 → MIT one-way
  compatibility of GenOffice code would create attribution ambiguity.
- *Fork on GitHub (network fork)*: rejected — the task forbids a GenOffice
  fork relationship and PR workflows; a clean independent repository with a
  recorded baseline keeps MDT's history its own.
- *Clean-room reimplementation of a slides editor*: rejected — cost/quality
  infeasible for 1.0 and explicitly against the reuse mandate.

## Consequences

- Every GenOffice-derived file keeps Apache-2.0 headers; CI license checks
  must not mislabel them MIT.
- Upstream updates are cherry-pick-only (see
  `docs/upstream/UPDATE_GENOFFICE.md`).
- If MDT ever changes license, Apache-2.0-attributed vendored code must keep
  its terms.
