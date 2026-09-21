"use strict";

const fs = require("fs");
const path = require("path");

function certDir() {
  return path.join(__dirname, "..", "certs");
}

function loadTlsCerts() {
  const dir = certDir();
  return {
    key: fs.readFileSync(path.join(dir, "key.pem")),
    cert: fs.readFileSync(path.join(dir, "cert.pem"))
  };
}

module.exports = { certDir, loadTlsCerts };
