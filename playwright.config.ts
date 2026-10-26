import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The test server's port, see test/browser/server.ts.
const PORT = 4173;

// Playwright's Firefox plays and processes audio only through PulseAudio.
// apulse gives it ALSA instead, so no sound server is needed.
const APULSE = "/usr/lib/x86_64-linux-gnu/apulse";

export default defineConfig({
  testDir: "test/browser",
  webServer: {
    command: "node test/browser/server.ts",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
  },
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: existsSync(APULSE)
          ? { env: { ...process.env, LD_LIBRARY_PATH: APULSE } }
          : {},
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
