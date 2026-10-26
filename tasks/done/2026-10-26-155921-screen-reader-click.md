# Screen reader click

Let a click alone start and end listening, per `architecture.md` (Voice input,
Listening).

- A `click` on the microphone button that does not follow a pointer press on it
  works as a `toggle` press, whatever the listen mode: the first starts a
  session with voice activity detection, the next ends it. A click that follows
  a pointer press is ignored, as the press already acted. Keys do not cause a
  click, because their default is prevented.
- Tests with Playwright: a click alone in `hold` starts a session that the next
  click ends, a pointer press and release still works as `hold`, and the keys
  still work.
