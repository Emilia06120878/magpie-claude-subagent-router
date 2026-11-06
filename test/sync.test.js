import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { agentDocument, agentName } from "../lib/agents.js";
import { syncAgents } from "../lib/sync.js";

function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-router-sync-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const catalog = { models: [
  { model: "provider/fast", label: "Fast" },
  { model: "group/reasoning[1m]", label: "Reasoning" },
] };

function file(dir, model) {
  return path.join(dir, "agents", `${agentName(model)}.md`);
}

test("sync generates multiple named agents and empty pool restores fallback", (t) => {
  const dir = sandbox(t);
  const result = syncAgents(dir, { models: [
    { model: "provider/fast", roles: ["fast"] },
    { model: "group/reasoning[1m]", roles: ["reasoning", "review"] },
  ] }, catalog);
  assert.equal(result.written, 2);
  assert.equal(result.agents.length, 2);
  assert.match(fs.readFileSync(file(dir, "provider/fast"), "utf8"), /model: "provider\/fast"/);
  assert.match(fs.readFileSync(file(dir, "group/reasoning[1m]"), "utf8"), /group\/reasoning\[1m\]/);

  const second = syncAgents(dir, { models: [{ model: "provider/fast", roles: [] }] }, catalog);
  assert.equal(second.updated, 1);
  assert.equal(second.removed, 1);
  assert.equal(fs.existsSync(file(dir, "group/reasoning[1m]")), false);
  assert.match(fs.readFileSync(file(dir, "provider/fast"), "utf8"), /No responsibility preference/);

  const empty = syncAgents(dir, { models: [] }, { models: [] });
  assert.equal(empty.removed, 1);
  assert.equal(fs.existsSync(file(dir, "provider/fast")), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "agents", ".claude-subagent-router.json"), "utf8")).files, {});
});

test("sync never overwrites a pre-existing same-name user file", (t) => {
  const dir = sandbox(t);
  const filename = file(dir, "provider/fast");
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, "user-owned\n", "utf8");
  const result = syncAgents(dir, { models: [{ model: "provider/fast", roles: [] }] }, catalog);
  assert.deepEqual(result.conflicts, [path.basename(filename)]);
  assert.equal(fs.readFileSync(filename, "utf8"), "user-owned\n");
  const empty = syncAgents(dir, { models: [] }, { models: [] });
  assert.equal(empty.removed, 0);
  assert.equal(fs.readFileSync(filename, "utf8"), "user-owned\n");
});

test("manual edits stop updates and deletion, even with an empty pool", (t) => {
  const dir = sandbox(t);
  syncAgents(dir, { models: [{ model: "provider/fast", roles: ["fast"] }] }, catalog);
  const filename = file(dir, "provider/fast");
  const original = agentDocument("provider/fast", ["fast"]);
  fs.writeFileSync(filename, `${original}\nUSER EDIT\n`, "utf8");
  const changed = syncAgents(dir, { models: [{ model: "provider/fast", roles: ["review"] }] }, catalog);
  assert.deepEqual(changed.modified, [path.basename(filename)]);
  assert.match(fs.readFileSync(filename, "utf8"), /USER EDIT/);
  const cleared = syncAgents(dir, { models: [] }, { models: [] });
  assert.equal(cleared.removed, 0);
  assert.match(fs.readFileSync(filename, "utf8"), /USER EDIT/);
});

test("a file deleted by the user can be regenerated, without stale agents", (t) => {
  const dir = sandbox(t);
  syncAgents(dir, { models: [{ model: "provider/fast", roles: [] }] }, catalog);
  fs.unlinkSync(file(dir, "provider/fast"));
  const result = syncAgents(dir, { models: [
    { model: "provider/fast", roles: [] },
    { model: "removed/model", roles: ["general"] },
  ] }, catalog);
  assert.equal(result.written, 1);
  assert.deepEqual(result.stale, ["removed/model"]);
  assert.equal(result.agents.length, 1);
});

test("corrupt ownership state cannot authorize overwrites", (t) => {
  const dir = sandbox(t);
  syncAgents(dir, { models: [{ model: "provider/fast", roles: [] }] }, catalog);
  const filename = file(dir, "provider/fast");
  fs.writeFileSync(path.join(dir, "agents", ".claude-subagent-router.json"), "broken", "utf8");
  const result = syncAgents(dir, { models: [{ model: "provider/fast", roles: ["review"] }] }, catalog);
  assert.deepEqual(result.conflicts, [path.basename(filename)]);
  assert.doesNotMatch(fs.readFileSync(filename, "utf8"), /Code review/);
});

test("stale selections preserve their generated file until deselected", (t) => {
  const dir = sandbox(t);
  const configuration = { models: [{ model: "provider/fast", roles: ["fast"] }] };
  syncAgents(dir, configuration, catalog);
  const filename = file(dir, "provider/fast");
  const original = fs.readFileSync(filename, "utf8");
  const stale = syncAgents(dir, configuration, { models: [] });
  assert.deepEqual(stale.stale, ["provider/fast"]);
  assert.equal(stale.removed, 0);
  assert.equal(fs.readFileSync(filename, "utf8"), original);
  const removed = syncAgents(dir, { models: [] }, { models: [] });
  assert.equal(removed.removed, 1);
  assert.equal(fs.existsSync(filename), false);
});

test("an initially empty pool is a no-op", (t) => {
  const dir = sandbox(t);
  const result = syncAgents(dir, { models: [] }, { models: [] });
  assert.equal(result.removed, 0);
  assert.equal(fs.existsSync(path.join(dir, "agents")), false);
});
test("synchronization is idempotent", (t) => {
  const dir = sandbox(t);
  const configuration = { models: [{ model: "provider/fast", roles: ["fast"] }] };
  syncAgents(dir, configuration, catalog);
  const filename = file(dir, "provider/fast");
  const before = fs.statSync(filename).mtimeMs;
  const result = syncAgents(dir, configuration, catalog);
  assert.equal(result.unchanged, 1);
  assert.equal(result.updated, 0);
  assert.equal(fs.statSync(filename).mtimeMs, before);
});
