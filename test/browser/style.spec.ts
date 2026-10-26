import { expect, test } from "@playwright/test";
import { openPage } from "./page.ts";

test("lets the page style the field and the button", async ({ page }) => {
  await openPage(
    page,
    `<style>
      dicta-input::part(field) { color: rgb(255, 0, 0); }
      dicta-input::part(button) { color: rgb(0, 128, 0); }
    </style>
    <dicta-input></dicta-input>`,
  );

  await expect(page.getByRole("textbox")).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(page.getByRole("button", { name: "Speak" })).toHaveCSS(
    "color",
    "rgb(0, 128, 0)",
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

  // The field, the Send button, then the microphone button.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
  }

  await expect(button).toBeFocused();
  await expect(button).toHaveCSS("outline-color", "rgb(0, 128, 0)");
});

test("puts the Send button right after the text field", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  const left = (locator: ReturnType<typeof page.getByRole>) =>
    locator.evaluate((element) => element.getBoundingClientRect().left);

  const field = await left(page.getByRole("textbox"));
  const send = await left(page.getByRole("button", { name: "Send" }));
  const speak = await left(page.getByRole("button", { name: "Speak" }));
  const settings = await left(
    page.getByRole("button", { name: "Voice settings" }),
  );

  expect(field < send && send < speak && speak < settings).toBe(true);
});

test("follows the row in the tab order", async ({ page }) => {
  await openPage(page, '<dicta-input label="Command"></dicta-input>');
  const order: (string | null)[] = [];

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(
        () =>
          document.querySelector("dicta-input")!.shadowRoot!.activeElement!
            .ariaLabel,
      ),
    );
  }

  expect(order).toEqual(["Command", "Send", "Speak", "Voice settings"]);
});
