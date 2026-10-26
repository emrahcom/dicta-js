# Shortcut tooltip

Name the shortcut in the button's tooltip only with text input, per
`architecture.md` (Voice input: Listening).

- The microphone button's tooltip is "Speak (Ctrl+Shift+Space)" when the text
  field is shown and "Speak" without it, set where `aria-keyshortcuts` is set.
- Tests with Playwright: the tooltip with `inputs="text voice"` and with
  `inputs="voice"`.
