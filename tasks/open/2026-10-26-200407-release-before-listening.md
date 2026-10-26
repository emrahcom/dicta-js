# Release before listening

Release the old audio before listening again after a failure or a removal, per
`architecture.md` (Voice input: Listening).

- `#reset` waits for the old capture to stop, which releases the microphone and
  closes its AudioContext, before the element may listen again. Until then it
  counts as ending: a press is kept and starts listening when the release is
  done, and a hold released before then is dropped.
- A failure while the capture is still starting releases it once it has started
  or failed.
- Tests: the three browser tests that fail in WebKit today pass in all three
  browsers: "opens a new connection on the next press after a close", "shows
  Voice failed after a close during an utterance" and "is ready again after
  being removed and added while listening". A new test: a press right after
  "Voice failed" starts listening once the old capture is released.
