export {};

/** Screen coordinates (desktop) or viewport coordinates (browser) of a menu's trigger. */
export type MenuAnchor = { x: number; y: number; width: number; height: number };

/** A popup window's size: `fixed` keeps it, otherwise it fits its content's height. */
export type PopupSpec = { width: number; height: number; fixed?: boolean; resizable?: boolean; minWidth?: number; minHeight?: number; noFocus?: boolean };

export type MgmBridge = {
  pickDirectory: () => Promise<string | null>;
  pickSaveDirectory: () => Promise<string | null>;
  /** An external program; the dialog opens in `current`'s folder, else the system program folder. */
  pickFile: (current?: string) => Promise<string | null>;
  openTool?: (url: string, kind: "diff" | "merge") => Promise<void>;
  platform: string;
  window?: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<boolean>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximized: (callback: (maximized: boolean) => void) => () => void;
    themeReady?: () => void;
  };

  /** The window's minimum size (clamped to the display); resolves with the width applied. */
  setMinimumSize: (width: number, height: number) => Promise<number>;

  /* Popups (src-tauri/src/popups.rs) — see src/host.ts for the façade callers use. */
  setBackgroundColor: (color: string) => Promise<boolean>;
  broadcastSettings: (settings: unknown) => Promise<boolean>;
  onSettingsChanged: (listener: (settings: unknown) => void) => () => void;

  /** Shows a menu; resolves with its openId (0 when it could not be shown). */
  openMenu: (payload: unknown, anchor: MenuAnchor) => Promise<number>;
  /** Closes menu `openId` (omitted: whichever is open); a stale id does nothing. */
  closeMenu: (openId?: number) => Promise<void>;
  menuPayload: () => Promise<unknown>;
  menuSize: (size: { width: number; height: number; openId?: number }) => Promise<void>;
  chooseMenu: (commandId: string) => Promise<void>;
  onMenuPayload: (listener: (payload: unknown) => void) => () => void;
  /** The answer for menu `openId`: the chosen id, or null when it was dismissed. */
  onMenuChosen: (listener: (answer: { openId: number; id: string | null }) => void) => () => void;

  openDialog: (name: string, payload: unknown, spec: PopupSpec) => Promise<boolean>;
  dialogPayload: () => Promise<unknown>;
  dialogResult: (name: string, result: unknown) => Promise<void>;
  closeDialog: (name?: string) => Promise<void>;
  closeAllDialogs: () => Promise<void>;
  dialogSize: (size: { width: number; height: number }) => Promise<void>;
  /** A new payload for an open dialog, without showing or focusing it; false when it is not open. */
  updateDialog: (name: string, payload: unknown) => Promise<boolean>;
  onDialogPayload: (listener: (payload: unknown) => void) => () => void;
  onDialogResult: (listener: (message: { name: string; result: unknown }) => void) => () => void;
  onDialogClosed: (listener: (name: string) => void) => () => void;

  openGuide: (section?: string) => Promise<boolean>;
  onGuideSection: (listener: (section: string) => void) => () => void;
};

declare global {
  const __MGM_BUILD__: string;

  interface Window {
    /** The desktop shell (src/tauriBridge.ts); absent in a browser tab. */
    mgm?: MgmBridge;
  }
}
