"use strict";

const path = require("path");
const { executeAppBuilder } = require("builder-util");

exports.afterPack = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const appInfo = context.packager.appInfo;
  const exe = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const icon = path.join(context.packager.projectDir, "build", "icon.ico");
  const args = [
    exe,
    "--set-version-string", "FileDescription", appInfo.description || appInfo.productName,
    "--set-version-string", "ProductName", appInfo.productName,
    "--set-version-string", "LegalCopyright", appInfo.copyright,
    "--set-file-version", appInfo.shortVersion || appInfo.buildVersion,
    "--set-product-version", appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm(),
    "--set-version-string", "InternalName", appInfo.productFilename,
    "--set-version-string", "OriginalFilename", "",
    "--set-icon", icon,
  ];
  await executeAppBuilder(["rcedit", "--args", JSON.stringify(args)]);
};
