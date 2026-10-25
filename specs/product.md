# Product

dicta lets users tell a web application what they want, by typing or by
speaking. dicta turns the input into something the application can act on.

dicta-js is the browser side. The application embeds it; it takes the user's
typed text or microphone audio, sends the audio to `dicta-server` and gives the
application the resulting text.

## What it is

- A browser library with one input element: a text field and a microphone
  button. The integrator enables keyboard input, voice input or both.
- Voice input streams the microphone audio to `dicta-server` and shows the
  interim text in the field while the user speaks.
- The application gets the user's text the same way for both inputs: a typed
  submission or a voice final.
- Independent of UI frameworks: it works in any web page.

## What it is not

- Not a speech-to-text engine. The server and its provider do the recognition;
  provider keys never reach the browser.
- Not a chat UI or assistant. It does not keep a conversation or talk back.
- Not the place for authentication. The application's backend issues the token.

## First version

- The input element, with keyboard and voice input configurable.
- Voice by push-to-talk: the user holds the microphone button or a key while
  speaking.
- Interim text while speaking, and the final text delivered to the application.
- Reconnect after a connection failure, with a new token when needed.

Later, dicta-js may add hands-free voice input (voice activity detection) and
pass the application's actions and context to the server, so the text becomes an
action instead of plain text.
