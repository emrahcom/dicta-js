import { mkdirSync, writeFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The test server's port, see test/browser/server.ts.
const PORT = 4173;

// The sound of Chromium's fake microphone, which plays it in a loop: 1 s of a
// tone, as speech, then 2 s of silence. Generated here, so no audio file is
// kept in the repo.
const FAKE_MICROPHONE = "node_modules/.cache/dicta-js/bursts.wav";
mkdirSync("node_modules/.cache/dicta-js", { recursive: true });
writeFileSync(FAKE_MICROPHONE, bursts());

function bursts() {
  const rate = 16_000;
  const samples = rate * 3;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < rate; i++) {
    const sample = 0.3 * Math.sin((2 * Math.PI * 300 * i) / rate);
    wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return wav;
}

export default defineConfig({
  testDir: "test/browser",
  webServer: {
    command: "node test/browser/server.ts",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A fake microphone that plays FAKE_MICROPHONE, allowed without a
        // prompt.
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-audio-capture=${FAKE_MICROPHONE}`,
          ],
        },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        // A fake microphone that plays a tone, allowed without a prompt.
        launchOptions: {
          firefoxUserPrefs: {
            "media.navigator.streams.fake": true,
            "media.navigator.permission.disabled": true,
          },
        },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
