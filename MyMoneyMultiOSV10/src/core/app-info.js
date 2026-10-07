export const APP_INFO = {
  name: "MyMoney",
  version: "1.0.0",
  author: "SHKWON(knix008@naver.com)",
  buildNumber: "20261007.1",
  buildDate: "2026-10-07",
  fileExtension: "mymoney",
  fileTypeName: "MyMoney Document",
  mimeType: "application/x-mymoney",
  appId: "com.shkwon.mymoney",
  userDataFolder: "MyMoney",
};

export const WINDOW_TITLE = "MyMoney V1.0";

export function titleText() {
  return `${APP_INFO.name} ${APP_INFO.version}`;
}
