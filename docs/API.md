# API outline

All routes use `/api/v1`. Responses use `{ success, data, message }` on success and `{ success: false, error: { code, message, correlationId } }` on failure. Calls that need case data must include the HttpOnly guest session cookie.

| Method and path | Purpose |
| --- | --- |
| `GET /health` | API and MongoDB health |
| `POST /session/guest` | Create or resume a guest session |
| `POST /cases` | Validate, queue, and return a case ID; requires an `Idempotency-Key` header |
| `GET /cases` | List cases owned by this session |
| `GET /cases/:caseId/status` | Read safe generation state |
| `POST /cases/:caseId/retry` | Retry a recoverable failed generation |
| `GET /cases/:caseId` | Public case details and progress; never the solution |
| `GET /cases/:caseId/suspects` | Public suspect profiles |
| `GET /cases/:caseId/suspects/:suspectId` | One public suspect profile |
| `GET /cases/:caseId/evidence` | Filtered and paginated public evidence |
| `GET /cases/:caseId/evidence/:evidenceId` | One evidence item; marks it investigated |
| `GET /cases/:caseId/assets/:assetId` | Serve a generated asset after ownership verification |
| `GET /cases/:caseId/timeline` | Chronological public timeline |
| `GET` / `PATCH /cases/:caseId/progress` | Read or update investigated evidence IDs |
| `POST /cases/:caseId/notes` | Create a private note |
| `PATCH` / `DELETE /cases/:caseId/notes/:noteId` | Edit or remove a private note |
| `POST /cases/:caseId/accusations` | Atomically record the only accusation and server verdict |
| `GET /cases/:caseId/result` | Reveal the solution after an accusation |
| `DELETE /cases/:caseId` | Delete the owned case and related records |

Case, progress, and result endpoints always scope queries to the owner resolved from the guest session. Unknown or unowned case IDs return a safe not-found response.
