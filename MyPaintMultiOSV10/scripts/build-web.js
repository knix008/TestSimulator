const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "dist", "web");

function copy(rel) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

fs.rmSync(dest, { recursive: true, force: true });
["index.html", "popup.html", "style", "src", "assets"].forEach(copy);
// the user guide, when it is there
["guide.html", "guide"].filter((rel) => fs.existsSync(path.join(root, rel))).forEach(copy);
console.log("web build:", dest);
