# Listen modes rename

Rename `voice-modes` to `voice-listen-modes`, per `architecture.md` (Element,
Voice input). The behavior does not change.

- The attribute `voice-modes` becomes `voice-listen-modes`. The old name is
  removed, not kept as an alias.
- The storage key `dicta-voice-mode` becomes `dicta-voice-listen-mode`. A choice
  stored under the old key is not moved.
- Names in the code follow, for example `VOICE_MODES` becomes `LISTEN_MODES` and
  `VoiceMode` becomes `ListenMode`.
- Example page, README and tests use the new name.
