# Project skeleton

Set up an empty TypeScript project for the browser, per `CLAUDE.md` and
`architecture.md` (Delivery).

- npm as the package manager, `"private": true` until the first release.
- The same tools as `dicta-server`: TypeScript 7 with `strict`, Prettier with
  `proseWrap: always`, Oxlint with type-aware rules, Node's built-in test
  runner.
- `tsc` compiles `src/` to ES modules in `dist/`, with the DOM types.
- npm scripts: `build`, `check` (format and type check), `format`, `lint`,
  `lint:fix`, `test`.
- `src/index.ts` as the empty entry module, with one test that imports it, so
  the test setup is proven.
- `.gitignore` with `node_modules/` and `dist/`.
- Fill in the verification commands in `CLAUDE.md`.
