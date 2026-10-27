# Releasing

How to release a new version of dicta-js. This is for the maintainers.

## Version numbers

The version is in `package.json`, as `MAJOR.MINOR.PATCH`, for example `0.1.0`.

While the major number is 0:

- Raise the minor number when a change breaks pages that use dicta-js. For
  example, an attribute, a CSS part or a field of the `dicta-text` event is
  removed or renamed. `0.1.3` becomes `0.2.0`.
- Raise the patch number for everything else: fixes and new features that do not
  break pages. `0.1.3` becomes `0.1.4`.

dicta-js and dicta-server have their own version numbers. They work together
through the protocol version, the `v1` in `/dicta/v1/listen`. A change that
breaks the protocol needs a new protocol version, not only a new version number.

## Steps

1. Run all checks on the commit you want to release:

   ```sh
   npm run check
   npm run lint
   npm run test
   npm run test:browser
   ```

2. Set the new version, without a tag:

   ```sh
   npm version 0.2.0 --no-git-tag-version
   ```

   It changes `package.json` and `package-lock.json`. Commit both with the
   message `chore: release 0.2.0` and push.

3. On GitHub, create a release for that commit:
   - Tag: `v0.2.0`, created on the release commit.
   - Title: `v0.2.0`.
   - Notes: a few lines about what changed. Say clearly if pages must change.
   - Leave "Set as the latest release" on.

4. Publish to npm from the release commit, logged in with `npm login`:

   ```sh
   npm publish
   ```

   It builds a clean `dist/` first. `npm pack --dry-run` shows what goes into
   the package without publishing it.

## Where releases go

Each release is on npm as `dicta-js`, for pages built with a bundler.

The dicta-server image is built only when dicta-server makes a release. It takes
the latest dicta-js release at that time. So a new dicta-js release reaches
users with the next dicta-server release. If dicta-server has no other change,
make a patch release of dicta-server for it.

Release dicta-js before dicta-server when both change.
