import type { AddressInfo } from "node:net";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type WebSocket, WebSocketServer } from "ws";
import { events, openPage } from "./page.ts";

type ServerConnection = {
  socket: WebSocket;
  // The request path with its query, for example /dicta/v1/listen?lang=de.
  url: string | undefined;
  // The Sec-WebSocket-Protocol header: dicta, then the token if there is one.
  protocols: string | undefined;
  frames: number;
  // The number of frames received before each `end`.
  ends: number[];
};

// A dicta-server stand-in: accepts every connection, sends ready and records
// what it receives.
async function fakeServer() {
  const server = new WebSocketServer({
    port: 0,
    handleProtocols: (protocols) => (protocols.has("dicta") ? "dicta" : false),
  });
  await new Promise((resolve) => server.once("listening", resolve));
  const connections: ServerConnection[] = [];
  server.on("connection", (socket, request) => {
    const connection: ServerConnection = {
      socket,
      url: request.url,
      protocols: request.headers["sec-websocket-protocol"],
      frames: 0,
      ends: [],
    };
    connections.push(connection);
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        connection.frames++;
      } else if ((data as Buffer).toString() === '{"type":"end"}') {
        connection.ends.push(connection.frames);
      }
    });
    socket.send(JSON.stringify({ type: "ready", sessionId: "s" }));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://localhost:${port}`,
    connections,
    close: () =>
      new Promise((resolve) => {
        for (const client of server.clients) {
          client.terminate();
        }
        server.close(resolve);
      }),
  };
}

let server: Awaited<ReturnType<typeof fakeServer>>;

test.beforeEach(async () => {
  server = await fakeServer();
});

test.afterEach(async () => {
  await server.close();
});

async function open(page: Page, attributes = "") {
  await openPage(
    page,
    `<dicta-input server="${server.url}" ${attributes}></dicta-input>`,
  );
  return page.getByRole("button", { name: "Speak" });
}

function transcript(text: string, final: boolean) {
  server.connections[0]!.socket.send(
    JSON.stringify({ type: "transcript", text, final }),
  );
}

// Counts the starts of audio processing in the page, so a test can wait for
// one before its fake clock jumps past the 5 second start limit.
async function countAudioStarts(page: Page) {
  await page.evaluate(() => {
    const page = window as unknown as { audioStarts: number };
    page.audioStarts = 0;
    window.AudioContext = class extends AudioContext {
      override async resume() {
        await super.resume();
        page.audioStarts++;
      }
    };
  });
}

async function untilAudioStarts(page: Page, count: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { audioStarts: number }).audioStarts,
      ),
    )
    .toBeGreaterThanOrEqual(count);
}

async function untilFrames(count: number) {
  await expect
    .poll(() => server.connections[0]?.frames ?? 0)
    .toBeGreaterThan(count);
}

// Waits until the first connection has received `count` ends.
async function untilEnds(count: number, timeout?: number) {
  await expect
    .poll(() => server.connections[0]?.ends.length ?? 0, { timeout })
    .toBe(count);
}

// A click with no pointer press before it, as a screen reader presses a
// button.
function clickAlone(button: Locator) {
  return button.evaluate((element: HTMLElement) => element.click());
}

// Holds the button with the pointer until audio flows, then releases it.
async function holdAndRelease(page: Page, button: Locator) {
  await button.hover();
  await page.mouse.down();
  await untilFrames(5);
  await page.mouse.up();
}

test("hold: streams while the pointer holds the button, then ends", async ({
  page,
}) => {
  const button = await open(page);

  await button.hover();
  await page.mouse.down();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(5);
  await page.mouse.up();
  const atRelease = server.connections[0]!.frames;

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await untilEnds(1);
  // About 6 frames of post-roll come after the release, and none after end.
  expect(server.connections[0]!.ends[0]! - atRelease).toBeGreaterThan(3);
  expect(server.connections[0]!.ends[0]).toBe(server.connections[0]!.frames);
});

