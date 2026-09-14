# Security Policy

## Reporting a Vulnerability

Report suspected vulnerabilities privately via GitHub's **private
vulnerability reporting** on this repository
(TZUKWAN/metis-development-tool → Security → Report a vulnerability).
Do not open public issues for security reports. We aim to acknowledge
reports within 72 hours and to publish fixes with credit (unless you
prefer otherwise).

## Scope and threat model

MDT is a desktop developer tool. The security boundaries that matter:

| Boundary                   | Threat                                                                  | Controls                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer → main (Electron) | A compromised renderer (e.g. malicious project file) attacking the host | contextIsolation + sandbox + nodeIntegration:false on every window; IPC payloads are Zod-validated in main (P13.02); no raw fs paths accepted from the renderer without project-root containment (P13.03)                                                                                       |
| Project files              | Malicious mdt.project.json planted in a repo                            | Schema validation on load; project documents are data, never executed; asset paths are project-relative and checked against traversal                                                                                                                                                           |
| Codex builds               | The coding agent writing outside its workspace                          | Builds run on a dedicated git branch with the Codex CLI sandbox pinned to the generated workspace (workspace-write, network off unless explicitly enabled); MDT never passes full-disk permissions (P13.05)                                                                                     |
| Generated agent apps       | The agent's tools misused at runtime                                    | Capability permission grants (default-deny for filesystem/process/browser); SSRF guards on all network capabilities incl. per-redirect re-validation; shell disabled unless explicitly granted; secrets only via the host secure store, never in project files or logs (P09.07, P13.04, P13.06) |
| Logs                       | Credential leakage                                                      | One shared sanitizer (redactText) over build logs and preview console capture; tests assert secrets never appear                                                                                                                                                                                |

## Supported versions

Security fixes land on the default branch and are released as patch
releases. As an open-source project we do not backport to old minors.

## Known limitations

- Release artifacts are unsigned (1.0); OS SmartScreen/Gatekeeper warnings
  are expected — see `docs/release/RELEASE_CHECKLIST.md`.
- The generated app's Node service is localhost-only by design; do not
  expose it to a network without adding authentication.

## Inherited posture

MDT inherits the GenOffice Electron lockdown posture (sandboxed windows,
default-deny navigation, external-URL allowlist) — see
docs/architecture/ipc-inventory.md for the audited baseline.
