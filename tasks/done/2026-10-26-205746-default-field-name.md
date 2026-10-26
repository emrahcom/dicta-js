# Default field name

Give the text field a default accessible name, per `architecture.md` (Element:
`label`; Accessibility).

- The field's `aria-label` is `label`, else `placeholder`, else "Message". It is
  never removed.
- README: `label` says what is used without it.
- Tests with Playwright: the field is named by `label`, by `placeholder` without
  `label`, and "Message" without both, also after the attributes are removed.
