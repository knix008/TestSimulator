import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 2000 },
  server: { strictPort: true },
});