test("hold: works with Space held on the focused button", async ({ page }) => {
  const button = await open(page);

  await button.focus();
  await page.keyboard.down(" ");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(5);
  await page.keyboard.up(" ");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await untilEnds(1);
});

test("toggle: a press starts and the next press ends", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(5);
  await button.press("Enter");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await untilEnds(1);
});

test("auto: shows interim text and sends finals with text as voice events", async ({
  page,
}) => {
  const button = await open(
    page,
    'voice-listen-modes="toggle" voice-submit-modes="auto"',
  );
  const caption = page.locator("dicta-input .caption");
  await button.click();
  await untilFrames(1);

  transcript("add a", false);
  await expect(caption).toHaveText("add a");
  transcript("add a note", true);
  await expect(caption).toHaveText("");
  transcript("", true);
  await button.click();

  await expect
    .poll(() => events(page))
    .toEqual([{ text: "add a note", input: "voice" }]);
  await page.waitForTimeout(100);
  expect(await events(page)).toEqual([{ text: "add a note", input: "voice" }]);
});

test("opens a new connection on the next press after a close", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await button.click();
  await untilFrames(1);
  await button.click();
  await untilEnds(1);

  server.connections[0]!.socket.close(1011);
  await page.waitForTimeout(100);
  await button.click();

  await expect.poll(() => server.connections.length).toBe(2);
  await expect.poll(() => server.connections[1]!.frames).toBeGreaterThan(0);
});

test("auto: stops and clears the caption when the connection closes", async ({
  page,
}) => {
  const button = await open(
    page,
    'voice-listen-modes="toggle" voice-submit-modes="auto"',
  );
  await button.click();
  await untilFrames(1);
  transcript("add a", false);
  await expect(page.locator("dicta-input .caption")).toHaveText("add a");

  server.connections[0]!.socket.close(1011);

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("dicta-input .caption")).toHaveText("");
});

test("shows the button only when inputs includes voice", async ({ page }) => {
  await openPage(
    page,
    `<dicta-input id="voice" inputs="voice"></dicta-input>
     <dicta-input id="text" inputs="text"></dicta-input>`,
  );

  await expect(
    page.locator("#voice").getByRole("button", { name: "Speak" }),
  ).toBeVisible();
  await expect(
    page.locator("#text").getByRole("button", { name: "Speak" }),
  ).toBeHidden();
});

test("shows Listening while speaking and the final after it", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  const status = page.getByRole("status");

  await button.click();
  await expect(status).toHaveText("Listening");
  await untilFrames(1);
  await button.click();
  await untilEnds(1);
  await expect(status).toHaveText("");
  transcript("add a note", true);

  await expect(status).toHaveText("add a note");
  await expect(page.locator("dicta-input .status")).toHaveText("add a note");
});

test("lets the page style and hide the caption and the status line", async ({
  page,
}) => {
  await openPage(
    page,
    `<style>
      dicta-input::part(caption) { color: rgb(255, 0, 0); }
      dicta-input::part(status) { display: none; }
    </style>
    <dicta-input server="${server.url}" voice-listen-modes="toggle"
      voice-submit-modes="auto">
    </dicta-input>`,
  );
  const button = page.getByRole("button", { name: "Speak" });
  await button.click();
  await untilFrames(1);
  transcript("add a", false);

  await expect(page.locator("dicta-input .caption")).toHaveCSS(
    "color",
    "rgb(255, 0, 0)",
  );
  await expect(page.locator("dicta-input .status")).toBeHidden();
  // Screen readers still hear the status.
  await expect(page.getByRole("status")).toHaveText("Listening");
});

test("shows Voice failed after a close during an utterance", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await button.click();
  await untilFrames(1);

  server.connections[0]!.socket.close(1011);
  await expect(page.getByRole("status")).toHaveText("Voice failed");
  await button.click();

  await expect(page.getByRole("status")).toHaveText("Listening");
});

