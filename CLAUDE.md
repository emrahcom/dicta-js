# dicta-js

The browser side of dicta. It takes the user's input in a web application, typed
text or speech from the microphone, streams the audio to `dicta-server` and
gives the transcripts to the application. Which inputs are enabled is up to the
integrator.

TypeScript, running in the browser.

## Specs and tasks

- `specs/` is authoritative; code follows it. Specs are living documents: write
  only what the next task needs and update them whenever needed.
- The protocol between `dicta-js` and the server is `specs/contract-protocol.md`
  in `dicta-server`, the source of truth for both repos. It is not copied here.
  Locally it is at `../dicta-server/specs/contract-protocol.md`, otherwise
  https://github.com/emrahcom/dicta-server/blob/main/specs/contract-protocol.md
- Tasks are files in `tasks/open/` and `tasks/done/`, named
  `YYYY-MM-DD-HHMMSS-slug.md` (UTC). The folder is the status. `specs/tasks.md`
  defines the format, including how findings are handled.

## User documents

The README and other user documents use simple English: short sentences, common
words, one idea per sentence. Most readers know English as a second language.
Specs are internal and not covered by this rule.

## Verification commands

Run them after every change.

- Format and type check: `npm run check`
- Lint: `npm run lint`
- Tests: `npm run test`
- Build: `npm run build`

`npm run format` fixes formatting.

## Commits

Type prefix (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`), subject only,
no body, no trailers. A task lands as up to three commits:

- `docs: <spec change>`
- `chore: add task 2026-10-25-160000-project-skeleton`
- `<type>: implement 2026-10-25-160000-project-skeleton`, with the type that
  fits the change. It also moves the task file to `tasks/done/`.
