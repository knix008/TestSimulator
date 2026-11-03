// Module hooks for test/register-assets.mjs (they run in Node's loader thread).
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const STYLE = /\.(css|scss|less)$/i;
const FILE = /\.(png|jpe?g|gif|svg|ico|icns|webp|woff2?|ttf|otf)$/i;

function split(specifier) {
  const at = specifier.indexOf("?");
  return at < 0 ? [specifier, ""] : [specifier.slice(0, at), specifier.slice(at)];
}

const isAsset = (path, query) => query === "?raw" || STYLE.test(path) || FILE.test(path) || /\.md$/i.test(path);

export async function resolve(specifier, context, nextResolve) {
  const [path, query] = split(specifier);
  if (!isAsset(path, query)) return nextResolve(specifier, context);
  const url = path.startsWith(".") || path.startsWith("/") || path.startsWith("file:")
    ? new URL(path, context.parentURL).href
    : (await nextResolve(path, context)).url;
  return { url: `${url}${query}`, shortCircuit: true };
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith("file:")) return nextLoad(url, context);
  const [path, query] = split(url);
  if (!isAsset(path, query)) return nextLoad(url, context);
  const file = fileURLToPath(path);
  let source = "export default undefined;";
  if (query === "?raw" || /\.md$/i.test(path)) source = `export default ${JSON.stringify(fs.readFileSync(file, "utf8"))};`;
  else if (FILE.test(path)) source = `export default ${JSON.stringify(file)};`;
  return { format: "module", source, shortCircuit: true };
}
