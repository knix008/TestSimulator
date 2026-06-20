import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

// Token-signing secrets must survive process restarts — otherwise every restart (including
// tsx watch reloading on every file save during development) silently invalidates every
// logged-in session and bounces users back to the login screen. Persisted alongside the
// other server-local state in data/ (gitignored).
const SECRETS_PATH = path.join(process.cwd(), "data", "secrets.json");

interface Secrets {
  jwt: string;
  bootstrap: string;
}

function loadOrCreateSecrets(): Secrets {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_PATH, "utf-8"));
  } catch {
    const secrets: Secrets = {
      jwt: randomBytes(48).toString("hex"),
      bootstrap: randomBytes(48).toString("hex")
    };
    fs.mkdirSync(path.dirname(SECRETS_PATH), { recursive: true });
    fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), "utf-8");
    return secrets;
  }
}

const secrets = loadOrCreateSecrets();

export const JWT_SECRET = process.env.JWT_SECRET ?? secrets.jwt;
export const BOOTSTRAP_TOKEN_SECRET = secrets.bootstrap;
