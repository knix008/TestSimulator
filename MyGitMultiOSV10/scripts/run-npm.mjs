import { spawn } from "node:child_process";

const env = { ...process.env };
delete env.npm_config_global_ignore_file;
delete env.NPM_CONFIG_GLOBAL_IGNORE_FILE;
delete env.npm_config_devdir;
delete env.NPM_CONFIG_DEVDIR;

const args = process.argv.slice(2);
const child = process.platform === "win32"
  ? spawn(env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", ["npm", ...args.map(quoteArg)].join(" ")], {
    stdio: "inherit",
    env,
    windowsHide: true,
  })
  : spawn("npm", args, { stdio: "inherit", env });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

function quoteArg(value) {
  if (value.length === 0) return "\"\"";
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\\\"")}"`;
}
