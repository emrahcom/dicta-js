import { expect, test } from "@playwright/test";
import { events, openPage } from "./page.ts";

test("submits the trimmed text on Enter and clears the field", async ({
  page,
}) => {
  await openPage(page, "<dicta-input></dicta-input>");
  const field = page.getByRole("textbox");

  await field.fill("  add a note  ");
  await field.press("Enter");

  expect(await events(page)).toEqual([{ text: "add a note", input: "text" }]);
  await expect(field).toHaveValue("");
});

test("adds a new line on Shift+Enter without submitting", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  const field = page.getByRole("textbox");

  await field.fill("first");
  await field.press("Shift+Enter");
  await field.pressSequentially("second");

  await expect(field).toHaveValue("first\nsecond");
  expect(await events(page)).toEqual([]);
});

test("does not submit empty text", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  const field = page.getByRole("textbox");

  await field.press("Enter");
  await field.fill("   ");
  await field.press("Enter");

  expect(await events(page)).toEqual([]);
});

test("shows the text field only when inputs includes text", async ({
  page,
}) => {
  await openPage(
    page,
    `<dicta-input id="default"></dicta-input>
     <dicta-input id="text" inputs="text"></dicta-input>
     <dicta-input id="voice" inputs="voice"></dicta-input>`,
  );

  await expect(page.locator("#default").getByRole("textbox")).toBeVisible();
  await expect(page.locator("#text").getByRole("textbox")).toBeVisible();
  await expect(page.locator("#voice").getByRole("textbox")).toBeHidden();
});

test("uses the placeholder as the accessible name", async ({ page }) => {
  await openPage(page, '<dicta-input placeholder="Tell me"></dicta-input>');

  const field = page.getByRole("textbox", { name: "Tell me" });

  await expect(field).toHaveAttribute("placeholder", "Tell me");
});

test("grows up to 5 lines, then scrolls", async ({ page }) => {
  await openPage(page, "<dicta-input></dicta-input>");
  const field = page.getByRole("textbox");
  const height = async () => (await field.boundingBox())!.height;
  const lines = (count: number) =>
    Array.from({ length: count }, (_, i) => `line ${i}`).join("\n");

  const one = await height();
  await field.fill(lines(3));
  const three = await height();
  await field.fill(lines(5));
  const five = await height();
  await field.fill(lines(10));
  const ten = await height();

  expect(three).toBeGreaterThan(one);
  expect(five).toBeGreaterThan(three);
  expect(ten).toBe(five);
  expect(
    await field.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
});
