(() => {
  "use strict";

  const ROLE_IDS = ["fast", "reasoning", "implementation", "review", "research", "general"];
  const I18N = {
    en: {
      title: "Claude Subagent Router",
      subtitle: "A global model pool for Claude Code. Assign optional responsibilities; Claude chooses whether to delegate, which agents to use, and whether to run them in parallel.",
      selected: "selected models",
      agents: "generated agents",
      available: "available models",
      search: "Search models",
      searchLabel: "Search models",
      all: "All models",
      selectedOnly: "Selected",
      clear: "Clear pool",
      reset: "Discard changes",
      apply: "Apply",
      applying: "Applying…",
      saved: "Applied",
      dirty: "Unsaved changes",
      noModels: "No Magpie model catalog found",
      noModelsText: "Configure Claude Code in Magpie and apply its agent settings, then reopen this page. Existing generated agents are preserved when the catalog is unavailable.",
      noResults: "No matching models",
      noResultsText: "Change the search or show all models.",
      noSelection: "The model pool is empty",
      noSelectionText: "Select one or more models, or apply the empty pool to restore Magpie's original single-model Subagent behavior.",
      roles: "Optional responsibilities",
      missing: "Not in current catalog",
      conflict: "Same-name user files were preserved",
      modified: "Manually edited agents were preserved",
      stale: "Unavailable selections were not generated",
      catalogError: "The model catalog could not be read. Existing agent files were not changed.",
      saveError: "Could not apply the configuration",
      help: "Each selected model becomes one named Claude Code subagent. No responsibility tags means no preference is added. Generated agents override only their own model; Magpie's original Subagent default remains unchanged.",
      retry: "Retry",
      fast: "Fast execution",
      reasoning: "Complex reasoning",
      implementation: "Code implementation",
      review: "Code review",
      research: "Exploration and research",
      general: "General tasks",
      routingMode: "Default delegation",
      strict: "Strict — always use the pool",
      prefer: "Prefer — allow explicit general-purpose",
      routingModeHelp: "While the pool is active, unnamed Agent/Task calls must choose a router. Other built-in and custom agents are unchanged. A new Claude Code session is required to load the routing hook.",
      hookError: "The routing hook could not be installed. Model definitions were synced, but default delegation was not changed.",
    },
    zh: {
      title: "Claude 子代理路由",
      subtitle: "为 Claude Code 配置全局模型池。职责标签可选；Claude 自主决定是否委派、选择哪些子代理，以及是否并行运行。",
      selected: "个已选模型",
      agents: "个已生成子代理",
      available: "个可用模型",
      search: "搜索模型名称或完整模型 ID",
      searchLabel: "搜索模型",
      all: "全部模型",
      selectedOnly: "仅看已选",
      clear: "清空模型池",
      reset: "放弃更改",
      apply: "应用",
      applying: "正在应用…",
      saved: "已应用",
      dirty: "有未保存的更改",
      noModels: "未找到 Magpie 模型目录",
      noModelsText: "请先在 Magpie 中配置 Claude Code 并应用 Agent 设置，然后重新打开此页面。目录不可用时，已有子代理文件不会被更改。",
      noResults: "没有匹配的模型",
      noResultsText: "请更改搜索条件或查看全部模型。",
      noSelection: "模型池为空",
      noSelectionText: "选择一个或多个模型；应用空池将恢复 Magpie 原有的单模型 Subagent 行为。",
      roles: "可选职责",
      missing: "不在当前目录",
      conflict: "同名用户文件已保留",
      modified: "手动修改的子代理已保留",
      stale: "不可用的已选模型未生成子代理",
      catalogError: "模型目录读取失败，已有子代理文件未更改。",
      saveError: "配置应用失败",
      help: "每个已选模型生成一个具名 Claude Code 子代理。未选职责标签时不附加职责倾向。生成的子代理仅覆盖自身模型，Magpie 原有 Subagent 默认值保持不变。",
      retry: "重试",
      fast: "快速执行",
      reasoning: "复杂推理",
      implementation: "代码实现",
      review: "代码审查",
      research: "探索研究",
      general: "通用任务",
      routingMode: "默认委派",
      strict: "严格——始终使用模型池",
      prefer: "宽松——允许显式 general-purpose",
      routingModeHelp: "模型池生效时，未指定类型的 Agent/Task 调用必须选择具名路由。其他内置和自定义子代理不受影响。需要新 Claude Code 会话加载路由 Hook。",
      hookError: "路由 Hook 安装失败。子代理定义已同步，但默认委派未更改。",
    },
  };

  const $ = (id) => document.getElementById(id);
  let lang = "en";
  let catalog = [];
  let saved = { models: [], mode: "strict" };
  let mode = "strict";
  let draft = new Map();
  let selectedOnly = false;
  let busy = false;
  let lastRevision = globalThis.__CLAUDE_SUBAGENT_ROUTER_STATUS__?.revision || 0;
  let lastError = "";
  let justSaved = false;
  const t = (key) => I18N[lang][key] ?? I18N.en[key] ?? key;

  function node(tag, properties = {}, children = []) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(properties)) {
      if (key === "text") element.textContent = value;
      else if (key === "class") element.className = value;
      else if (key === "hidden") element.hidden = value;
      else element.setAttribute(key, value);
    }
    element.append(...children);
    return element;
  }

  function setText(id, value) { $(id).textContent = value; }
  function dirty() {
    return mode !== saved.mode || JSON.stringify([...draft.values()].filter((row) => row.selected).map((row) => ({ model: row.model, roles: row.roles }))) !== JSON.stringify(saved.models);
  }
  function updateDirty() {
    setText("save-status", busy ? t("applying") : lastError || (dirty() ? t("dirty") : justSaved ? t("saved") : ""));
    $("apply").disabled = busy;
    $("reset").disabled = busy || !dirty();
  }

  function translate() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t("title");
    for (const key of ["title", "subtitle", "clear", "reset", "apply", "help"]) setText(key, t(key));
    setText("selected-label", t("selected"));
    setText("agent-label", t("agents"));
    setText("catalog-label", t("available"));
    setText("filter-all", t("all"));
    setText("filter-selected", t("selectedOnly"));
    $("search").placeholder = t("search");
    $("search").setAttribute("aria-label", t("search"));
    setText("routing-mode-label", t("routingMode"));
    setText("routing-mode-help", t("routingModeHelp"));
    for (const option of $("routing-mode").children) option.textContent = t(option.value);
    setText("language", lang === "zh" ? "中文" : "EN");
    render();
  }

  function notice(messages) {
    const text = messages.filter(Boolean).join(" ");
    $("notice").textContent = text;
    $("notice").hidden = !text;
  }

  function statusMessages() {
    const status = globalThis.__CLAUDE_SUBAGENT_ROUTER_STATUS__;
    if (!status) return [t("catalogError")];
    const messages = [];
    if (status?.catalog && !status.catalog.ok) messages.push(t("catalogError"));
    if (status?.hook && !status.hook.ok) messages.push(t("hookError"));
    if (status?.sync?.conflicts?.length) messages.push(`${t("conflict")}: ${status.sync.conflicts.join(", ")}`);
    if (status?.sync?.modified?.length) messages.push(`${t("modified")}: ${status.sync.modified.join(", ")}`);
    if (status?.sync?.stale?.length) messages.push(`${t("stale")}: ${status.sync.stale.join(", ")}`);
    return messages;
  }

  function render() {
    const query = $("search").value.trim().toLocaleLowerCase();
    const selected = [...draft.values()].filter((row) => row.selected);
    const merged = new Map(catalog.map((row) => [row.model, row]));
    for (const row of selected) {
      if (!merged.has(row.model)) merged.set(row.model, { model: row.model, label: row.model, missing: true });
    }
    const visible = [...merged.values()].filter((row) => {
      if (selectedOnly && !draft.get(row.model)?.selected) return false;
      return !query || `${row.label}\n${row.model}`.toLocaleLowerCase().includes(query);
    });
    setText("selected-count", String(selected.length));
    setText("catalog-count", String(catalog.length));
    setText("agent-count", String(globalThis.__CLAUDE_SUBAGENT_ROUTER_STATUS__?.sync?.agents?.length || 0));
    $("clear").disabled = busy || !selected.length;
    $("routing-mode").disabled = busy;
    $("routing-mode").value = mode;
    $("filter-all").setAttribute("aria-pressed", String(!selectedOnly));
    $("filter-selected").setAttribute("aria-pressed", String(selectedOnly));
    $("filter-selected").textContent = `${t("selectedOnly")} (${selected.length})`;
    $("clear").title = t("help");

    const list = $("models");
    list.replaceChildren();
    for (const model of visible) {
      const current = draft.get(model.model) || { model: model.model, selected: false, roles: [] };
      const checkbox = node("input", { type: "checkbox", class: "model-check", "aria-label": model.label });
      checkbox.checked = current.selected;
      checkbox.disabled = busy;
      checkbox.addEventListener("change", () => {
        justSaved = false;
        lastError = "";
        draft.set(model.model, { model: model.model, selected: checkbox.checked, roles: current.roles });
        render();
      });
      const title = node("label", { class: "model-select" }, [
        node("span", { class: "model-label", text: model.label }),
        node("span", { class: "model-id", text: model.model + (model.missing ? ` · ${t("missing")}` : "") }),
      ]);
      title.prepend(checkbox);
      const card = node("article", { class: `model${current.selected ? " selected" : ""}` }, [
        node("div", { class: "model-top" }, [title]),
      ]);
      const roles = node("div", { class: "roles", "aria-label": t("roles") });
      roles.hidden = !current.selected;
      for (const id of ROLE_IDS) {
        const role = node("input", { type: "checkbox" });
        role.checked = current.roles.includes(id);
        role.disabled = busy;
        role.addEventListener("change", () => {
          const latest = draft.get(model.model) || current;
          const nextRoles = role.checked ? [...latest.roles, id] : latest.roles.filter((value) => value !== id);
          justSaved = false;
          lastError = "";
          draft.set(model.model, { ...latest, selected: true, roles: ROLE_IDS.filter((value) => nextRoles.includes(value)) });
          updateDirty();
        });
        roles.append(node("label", { class: "role" }, [role, node("span", { text: t(id) })]));
      }
      card.append(roles);
      list.append(card);
    }

    const hasModels = merged.size > 0;
    setText("empty-title", t(hasModels ? (selectedOnly && !selected.length ? "noSelection" : "noResults") : "noModels"));
    setText("empty-text", t(hasModels ? (selectedOnly && !selected.length ? "noSelectionText" : "noResultsText") : "noModelsText"));
    $("empty").hidden = visible.length > 0;
    updateDirty();
  }

  function readStatus() {
    const status = globalThis.__CLAUDE_SUBAGENT_ROUTER_STATUS__;
    if (!status) return false;
    lastRevision = status.revision || lastRevision;
    notice(statusMessages());
    render();
    return true;
  }

  function refreshSnapshot(name) {
    return new Promise((resolve) => {
      const script = node("script", { src: `${name}.js?r=${Date.now()}` });
      script.onload = () => { script.remove(); resolve(true); };
      script.onerror = () => { script.remove(); resolve(false); };
      document.head.append(script);
    });
  }

  async function apply() {
    if (busy) return;
    busy = true;
    lastError = "";
    justSaved = false;
    $("apply").disabled = true;
    setText("save-status", t("applying"));
    render();
    const before = lastRevision;
    try {
      const models = [...draft.values()].filter((row) => row.selected).map((row) => ({ model: row.model, roles: [...row.roles] }));
      await magpie.options.set({ version: 1, models, mode });
      saved = { models, mode };
      draft = new Map(models.map((row) => [row.model, { ...row, selected: true }]));
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await refreshSnapshot("status");
        readStatus();
        await refreshSnapshot("catalog");
        catalog = globalThis.__CLAUDE_SUBAGENT_ROUTER_CATALOG__?.models || [];
        if (lastRevision > before) break;
      }
      if (lastRevision <= before) throw new Error("Magpie did not finish reloading the plugin");
      justSaved = true;
      setText("save-status", t("saved"));
    } catch (error) {
      lastError = `${t("saveError")}: ${error.message || error}`;
      setText("save-status", lastError);
    } finally {
      busy = false;
      $("apply").disabled = false;
      render();
    }
  }

  async function init() {
    await magpie.ready;
    lang = String(magpie.theme?.lang || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
    magpie.onTheme((theme) => {
      const next = String(theme.lang || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
      if (next !== lang) { lang = next; translate(); }
    });
    const options = await magpie.options.get();
    saved = { models: Array.isArray(options?.models) ? options.models.filter((row) => row && typeof row.model === "string").map((row) => ({ model: row.model, roles: Array.isArray(row.roles) ? row.roles.filter((id) => ROLE_IDS.includes(id)) : [] })) : [], mode: options?.mode === "prefer" ? "prefer" : "strict" };
    mode = saved.mode;
    draft = new Map(saved.models.map((row) => [row.model, { ...row, selected: true }]));
    catalog = globalThis.__CLAUDE_SUBAGENT_ROUTER_CATALOG__?.models || [];
    $("search").addEventListener("input", render);
    $("routing-mode").addEventListener("change", () => {
      mode = $("routing-mode").value;
      justSaved = false;
      lastError = "";
      updateDirty();
    });
    $("filter-all").addEventListener("click", () => { selectedOnly = false; render(); });
    $("filter-selected").addEventListener("click", () => { selectedOnly = true; render(); });
    $("clear").addEventListener("click", () => { draft.clear(); selectedOnly = false; render(); });
    $("reset").addEventListener("click", () => { mode = saved.mode; draft = new Map(saved.models.map((row) => [row.model, { ...row, selected: true }])); render(); });
    $("apply").addEventListener("click", apply);
    translate();
    readStatus();
    magpie.onVisibility((visible) => {
      if (!visible || busy) return;
      refreshSnapshot("status").then((ok) => {
        if (ok) readStatus();
      });
      refreshSnapshot("catalog").then((ok) => {
        if (!ok) return;
        catalog = globalThis.__CLAUDE_SUBAGENT_ROUTER_CATALOG__?.models || [];
        render();
      });
    });
  }

  init().catch((error) => {
    $("notice").hidden = false;
    $("notice").textContent = String(error?.message || error);
    $("apply").disabled = true;
  });
})();
