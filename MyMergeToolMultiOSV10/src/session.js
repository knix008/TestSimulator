(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function serialize(docs) {
    return JSON.stringify({
      kind: "mymerge-session",
      version: 1,
      savedAt: new Date().toISOString(),
      files: (docs || []).map((doc) => ({
        name: doc.name,
        baseText: doc.baseText,
        localText: doc.localText,
        remoteText: doc.remoteText,
        resultText: doc.resultText,
        basePath: doc.basePath || "",
        localPath: doc.localPath || "",
        remotePath: doc.remotePath || "",
        mergedPath: doc.mergedPath || "",
        encoding: doc.encoding || "UTF-8",
        eol: doc.eol || "LF",
        labels: doc.labels,
        initialConflicts: doc.initialConflicts || 0,
        resolved: doc.resolved || 0,
      })),
    }, null, 2);
  }

  function parse(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      const wrapped = new Error("Session file is not valid JSON: " + error.message);
      wrapped.code = "SESSION_JSON";
      throw wrapped;
    }
    if (!data || data.kind !== "mymerge-session" || !Array.isArray(data.files)) {
      const error = new Error("This file is not a MyMerge session (.mmerge).");
      error.code = "SESSION_KIND";
      throw error;
    }
    return data;
  }

  return { serialize: serialize, parse: parse };
});
