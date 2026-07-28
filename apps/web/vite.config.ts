import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@huddle/protocol": path.join(root, "../../packages/protocol/src/index.ts"),
      "@huddle/authz": path.join(root, "../../packages/authz/src/index.ts"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
  },
});
