import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { environment: "jsdom", include: ["test-ui/**/*.test.jsx"], restoreMocks: true },
});