test("shows Voice failed when the microphone is denied", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await page.evaluate(() => {
    MediaDevices.prototype.getUserMedia = () =>
      Promise.reject(new DOMException("denied", "NotAllowedError"));
  });

  await button.click();

  await expect(page.getByRole("status")).toHaveText("Voice failed");
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("shows a focus outline on the field and the button", async ({ page }) => {
  await open(page);
  const outline = () =>
    page.evaluate(() => {
      const root = document.querySelector("dicta-input")!.shadowRoot!;
      return getComputedStyle(root.activeElement!).outlineStyle;
    });

  await page.keyboard.press("Tab");
  expect(await outline()).toBe("solid");
  await page.keyboard.press("Tab");
  expect(await outline()).toBe("solid");
});

test("looks pressed while listening, by more than color", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  const look = () =>
    button.evaluate((element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderTopWidth,
        width: element.offsetWidth,
      };
    });
  const idle = await look();

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const pressed = await look();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");

  expect(pressed.background).not.toBe(idle.background);
  expect(pressed.border).toBe("3px");
  expect(idle.border).toBe("1px");
  // The size stays the same.
  expect(pressed.width).toBe(idle.width);
  expect(await look()).toEqual(idle);
});

// Whether the element matches :state(listening).
function listening(page: Page) {
  return page
    .locator("dicta-input")
    .evaluate((element) => element.matches(":state(listening)"));
}

test("has the listening state while listening", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  expect(await listening(page)).toBe(false);

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  expect(await listening(page)).toBe(true);
  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(await listening(page)).toBe(false);
});

test("loses the listening state after a failure", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await button.click();
  await untilFrames(1);
  expect(await listening(page)).toBe(true);

  server.connections[0]!.socket.close(1011);

  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(await listening(page)).toBe(false);
});

test("lets the page style the pressed button", async ({ page }) => {
  await openPage(
    page,
    `<style>
      dicta-input:state(listening)::part(button) {
        background-color: rgb(255, 0, 0);
      }
    </style>
    <dicta-input server="${server.url}" voice-listen-modes="toggle">
    </dicta-input>`,
  );
  const button = page.getByRole("button", { name: "Speak" });

  await button.click();

  await expect(button).toHaveCSS("background-color", "rgb(255, 0, 0)");
});

// The fake microphone plays 1 s of tone, then 2 s of silence, in a loop
// (test/browser/page.ts).

test("toggle: ends each utterance on silence and sends no pauses", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');

  await button.click();
  const started = Date.now();
  await expect
    .poll(() => server.connections[0]?.ends.length ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(2);
  const elapsed = Date.now() - started;
  const { frames } = server.connections[0]!;
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();

  // Without the pauses, far fewer frames than 50 ms steps went out.
  expect(frames).toBeGreaterThan(20);
  expect(frames).toBeLessThan((elapsed / 50) * 0.85);
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("toggle: a press during speech ends that utterance", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');

  await button.click();
  await untilFrames(3);
  await button.click();

  await untilEnds(1);
  const { frames } = server.connections[0]!;
  await page.waitForTimeout(1500);
  expect(server.connections[0]!.ends.length).toBe(1);
  expect(server.connections[0]!.frames).toBe(frames);
});

test("toggle: a press during a pause only stops", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');

  await button.click();
  // Firefox starts audio late, in the first tone, which then counts as
  // background; the second tone is the first utterance.
  await untilEnds(1, 10_000);
  const { frames } = server.connections[0]!;
  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(1500);
  expect(server.connections[0]!.ends.length).toBe(1);
  expect(server.connections[0]!.frames).toBe(frames);
});

test("toggle: the session ends after 5 minutes without speech", async ({
  page,
}) => {
  const { button } = await openIdle(page);
  await button.click();
  await expect(page.getByRole("status")).toHaveText("Listening");
  await untilAudioStarts(page, 1);

  await page.clock.fastForward("04:59");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.clock.fastForward("00:02");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("status")).toHaveText("");
});

