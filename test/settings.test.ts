import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedModes,
  choose,
  LISTEN_MODES,
  SUBMIT_MODES,
} from "../src/settings.ts";

// A browser storage stand-in for one test; `fail` makes every call throw, as in
// some private windows.
function fakeStorage(items: Record<string, string> = {}, fail = false) {
  const storage = {
    getItem: (key: string) => {
      if (fail) {
        throw new DOMException("denied", "SecurityError");
      }
      return items[key] ?? null;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

test("allows the modes named in the value, in its order", () => {
  assert.deepEqual(allowedModes("toggle hold", LISTEN_MODES), [
    "toggle",
    "hold",
  ]);
  assert.deepEqual(allowedModes("auto", SUBMIT_MODES), ["auto"]);
});

test("ignores unknown words and extra spaces", () => {
  assert.deepEqual(allowedModes("  other  toggle ", LISTEN_MODES), ["toggle"]);
  assert.deepEqual(allowedModes("other", LISTEN_MODES), []);
});

test("chooses the mode chosen on the page first", () => {
  fakeStorage({ key: "hold" });

  assert.equal(choose(["hold", "toggle"], "toggle", "key"), "toggle");
});

test("chooses the stored mode when it is allowed", () => {
  fakeStorage({ key: "toggle" });

  assert.equal(choose(["hold", "toggle"], undefined, "key"), "toggle");
});

test("chooses the first allowed mode over one no longer allowed", () => {
  fakeStorage({ key: "toggle" });

  assert.equal(choose(["hold"], undefined, "key"), "hold");
  assert.equal(choose(["hold"], "toggle", "key"), "hold");
});

test("chooses without storage when storage fails", () => {
  fakeStorage({}, true);

  assert.equal(choose(["hold", "toggle"], undefined, "key"), "hold");
  assert.equal(choose(["hold", "toggle"], "toggle", "key"), "toggle");
});
