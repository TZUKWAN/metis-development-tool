# Capability Guide (MDT 1.0)

Capabilities are the tools an agent can use — web search, file access,
browser automation, and so on. In MDT you assign them to agents visually;
the generated application registers exactly the assigned set.

## The built-in capabilities

| Capability     | What it does                                                                                        | Permissions (defaults)                    | Secrets                                           |
| -------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| `web_search`   | Web search via a configurable provider (DuckDuckGo built in; a deterministic mock exists for tests) | network (granted)                         | provider `api_key` when the provider requires one |
| `web_fetch`    | Fetch a URL, extract text/title; strict SSRF guard; size/timeout caps                               | network (granted)                         | —                                                 |
| `http_request` | General HTTP calls with `${secret:NAME}` header resolution                                          | network (granted)                         | optional slots                                    |
| `browser`      | Driven browsing (open/click/type/screenshot) via an injected Playwright driver                      | browser (NOT granted by default), network | —                                                 |
| `file_read`    | Read files inside the app's sandbox roots                                                           | filesystem (NOT granted)                  | —                                                 |
| `file_write`   | Write files (overwrite policy) inside sandbox                                                       | filesystem (NOT granted)                  | —                                                 |
| `file_list`    | List directories with depth/limit caps                                                              | filesystem (NOT granted)                  | —                                                 |
| `shell`        | Run a command in the workspace; **off unless you grant process**                                    | process (NOT granted)                     | —                                                 |
| `python`       | Run a Python snippet (restricted, isolated mode, timeout)                                           | process (NOT granted)                     | —                                                 |
| `mcp`          | Call tools on an MCP server (stdio)                                                                 | process (NOT granted)                     | —                                                 |
| `datetime`     | Current time / date arithmetic                                                                      | —                                         | —                                                 |
| `json`         | Parse/query/serialize JSON                                                                          | —                                         | —                                                 |
| `ask_user`     | Ask the user a question in the app UI (text/confirm/select)                                         | user-interaction (granted)                | —                                                 |

## Assigning capabilities to an agent

1. Open the **Agents** tab in the MDT dock.
2. Select or create an agent.
3. Under _Capabilities (tools)_ press **+ Add capability** and pick one.
4. Grant the permissions you are comfortable with (high-risk scopes such as
   `filesystem` and `process` stay ungranted until you explicitly enable
   them — the generated app enforces this at runtime).

## Secrets

Capabilities declare secret _slots_ (`api_key`, …). Your project file only
ever stores a **reference** like `${secret:api_key}`; the value lives in
your environment (`.env` of the generated app / your secret store). MDT
never writes secret values into project files or logs — build logs run
through a redacting sanitizer, and the contract tests assert that.

Example `.env` of a generated app using web search with a paid provider:

    WEB_SEARCH_API_KEY=...      # resolved for the ${secret:api_key} slot

## Permissions model

Every capability declares the scopes it needs (`network`, `filesystem`,
`process`, `browser`, `user-interaction`). A call that touches an
ungranted scope fails with a typed `PERMISSION_DENIED` error that the
agent sees as a tool error — it cannot bypass the grant. Network
capabilities additionally enforce an SSRF guard: only http/https, no
localhost/private/link-local/cloud-metadata targets (local development
can opt in to loopback-only mode explicitly).

## Writing your own capability

See [CAPABILITY_SDK.md](CAPABILITY_SDK.md). Third-party capabilities go
through the same manifest validation, permission model and contract test
harness as the built-ins.
