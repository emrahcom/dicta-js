import { expect, test } from "@playwright/test";
import { openPage } from "./page.ts";

test("lets the page style the field, the button and the mode switch", async ({
  page,
}) => {
  await openPage(
    page,
    `<style>
      dicta-input::part(field) { color: rgb(255, 0, 0); }
      dicta-input::part(button) { color: rgb(0, 128, 0); }
      dicta-input::part(voice-listen-mode) { color: rgb(0, 0, 255); }
    </style>
    <dicta-input></dicta-input>`,
  );

  await expect(page.getByRole("textbox")).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.getByRole("button", { name: "Speak" })).toHaveCSS(
    "color",
    "rgb(0, 128, 0)",
  );
  await expect(page.getByRole("combobox", { name: "Voice mode" })).toHaveCSS(
    "color",
    "rgb(0, 0, 255)",
  );
});

test("lets the page style a part's pseudo-class", async ({ page }) => {
  await openPage(
    page,
    `<style>
      dicta-input::part(button):focus-visible { outline-color: rgb(0, 128, 0); }
    </style>
    <dicta-input></dicta-input>`,
  );
  const button = page.getByRole("button", { name: "Speak" });

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("outline-color", "rgb(0, 128, 0)");
});
