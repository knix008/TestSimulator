export function dirname(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return normalized.slice(0, index);
}

export function basename(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

export function userDataDir(platformName, home, folder = "MyWeather") {
  if (platformName === "win32") return `${home}\\AppData\\Roaming\\${folder}`;
  if (platformName === "darwin") return `${home}/Library/Application Support/${folder}`;
  return `${home}/.config/${folder}`;
}
