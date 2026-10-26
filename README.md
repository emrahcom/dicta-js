# dicta-js

Browser side of dicta. Users tell your web application what they want. They can
type it or say it.

Early development. Not ready for use.

## How it works

You put one element on your page: `<dicta-input>`. It has a text field, a
microphone button and a Send button.

- When the user types and presses Enter or Send, you get the text.
- When the user speaks, the element sends the audio to dicta-server. The text
  goes into the text field, and the user presses Enter or Send to send it. Or
  you get it at once when the user stops. See `voice-submit-modes`.

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
- `input`: `text` (typed), `voice` (spoken) or `mixed` (both, for example spoken
  and then edited).

## Attributes

- `server`: the address of your dicta-server.
- `inputs`: `text`, `voice` or `text voice`. The default is `text voice`.
- `voice-listen-modes`: how the user may start and stop listening. The first one
  is used until the user chooses. Without this attribute, it is `hold toggle`.
  - `hold`: the user holds the button while speaking.
  - `toggle`: the user presses once to start and once to stop. In between, the
    user can say many things. A pause of about one second ends each one. It also
    stops by itself after 5 minutes of silence.

  With two modes, the user can switch between them next to the button. The
  browser remembers the choice.

  In the text field, Ctrl+Shift+Space works like the button. The user can speak
  without leaving the field.

- `voice-submit-modes`: what happens with the spoken text. The first one is used
  until the user chooses. Without this attribute, it is `review auto`.
  - `review`: the text goes into the text field, where the user is typing. The
    user can change it and presses Enter or Send to send it.
  - `auto`: the text is sent when the user stops speaking.

  With two modes, the user can switch with a "Review before sending" checkbox.
  The browser remembers the choice. Without the text field, it is always `auto`.

- `label`: the name of the text field for screen readers.
- `placeholder`: the hint in the empty text field.
- `lang`: the language the user speaks, for example `de` or `en-US`.

We advise you to keep text input on. Some users cannot speak, and some voices
are not recognized well. We also advise you to allow `toggle`. Some users cannot
hold a button.

## Style

You can style each part of the element with CSS:

- `caption`: the text the user is saying, shown above the text field in `auto`.
- `field`: the text field.
- `button`: the microphone button.
- `send`: the Send button.
- `voice-listen-mode`: the switch between the listen modes.
- `voice-submit-mode`: the "Review before sending" checkbox with its label.
- `status`: the line under the element, for example "Listening".

For example, this hides the status line:

```css
dicta-input::part(status) {
  display: none;
}
```

Screen readers still read the status when the line is hidden.

Pseudo-classes work too. For example, this changes the focus outline of the
button:

```css
dicta-input::part(button):focus-visible {
  outline-color: green;
}
```

While the element listens, it has the state `listening`. This changes the color
of the button while it listens:

```css
dicta-input:state(listening)::part(button) {
  background-color: darkred;
}
```

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
npm run demo
```

Open `http://localhost:4174/?server=ws://localhost:8080`. The microphone works
only on `localhost` or over HTTPS.

## License

Apache-2.0
