import { expect, test } from "@playwright/test";
import { openPage } from "./page.ts";

const SWITCH = { name: "Voice mode" };

test("allows both modes by default, hold first", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");

  await expect(page.getByRole("combobox", SWITCH)).toHaveValue("hold");
});

test("uses the first mode in voice-modes as the default", async ({ page }) => {
  await openPage(page, '<dicta-input voice-modes="toggle hold"></dicta-input>');

  await expect(page.getByRole("combobox", SWITCH)).toHaveValue("toggle");
});

test("shows no switch with one mode or no valid mode", async ({ page }) => {
  await openPage(
    page,
    `<dicta-input id="one" voice-modes="toggle"></dicta-input>
     <dicta-input id="none" voice-modes="other"></dicta-input>`,
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
    `<dicta-input id="hold" voice-modes="hold"></dicta-input>
     <dicta-input id="both" voice-modes="hold toggle"></dicta-input>`,
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
