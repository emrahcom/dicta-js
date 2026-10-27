# Usage

How to put dicta-js on your page and get the user's text.

## Build

Requires Node.js 24 or later.

```sh
npm install
npm run build
```

The result is in `dist/`. It has no dependencies.

It works in the current and the previous version of Chrome, Edge, Firefox and
Safari, on desktop and mobile.

## Load it

Put the whole `dist/` folder on your web server. The element loads more files
from it, for example the audio code in `audio/worklet.js`.

```html
<script type="module" src="/path/to/dist/index.js"></script>

<dicta-input server="wss://dicta.example.com" label="Command"></dicta-input>

<script type="module">
  const input = document.querySelector("dicta-input");

  input.getToken = async () => {
    const response = await fetch("/api/dicta-token");
    return response.text();
  };

  input.addEventListener("dicta-text", (event) => {
    console.log(event.detail.input, event.detail.text);
  });
</script>
```

`getToken` asks your backend for a token. See the tokens document:
https://github.com/emrahcom/dicta-js/blob/main/docs/tokens.md

## The event

The element sends a `dicta-text` event for each text the user sends. The event
detail has two fields:

- `text`: what the user typed or said.
- `input`: `text` (typed), `voice` (spoken) or `mixed` (both, for example spoken
  and then edited).

Typed text stays in the browser. Only audio goes to the server.

## HTTPS

The microphone works only on pages served over HTTPS, or on `localhost`. A page
on HTTPS must use `wss://` for the server.

## Try it

Start dicta-server without authentication. Then run:

```sh
npm run demo
```

Open `http://localhost:4174/?server=ws://localhost:8080`. You can add more
attributes to the address, for example `&voice-listen-modes=toggle`,
`&voice-submit-modes=auto`, `&inputs=voice` or `&lang=de`.
