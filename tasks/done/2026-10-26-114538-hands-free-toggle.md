# Hands-free toggle

Make `toggle` a hands-free session, per `architecture.md` (Voice input,
Accessibility). Replaces today's `toggle`, which is one utterance per two
presses.

- A press starts the session: the microphone stays open and every frame goes
  through `VoiceDetector`. What it sends goes to the connection, and each end it
  finds sends `end`. The connection opens at the first press, as now.
- The next press ends the session. During speech it ends the utterance as in
  `hold`, with 300 ms more audio and then `end`; otherwise it only stops.
- The session also ends after 5 minutes without speech.
- `aria-pressed` and "Listening" last for the whole session. A failure ends the
  session and shows "Voice failed", as now.
- Tests with Playwright: Chromium's fake microphone plays a test file with tone
  bursts and pauses, so the session gets several utterances, each ended by
  silence, and no frames during the pauses. Also the press during speech and the
  5-minute end with Playwright's clock.
