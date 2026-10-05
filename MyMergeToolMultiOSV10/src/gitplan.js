(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeGit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parsePorcelain(text) {
    const rows = [];
    String(text || "").split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const status = line.slice(0, 2);
      let file = line.slice(3);
      if (file.includes(" -> ")) file = file.split(" -> ").pop();
      rows.push({ status: status, file: file.trim().replace(/^"|"$/g, "") });
    });
    return rows;
  }

  function isConflictStatus(status) {
    return status.indexOf("U") >= 0 || status === "AA" || status === "DD";
  }

  function conflictPaths(porcelain) {
    return parsePorcelain(porcelain).filter((row) => isConflictStatus(row.status)).map((row) => row.file);
  }

  function collectLaunchArgs(argv, packaged) {
    const list = argv || [];
    if (packaged) return list.slice(1);
    const sep = list.indexOf("--");
    if (sep >= 0) return list.slice(sep + 1);
    return [];
  }

  function parseLaunchArgs(args) {
    const paths = (args || []).filter((arg) => arg && !String(arg).startsWith("-"));
    if (paths.length >= 4) {
      return { mode: "mergetool", base: paths[0], local: paths[1], remote: paths[2], merged: paths[3] };
    }
    if (paths.length === 1) return { mode: "file", file: paths[0] };
    return { mode: "standalone" };
  }

  function stageArgs(file) {
    return [1, 2, 3].map((stage) => ["show", ":" + stage + ":" + file]);
  }

  function mergetoolConfig(exe) {
    const command = '"' + exe + '" "$BASE" "$LOCAL" "$REMOTE" "$MERGED"';
    return [
      'git config --global mergetool.mymerge.cmd "' + command.replace(/"/g, '\\"') + '"',
      "git config --global mergetool.mymerge.trustExitCode true",
      "git config --global merge.tool mymerge",
    ];
  }

  function formatGitError(command, stderr) {
    return ["git " + command, String(stderr || "").trim()].filter(Boolean).join("\n");
  }

  function assignDroppedFiles(names) {
    const files = (names || []).map((name, index) => ({
      index: index,
      name: name,
      lower: String(name).toLowerCase(),
    }));
    if (files.length === 1) {
      if (files[0].lower.endsWith(".mmerge")) return { kind: "session", file: files[0] };
      return { kind: "single", file: files[0] };
    }
    const find = (words) => files.find((file) => words.some((word) => file.lower.includes(word)));
    const base = find(["base", "ancestor"]);
    const local = find(["local", "ours", "mine"]);
    const remote = find(["remote", "theirs"]);
    const merged = find(["merged", "result"]);
    if (base && local && remote) return { kind: "three", base: base, local: local, remote: remote, merged: merged || null };
    if (files.length >= 3) {
      return { kind: "three-order", base: files[0], local: files[1], remote: files[2], merged: files[3] || null };
    }
    return { kind: "unknown", files: files };
  }

  return {
    parsePorcelain: parsePorcelain,
    isConflictStatus: isConflictStatus,
    conflictPaths: conflictPaths,
    collectLaunchArgs: collectLaunchArgs,
    parseLaunchArgs: parseLaunchArgs,
    stageArgs: stageArgs,
    mergetoolConfig: mergetoolConfig,
    formatGitError: formatGitError,
    assignDroppedFiles: assignDroppedFiles,
  };
});
