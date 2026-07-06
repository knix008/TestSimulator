export interface AppBuildInfo {
  version: string;
  buildDate: string | null;
  commit: string;
  branch: string;
  builtOnPlatform: string;
  builtOnArch: string;
  electronVersion: string;
  development: boolean;
}

export interface AppInfo {
  version: string;
  productName: string;
  build: AppBuildInfo;
}
