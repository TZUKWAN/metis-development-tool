# EXECUTION_STATE=INCOMPLETE_CONTINUE_REQUIRED

## OPEN_SET — 1 item remaining
### CI pptx-engine test: "the gate sees malformed raw parts and .rels"
The xmllint wasm fallback (tools/ooxml-validate/xmllint-runner.mjs) returns
error output in a different format than system xmllint's stderr. The
validate-pptx.mjs parser expects `file:line: message` lines. The wasm
validateXML() returns errors via rawMessages which may lack the filename
prefix.

FIX: In xmllint-runner.mjs's wasm path, after validateXML returns invalid,
format the error text to match system xmllint's stderr format:
`${fileName}:${line}: ${message}` for each error. The fileName is known
from the xml entries passed to validateXML.

OR: modify validate-pptx.mjs's parser to handle both formats.

## Release v1.0.1-rc.11 — SUCCESS ✅
All assets verified: win exe, mac dmg, linux AppImage+deb, SBOM,
SHA256SUMS, source archives. Release URL:
https://github.com/TZUKWAN/metis-development-tool/releases/tag/v1.0.1-rc.11

## All other gates green
- 310/310 tasks DONE in TASK_STATUS.md
- lint 0 errors 0 warnings
- e2e 5/5 specs green
- coverage thresholds met for all @mdt packages
- security review: docs/release/SECURITY_REVIEW.md
- metadata: all pointed at TZUKWAN/metis-development-tool

## After fixing the wasm error format
1. Push → CI should go green
2. Tag v1.0.1 (final) → Release workflow runs → all assets verified
3. Update v1.0.0 release description to note it's superseded by v1.0.1
4. Write final report per V2 §二十六
5. Set EXECUTION_STATE=COMPLETE