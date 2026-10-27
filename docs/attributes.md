# Attributes

The attributes of `<dicta-input>`.

- `server`: the address of your dicta-server, for example
  `wss://dicta.example.com`.
- `inputs`: `text`, `voice` or `text voice`. The default is `text voice`.
- `voice-listen-modes`: how the user may start and stop listening. The first one
  is used until the user chooses. Without this attribute, it is `hold toggle`.
  - `hold`: the user holds the button while speaking.
  - `toggle`: the user presses once to start and once to stop. In between, the
    user can say many things. A pause of about one second ends each one. It also
    stops by itself after 5 minutes of silence.

  With two modes, the user can switch between them in the voice settings. The
  small arrow next to the microphone button opens them. The browser remembers
  the choice.

  In the text field, Ctrl+Shift+Space works like the button. The user can speak
  without leaving the field.

- `voice-submit-modes`: what happens with the spoken text. The first one is used
  until the user chooses. Without this attribute, it is `review auto`.
  - `review`: the text goes into the text field, where the user is typing. The
    user can change it and presses Enter or Send to send it.
  - `auto`: the text is sent when the user stops speaking.

  With two modes, the user can switch with a "Review before sending" checkbox in
  the voice settings. The browser remembers the choice. Without the text field,
  it is always `auto`.

- `label`: the name of the text field for screen readers. Without it, the
  placeholder is used, or "Message" without both.
- `placeholder`: the hint in the empty text field.
- `lang`: the language the user speaks, for example `de` or `en-US`.

## Advice

Keep text input on. Some users cannot speak, and some voices are not recognized
well.

Allow `toggle`. Some users cannot hold a button.
