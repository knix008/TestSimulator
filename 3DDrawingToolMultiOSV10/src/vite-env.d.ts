/// <reference types="vite/client" />

interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  saveProject: (data: string) => Promise<{ canceled: boolean; filePath?: string }>;
  openProject: () => Promise<{ canceled: boolean; filePath?: string; data?: string }>;
  openExternal: (url: string) => Promise<void>;
  exportImage: (payload: {
    pngBase64: string;
    format: string;
    fileName: string;
    quality: number;
    includeBackground: boolean;
    backgroundColor: string;
  }) => Promise<{ canceled: boolean; filePath?: string; warning?: string }>;
  platform: string;
  isElectron: boolean;
}

interface Window {
  electronAPI?: ElectronAPI;
}
