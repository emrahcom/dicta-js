// Opens the test server's page (server.ts), which loads the built module, and
// puts the given markup into its body.

import type { Page } from "@playwright/test";

export async function openPage(page: Page, body: string) {
  await page.goto("/");
  await page.waitForFunction(() => customElements.get("dicta-input"));
  await page.evaluate((markup) => {
    document.body.innerHTML = markup;
    // Records every dicta-text event for the test to read.
    const events: unknown[] = [];
    (window as unknown as { events: unknown[] }).events = events;
    document.addEventListener("dicta-text", (event) =>
      events.push((event as CustomEvent).detail),
    );
  }, body);
}

export function events(page: Page) {
  return page.evaluate(
    () => (window as unknown as { events: unknown[] }).events,
  );
}
