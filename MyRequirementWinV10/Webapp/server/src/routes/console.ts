import { Router } from "express";
import { signBootstrapToken, verifyBootstrapCredentials } from "../consoleAuth";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || !verifyBootstrapCredentials(username, password)) {
    res.status(401).json({ error: "Invalid ID or password." });
    return;
  }
  res.json({ token: signBootstrapToken() });
});

export default router;
