import { defineConfig, devices } from "@playwright/test";

// The test server's port, see test/browser/server.ts.
const PORT = 4173;

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
        // A fake microphone that plays a beep, allowed without a prompt.
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
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
