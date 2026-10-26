# Connection setup failure

Fail the connection when it cannot be set up, per `architecture.md` (Connection:
a close or an error during an utterance ends it and shows that voice failed).

- In `Connection`, building the URL and opening the WebSocket can throw, for
  example with a missing `server` or an empty token. Such a throw ends the
  connection like a failed `getToken`, so the element shows "Voice failed" and
  the next press opens a new connection.
- `onClose` loses its close code, which nothing reads.
- Tests: with node:test or Playwright, a missing `server` and an empty token
  each end listening with "Voice failed", and the next press tries again.
