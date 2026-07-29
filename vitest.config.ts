import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@huddle/protocol": path.join(root, "packages/protocol/src/index.ts"),
      "@huddle/authz": path.join(root, "packages/authz/src/index.ts"),
      "@huddle/authz/crypto": path.join(root, "packages/authz/src/crypto.ts"),
      "@huddle/testkit": path.join(root, "packages/testkit/src/index.ts"),
      "@huddle/codex-adapter": path.join(root, "packages/codex-adapter/src/index.ts"),
      "@huddle/runner-core": path.join(root, "packages/runner-core/src/index.ts"),
      "@huddle/persistence": path.join(root, "packages/persistence/src/index.ts"),
      "@huddle/analytics": path.join(root, "packages/analytics/src/index.ts"),
      "@huddle/opencode-adapter": path.join(root, "packages/opencode-adapter/src/index.ts"),
      "@huddle/control-plane": path.join(root, "apps/control-plane/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: ["apps/web/**", "**/node_modules/**", "**/dist/**", "**/build/**"],
    environment: "node",
  },
});
