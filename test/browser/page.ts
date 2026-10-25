// Opens a page with the built module and the given body, served from memory
// and from dist/ without a web server.

import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

const ORIGIN = "http://dicta.test";
const DIST = new URL("../../dist/", import.meta.url);

export async function openPage(page: Page, body: string) {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/") {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>
          <script type="module" src="/dist/index.js"></script>
          ${body}`,
      });
    } else if (pathname.startsWith("/dist/")) {
      await route.fulfill({
        contentType: "text/javascript",
        body: await readFile(new URL(pathname.slice(6), DIST), "utf8"),
      });
    } else {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForFunction(() => customElements.get("dicta-input"));
  // Records every dicta-text event for the test to read.
  await page.evaluate(() => {
    const events: unknown[] = [];
    (window as unknown as { events: unknown[] }).events = events;
    document.addEventListener("dicta-text", (event) =>
      events.push((event as CustomEvent).detail),
    );
  });
}

export function events(page: Page) {
  return page.evaluate(
    () => (window as unknown as { events: unknown[] }).events,
  );
}
