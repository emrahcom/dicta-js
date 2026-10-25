# Microphone capture

Capture the microphone and turn it into contract frames, per `architecture.md`
(Voice input). Not yet used by the element; the button comes in the next task.

- Start: create the audio context first, so it starts inside the user's press
  (Safari), then ask for the microphone and resume the context.
- An AudioWorklet runs `PcmConverter` on the microphone audio and posts each 50
  ms frame to the page.
- Stop: the worklet sends the rest of the last frame, then the microphone track
  is stopped and the audio context closed, so the browser's recording indicator
  goes off.
- A failure to get the microphone (denied, missing) is reported to the caller.
- Tests with Playwright and the browsers' fake microphones: frames of 1600 bytes
  that are not silent, the rest after stop, and the track ended after stop.