test("toggle: a session ended during speech does not end a later utterance", async ({
  page,
}) => {
  await page.clock.install();
  const button = await open(page);
  // A click alone is a toggle press; the post-roll then still hears speech.
  await clickAlone(button);
  await untilFrames(3);
  await clickAlone(button);
  await untilEnds(1);

  await button.hover();
  await page.mouse.down();
  const frames = server.connections[0]!.frames;
  await expect
    .poll(() => server.connections[0]!.frames)
    .toBeGreaterThan(frames + 5);
  await page.clock.fastForward("05:01");
  await page.waitForTimeout(200);

  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
});

test("disables the voice settings while listening", async ({ page }) => {
  const button = await open(page);
  const settings = page.getByRole("button", { name: "Voice settings" });

  await button.hover();
  await page.mouse.down();
  await expect(settings).toBeDisabled();
  await page.mouse.up();

  await expect(settings).toBeEnabled();
});

test("closes the voice settings when listening starts", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await page.getByRole("button", { name: "Voice settings" }).click();
  const review = page.getByRole("checkbox", { name: "Review before sending" });
  await expect(review).toBeVisible();

  // Focus by code does not close the panel; only the start does.
  await page.getByRole("textbox").evaluate((field) => field.focus());
  await page.keyboard.press("Control+Shift+Space");

  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(review).toBeHidden();
});

test("uses the mode the user picks", async ({ page }) => {
  const button = await open(page);
  await page.getByRole("button", { name: "Voice settings" }).click();
  await page.getByRole("radio", { name: "Hands-free" }).check();
  await page.keyboard.press("Escape");

  // A click starts a session instead of a short hold.
  await button.click();
  await untilFrames(3);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "false");
});

// Opens a toggle element in review, the default, with the given text in the
// field and the cursor or selection from `start` to `end`, then starts
// listening.
async function startReview(page: Page, text = "", start = 0, end = start) {
  const button = await open(page, 'voice-listen-modes="toggle"');
  const field = page.getByRole("textbox");
  await field.fill(text);
  await field.evaluate(
    (element: HTMLTextAreaElement, [from, to]) =>
      element.setSelectionRange(from!, to!),
    [start, end],
  );
  await button.click();
  await untilFrames(1);
  return { button, field };
}

test("review: shows the text at the cursor and keeps the final there", async ({
  page,
}) => {
  const { field } = await startReview(page, "hello world", 5);

  transcript("add a", false);
  await expect(field).toHaveValue("hello add a world");
  await expect(field).toHaveJSProperty("readOnly", true);
  transcript("add a note", true);

  await expect(field).toHaveValue("hello add a note world");
  await expect(field).toHaveJSProperty("readOnly", false);
  await expect(field).toHaveJSProperty("selectionStart", 16);
  expect(await events(page)).toEqual([]);
});

test("review: replaces the selected text", async ({ page }) => {
  const { field } = await startReview(page, "one two three", 4, 7);

  transcript("four", true);

  await expect(field).toHaveValue("one four three");
});

test("review: an empty final removes the interim text", async ({ page }) => {
  const { field } = await startReview(page, "hello", 5);

  transcript("add", false);
  await expect(field).toHaveValue("hello add");
  transcript("", true);

  await expect(field).toHaveValue("hello");
  await expect(field).toHaveJSProperty("readOnly", false);
});

test("review: Enter does not submit while interim text is shown", async ({
  page,
}) => {
  const { field } = await startReview(page);

  transcript("add a", false);
  await expect(field).toHaveValue("add a");
  await field.press("Enter");

  expect(await events(page)).toEqual([]);
  await expect(field).toHaveValue("add a");
});

test("review: adds each final of a toggle session", async ({ page }) => {
  const { field } = await startReview(page);

  transcript("add a note", true);
  await expect(field).toHaveValue("add a note");
  transcript("about lunch", true);

  await expect(field).toHaveValue("add a note about lunch");
});

