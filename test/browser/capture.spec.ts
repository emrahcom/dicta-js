import { expect, type Page, test } from "@playwright/test";
import { openPage } from "./page.ts";

// Adds a button that starts the capture on click, because browsers start audio
// only from a user action, and clicks it.
async function startFromClick(page: Page) {
  await openPage(page, "<button>start</button>");
  await page.evaluate(async () => {
    const { startCapture } = await import("/dist/audio/capture.js" as string);
    const state = window as unknown as Record<string, unknown>;
    const frames: ArrayBuffer[] = [];
    const tracks: MediaStreamTrack[] = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    MediaDevices.prototype.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      tracks.push(...stream.getTracks());
      return stream;
    };
    Object.assign(state, { frames, tracks });
    document.querySelector("button")!.onclick = () => {
      state.capture = startCapture((frame: ArrayBuffer) => frames.push(frame));
    };
  });
  await page.click("button");
}

test("captures 50 ms frames with sound and releases the microphone", async ({
  page,
}) => {
  await startFromClick(page);

  const result = await page.evaluate(async () => {
    const state = window as unknown as {
      capture: Promise<{ stop: () => Promise<void> }>;
      frames: ArrayBuffer[];
      tracks: MediaStreamTrack[];
    };
    const capture = await state.capture;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await capture.stop();
    return {
      sizes: state.frames.map((frame) => frame.byteLength),
      loud: state.frames.some((frame) =>
        new Int16Array(frame).some((sample) => Math.abs(sample) > 1000),
      ),
      ended: state.tracks.map((track) => track.readyState),
    };
  });

  // About 30 frames in 1.5 s; the last one is the shorter rest.
  expect(result.sizes.length).toBeGreaterThan(20);
  expect(result.sizes.slice(0, -1).every((size) => size === 1600)).toBe(true);
  expect(result.sizes.at(-1)).toBeGreaterThan(0);
  expect(result.sizes.at(-1)).toBeLessThanOrEqual(1600);
  expect(result.loud).toBe(true);
  expect(result.ended).toEqual(["ended"]);
});

test("rejects when the microphone is denied", async ({ page }) => {
  await openPage(page, "");

  const error = await page.evaluate(async () => {
    MediaDevices.prototype.getUserMedia = () =>
      Promise.reject(new DOMException("denied", "NotAllowedError"));
    const { startCapture } = await import("/dist/audio/capture.js" as string);
    try {
      await startCapture(() => {});
      return "started";
    } catch (err) {
      return (err as DOMException).name;
    }
  });

  expect(error).toBe("NotAllowedError");
});
