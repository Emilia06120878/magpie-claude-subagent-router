import test from "node:test";
import assert from "node:assert/strict";
import { agentDescription, agentDocument, agentName } from "../lib/agents.js";
import { normalizeOptions, ROLE_IDS } from "../lib/config.js";

const namePattern = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

test("configuration accepts several models and several stable roles", () => {
  const options = normalizeOptions({ models: [
    { model: "group/reasoning", roles: ["review", "reasoning", "review", "unknown"] },
    { model: "vendor/model[1m]", roles: ["fast"] },
  ] });
  assert.deepEqual(options, { version: 1, mode: "strict", models: [
    { model: "group/reasoning", roles: ["reasoning", "review"] },
    { model: "vendor/model[1m]", roles: ["fast"] },
  ] });
  assert.equal(ROLE_IDS.length, 6);
});

test("no roles means no responsibility preference", () => {
  const document = agentDocument("provider/model", []);
  assert.match(document, /No responsibility preference is assigned/);
  assert.doesNotMatch(document, /职责倾向：/);
  assert.match(document, /model: "provider\/model"/);
});

test("model IDs retain suffixes and YAML scalars are safely quoted", () => {
  const id = 'provider/a:b[1m]:high # "quoted"';
  const document = agentDocument(id, ["implementation"]);
  assert.match(document, new RegExp(`model: ${JSON.stringify(id).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.ok(document.startsWith("---\n"));
  assert.equal(document.split("\n---\n").length, 2);
});

test("agent names are stable, legal, collision-resistant, and path safe", () => {
  const first = agentName("Group/Model[1m]");
  const second = agentName("group-model-1m");
  assert.match(first, namePattern);
  assert.match(second, namePattern);
  assert.equal(first, agentName("Group/Model[1m]"));
  assert.notEqual(first, second);
  assert.ok(agentName("x".repeat(200)).length <= 50);
  assert.ok(agentName("模型").startsWith("router-model-"));
  assert.doesNotMatch(first, /[\\/]/);
});

test("bilingual descriptions expose model and every selected role", () => {
  const description = agentDescription("provider/model", ["fast", "review"]);
  assert.match(description, /provider\/model/);
  assert.match(description, /Fast execution, Code review/);
  assert.match(description, /快速执行、代码审查/);
  assert.match(description, /并行/);
});

test("bilingual descriptions stay within the 1000 character compatibility limit", () => {
  const description = agentDescription("x".repeat(200), ROLE_IDS);
  assert.ok(description.length <= 1000, String(description.length));
  for (const id of ROLE_IDS) assert.match(description, new RegExp(id === "fast" ? "Fast execution" : id === "reasoning" ? "Complex reasoning" : id === "implementation" ? "Code implementation" : id === "review" ? "Code review" : id === "research" ? "Exploration and research" : "General tasks"));
});
test("invalid configuration is normalized without throwing", () => {
  assert.deepEqual(normalizeOptions(null), { version: 1, mode: "strict", models: [] });
  assert.deepEqual(normalizeOptions({ mode: "prefer", models: [null, "", " padded ", { model: "ok", roles: "fast" }] }), {
    version: 1,
    mode: "prefer",
    models: [{ model: "ok", roles: [] }],
  });
  assert.equal(normalizeOptions({ mode: "invalid" }).mode, "strict");
});
