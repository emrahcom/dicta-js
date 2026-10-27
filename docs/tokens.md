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

If dicta-server runs without authentication, do not set `getToken`.
