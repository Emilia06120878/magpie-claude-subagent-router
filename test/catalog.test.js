import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publicCatalog, readCatalog } from "../lib/catalog.js";
import { claudeConfigDir } from "../lib/paths.js";

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-router-catalog-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("catalog projects only model and label, never credentials or descriptions", () => {
  const result = publicCatalog({ env: { ANTHROPIC_AUTH_TOKEN: "secret-token" }, modelPicker: { options: [
    { model: "group/a[1m]", label: "Model A", description: "private-account@example.com", token: "secret-token" },
    { model: "provider/b", label: "Model B", description: "another-account" },
  ] } });
  assert.deepEqual(result, { ok: true, reason: "", models: [
    { model: "group/a[1m]", label: "Model A" },
    { model: "provider/b", label: "Model B" },
  ] });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /secret-token|private-account|another-account|description|env/);
});

test("malformed, missing, or empty model picker is reported without data loss", (t) => {
  assert.equal(publicCatalog({}).reason, "picker-missing");
  assert.deepEqual(publicCatalog({ modelPicker: { options: [] } }), { ok: true, models: [], reason: "picker-empty" });
  const dir = temporary(t);
  assert.equal(readCatalog(dir).reason, "settings-missing");
  fs.writeFileSync(path.join(dir, "settings.json"), "{broken", "utf8");
  assert.equal(readCatalog(dir).reason, "settings-invalid");
  fs.writeFileSync(path.join(dir, "settings.json"), "null", "utf8");
  assert.equal(readCatalog(dir).reason, "settings-invalid");
});

test("custom model pickers are not treated as Magpie's catalog", (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ modelPicker: { options: [
    { model: "custom/model", label: "Custom", description: "user-owned" },
  ] } }));
  assert.deepEqual(readCatalog(dir), { ok: false, models: [], reason: "picker-unmanaged" });
});
test("invalid and duplicate picker entries cannot create duplicate agents", () => {
  const result = publicCatalog({ modelPicker: { options: [
    { model: "a/b", label: "First" },
    { model: "a/b", label: "Duplicate", description: "ignored" },
    { model: " padded " },
    { model: "line\nbreak" },
    { model: 42 },
    null,
    { model: "fallback" },
  ] } });
  assert.deepEqual(result.models, [{ model: "a/b", label: "First" }, { model: "fallback", label: "fallback" }]);
});

test("CLAUDE_CONFIG_DIR takes precedence and Windows paths are resolved", (t) => {
  assert.equal(claudeConfigDir({ CLAUDE_CONFIG_DIR: "D:\\Claude Config" }, "C:\\Users\\Example"), path.win32.resolve("D:\\Claude Config"));
  assert.equal(claudeConfigDir({}, "C:\\Users\\Example"), path.win32.resolve("C:\\Users\\Example", ".claude"));
  const dir = temporary(t);
  const home = path.join(dir, "home");
  assert.equal(claudeConfigDir({}, home), path.join(home, ".claude"));
});
