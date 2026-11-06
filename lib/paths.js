import os from "node:os";
import path from "node:path";

export function claudeConfigDir(env = process.env, home = os.homedir()) {
  const configured = typeof env.CLAUDE_CONFIG_DIR === "string" ? env.CLAUDE_CONFIG_DIR.trim() : "";
  return path.resolve(configured || path.join(home, ".claude"));
}
