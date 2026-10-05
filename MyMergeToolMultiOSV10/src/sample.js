(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyMergeSample = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const total = {
    name: "total.js",
    baseText: "function total(price, count) {\n  return price * count;\n}\n",
    localText: "function total(price, count) {\n  const tax = 0.1;\n  return price * count * (1 + tax);\n}\n",
    remoteText: "function total(price, qty) {\n  return price * qty;\n}\n",
  };
  const readme = {
    name: "README.md",
    baseText: "# Guide\n\nInstall the tool.\n",
    localText: "# Guide\n\nInstall the desktop tool.\n",
    remoteText: "# Guide\n\nInstall the tool.\nSee the website.\n",
  };
  return { total: total, readme: readme };
});
