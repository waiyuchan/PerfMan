# Workspace API v1

The active API is `/api/v1/`. Authenticate with the same-origin console or `POST /api/v1/session`. All writes require JSON; supplied Origin headers must match the request host. Session tokens are hashed in SQLite and sent as HttpOnly, SameSite=Strict cookies. Read and write authorization is checked on the server.

| Method | Path (under `/api/v1`) | Behavior |
| --- | --- | --- |
| POST / GET / DELETE | `/session` | Sign in, current session, sign out |
| GET | `/state` | Authorized workspace/user/collections snapshot; masks secrets and removes private run bundles |
| POST | `/preferences` | Language and dashboard metric preferences |
| POST | `/:collection` | Create or update an entity; updates require the current `version` |
| DELETE | `/:collection/:id` | Delete after role, policy and reference checks |
| POST | `/validate` | Validate/execute a bounded scenario preview |
| POST | `/extract` | Evaluate a JSONPath or regex extractor |
| POST | `/runs` | Queue `{scenarioId, kind:"load" or "debug", idempotencyKey?}` |
| POST | `/runs/:id/stop` | Stop and release allocations |
| POST | `/runs/:id/load` | Adjust `{rps}` for an RPS scenario within its maximum |
| POST | `/runs/:id/baseline` | Set the project/scenario baseline |
| GET | `/runs/:id/export` | Export a sanitized JSON report |
| GET | `/runs/:id/csv` | Export window metrics as CSV |
| POST | `/schedules/preview` | Next occurrences for once/cron and an IANA timezone |
| POST | `/:collection/:id/action` | Supported entity actions described below |
| POST | `/terminals` | Open an owned, expiring virtual terminal on a worker or Pod |
| POST | `/terminals/:id/command` | Execute `{command}` in the managed virtual environment |
| GET | `/metrics` | Authenticated, project/policy-scoped Prometheus text metrics |

`GET /healthz` is public liveness. `/target-api/*` is the bundled local fixture target.

Entity collections include projects, environments, files, scenarios, groups, resources, clusters, schedules, contacts, recordings, tags, integrations, users and policies. Pods, runs, occurrences, deliveries and audit records are managed by their lifecycle APIs.

Actions include resource probe/drain/enable/offline; cluster probe/drain; recording capture/convert; schedule run/pause/resume; alert acknowledge; delivery retry; contact/integration test; terminal close. Authorization varies by collection and action. Viewer accounts cannot mutate, engineers can author/run within their projects, operators can manage resources, and administrators manage accounts and policies. Deny policies refine non-admin access.

Errors use `{code,error}`. Expected statuses include 401 for missing/expired authentication, 403 for authorization/origin rejection, 409 for stale versions/referenced entities, 400 for invalid input, and 500 for persistence failures. Some run admission policy/validation errors share the 400 admission path. The console translates known error codes.

## Example

```sh
curl -c /tmp/perfman-session -H 'Content-Type: application/json' \
  -d '{"email":"alex.morgan@acme.io","password":"PerfMan2026!"}' \
  http://127.0.0.1:8099/api/v1/session
curl -b /tmp/perfman-session -H 'Content-Type: application/json' \
  -d '{"scenarioId":"scn_checkout","kind":"load","idempotencyKey":"checkout-1"}' \
  http://127.0.0.1:8099/api/v1/runs
curl -b /tmp/perfman-session http://127.0.0.1:8099/api/v1/state
```

The state API intentionally uses a complete snapshot for this single-workspace implementation. Large installations require pagination, separate series queries and a push channel; those are not currently implemented.
