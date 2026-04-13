# Phase 0 Contract Freeze - AI Assistant V1

Status: Approved for implementation handoff

## 1) Scope Locked for Phase 1

- Add one AI endpoint only in first implementation step:
  - POST /api/ai/group/:groupId/ask
- Keep AI integration backend-only.
- No direct model call from browser.
- Human chat and AI panel stay separated in UI domain.

## 2) API Contract (Phase 1)

### Endpoint

- Method: POST
- Path: /api/ai/group/:groupId/ask
- Auth: Bearer token required
- Authorization: user must belong to target group

### Request Body

```json
{
  "question": "What are the top overdue tasks this week?"
}
```

### Validation Rules

- question: required string
- question must be trimmed before processing
- question length: 1..AI_MAX_QUESTION_CHARS (default 800)

### Success Response (200)

```json
{
  "answer": "There are 3 overdue tasks: ...",
  "meta": {
    "model": "gpt-4.1-mini",
    "requestId": "req_xxx",
    "latencyMs": 1240
  }
}
```

### Error Response Shape (all non-2xx)

```json
{
  "error": {
    "code": "AI_CONTEXT_EMPTY",
    "message": "No relevant project data found for this group.",
    "requestId": "req_xxx"
  }
}
```

## 3) Error Code Map (Frozen)

- 401 AUTH_UNAUTHORIZED: missing or invalid token
- 403 AI_GROUP_FORBIDDEN: user not in group
- 404 AI_GROUP_NOT_FOUND: group does not exist
- 422 AI_VALIDATION_FAILED: invalid request payload
- 502 AI_PROVIDER_FAILED: provider timeout/rate-limit/upstream failure
- 500 AI_INTERNAL_ERROR: unexpected server error

## 4) Context Budget Policy (Frozen)

Backend context service must only include bounded and in-scope data:

- Group basic info: id, name
- Lists: ordered by position
- Tasks: ordered by position, include title, dueDate, assignee, list name
- Checklist summary: completed/total only
- Comments: latest N (default 3) per task if needed

Hard limits for first version:

- Max lists: 20
- Max tasks total: 200
- Max comments per task: 3
- No full raw object dump to model input

## 5) Model Invocation Policy (Frozen)

- Provider key only from backend environment variable OPENAI_API_KEY
- Default model from OPENAI_MODEL (default gpt-4.1-mini)
- Timeout: AI_REQUEST_TIMEOUT_MS (default 30000)
- Retry: AI_RETRY_COUNT (default 1, only for transient upstream errors)
- Fallback behavior:
  - if context empty: return safe explanatory response
  - if provider fails: return AI_PROVIDER_FAILED with requestId

## 6) Logging and Observability (Phase 1 Minimum)

For each AI request, log:

- requestId
- userId
- groupId
- model
- latencyMs
- status (success/error)
- providerErrorType (if any)

Security note:

- Do not log full prompt/context payload in production logs.

## 7) Environment Policy (Frozen)

Backend-only variables:

- AI_FEATURE_ENABLED (default false)
- OPENAI_API_KEY
- OPENAI_MODEL
- AI_REQUEST_TIMEOUT_MS
- AI_RETRY_COUNT
- AI_MAX_QUESTION_CHARS
- AI_RATE_LIMIT_PER_MINUTE

Frontend:

- Optional VITE_AI_ENABLED only (no provider secrets)

## 8) CI/CD Policy (Frozen)

- CI tests must mock provider; no real model calls in pipeline.
- Deployment must inject OPENAI_API_KEY only into backend runtime.
- Post-deploy smoke checks:
  - /health
  - /api/health
  - one authenticated /api/ai/group/:groupId/ask request in staging/prod verification workflow

## 9) Definition of Done - Phase 0

- Contract document exists and is versioned
- Env examples include all AI variables
- Error map and response shape are fixed
- Team can start Phase 1 without open architecture questions
