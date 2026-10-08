export const APP_INFO = {
  name: "MyWeather",
  version: "1.0.0",
  author: "SHKWON(knix008@naver.com)",
  buildNumber: "20261007.1",
  buildDate: "2026-10-07",
  fileExtension: "myweather",
  fileTypeName: "MyWeather Document",
  mimeType: "application/x-myweather",
  appId: "com.shkwon.myweather",
  userDataFolder: "MyWeather",
};

export const WINDOW_TITLE = APP_INFO.name;

export function titleText() {
  return `${APP_INFO.name} ${APP_INFO.version}`;
}
