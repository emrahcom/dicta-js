# dicta-js

Browser side of dicta. Users tell your web application what they want. They can
type it or say it.

Early development. Not ready for use.

## How it works

You put one element on your page: `<dicta-input>`. It has a text field and a
microphone button.

- When the user types and presses Enter, you get the text.
- When the user speaks, the element sends the audio to dicta-server. You get the
  text when the user stops.

Typed text stays in the browser. Only audio goes to the server.

## Build

Requires Node.js 24 or later.

```sh
npm install
npm run build
```

The result is in `dist/`. It has no dependencies.

## Use

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

The event detail has two fields:

- `text`: what the user typed or said.
- `input`: `text` or `voice`.

## Attributes

- `server`: the address of your dicta-server.
- `inputs`: `text`, `voice` or `text voice`. The default is `text voice`.
- `voice-modes`: the voice modes the user may choose. The first one is used
  until the user chooses. Without this attribute, it is `hold toggle`.
  - `hold`: the user holds the button while speaking.
  - `toggle`: the user presses once to start and once to stop. In between, the
    user can say many things. A pause of about one second ends each one. It also
    stops by itself after 5 minutes of silence.

  With two modes, the user can switch between them next to the button. The
  browser remembers the choice.

- `label`: the name of the text field for screen readers.
- `placeholder`: the hint in the empty text field.
- `lang`: the language the user speaks, for example `de` or `en-US`.

We advise you to keep text input on. Some users cannot speak, and some voices
are not recognized well. We also advise you to allow `toggle`. Some users cannot
hold a button.

## Token

dicta-server needs a token for each connection. Your backend makes the token.
The element asks for it with `getToken`, so write `getToken` to call your
backend.

The token is a JWT signed with HS256. It uses the same secret as dicta-server
(`JWT_SECRET`) and must have an expiry time (`exp`). Keep it short, for example
5 minutes. An example for Node.js with the `jose` package:

```js
import { SignJWT } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

async function dictaToken(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secret);
}
```

Only give tokens to users who may use voice input.

If dicta-server runs without authentication, do not set `getToken`.

## Try it

Start dicta-server without authentication. Then run:

```sh
npm run example
```

Open `http://localhost:4174/?server=ws://localhost:8080`. The microphone works
only on `localhost` or over HTTPS.

## License

Apache-2.0
