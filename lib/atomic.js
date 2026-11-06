import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function atomicWrite(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = path.join(
    path.dirname(filename),
    `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(handle, content, "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temporary, filename);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    fs.rmSync(temporary, { force: true });
  }
}

export function writePageSnapshot(directory, name, value) {
  // Script, rather than fetch(), because Magpie's page CSP has connect-src 'none'.
  const json = JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
  atomicWrite(path.join(directory, `${name}.js`), `globalThis.__CLAUDE_SUBAGENT_ROUTER_${name.toUpperCase()}__ = ${json};\n`);
}
