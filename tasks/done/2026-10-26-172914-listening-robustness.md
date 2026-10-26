# Listening robustness

Make listening robust, per `architecture.md` (Voice input: Listening).

- The microphone button reacts only to the primary pointer button. Other buttons
  neither start listening nor mark a press, so a later click alone still works.
- A press while an utterance is ending is kept and starts listening when the
  ending is done. A release before then drops it.
- A `blur` of the button or the text field while a key holds an utterance ends
  it as a release does, and clears the held shortcut.
- `disconnectedCallback` runs the same cleanup as a failure, without "Voice
  failed": listening off, the interim text removed, the caption cleared.
- Tests with Playwright: a right click does nothing, a quick second press after
  a hold is not lost, a quick tap during the ending is dropped, a blur ends a
  key hold, and removing and adding back the element while listening leaves it
  ready.
