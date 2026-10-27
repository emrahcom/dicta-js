# Listening flow cleanup

Simplify the listening flow in `src/input.ts`. The behavior does not change.

- `#showListening(on)` becomes `#setListening(on)` and also sets `#listening`,
  so the flag and what shows it cannot drift apart.
- The guard at the start of `#start` goes: every caller already makes sure the
  element is neither listening nor ending.
- In `#end`, `#capture` is cleared without the `if`, since it holds the same
  capture or is already cleared, and `speaking` goes inline.
- `disconnectedCallback` no longer sets `#connection` to `undefined`: a closed
  connection is replaced on the next press anyway.
- The button keys and the shortcut share one key-press path and one key-release
  path. A key release on the button then ends a hold only after a key press on
  it, as for the shortcut.
- Tests: the existing tests pass unchanged.
