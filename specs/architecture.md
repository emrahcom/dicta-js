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

## Element

- `server`: the dicta-server URL, for example `wss://example.com`.
- `inputs`: `text`, `voice` or `text voice`. An input left out is not shown.
- `lang`: optional, passed to the server as the contract's `lang`.
- `getToken`: a function set by the application that returns a promise of a
  token from the application's backend. It is called for each new connection.
- The element sends a `dicta-text` event with `{ text, input }`, where `input`
  is `text` or `voice`, for each typed submission and each voice final with
  text. Empty finals are not sent.
