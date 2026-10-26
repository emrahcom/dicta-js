# Fake microphone prototype

Keep the fake microphone in WebKit after the first capture. Only the browser
tests change; the element does not.

- WebKit drops a `getUserMedia` set on `navigator.mediaDevices` after the first
  capture, so the second press reaches the real one, which the test browser
  denies with `NotAllowedError`.
- The fake microphone in `test/browser/page.ts`, and every test that replaces
  `getUserMedia` itself, set it on `MediaDevices.prototype` instead.
- Tests: the existing browser tests pass in Chromium, Firefox and WebKit,
  including "opens a new connection on the next press after a close", "shows
  Voice failed after a close during an utterance" and "is ready again after
  being removed and added while listening" in WebKit.