test("review: a close removes the interim text", async ({ page }) => {
  const { field } = await startReview(page, "hello", 5);

  transcript("add", false);
  await expect(field).toHaveValue("hello add");
  server.connections[0]!.socket.close(1011);

  await expect(field).toHaveValue("hello");
  await expect(field).toHaveJSProperty("readOnly", false);
});

test("review: submits text, voice or mixed by where it came from", async ({
  page,
}) => {
  const { field } = await startReview(page);

  transcript("add a note", true);
  await expect(field).toHaveValue("add a note");
  await field.press("Enter");
  await field.pressSequentially("typed");
  await field.press("Enter");
  transcript("add a note", true);
  await expect(field).toHaveValue("add a note");
  await field.pressSequentially(" now");
  await field.press("Enter");

  expect(await events(page)).toEqual([
    { text: "add a note", input: "voice" },
    { text: "typed", input: "text" },
    { text: "add a note now", input: "mixed" },
  ]);
});

test("review: forgets where the text came from when the field is emptied", async ({
  page,
}) => {
  const { field } = await startReview(page);

  transcript("add a note", true);
  await expect(field).toHaveValue("add a note");
  await field.fill("");
  await field.pressSequentially("typed");
  await field.press("Enter");

  expect(await events(page)).toEqual([{ text: "typed", input: "text" }]);
});

test("is always auto without text input", async ({ page }) => {
  const button = await open(
    page,
    'inputs="voice" voice-listen-modes="toggle" voice-submit-modes="review"',
  );
  await button.click();
  await untilFrames(1);

  transcript("add a note", true);

  await expect
    .poll(() => events(page))
    .toEqual([{ text: "add a note", input: "voice" }]);
});

test("sends at once when the user turns review off", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await page.getByRole("button", { name: "Voice settings" }).click();
  await page.getByRole("checkbox", { name: "Review before sending" }).uncheck();
  await page.keyboard.press("Escape");
  await button.click();
  await untilFrames(1);

  transcript("add a note", true);

  await expect
    .poll(() => events(page))
    .toEqual([{ text: "add a note", input: "voice" }]);
  await expect(page.getByRole("textbox")).toHaveValue("");
});

test("review: a click on the button leaves the focus and cursor in the field", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  const field = page.getByRole("textbox");
  await field.fill("hello world");
  await field.evaluate((element: HTMLTextAreaElement) =>
    element.setSelectionRange(5, 5),
  );

  await button.click();
  await untilFrames(1);
  transcript("add a note", true);

  await expect(field).toBeFocused();
  await expect(field).toHaveValue("hello add a note world");
  await expect(field).toHaveJSProperty("selectionStart", 16);
});

test("review: Send does nothing while interim text is shown", async ({
  page,
}) => {
  const { field } = await startReview(page);

  transcript("add a", false);
  await expect(field).toHaveValue("add a");
  await page.getByRole("button", { name: "Send" }).click();

  expect(await events(page)).toEqual([]);
  await expect(field).toHaveValue("add a");
});

