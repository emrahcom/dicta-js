// Opens the test server's page (server.ts), which loads the built module, and
// puts the given markup into its body. The page gets a fake microphone.

import type { Page } from "@playwright/test";

export async function openPage(page: Page, body: string) {
  await page.addInitScript(fakeMicrophone);
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

// The same fake microphone in every browser, made in the page: a 300 Hz tone,
// 1 s on as speech and 2 s off as silence, in a loop. The steps are scheduled
// on the AudioContext clock, so a fake page clock does not stop them. It is set
// on the prototype, since WebKit drops one set on navigator.mediaDevices after
// the first capture; tests that replace getUserMedia themselves do the same.
function fakeMicrophone() {
  const CYCLES = 200; // 10 minutes
  MediaDevices.prototype.getUserMedia = async () => {
    const context = new AudioContext();
    void context.resume();
    const tone = context.createOscillator();
    tone.frequency.value = 300;
    const volume = context.createGain();
    volume.gain.value = 0;
    const start = context.currentTime;
    for (let i = 0; i < CYCLES; i++) {
      volume.gain.setValueAtTime(0.3, start + i * 3);
      volume.gain.setValueAtTime(0, start + i * 3 + 1);
    }
    const output = context.createMediaStreamDestination();
    tone.connect(volume).connect(output);
    tone.start();
    return output.stream;
  };
}
