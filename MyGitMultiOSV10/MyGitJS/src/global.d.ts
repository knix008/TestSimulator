export {};

declare global {
  const __MYGIT_BUILD__: string;

  interface Window {
    mygit?: {
      pickDirectory: () => Promise<string | null>;
      pickSaveDirectory: () => Promise<string | null>;
      pickFile: () => Promise<string | null>;
      platform: string;
      window?: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<boolean>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        onMaximized: (callback: (maximized: boolean) => void) => () => void;
        themeReady?: () => void;
      };
    };
  }
}
