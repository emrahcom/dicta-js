# Close while a final is awaited

A close or an error while an utterance's final is still awaited ends it as any
close during an utterance does, as `architecture.md` (Connection) says: the
interim text is removed and the element shows that voice failed. Today the
failure is shown only while listening or in the post-roll, so a close after
`end` and before the final removes the interim text without a word.

Test: after the user releases the button and `end` is sent, a close before the
final shows "Voice failed"; a close after the final shows nothing, as before.
