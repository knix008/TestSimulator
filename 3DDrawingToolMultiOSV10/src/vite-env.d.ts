/// <reference types="vite/client" />

interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  saveProject: (data: string) => Promise<{ canceled: boolean; filePath?: string }>;
  openProject: () => Promise<{ canceled: boolean; filePath?: string; data?: string }>;
  openExternal: (url: string) => Promise<void>;
  platform: string;
  isElectron: boolean;
}

interface Window {
  electronAPI?: ElectronAPI;
}
