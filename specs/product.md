# Product

dicta lets users tell a web application what they want, by typing or by
speaking. dicta turns the input into something the application can act on.

dicta-js is the browser side. The application embeds it; it takes the user's
typed text or microphone audio, sends the audio to `dicta-server` and gives the
application the resulting text.

## What it is

- A browser library with one input element: a text field and a microphone
  button. The integrator chooses the inputs: text, voice or both.
- Voice input streams the microphone audio to `dicta-server` and shows the
  interim text while the user speaks.
- The application gets the user's text the same way for both inputs: a typed
  submission or a voice final.
- Independent of UI frameworks: it works in any web page.

## What it is not

- Not a speech-to-text engine. The server and its provider do the recognition;
  provider keys never reach the browser.
- Not a chat UI or assistant. It does not keep a conversation or talk back.
- Not the place for authentication. The application's backend issues the token.

## First version

- The input element. An input the integrator leaves out is not shown.
- Voice by push-to-talk: the user holds the microphone button while speaking, or
  presses it once to start and once to stop.
- Interim text while speaking, and the final text delivered to the application.
- Reconnect after a connection failure, with a new token when needed.

Later, dicta-js may add hands-free voice input (voice activity detection) and
let users choose among the inputs and voice modes the integrator allows.

Turning the text into the application's actions (tool calls) is not part of
dicta-js. `dicta-js` and `dicta-server` are complete without it: the application
gets the text and handles it itself. Applications that want actions can add the
optional `dicta-action-js`, which takes the text that `dicta-js` delivers.
