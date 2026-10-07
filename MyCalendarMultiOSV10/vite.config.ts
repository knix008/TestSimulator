import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: [
      {
        // The package's exports map does not expose its JSON rules, so point at the file directly.
        // A pattern keeps the `?url` query that follows the name.
        find: /^date-holidays-rules\.json/,
        replacement: fileURLToPath(new URL("node_modules/date-holidays/data/holidays.json", import.meta.url)),
      },
      {
        // The holiday parser only needs moment-timezone's core; holidayRules.ts loads the zone data as JSON.
        find: /^moment-timezone$/,
        replacement: "moment-timezone/moment-timezone.js",
      },
    ],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