test("shortcut: hold Ctrl+Shift+Space in the field to speak", async ({
  page,
}) => {
  const button = await open(page);
  const field = page.getByRole("textbox");
  await field.focus();

  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.keyboard.down("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(5);
  await page.keyboard.up("Space");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await untilEnds(1);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
});

test("shortcut: press Ctrl+Shift+Space to start and stop toggle", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  const field = page.getByRole("textbox");
  await field.focus();

  await page.keyboard.press("Control+Shift+Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(1);
  await page.keyboard.press("Control+Shift+Space");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
});

test("shortcut: names it only with voice input", async ({ page }) => {
  await openPage(
    page,
    `<dicta-input id="both"></dicta-input>
     <dicta-input id="text" inputs="text"></dicta-input>`,
  );

  await expect(page.locator("#both").getByRole("textbox")).toHaveAttribute(
    "aria-keyshortcuts",
    "Control+Shift+Space",
  );
  await expect(
    page.locator("#both").getByRole("button", { name: "Speak" }),
  ).toHaveAttribute("title", "Speak (Ctrl+Shift+Space)");
  await expect(page.locator("#text").getByRole("textbox")).not.toHaveAttribute(
    "aria-keyshortcuts",
  );
});

test("shortcut: does nothing without voice input", async ({ page }) => {
  await open(page, 'inputs="text"');
  const field = page.getByRole("textbox");
  await field.focus();

  await page.keyboard.press("Control+Shift+Space");
  await page.waitForTimeout(200);

  expect(server.connections).toHaveLength(0);
});

test("shortcut: keeps the browser from handling the key", async ({ page }) => {
  await open(page, 'voice-listen-modes="toggle"');
  await page.getByRole("textbox").focus();
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      (window as unknown as { prevented: boolean }).prevented =
        event.defaultPrevented;
    });
  });

  await page.keyboard.press("Control+Shift+Space");

  expect(
    await page.evaluate(
      () => (window as unknown as { prevented: boolean }).prevented,
    ),
  ).toBe(true);
});

test("a click alone works as a toggle press, even in hold", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="hold"');
  await clickAlone(button);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(5);
  // The fake microphone's silence ends the utterance, as in toggle.
  await untilEnds(1);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await clickAlone(button);

  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("a pointer press in hold is not also taken as a click", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="hold"');

  await button.click();
  await untilEnds(1);
  await page.waitForTimeout(200);

  await expect(button).toHaveAttribute("aria-pressed", "false");
});

// Opens a toggle element with a fake clock and a silent microphone, so a
// session can start and stop at once, with no post-roll.
async function openIdle(page: Page) {
  await page.clock.install();
  const button = await open(page, 'voice-listen-modes="toggle"');
  await page.evaluate(() => {
    MediaDevices.prototype.getUserMedia = async () =>
      new AudioContext().createMediaStreamDestination().stream;
  });
  await countAudioStarts(page);
  let starts = 0;
  const listenOnce = async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await untilAudioStarts(page, ++starts);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
  };
  return { button, listenOnce };
}

const isOpen = (index: number) =>
  server.connections[index]!.socket.readyState ===
  server.connections[index]!.socket.OPEN;

test("closes the connection one minute after listening", async ({ page }) => {
  const { listenOnce } = await openIdle(page);
  await listenOnce();
  await expect.poll(() => server.connections.length).toBe(1);

  await page.clock.fastForward("00:59");
  expect(isOpen(0)).toBe(true);
  await page.clock.fastForward("00:02");

  await expect.poll(() => isOpen(0)).toBe(false);
  await expect(page.getByRole("status")).not.toHaveText("Voice failed");
});

test("keeps the connection while the user listens again", async ({ page }) => {
  const { button, listenOnce } = await openIdle(page);
  await listenOnce();
  await expect.poll(() => server.connections.length).toBe(1);

  await page.clock.fastForward("00:40");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.clock.fastForward("00:40");
  // Time for a close to reach the server.
  await page.waitForTimeout(200);

  expect(server.connections).toHaveLength(1);
  expect(isOpen(0)).toBe(true);
});

test("opens a new connection with the new lang after lang changes", async ({
  page,
}) => {
  const button = await open(page, 'lang="de"');
  await holdAndRelease(page, button);
  await untilEnds(1);

  await page.locator("dicta-input").evaluate((element) => {
    element.setAttribute("lang", "en");
  });
  await button.hover();
  await page.mouse.down();
  await expect
    .poll(() => server.connections[1]?.frames ?? 0)
    .toBeGreaterThan(5);
  await page.mouse.up();

  expect(server.connections[0]!.url).toBe("/dicta/v1/listen?lang=de");
  expect(server.connections[1]!.url).toBe("/dicta/v1/listen?lang=en");
  await expect.poll(() => isOpen(0)).toBe(false);
  await expect.poll(() => server.connections[1]!.ends.length).toBe(1);
});

