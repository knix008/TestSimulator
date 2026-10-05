const fs = require("fs");
const path = require("path");

const release = path.join(__dirname, "..", "release");
if (!fs.existsSync(release)) process.exit(0);
const setup = fs.readdirSync(release).find((name) => name.endsWith(".exe"));
if (!setup) process.exit(0);
fs.copyFileSync(path.join(release, setup), path.join(__dirname, "..", setup));
console.log("copied", setup);
