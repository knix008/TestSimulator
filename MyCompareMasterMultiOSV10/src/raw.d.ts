// `import text from "../file.md?raw"`: Vite hands over the file's text as a string.
// Vite's `import.meta.glob`, the one part of vite/client the app uses (the guide's
// pictures); the tsconfig does not load vite/client's types.
interface ImportMeta {
  glob<T = unknown>(
    pattern: string | string[],
    options?: { eager?: boolean; query?: string; import?: string },
  ): Record<string, T>;
}

declare module "*.md?raw" {
  const text: string;
  export default text;
}