test("opens a new connection on the press after an idle close", async ({
  page,
}) => {
  const { button, listenOnce } = await openIdle(page);
  await listenOnce();
  await expect.poll(() => server.connections.length).toBe(1);
  await page.clock.fastForward("01:01");
  await expect.poll(() => isOpen(0)).toBe(false);

  await button.click();

  await expect.poll(() => server.connections.length).toBe(2);
  await expect(page.getByRole("status")).toHaveText("Listening");
});

test("shows Voice failed when the connection cannot be set up", async ({
  page,
}) => {
  await openPage(
    page,
    '<dicta-input voice-listen-modes="toggle"></dicta-input>',
  );
  const button = page.getByRole("button", { name: "Speak" });
  // Without a server attribute, the WebSocket URL is not valid.
  await button.click();

  await expect(page.getByRole("status")).toHaveText("Voice failed");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await button.click();
  await expect(page.getByRole("status")).toHaveText("Voice failed");
});

test("ignores a right click on the button", async ({ page }) => {
  const button = await open(page);

  await button.click({ button: "right" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(server.connections).toHaveLength(0);

  // A later click alone still works.
  await clickAlone(button);
  await expect(button).toHaveAttribute("aria-pressed", "true");
});

test("hold: keeps a quick second press made while the first ends", async ({
  page,
}) => {
  const button = await open(page);
  await holdAndRelease(page, button);

  // Pressed again during the 300 ms post-roll of the first utterance.
  await page.mouse.down();
  await untilEnds(1);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  const atStart = server.connections[0]!.frames;
  await expect
    .poll(() => server.connections[0]!.frames)
    .toBeGreaterThan(atStart + 3);
  await page.mouse.up();

  await untilEnds(2);
});

test("hold: drops a quick tap made while the first ends", async ({ page }) => {
  const button = await open(page);
  await holdAndRelease(page, button);

  await page.mouse.down();
  await page.mouse.up();
  await untilEnds(1);
  await page.waitForTimeout(300);

  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(server.connections[0]!.ends).toHaveLength(1);
});

test("hold: ends when the button loses the focus while Space holds it", async ({
  page,
}) => {
  const button = await open(page);
  await button.focus();
  await page.keyboard.down(" ");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(3);

  await page.getByRole("textbox").evaluate((field) => field.focus());

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await untilEnds(1);
  await page.keyboard.up(" ");
});

test("hold: ends when the field loses the focus during the shortcut", async ({
  page,
}) => {
  const button = await open(page);
  await page.getByRole("textbox").focus();
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.keyboard.down("Space");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(3);

  await button.evaluate((element: HTMLElement) => element.focus());

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await untilEnds(1);
  await page.keyboard.up("Space");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
});

test("is ready again after being removed and added while listening", async ({
  page,
}) => {
  const { button, field } = await startReview(page, "hello", 5);
  transcript("add", false);
  await expect(field).toHaveJSProperty("readOnly", true);

  await page.locator("dicta-input").evaluate((element) => {
    element.remove();
    document.body.append(element);
  });

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(field).toHaveValue("hello");
  await expect(field).toHaveJSProperty("readOnly", false);
  await expect(page.getByRole("status")).toHaveText("");
  await expect.poll(() => listening(page)).toBe(false);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => server.connections.length).toBe(2);
});

test("keeps a touch hold on the button from scrolling or selecting", async ({
  page,
}) => {
  const button = await open(page);

  // -webkit-touch-callout is set too, but only Safari knows it.
  await expect(button).toHaveCSS("touch-action", "none");
  await expect(button).toHaveCSS("user-select", "none");
});

test("fails when audio processing does not start in 5 seconds", async ({
  page,
}) => {
  await page.clock.install();
  const button = await open(page, 'voice-listen-modes="toggle"');
  await page.evaluate(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    const page = window as unknown as {
      streams: MediaStream[];
      stuck: boolean;
    };
    page.streams = [];
    page.stuck = true;
    // Audio processing that never starts, as in Firefox without a sound
    // system, until stuck is cleared.
    window.AudioContext = class extends AudioContext {
      override resume() {
        return page.stuck ? new Promise<void>(() => {}) : super.resume();
      }
    };
    MediaDevices.prototype.getUserMedia = async (constraints) => {
      const stream = await real(constraints);
      page.streams.push(stream);
      return stream;
    };
  });
  const released = () =>
    page.evaluate(() =>
      (
        window as unknown as { streams: MediaStream[] }
      ).streams[0]!.getTracks().every((track) => track.readyState === "ended"),
    );

  await button.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { streams: MediaStream[] }).streams.length,
      ),
    )
    .toBe(1);
  await page.clock.fastForward(4900);
  await expect(page.getByRole("status")).toHaveText("Listening");
  await page.clock.fastForward(200);

  await expect(page.getByRole("status")).toHaveText("Voice failed");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(await released()).toBe(true);

  await page.evaluate(() => {
    (window as unknown as { stuck: boolean }).stuck = false;
  });
  await button.click();
  await expect(page.getByRole("status")).toHaveText("Listening");
  await expect
    .poll(() => server.connections[0]?.frames ?? 0)
    .toBeGreaterThan(0);
});

