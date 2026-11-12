import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test-browser",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4179", headless: true },
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4179 --strictPort",
    url: "http://127.0.0.1:4179",
    reuseExistingServer: false,
  },
});
