import { expect, test } from "@playwright/test";
import { openPage } from "./page.ts";

const SWITCH = { name: "Voice mode" };

test("allows both modes by default, hold first", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");

  await expect(page.getByRole("combobox", SWITCH)).toHaveValue("hold");
});

test("uses the first mode in voice-listen-modes as the default", async ({
  page,
}) => {
  await openPage(
    page,
    '<dicta-input voice-listen-modes="toggle hold"></dicta-input>',
  );

  await expect(page.getByRole("combobox", SWITCH)).toHaveValue("toggle");
});

test("shows no switch with one mode or no valid mode", async ({ page }) => {
  await openPage(
    page,
    `<dicta-input id="one" voice-listen-modes="toggle"></dicta-input>
     <dicta-input id="none" voice-listen-modes="other"></dicta-input>`,
  );

  await expect(page.locator("#one").getByRole("button")).toBeVisible();
  await expect(page.locator("#one").getByRole("combobox")).toBeHidden();
  await expect(page.locator("#none").getByRole("combobox")).toBeHidden();
});

test("keeps the user's choice after a reload", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");

  await page.getByRole("combobox", SWITCH).selectOption("Hands-free");
  await openPage(page, "<dicta-input></dicta-input>");

  await expect(page.getByRole("combobox", SWITCH)).toHaveValue("toggle");
});

test("ignores a stored choice that is no longer allowed", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await page.getByRole("combobox", SWITCH).selectOption("Hands-free");

  await openPage(
    page,
    `<dicta-input id="hold" voice-listen-modes="hold"></dicta-input>
     <dicta-input id="both" voice-listen-modes="hold toggle"></dicta-input>`,
  );

  // The switch is hidden with one mode, but still shows the mode in use.
  await expect(page.locator("#hold select")).toHaveValue("hold");
  await expect(page.locator("#both").getByRole("combobox")).toHaveValue(
    "toggle",
  );
});

test("keeps the choice for the page when storage fails", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });

  await page.getByRole("combobox", SWITCH).selectOption("Hands-free");
  await page.locator("dicta-input").evaluate((element) => {
    element.setAttribute("label", "re-render");
  });

  await expect(page.getByRole("combobox", SWITCH)).toHaveValue("toggle");
});

const REVIEW = { name: "Review before sending" };

test("checks Review before sending by default", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");

  await expect(page.getByRole("checkbox", REVIEW)).toBeChecked();
});

test("unchecks Review before sending when auto comes first", async ({
  page,
}) => {
  await openPage(
    page,
    '<dicta-input voice-submit-modes="auto review"></dicta-input>',
  );

  await expect(page.getByRole("checkbox", REVIEW)).not.toBeChecked();
});

test("shows the review switch only with both modes and both inputs", async ({
  page,
}) => {
  await openPage(
    page,
    `<dicta-input id="one" voice-submit-modes="review"></dicta-input>
     <dicta-input id="voice" inputs="voice"></dicta-input>
     <dicta-input id="text" inputs="text"></dicta-input>`,
  );

  for (const id of ["one", "voice", "text"]) {
    await expect(page.locator(`#${id}`).getByRole("checkbox")).toBeHidden();
  }
});

test("keeps the user's review choice after a reload", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");

  await page.getByRole("checkbox", REVIEW).uncheck();
  await openPage(page, "<dicta-input></dicta-input>");

  await expect(page.getByRole("checkbox", REVIEW)).not.toBeChecked();
});

test("ignores a stored review choice that is no longer allowed", async ({
  page,
}) => {
  await openPage(page, "<dicta-input></dicta-input>");
  await page.getByRole("checkbox", REVIEW).uncheck();

  await openPage(
    page,
    '<dicta-input voice-submit-modes="review"></dicta-input>',
  );

  await expect(page.locator("dicta-input input[type=checkbox]")).toBeChecked();
});

test("lets the page style the review switch", async ({ page }) => {
  await openPage(
    page,
    `<style>
      dicta-input::part(voice-submit-mode) { color: rgb(255, 0, 0); }
    </style>
    <dicta-input></dicta-input>`,
  );

  await expect(page.locator("dicta-input label")).toHaveCSS(
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

  await page.getByRole("checkbox", REVIEW).uncheck();
  await page.locator("dicta-input").evaluate((element) => {
    element.setAttribute("label", "re-render");
  });

  await expect(page.getByRole("checkbox", REVIEW)).not.toBeChecked();
});