test("uses a getToken set after the element is defined", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  await page.locator("dicta-input").evaluate((element) => {
    (element as unknown as { getToken: () => Promise<string> }).getToken =
      async () => "after";
  });

  await button.click();

  await expect
    .poll(() => server.connections[0]?.protocols)
    .toBe("dicta, after");
});

test("keeps a getToken set before the element is defined", async ({ page }) => {
  // A page that does not load the module, so the element is defined only after
  // the page has set getToken.
  await page.goto("/empty");
  await page.evaluate(async (url) => {
    document.body.innerHTML = `<dicta-input server="${url}"
      voice-listen-modes="toggle"></dicta-input>`;
    const element = document.querySelector("dicta-input")!;
    (element as unknown as { getToken: () => Promise<string> }).getToken =
      async () => "before";
    const module = "/dist/index.js";
    await import(module);
  }, server.url);

  // The connection opens on the press, before the microphone is asked for.
  await page.getByRole("button", { name: "Speak" }).click();

  await expect
    .poll(() => server.connections[0]?.protocols)
    .toBe("dicta, before");
});

test("shortcut: names it in the tooltip only with the text field", async ({
  page,
}) => {
  await openPage(
    page,
    `<dicta-input id="both"></dicta-input>
     <dicta-input id="voice" inputs="voice"></dicta-input>`,
  );
  const speak = (id: string) =>
    page.locator(`#${id}`).getByRole("button", { name: "Speak" });

  await expect(speak("both")).toHaveAttribute(
    "title",
    "Speak (Ctrl+Shift+Space)",
  );
  await expect(speak("voice")).toHaveAttribute("title", "Speak");
});

test("keeps a toggle press made while a hold utterance ends", async ({
  page,
}) => {
  const button = await open(page);
  await holdAndRelease(page, button);

  // A click alone, as from a screen reader, during the 300 ms post-roll.
  await clickAlone(button);

  await untilEnds(1);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  // A toggle session: the fake microphone's silence ends the next utterance,
  // and the session goes on.
  await untilEnds(2, 10_000);
  await expect(button).toHaveAttribute("aria-pressed", "true");
});

test("starts again after a close during the end of a hold utterance", async ({
  page,
}) => {
  const button = await open(page);
  await holdAndRelease(page, button);

  // Within the 300 ms post-roll: the server closes, then the user presses.
  server.connections[0]!.socket.close(1011);
  await expect(page.getByRole("status")).toHaveText("Voice failed");
  await clickAlone(button);

  await expect(page.getByRole("status")).toHaveText("Listening");
  await expect.poll(() => server.connections.length).toBe(2);
  await expect.poll(() => server.connections[1]!.frames).toBeGreaterThan(0);
});
