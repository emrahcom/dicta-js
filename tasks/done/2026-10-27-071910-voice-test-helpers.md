# Voice test helpers

Shorten `test/browser/voice.spec.ts` with a few helpers. The tests check the
same things as before.

- `untilEnds(count)`, next to `untilFrames`, for the 16 polls on the number of
  `end` messages.
- `clickAlone(button)` for a click with no pointer press before it, as from a
  screen reader, in the 4 places that do it inline.
- `holdAndRelease(page, button)` for a pointer hold with audio, then the
  release, in the places that release at once.
- "toggle: the session ends after 5 minutes without speech" uses `openIdle`,
  which has the same setup.
- Tests: all browser tests pass in Chromium, Firefox and WebKit.
