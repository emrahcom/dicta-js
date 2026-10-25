import { test } from "node:test";

test("loads the entry module", async () => {
  await import("../src/index.ts");
});
