import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import { type WebSocket, WebSocketServer } from "ws";
import { events, openPage } from "./page.ts";

type ServerConnection = {
  socket: WebSocket;
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
  server.on("connection", (socket) => {
    const connection: ServerConnection = { socket, frames: 0, ends: [] };
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

async function untilFrames(count: number) {
  await expect
    .poll(() => server.connections[0]?.frames ?? 0)
    .toBeGreaterThan(count);
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
  await expect.poll(() => server.connections[0]!.ends.length).toBe(1);
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
  await expect.poll(() => server.connections[0]!.ends.length).toBe(1);
});

test("toggle: a press starts and the next press ends", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await untilFrames(5);
  await button.press("Enter");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => server.connections[0]!.ends.length).toBe(1);
});

test("shows interim text and sends finals with text as voice events", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
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
  await expect.poll(() => server.connections[0]!.ends.length).toBe(1);

  server.connections[0]!.socket.close(1011);
  await page.waitForTimeout(100);
  await button.click();

  await expect.poll(() => server.connections.length).toBe(2);
  await expect.poll(() => server.connections[1]!.frames).toBeGreaterThan(0);
});

test("stops and clears the caption when the connection closes", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
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

  await expect(page.locator("#voice").getByRole("button")).toBeVisible();
  await expect(page.locator("#text").getByRole("button")).toBeHidden();
});

test("shows Listening while speaking and the final after it", async ({
  page,
}) => {
  const button = await open(page, 'voice-listen-modes="toggle"');
  const status = page.locator("dicta-input .status");
  await expect(status).toHaveAttribute("role", "status");

  await button.click();
  await expect(page.getByRole("status")).toHaveText("Listening");
  await untilFrames(1);
  await button.click();
  await expect.poll(() => server.connections[0]!.ends.length).toBe(1);
  await expect(status).toHaveText("");
  transcript("add a note", true);

  await expect(page.getByRole("status")).toHaveText("add a note");
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
    navigator.mediaDevices.getUserMedia = () =>
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

// The fake microphone plays 1 s of tone, then 2 s of silence, in a loop
// (playwright.config.ts).

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

  await expect.poll(() => server.connections[0]!.ends.length).toBe(1);
  const { frames } = server.connections[0]!;
  await page.waitForTimeout(1500);
  expect(server.connections[0]!.ends.length).toBe(1);
  expect(server.connections[0]!.frames).toBe(frames);
});

test("toggle: a press during a pause only stops", async ({ page }) => {
  const button = await open(page, 'voice-listen-modes="toggle"');

  await button.click();
  await expect.poll(() => server.connections[0]?.ends.length ?? 0).toBe(1);
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
  await page.clock.install();
  const button = await open(page, 'voice-listen-modes="toggle"');
  // A silent microphone instead of the fake one, so nothing is speech.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () =>
      new AudioContext().createMediaStreamDestination().stream;
  });
  await button.click();
  await expect(page.getByRole("status")).toHaveText("Listening");

  await page.clock.fastForward("04:59");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.clock.fastForward("00:02");

  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("dicta-input .status")).toHaveText("");
});

test("disables the mode switch while listening", async ({ page }) => {
  const button = await open(page);
  const modes = page.getByRole("combobox", { name: "Voice mode" });

  await button.hover();
  await page.mouse.down();
  await expect(modes).toBeDisabled();
  await page.mouse.up();

  await expect(modes).toBeEnabled();
});

test("uses the mode the user picks", async ({ page }) => {
  const button = await open(page);
  await page
    .getByRole("combobox", { name: "Voice mode" })
    .selectOption("Hands-free");

  // A click starts a session instead of a short hold.
  await button.click();
  await untilFrames(3);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();

  await expect(button).toHaveAttribute("aria-pressed", "false");
});
