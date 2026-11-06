import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { runPlugin } from "../index.js";

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-router-plugin-"));
  const claude = path.join(root, "claude");
  const page = path.join(root, "page");
  fs.mkdirSync(claude, { recursive: true });
  fs.mkdirSync(page, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, claude, page };
}

function snapshot(page, name) {
  const content = fs.readFileSync(path.join(page, `${name}.js`), "utf8");
  return JSON.parse(content.slice(content.indexOf("= ") + 2, content.lastIndexOf(";")));
}

test("host end-to-end sync uses CLAUDE_CONFIG_DIR and emits safe snapshots", async (t) => {
  const { claude, page } = sandbox(t);
  fs.writeFileSync(path.join(claude, "settings.json"), JSON.stringify({
    env: { TOKEN: "unit-test-only-credential" },
    modelPicker: { options: [
      { model: "provider/a", label: "A", description: "via magpie" },
      { model: "provider/b", label: "B", description: "via magpie" },
    ] },
  }));
  await runPlugin({}, { models: [
    { model: "provider/a", roles: ["fast"] },
    { model: "provider/b", roles: ["reasoning", "review"] },
  ] }, { CLAUDE_CONFIG_DIR: claude }, page);
  assert.equal(snapshot(page, "status").hook.ok, true);
  assert.deepEqual(snapshot(page, "catalog"), { models: [{ model: "provider/a", label: "A" }, { model: "provider/b", label: "B" }] });
  assert.equal(snapshot(page, "status").sync.agents.length, 2);
  assert.equal(fs.readdirSync(path.join(claude, "agents")).filter((name) => name.endsWith(".md")).length, 2);
  for (const name of ["catalog.js", "status.js"]) {
    const content = fs.readFileSync(path.join(page, name), "utf8");
    assert.doesNotMatch(content, /unit-test-only-credential|private-account|another-account|"env"/);
  }

  await runPlugin({}, { models: [] }, { CLAUDE_CONFIG_DIR: claude }, page);
  assert.equal(fs.readdirSync(path.join(claude, "agents")).filter((name) => name.endsWith(".md")).length, 0);
});

test("a clean GitHub-style source copy generates both hooks on Apply", async (t) => {
  const { root, claude, page } = sandbox(t);
  const source = fileURLToPath(new URL("..", import.meta.url));
  const installed = path.join(root, "node_modules", "magpie-claude-subagent-router");
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.cpSync(source, installed, { recursive: true, filter: (file) =>
    !file.includes(`${path.sep}.git${path.sep}`)
    && !file.includes(`${path.sep}test${path.sep}`)
    && !file.endsWith(`${path.sep}page${path.sep}catalog.js`)
    && !file.endsWith(`${path.sep}page${path.sep}status.js`) });
  fs.mkdirSync(path.join(installed, "page"), { recursive: true });
  fs.writeFileSync(path.join(claude, "settings.json"), JSON.stringify({
    modelPicker: { options: [{ model: "provider/fresh", label: "Fresh", description: "via magpie" }] },
  }));
  const { runPlugin: installPlugin } = await import(new URL("index.js", pathToFileURL(installed + path.sep)));
  await installPlugin({}, { mode: "strict", models: [{ model: "provider/fresh", roles: ["general"] }] }, { CLAUDE_CONFIG_DIR: claude }, path.join(installed, "page"));
  const settings = JSON.parse(fs.readFileSync(path.join(claude, "settings.json"), "utf8"));
  for (const event of ["PreToolUse", "SessionStart"]) {
    assert.equal(settings.hooks[event].length, 1);
    assert.equal(settings.hooks[event][0].hooks[0].command, `node "${path.join(installed, "hook.js")}"`);
  }
  assert.equal(fs.readdirSync(path.join(claude, "agents")).filter((name) => name.endsWith(".md")).length, 1);
  assert.equal(fs.existsSync(path.join(installed, "page", "catalog.js")), true);
  assert.equal(fs.existsSync(path.join(installed, "page", "status.js")), true);
});

test("the npm release archive loads from an extracted package", async (t) => {
  const { root } = sandbox(t);
  const source = fileURLToPath(new URL("..", import.meta.url));
  const archive = execFileSync("npm", ["pack", "--silent", "--pack-destination", root], { cwd: source, encoding: "utf8", shell: process.platform === "win32" }).trim();
  execFileSync("tar", ["-xzf", archive, "-C", "."], { cwd: root });
  const { runPlugin: installPlugin } = await import(pathToFileURL(path.join(root, "package", "index.js")));
  assert.equal(typeof installPlugin, "function");
  for (const file of ["hook.js", "uninstall-hook.js", "page/index.html", "lib/sync.js"]) {
    assert.equal(fs.existsSync(path.join(root, "package", file)), true, file);
  }
});

test("a hook installation failure is reported without discarding agent sync", async (t) => {
  const { claude, page } = sandbox(t);
  fs.writeFileSync(path.join(claude, "settings.json"), JSON.stringify({
    modelPicker: { options: [{ model: "a/b", label: "A", description: "via magpie" }] },
    hooks: { PreToolUse: "invalid" },
  }));
  await runPlugin({}, { models: [{ model: "a/b", roles: [] }] }, { CLAUDE_CONFIG_DIR: claude }, page);
  const status = snapshot(page, "status");
  assert.equal(status.hook.ok, false);
  assert.equal(status.hook.reason, "settings-unwritable");
  assert.equal(status.sync.agents.length, 1);
});

test("unavailable catalog preserves configured agents; empty pool still cleans up", async (t) => {
  const { claude, page } = sandbox(t);
  fs.writeFileSync(path.join(claude, "settings.json"), JSON.stringify({ modelPicker: { options: [{ model: "a/b", label: "A", description: "via magpie" }] } }));
  await runPlugin({}, { models: [{ model: "a/b", roles: [] }] }, { CLAUDE_CONFIG_DIR: claude }, page);
  const before = fs.readdirSync(path.join(claude, "agents")).filter((name) => name.endsWith(".md"));
  fs.writeFileSync(path.join(claude, "settings.json"), "{broken");
  await runPlugin({}, { models: [{ model: "a/b", roles: [] }] }, { CLAUDE_CONFIG_DIR: claude }, page);
  assert.equal(snapshot(page, "status").catalog.ok, false);
  assert.deepEqual(fs.readdirSync(path.join(claude, "agents")).filter((name) => name.endsWith(".md")), before);
  await runPlugin({}, { models: [] }, { CLAUDE_CONFIG_DIR: claude }, page);
  assert.equal(fs.readdirSync(path.join(claude, "agents")).filter((name) => name.endsWith(".md")).length, 0);
});
