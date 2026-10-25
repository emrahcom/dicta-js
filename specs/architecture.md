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
- `placeholder`: optional text shown in the empty text field, also used as its
  accessible name.
- `lang`: optional, passed to the server as the contract's `lang`.
- `getToken`: an async function the application provides, returning the token as
  a string. How it gets the token is up to the application; usually it calls the
  application's backend, which signs the token (see `contract-protocol.md`,
  Connection). It is called for each new connection, because tokens expire.
- The element sends a `dicta-text` event with `{ text, input }`, where `input`
  is `text` or `voice`, for each typed submission and each voice final with
  text. Empty finals are not sent.

## Text input

- A text field that starts with one line and grows with its content up to a
  limit, then scrolls, so long text stays visible. Enter submits it; Shift+Enter
  adds a new line.
- The text is trimmed. Empty text is not submitted.
- After a submission the field is cleared, ready for the next one.
