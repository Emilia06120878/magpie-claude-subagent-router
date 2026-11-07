import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makePage } from "./dom.js";

const ids = ["title", "subtitle", "router-status", "router-status-text", "selected-count", "selected-label", "agent-count", "agent-label", "catalog-count", "catalog-label", "coverage-count", "coverage-label", "search-label", "search", "filter-all", "filter-selected", "clear", "notice", "models", "empty", "empty-title", "empty-text", "help", "save-status", "reset", "apply", "routing-mode", "routing-mode-label", "routing-mode-help", "pool-kicker", "pool-title", "pool-count", "coverage-title", "coverage-help", "coverage-fraction", "coverage-list", "workflow-kicker", "workflow-title", "workflow-list"];
const source = fs.readFileSync(new URL("../page/app.js", import.meta.url), "utf8");

async function setup(t, lang = "zh", initialStatus = null, initialOptions = null) {
  const { document, elements } = makePage(ids);
  let currentStatus = initialStatus || { revision: 1, catalog: { ok: true }, hook: { ok: true }, sync: { agents: [] } };
  const writes = [];
  const themes = [];
  const context = {
    document,
    console,
    setTimeout,
    clearTimeout,
    __CLAUDE_SUBAGENT_ROUTER_CATALOG__: { models: [
      { model: "provider/a", label: "Fast model" },
      { model: "group/b[1m]", label: "Reasoning model" },
      { model: "provider/unselected", label: "Other" },
    ] },
    get __CLAUDE_SUBAGENT_ROUTER_STATUS__() { return currentStatus; },
    get globalThis() { return this; },
    magpie: {
      ready: Promise.resolve(),
      theme: { lang },
      onTheme: (fn) => themes.push(fn),
      onAction: () => {},
      onVisibility: () => {},
      options: {
        get: async () => initialOptions || ({ version: 1, models: [] }),
        set: async (options) => {
          writes.push(options);
          currentStatus = { revision: currentStatus.revision + 1, catalog: { ok: true }, hook: { ok: true }, sync: { ok: true, agents: options.models } };
          return options;
        },
      },
    },
  };
  const originalAppend = document.head.append.bind(document.head);
  document.head.append = (...children) => {
    originalAppend(...children);
    for (const child of children) if (child.tagName === "SCRIPT") setTimeout(() => child.onload?.(), 0);
  };
  const globals = { ...context };
  Object.defineProperty(globals, "__CLAUDE_SUBAGENT_ROUTER_STATUS__", { get: () => currentStatus });
  const vmContext = vm.createContext(globals);
  vm.runInContext(source, vmContext, { filename: "page/app.js" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(elements.get("notice").hidden, true, elements.get("notice").textContent);
  t.after(() => {});
  return { context, elements, writes, themes };
}

const models = (elements) => elements.get("models").queryAll((el) => el.className.startsWith("model-check"));
const roles = (elements) => elements.get("models").queryAll((el) => el.tagName === "INPUT" && !el.className);

test("Chinese UI supports multiple models, multiple roles, search, and apply", async (t) => {
  const { elements, writes } = await setup(t);
  assert.equal(elements.get("title").textContent, "Claude 子代理路由");
  const checks = models(elements);
  assert.equal(checks.length, 3);
  checks[0].checked = true;
  checks[0].dispatch("change");
  const checksAfterRender = models(elements);
  checksAfterRender[1].checked = true;
  checksAfterRender[1].dispatch("change");
  const roleChecks = roles(elements);
  roleChecks[0].checked = true;
  roleChecks[0].dispatch("change");
  roleChecks[2].checked = true;
  roleChecks[2].dispatch("change");
  assert.equal(elements.get("selected-count").textContent, "2");
  elements.get("apply").click();
  await new Promise((resolve) => {
    const wait = () => elements.get("apply").disabled ? setTimeout(wait, 20) : resolve();
    wait();
  });
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{ version: 1, mode: "strict", models: [
    { model: "provider/a", roles: ["fast", "implementation"] },
    { model: "group/b[1m]", roles: [] },
  ] }]);
  assert.equal(elements.get("save-status").textContent, "配置已应用");
  assert.equal(elements.get("coverage-count").textContent, "2");
  assert.equal(elements.get("coverage-list").queryAll((item) => item.className.includes("covered-role")).length, 2);
  assert.equal(elements.get("agent-count").textContent, "2");
});

test("clearing and applying saves an empty pool for fallback", async (t) => {
  const { elements, writes } = await setup(t);
  const check = models(elements)[0];
  check.checked = true;
  check.dispatch("change");
  elements.get("clear").click();
  assert.equal(elements.get("selected-count").textContent, "0");
  elements.get("apply").click();
  await new Promise((resolve) => {
    const wait = () => elements.get("apply").disabled ? setTimeout(wait, 20) : resolve();
    wait();
  });
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1))), { version: 1, mode: "strict", models: [] });
});

test("routing mode is a saved draft and can be discarded", async (t) => {
  const { elements, writes } = await setup(t);
  assert.equal(elements.get("routing-mode-label").textContent, "默认委派");
  const select = elements.get("routing-mode");
  select.value = "prefer";
  select.dispatch("change");
  assert.equal(elements.get("save-status").textContent, "有未保存的更改");
  elements.get("reset").click();
  assert.equal(select.value, "strict");
  select.value = "prefer";
  select.dispatch("change");
  elements.get("apply").click();
  await new Promise((resolve) => {
    const wait = () => elements.get("apply").disabled ? setTimeout(wait, 20) : resolve();
    wait();
  });
  assert.equal(JSON.parse(JSON.stringify(writes.at(-1))).mode, "prefer");
});

test("Magpie language changes preserve selected models", async (t) => {
  const { elements, themes } = await setup(t);
  const check = models(elements)[0];
  check.checked = true;
  check.dispatch("change");
  themes[0]({ lang: "en" });
  assert.equal(elements.get("title").textContent, "Claude Subagent Router");
  assert.equal(models(elements)[0].checked, true);
  assert.equal(elements.get("selected-count").textContent, "1");
});

test("deselection does not create an unsaved phantom model", async (t) => {
  const { elements } = await setup(t);
  const check = models(elements)[0];
  check.checked = true;
  check.dispatch("change");
  models(elements)[0].checked = false;
  models(elements)[0].dispatch("change");
  assert.equal(elements.get("save-status").textContent, "");
  assert.equal(elements.get("reset").disabled, true);
});

test("a saved host snapshot replaces a stale issue without a phantom warning", async (t) => {
  const { elements, writes } = await setup(t, "zh", {
    revision: 1,
    catalog: { ok: true }, hook: { ok: true },
    sync: { ok: true, agents: [] },
    issues: [{ model: "provider/a", kind: "stale" }],
  }, { models: [{ model: "provider/a", roles: [] }] });
  assert.equal(elements.get("models").queryAll((el) => el.className === "model-warning").length, 1);
  const check = models(elements)[0];
  check.checked = false;
  check.dispatch("change");
  assert.equal(elements.get("models").queryAll((el) => el.className === "model-warning").length, 0);
  const replacement = models(elements)[1];
  replacement.checked = true;
  replacement.dispatch("change");
  elements.get("apply").click();
  await new Promise((resolve) => {
    const wait = () => elements.get("apply").disabled ? setTimeout(wait, 20) : resolve();
    wait();
  });
  assert.equal(writes.length, 1);
  assert.equal(elements.get("models").queryAll((el) => el.className === "model-warning").length, 0);
  assert.equal(elements.get("agent-count").textContent, "1");
});
