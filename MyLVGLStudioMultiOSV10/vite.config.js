import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const commit = () => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};

const pad = (value) => String(value).padStart(2, "0");
const now = new Date();

// MLS_REACT_DEV=1: a build with React's development checks and full error messages, for finding a fault.
const reactDev = process.env.MLS_REACT_DEV === "1";

export default defineConfig({
  plugins: [react()],
  ...(reactDev ? { mode: "development" } : {}),
  base: "./",
  clearScreen: false,
  define: {
    ...(reactDev ? { "process.env.NODE_ENV": JSON.stringify("development") } : {}),
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version),
    __BUILD_INFO__: JSON.stringify({ date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`, commit: commit() }),
  },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 2000 },
  // The spell checker (hunspell-asm): the ESM builds of it and its loader call a module namespace
  // (nanoid 2) as a function, which breaks once bundled; their CommonJS builds do not.
  resolve: { alias: [{ find: /^emscripten-wasm-loader$/, replacement: fileURLToPath(new URL("./node_modules/emscripten-wasm-loader/dist/cjs/index.js", import.meta.url)) }] },
  // The folder also holds the LVGL sources and every build's output, tens of thousands of files.
  // Left to itself the dev server looks through and watches all of them before serving the page:
  // that took 46 seconds at each npm start.
  optimizeDeps: { entries: ["index.html"] },
  server: {
    strictPort: true,
    watch: { ignored: ["**/third_party/**", "**/src-tauri/**", "**/build/**", "**/dist/**", "**/test-results/**", "**/samples/**", "**/.git/**"] },
  },
});
