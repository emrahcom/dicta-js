# Architecture

## Flow

```
application <-text-- dicta-js (browser) --WebSocket--> dicta-server
                                        <-transcripts-
```

1. The application puts the dicta-js element on its page and configures it.
2. Typed text: the user submits it, and the element gives it to the application.
   It never reaches the server.
3. Voice: the element gets a token from the application, opens a WebSocket to
   dicta-server, streams the microphone audio and shows the interim text. The
   final text goes to the application.

Message formats are in `contract-protocol.md` in `dicta-server`.

## Delivery

- One ES module with no runtime dependencies, written in TypeScript and compiled
  to JavaScript for the browser.
- The element is a custom element, `<dicta-input>`, so it works in any page and
  with any UI framework. Its markup and styles live in a shadow root, so the
  page's styles do not break it.
- Supported browsers: the current and previous major version of Chromium-based
  browsers, Firefox and Safari, desktop and mobile.

## Element

Importing the module defines `<dicta-input>`.

- `server`: the dicta-server URL, for example `wss://example.com`.
- `inputs`: `text`, `voice` or `text voice`, by default `text voice`. An input
  left out is not shown.
- `label`: optional accessible name of the text field. Without it, the
  placeholder is used.
- `placeholder`: optional text shown in the empty text field.
- `voice-modes`: the voice modes the user may choose, `hold` and `toggle`, see
  Voice input. The first one is the default. Without the attribute it is
  `hold toggle`. With one mode, that mode is used and no switch is shown.
- `lang`: optional, passed to the server as the contract's `lang`.
- `getToken`: an async function the application provides, returning the token as
  a string. How it gets the token is up to the application; usually it calls the
  application's backend, which signs the token (see `contract-protocol.md`,
  Connection). It is called for each new connection, because tokens expire.
  Without `getToken`, the element connects without a token, for a server with
  authentication turned off.
- The element sends a `dicta-text` event with `{ text, input }`, where `input`
  is `text` or `voice`, for each typed submission and each voice final with
  text. Empty finals are not sent.

## Text input

- A text field that starts with one line and grows with its content up to a
  limit, then scrolls, so long text stays visible. Enter submits it; Shift+Enter
  adds a new line.
- The text is trimmed. Empty text is not submitted.
- After a submission the field is cleared, ready for the next one.

## Voice input

Two modes: push-to-talk, and hands-free between two presses.

- A microphone button, shown when `inputs` includes `voice`. It works with the
  pointer, and with Space or Enter while it has focus.
- `hold`: the user holds the button while speaking; releasing it ends the
  utterance.
- `toggle`: a press starts a listening session and the next press ends it, so
  the user does not have to hold anything. During the session the element finds
  each utterance itself with voice activity detection: speech starts an
  utterance, including the 300 ms of audio before it, and 800 ms of silence ends
  it and sends `end`. Silence is not sent. A press during speech ends that
  utterance as in `hold`. The session also ends after 5 minutes without speech.
  Background speech becomes text too; the user decides whether to use this mode.
- At the start of each `hold` utterance, or of a `toggle` session, the element
  asks for the microphone, so the browser asks for permission the first time. It
  stops the microphone after each utterance or session, so the browser's
  recording indicator is on only while the element listens.
- Audio is captured at the microphone's own rate and converted in an
  AudioWorklet to the contract's format: 16 kHz, mono, 16-bit. It is sent in
  frames of 50 ms. Converting in the element works the same in every supported
  browser; Firefox cannot open audio processing at a rate other than the
  microphone's.
- When the integrator allows both modes, a switch next to the button lets the
  user choose the mode. The choice is stored in the browser and used on the next
  visit; without a stored choice, or when the stored mode is no longer allowed,
  the first mode in `voice-modes` applies. The mode cannot change during an
  utterance or session.
- When the user ends an utterance with the button, audio is captured for another
  300 ms, so the last word is not cut, and then `end` is sent.
- While the user speaks, the interim text is shown in a caption above the text
  field, so it does not touch text the user has typed. The final is sent as
  `dicta-text` with `input: "voice"`, and the caption is cleared.

## Connection

- The element opens the WebSocket to `<server>/dicta/v1/listen` on the first
  press, with a token from `getToken`, and keeps it open for the next
  utterances.
- Audio captured before `ready` is kept and sent after it, in the same 50 ms
  frames.
- When the connection closes, the next press opens a new one, with a new token.
  There is no automatic reconnect while the user is not speaking, so no backoff
  is needed.
- A close or an error during an utterance ends it: the interim text is cleared
  and the element shows that voice failed, until the next press.

## Accessibility

The element meets WCAG 2.2 level AA.

- Everything works by keyboard, with a visible focus indicator.
- The text field and the microphone button have accessible names. The button has
  `aria-pressed="true"` while the element listens: during a `hold` utterance, or
  during a whole `toggle` session.
- Status changes (listening, voice failed) and each voice final are announced
  through a status region. Interim text is not announced, because it changes
  many times a second.
- The speaking state is not shown by color alone, and all text and icons have
  enough contrast.
- Animations are turned off when the user prefers reduced motion.
- User documents advise integrators to keep text input on, because voice alone
  excludes users who cannot speak or whose speech is not recognized well.
