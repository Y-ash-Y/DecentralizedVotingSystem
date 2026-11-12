import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test-sandbox",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4182" },
  webServer: {
    command: "npm run build:sandbox && npm run preview -- --host 127.0.0.1 --port 4182 --strictPort",
    url: "http://127.0.0.1:4182/sandbox/",
    reuseExistingServer: false,
  },
});
