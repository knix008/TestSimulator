// Lets the Node test runner import UI modules that import assets the way Vite does:
//
//   import "./styles.css"            → an empty module
//   import icon from "./icon.png"    → the file's path (like Vite's URL string)
//   import text from "./guide.md?raw" → the file's text
//
// Registered with `tsx --import ./test/register-assets.mjs test/run.ts`.
import { register } from "node:module";

register(new URL("./asset-hooks.mjs", import.meta.url));
