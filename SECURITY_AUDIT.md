# Security Notes

Notes from a security review of the CDSI codebase, covering secrets handling, personal data flow, and hardening applied before deployment.

## Secrets

API keys (`GROQ_API_KEY`, `DXGPT_API_KEY`, `DXGPT_ENDPOINT`) are read from environment variables only - none are hardcoded in source. `.env` and its variants are gitignored, so they shouldn't end up in commits. The frontend only exposes `VITE_API_URL`, which is a public endpoint, not a secret. Console logging is limited to test files and doesn't print tokens or credentials.

If a key was ever accidentally committed in the past, rotate it - grep the full git history if you want to confirm, since removing a file from the working tree doesn't remove it from history.

## Personal data flow

The app collects uploaded medical documents, patient intake details (name, age, sex, history), and chat messages. This data flows: upload → API → in-memory job store → Groq/DxGPT for AI processing → report generation → frontend. No PII beyond what's needed for the medical analysis is sent externally.

There's no authentication system and no database - session data lives in memory only, with no cookies or localStorage use for sensitive data. Because there's no auth, job/session IDs are effectively the only access control; they're UUIDs (not sequential), which limits casual guessing but isn't a substitute for real authorization if this ever needs multi-user support.

## Hardening applied

- **Security headers** - helmet middleware, with CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- **Rate limiting** - general limit of 100 req/15min per IP, tighter 10 uploads/15min per IP on the upload endpoint
- **Correlation IDs** - every error response includes a correlation ID (from `x-correlation-id`/`x-request-id` header, or generated) for tracing
- **File upload validation** - MIME type and extension allowlist (PDF/images only), 25MB size cap, filename sanitization against path traversal
- **Input sanitization** - chat messages and patient name run through DOMPurify-based sanitization to reduce XSS risk; patient name capped at 100 characters
- **Data deletion** - `DELETE /api/delete/job/:jobId` endpoint, plus an hourly scheduled cleanup of jobs older than 24 hours
- **CORS** - restricted to a configured frontend origin via `FRONTEND_URL`, not left open
- **Graceful shutdown** - SIGTERM/SIGINT handlers for clean server shutdown

## Known gaps

- No authentication/authorization at all - acceptable for a single-user local/demo tool, but a real prerequisite before any multi-user or public deployment
- Health check endpoints return minimal info but haven't been independently reviewed for information leakage
- No database, so no SQL injection surface, but also no durable storage - all jobs are lost on restart
