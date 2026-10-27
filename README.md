# dicta-js

Browser side of dicta. Users tell your web application what they want. They can
type it or say it.

https://github.com/user-attachments/assets/b3faf3e0-a4c7-4ada-be74-889c05b9ab01

Version 0.x. Attributes may still change. The release notes tell you when you
must change your page.

## How it works

You put one element on your page: `<dicta-input>`. It has a text field, a
microphone button and a Send button.

- When the user types and presses Enter or Send, you get the text.
- When the user speaks, the element sends the audio to dicta-server. The text
  goes into the text field, and the user presses Enter or Send to send it. Or
  you get it at once when the user stops.

## Quick start

dicta-server also serves dicta-js. Load it from there:

```html
<script
  type="module"
  src="https://dicta.example.com/dicta/js/index.js"
></script>

<dicta-input server="wss://dicta.example.com"></dicta-input>
```

To try it without your own page, start dicta-server without authentication and
run `npm run demo`.

## Documents

- Usage, the event and the demo:
  https://github.com/emrahcom/dicta-js/blob/main/docs/usage.md
- Attributes: https://github.com/emrahcom/dicta-js/blob/main/docs/attributes.md
- Styling: https://github.com/emrahcom/dicta-js/blob/main/docs/styling.md
- Tokens: https://github.com/emrahcom/dicta-js/blob/main/docs/tokens.md

## License

Apache-2.0
