type Unsubscribe = () => void;

export type MenuAnchor = { x: number; y: number; width: number; height: number };

export type MdmBridge = {
  desktop: true;
  platform: NodeJS.Platform;

  info(): Promise<{
    platform: string;
    versions: { electron: string; chrome: string; node: string; v8: string };
    packaged: boolean;
    launcher: string;
    iconPath: string;
  }>;
  quit(): Promise<boolean>;

  setTitle(title: string): Promise<boolean>;
  setMinimumSize(width: number, height: number): Promise<number>;
  setBackgroundColor(color: string): Promise<boolean>;
  minimizeWindow(): Promise<boolean>;
  resizeWindowTo(width: number, height: number): Promise<boolean>;
  toggleMaximizeWindow(): Promise<boolean>;
  isMaximized(): Promise<boolean>;
  onWindowState(listener: (state: { maximized: boolean }) => void): Unsubscribe;
  setNativeTheme(kind: "light" | "dark" | "system"): Promise<string>;
  resetZoom(): void;

  pickFile(options?: {
    title?: string;
    defaultPath?: string;
    multiple?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | string[] | null>;
  pickDirectory(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
  pickSave(options?: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;

  copyText(value: string): Promise<boolean>;
  readText(): Promise<string>;
  openExternal(target: string): Promise<boolean>;
  revealInFolder(target: string): Promise<boolean>;

  mergeSaved(): Promise<boolean>;
  print(options?: { printBackground?: boolean; landscape?: boolean }): Promise<{ ok: boolean; reason: string }>;

  openMenu(payload: unknown, anchor: MenuAnchor): Promise<boolean>;
  closeMenu(): Promise<void>;
  menuPayload(): Promise<unknown>;
  menuSize(size: { width: number; height: number }): Promise<void>;
  chooseMenu(commandId: string): Promise<void>;
  onMenuPayload(listener: (payload: unknown) => void): Unsubscribe;
  onMenuChosen(listener: (commandId: string) => void): Unsubscribe;

  openDialog(name: string, payload?: unknown): Promise<boolean>;
  dialogPayload(): Promise<unknown>;
  dialogResult(name: string, result: unknown): Promise<void>;
  closeDialog(name?: string): Promise<void>;
  closeAllDialogs(): Promise<void>;
  dialogSize(size: { width: number; height: number }): Promise<void>;
  onDialogPayload(listener: (payload: unknown) => void): Unsubscribe;
  onDialogResult(listener: (payload: { name: string; result: unknown }) => void): Unsubscribe;
  onDialogClosed(listener: (name: string) => void): Unsubscribe;

  broadcastSettings(settings: unknown): Promise<boolean>;
  onSettingsChanged(listener: (settings: unknown) => void): Unsubscribe;
  onOpenRequest(listener: (argv: string[]) => void): Unsubscribe;
};

declare global {
  /** Injected by vite.config.ts at build time. */
  const __MDM_VERSION__: string;
  const __MDM_BUILD__: string;

  interface Window {
    mdm?: MdmBridge;
    /** Installed by the app for the automated GUI test; absent in normal runs. */
    __mdm?: Record<string, unknown>;
    queryLocalFonts?: () => Promise<{ family: string; postscriptName: string; style: string }[]>;
  }
}

export {};
