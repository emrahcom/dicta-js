# Tokens

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

The speech-to-text service costs money for each minute of audio. dicta-server
limits each connection, but it cannot limit a user: a user can always get a new
token and connect again. So limit users in your backend, before it makes a
token. For example, limit how many tokens one user gets per hour, and stop
giving tokens to a user who uses too much. With a short `exp`, such a user loses
access soon. They cannot connect again after the token expires, and an open
connection ends after at most 30 minutes by default.

If dicta-server runs without authentication, do not set `getToken`.
