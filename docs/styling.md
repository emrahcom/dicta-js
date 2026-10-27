# Styling

You can style each part of the element with CSS:

- `caption`: the text the user is saying, shown above the text field in `auto`.
- `field`: the text field.
- `button`: the microphone button.
- `send`: the Send button.
- `voice-settings`: the small arrow that opens the voice settings.
- `voice-listen-mode`: the listen mode choice in the voice settings.
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
