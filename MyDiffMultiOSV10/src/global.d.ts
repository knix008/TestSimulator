export {};

declare global {
  /** Build stamp injected by Vite. */
  const __MYDIFF_BUILD__: string;

  interface Window {
    /** Present only in the Electron build (see electron/preload.cjs). */
    mydiff?: {
      platform: string;
      pickFile: (title?: string) => Promise<string | null>;
      pickDirectory: (title?: string) => Promise<string | null>;
      copyText: (value: string) => Promise<boolean>;
      openExternal: (target: string) => Promise<boolean>;
    };
  }
}
