import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "artifacts/api-server/src/lib/cleanupScheduler.ts",
        "artifacts/api-server/src/lib/sanitize.ts",
        "artifacts/api-server/src/services/ocr.ts",
        "artifacts/api-server/src/store.ts",
        "artifacts/cdsi-platform/src/translations.ts",
        "lib/api-client-react/src/custom-fetch.ts",
      ],
    },
  },
});
