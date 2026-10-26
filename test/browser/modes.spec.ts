import { expect, type Locator, type Page, test } from "@playwright/test";
import { openPage } from "./page.ts";

const SETTINGS = { name: "Voice settings" };
const REVIEW = { name: "Review before sending" };

// Opens the voice settings panel of the element in `scope`.
async function openSettings(scope: Page | Locator) {
  await scope.getByRole("button", SETTINGS).click();
}

function radio(scope: Page | Locator, name: string) {
  return scope.getByRole("radio", { name });
}

test("allows both modes by default, hold first", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await expect(radio(page, "Hold to talk")).toBeChecked();
  await expect(radio(page, "Hands-free")).not.toBeChecked();
});

test("uses the first mode in voice-listen-modes as the default", async ({
  page,
}) => {
  await openPage(
    page,
    '<dicta-input voice-listen-modes="toggle hold"></dicta-input>',
  );
  await openSettings(page);

  await expect(radio(page, "Hands-free")).toBeChecked();
});

test("opens and closes the panel with the arrow and with Esc", async ({
  page,
}) => {
  await openPage(page, "<dicta-input></dicta-input>");
  const group = page.getByRole("group", { name: "Listen mode" });
  await expect(group).toBeHidden();

  await openSettings(page);
  await expect(group).toBeVisible();
  await openSettings(page);
  await expect(group).toBeHidden();
  await openSettings(page);
  await page.keyboard.press("Escape");

  await expect(group).toBeHidden();
});

test("keeps the panel open after a choice", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await radio(page, "Hands-free").check();

  await expect(page.getByRole("checkbox", REVIEW)).toBeVisible();
});

test("shows no arrow with nothing to choose", async ({ page }) => {
  await openPage(
    page,
    `<dicta-input id="one" voice-listen-modes="toggle" voice-submit-modes="review">
     </dicta-input>
     <dicta-input id="none" voice-listen-modes="other" inputs="voice">
     </dicta-input>
     <dicta-input id="text" inputs="text"></dicta-input>`,
  );

  for (const id of ["one", "none", "text"]) {
    await expect(
      page.locator(`#${id}`).getByRole("button", SETTINGS),
    ).toBeHidden();
  }
  await expect(
    page.locator("#one").getByRole("button", { name: "Speak" }),
  ).toBeVisible();
});

test("shows only the listen modes with one submit mode", async ({ page }) => {
  await openPage(page, '<dicta-input voice-submit-modes="auto"></dicta-input>');
  await openSettings(page);

  await expect(radio(page, "Hands-free")).toBeVisible();
  await expect(page.getByRole("checkbox", REVIEW)).toBeHidden();
});

test("keeps the user's choice after a reload", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await radio(page, "Hands-free").check();
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await expect(radio(page, "Hands-free")).toBeChecked();
});

test("ignores a stored choice that is no longer allowed", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);
  await radio(page, "Hands-free").check();

  await openPage(
    page,
    `<dicta-input id="hold" voice-listen-modes="hold"></dicta-input>
     <dicta-input id="both" voice-listen-modes="hold toggle"></dicta-input>`,
  );

  // The radio group is hidden with one mode, but still shows the mode in use.
  await expect(page.locator("#hold input[value=hold]")).toBeChecked();
  await openSettings(page.locator("#both"));
  await expect(radio(page.locator("#both"), "Hands-free")).toBeChecked();
});

test("keeps the choice for the page when storage fails", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await openSettings(page);

  await radio(page, "Hands-free").check();
  await page.locator("dicta-input").evaluate((element) => {
    element.setAttribute("label", "re-render");
  });

  await expect(radio(page, "Hands-free")).toBeChecked();
});

test("checks Review before sending by default", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await expect(page.getByRole("checkbox", REVIEW)).toBeChecked();
});

test("unchecks Review before sending when auto comes first", async ({
  page,
}) => {
  await openPage(
    page,
    '<dicta-input voice-submit-modes="auto review"></dicta-input>',
  );
  await openSettings(page);

  await expect(page.getByRole("checkbox", REVIEW)).not.toBeChecked();
});

test("shows the review switch only with both modes and both inputs", async ({
  page,
}) => {
  await openPage(
    page,
    `<dicta-input id="one" voice-submit-modes="review"></dicta-input>
     <dicta-input id="voice" inputs="voice"></dicta-input>`,
  );

  for (const id of ["one", "voice"]) {
    await openSettings(page.locator(`#${id}`));
    await expect(page.locator(`#${id}`).getByRole("checkbox")).toBeHidden();
    await page.keyboard.press("Escape");
  }
});

test("keeps the user's review choice after a reload", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await page.getByRole("checkbox", REVIEW).uncheck();
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  await expect(page.getByRole("checkbox", REVIEW)).not.toBeChecked();
});

test("ignores a stored review choice that is no longer allowed", async ({
  page,
}) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);
  await page.getByRole("checkbox", REVIEW).uncheck();

  await openPage(
    page,
    '<dicta-input voice-submit-modes="review"></dicta-input>',
  );

  await expect(page.locator("dicta-input input[type=checkbox]")).toBeChecked();
});

test("lets the page style the settings", async ({ page }) => {
  await openPage(
    page,
    `<style>
      dicta-input::part(voice-settings) { color: rgb(0, 128, 0); }
      dicta-input::part(voice-listen-mode) { color: rgb(0, 0, 255); }
      dicta-input::part(voice-submit-mode) { color: rgb(255, 0, 0); }
    </style>
    <dicta-input></dicta-input>`,
  );
  await openSettings(page);

  await expect(page.getByRole("button", SETTINGS)).toHaveCSS(
    "color",
    "rgb(0, 128, 0)",
  );
  await expect(page.getByRole("group", { name: "Listen mode" })).toHaveCSS(
    "color",
    "rgb(0, 0, 255)",
  );
  await expect(page.locator("dicta-input label").last()).toHaveCSS(
    "color",
    "rgb(255, 0, 0)",
  );
});

test("keeps the review choice for the page when storage fails", async ({
  page,
}) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await openSettings(page);

  await page.getByRole("checkbox", REVIEW).uncheck();
  await page.locator("dicta-input").evaluate((element) => {
    element.setAttribute("label", "re-render");
  });

  await expect(page.getByRole("checkbox", REVIEW)).not.toBeChecked();
});

test("opens the panel under the arrow", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await openSettings(page);

  const arrow = await page.getByRole("button", SETTINGS).boundingBox();
  const panel = await page.locator("dicta-input .panel").boundingBox();

  expect(panel!.y).toBeGreaterThanOrEqual(arrow!.y + arrow!.height);
  expect(Math.round(panel!.x + panel!.width)).toBe(
    Math.round(arrow!.x + arrow!.width),
  );
});

test("makes the arrow at least 24 px wide", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");

  const arrow = await page.getByRole("button", SETTINGS).boundingBox();

  expect(arrow!.width).toBeGreaterThanOrEqual(24);
});

test("opens the panel above the arrow near the bottom", async ({ page }) => {
  await openPage(
    page,
    '<div style="height: 90vh"></div><dicta-input></dicta-input>',
  );
  await openSettings(page);

  const arrow = await page.getByRole("button", SETTINGS).boundingBox();
  const panel = await page.locator("dicta-input .panel").boundingBox();

  expect(panel!.y + panel!.height).toBeLessThanOrEqual(arrow!.y);
  expect(panel!.y).toBeGreaterThanOrEqual(0);
});
