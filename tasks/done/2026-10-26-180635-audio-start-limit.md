# Audio start limit

Fail listening when audio processing does not start, per `architecture.md`
(Voice input: Audio).

- In `startCapture`, the steps after the microphone is granted (loading the
  worklet and resuming the AudioContext) must finish within 5 seconds. Otherwise
  it releases the microphone, closes the AudioContext and rejects, as for a
  denied microphone. Waiting for `getUserMedia` has no limit.
- The element then shows "Voice failed" and stops listening, as today for a
  denied microphone, so the next press works.
- Tests with Playwright: with an AudioContext whose `resume` never settles,
  listening ends with "Voice failed" after 5 seconds and the microphone is
  released; the next press starts again.
