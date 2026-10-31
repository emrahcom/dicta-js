# Product

dicta lets users tell a web application what they want, by typing or by
speaking. dicta turns the input into something the application can act on.

dicta-js is the browser side. The application embeds it; it takes the user's
typed text or microphone audio, sends the audio to `dicta-server` and gives the
application the resulting text.

## What it is

- A browser library with one input element, for typed and spoken input. The
  application gets the user's text the same way for both.
- Independent of UI frameworks: it works in any web page.
- Accessible as a first-class feature: everything a sighted user sees or does is
  available to keyboard and screen reader users (`architecture.md`,
  Accessibility).

## What it is not

- Not a speech-to-text engine. The server and its provider do the recognition;
  provider keys never reach the browser.
- Not a chat UI or assistant. It does not keep a conversation or talk back.
- Not the place for authentication. The application's backend issues the token.

## First version

- The input element: a text field with a Send button, and a microphone button.
  The integrator chooses the inputs: text, voice or both. An input left out is
  not shown.
- Voice by push-to-talk, holding the microphone button while speaking, or
  hands-free between two presses of the button, with voice activity detection
  finding each utterance.
- Voice input streams the microphone audio to `dicta-server` and shows the
  interim text while the user speaks. The final text goes to the application, or
  into the text field for the user to review and submit first.
- After a connection failure, the next press opens a new connection.

Turning the text into the application's actions (tool calls) is not part of
dicta-js. `dicta-js` and `dicta-server` are complete without it: the application
gets the text and handles it itself. Applications that want actions can add the
optional `dicta-action-js`, which takes the text that `dicta-js` delivers.
