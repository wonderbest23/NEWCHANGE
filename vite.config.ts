// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    importProtection: {
      // Lovable-exported routes currently import createServerFn modules under src/server.
      // Skip route importer checks to prevent false-positive hard failures during migration stabilization.
      ignoreImporters: ["src/routes/**"],
      // *.functions.ts files use createServerFn which the TanStack Start compiler
      // rewrites into client-RPC stubs. They live under src/server/** but must be
      // importable by the client. Without this exclusion, import-protection
      // returns mock modules and pages relying on these server functions break at runtime.
      client: {
        excludeFiles: ["**/node_modules/**", "**/*.functions.*"],
      },
    },
  },
});
