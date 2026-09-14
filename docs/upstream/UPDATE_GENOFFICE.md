# Updating the GenOffice Upstream Baseline (Dry-Run Procedure)

MDT treats GenOffice as a **vendored upstream**, not a live merge target.
Updates are deliberate, reviewed, per-commit cherry-picks. **Never merge
upstream `main` wholesale over MDT** — MDT has diverged structurally
(removed apps, renamed brands, added MDT packages), and a whole-tree merge
would clobber that work.

## Step-by-step dry-run

1. **Fetch (always safe):**

   ```sh
   git fetch genoffice-upstream
   ```

   If this fails, fix your network/credentials — but note that
   `genoffice-upstream` is configured fetch-only on purpose.

2. **See what changed since our baseline:**

   ```sh
   BASE=$(node -e "console.log(require('fs').readFileSync('docs/upstream/GENOFFICE_BASELINE.md','utf8').match(/Baseline commit SHA \| `([0-9a-f]+)`/)[1])")
   git log --oneline "$BASE"..genoffice-upstream/main
   git diff --stat "$BASE"...genoffice-upstream/main
   ```

3. **Inspect each candidate commit** for relevance to the Slides/designer
   surface MDT reuses (`apps/slides`, `packages/pptx-*`, `packages/ui`,
   `packages/font-metrics`, `packages/i18n`, `packages/project-store`,
   `packages/electron-utils`, `packages/file-parse`).

4. **Cherry-pick only reviewed commits:**

   ```sh
   git cherry-pick <sha>       # resolve conflicts by hand, keeping MDT structure
   ```

   For diverged files, prefer re-applying the _upstream idea_ manually over
   taking their whole file when MDT has modified it.

5. **Validate after every cherry-pick:**

   ```sh
   npm ci
   npm run typecheck:mdt && npm run test:mdt
   ```

6. **Record the new baseline** in `docs/upstream/GENOFFICE_BASELINE.md`
   (append a history table row with the new SHA and date) and in the ADR log
   if the update changes architecture-relevant behavior.

## Hard rules

- ❌ `git merge genoffice-upstream/main` — forbidden.
- ❌ `git push genoffice-upstream` — forbidden (blocked by config + pre-push hook).
- ❌ Opening PRs against `genspark-ai/genoffice` — forbidden.
- ✅ Cherry-picks with conflict resolution that preserve MDT structure and
  Apache-2.0 attribution.
- ✅ Upstream security fixes relevant to reused code should be prioritized.
