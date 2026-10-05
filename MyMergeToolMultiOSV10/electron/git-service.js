const { spawn } = require("child_process");

function run(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: cwd || process.cwd(),
      windowsHide: true,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0" }),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else {
        const error = new Error((stderr || stdout || ("git exit " + code)).trim());
        error.stderr = stderr;
        error.stdout = stdout;
        error.code = code;
        reject(error);
      }
    });
  });
}

async function inspect(dir) {
  const root = (await run(dir, ["rev-parse", "--show-toplevel"])).trim();
  const branch = (await run(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const porcelain = await run(root, ["status", "--porcelain"]);
  return { root: root, branch: branch, porcelain: porcelain };
}

async function showStage(root, file, stage) {
  try {
    return await run(root, ["show", ":" + stage + ":" + file]);
  } catch (error) {
    return "";
  }
}

async function readStages(root, file) {
  const base = await showStage(root, file, 1);
  const local = await showStage(root, file, 2);
  const remote = await showStage(root, file, 3);
  return { base: base, local: local, remote: remote };
}

module.exports = { run: run, inspect: inspect, readStages: readStages };
