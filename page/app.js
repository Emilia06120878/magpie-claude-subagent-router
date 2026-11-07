/* global magpie */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const ROLE_IDS = ["fast", "reasoning", "implementation", "review", "research", "general"];
  const ROLE_COLORS = { fast: "#8f7550", reasoning: "#766ba5", implementation: "#628d81", review: "#b07665", research: "#65899b", general: "#7d8b74" };
  const I18N = {
    en: {
      title: "Claude Subagent Router",
      subtitle: "A considered model for every task. Build your delegation pool, then let Claude orchestrate the work.",
      active: "Router active", configured: "Router configured", inactive: "Router inactive", issues: "Attention needed",
      selected: "Models in pool", agents: "Ready to delegate", catalog: "Available models", coverage: "Roles covered",
      routingMode: "Default delegation",
      routingModeHelp: "Route unnamed Agent/Task calls through your model pool. Built-in and custom agents keep their own behavior.",
      strict: "Strict · pool required", prefer: "Prefer · allow general-purpose",
      poolKicker: "YOUR MODEL ECOSYSTEM", poolTitle: "Delegation pool", modelsUnit: "models",
      searchLabel: "Search models", search: "Search models or model IDs…", all: "All models", selectedOnly: "Selected",
      clear: "Clear pool", reset: "Discard changes", apply: "Apply configuration", applying: "Applying…", saved: "Configuration applied",
      unsaved: "Unsaved changes", saveError: "Could not apply",
      help: "Changes take effect in a new Claude Code session. No task content is sent by this page.",
      empty: "No matching models", emptyText: "Try another search, or show all models in the catalog.",
      noModels: "Your model catalog is empty", noModelsText: "Configure Claude Code's model picker in Magpie, then reopen this page.",
      coverageTitle: "Responsibility map", coverageHelp: "Assign roles to guide Claude's delegation. Each model can cover more than one.",
      covered: "covered", unassigned: "Not assigned", selectToAssign: "Select a model to assign roles",
      workflowKicker: "NATIVE CLAUDE CODE", workflowTitle: "One pool. Parallel possibilities.",
      workflow: ["Claude chooses the right model for each task.", "Independent tasks can run in parallel.", "Claude reviews and synthesizes the results."],
      catalogError: "The model catalog is unavailable. Your existing agent definitions are preserved.",
      hookError: "The routing hook could not be installed. Check the Claude Code settings file.",
      conflict: "Name conflict; not routed", modified: "Manually edited; not routed", stale: "Not in current catalog; preserved",
      errors: "Some models need attention. Only conflict-free, unmodified agents enter the active routing pool.",
      added: "Added to pool", inPool: "In pool", add: "Add model", modelId: "Model ID", rolesLabel: "Responsibilities",
      noRoles: "No roles assigned", optionalRoles: "Optional · select all that apply",
      generalNote: "For broad tasks without a narrow specialty.",
      fast: "Fast execution", reasoning: "Complex reasoning", implementation: "Code implementation", review: "Code review", research: "Exploration & research", general: "General tasks",
      language: "中文",
    },
    zh: {
      title: "Claude 子代理路由",
      subtitle: "让每项任务遇见合适的模型。构建你的委派模型池，由 Claude 自主分工、并行执行并综合结果。",
      active: "路由已启用", configured: "路由已配置", inactive: "路由未启用", issues: "需要检查",
      selected: "池内模型", agents: "可委派代理", catalog: "可选模型", coverage: "职责覆盖",
      routingMode: "默认委派",
      routingModeHelp: "将未指定类型的 Agent/Task 调用引导至模型池；内置和自定义代理保持原有行为。",
      strict: "严格 · 必须使用模型池", prefer: "宽松 · 允许 general-purpose",
      poolKicker: "YOUR MODEL ECOSYSTEM", poolTitle: "委派模型池", modelsUnit: "个模型",
      searchLabel: "搜索模型", search: "搜索模型名称或模型 ID…", all: "全部模型", selectedOnly: "已选模型",
      clear: "清空模型池", reset: "放弃更改", apply: "应用配置", applying: "正在应用…", saved: "配置已应用",
      unsaved: "有未保存的更改", saveError: "应用失败",
      help: "配置在新的 Claude Code 会话中生效。此页面不会发送任务内容。",
      empty: "没有匹配的模型", emptyText: "试试其他关键词，或返回查看完整模型目录。",
      noModels: "模型目录为空", noModelsText: "请先在 Magpie 中配置 Claude Code 的模型选择器，再重新打开此页面。",
      coverageTitle: "职责覆盖图", coverageHelp: "职责用于引导 Claude 选择代理；一个模型可承担多种职责。",
      covered: "个模型", unassigned: "尚未分配", selectToAssign: "选中模型后即可分配职责",
      workflowKicker: "NATIVE CLAUDE CODE", workflowTitle: "一个模型池，多种并行可能。",
      workflow: ["Claude 按任务与职责选择合适的模型。", "相互独立的任务可以由多个代理并行完成。", "Claude 比较、评审并综合各代理的结果。"],
      catalogError: "模型目录暂时不可用，已有子代理定义会被保留。",
      hookError: "路由 Hook 安装失败，请检查 Claude Code 设置文件。",
      conflict: "同名冲突，未加入路由", modified: "文件已手动修改，未加入路由", stale: "不在当前模型目录，定义已保留",
      errors: "部分模型需要检查。只有无冲突且未修改的代理才会进入当前路由池。",
      added: "已加入模型池", inPool: "池内模型", add: "加入模型池", modelId: "模型 ID", rolesLabel: "职责分配",
      noRoles: "未指定职责", optionalRoles: "可多选 · 不选则不附加职责倾向",
      generalNote: "适用于没有明确专业方向的一般任务。",
      fast: "快速执行", reasoning: "复杂推理", implementation: "代码实现", review: "代码审查", research: "探索研究", general: "通用任务",
      language: "EN",
    },
  };

  let lang = "en";
  let saved = { models: [], mode: "strict" };
  let draft = new Map();
  let mode = "strict";
  let catalog = [];
  let status = null;
  let lastRevision = 0;
  let selectedOnly = false;
  let busy = false;
  let lastError = "";
  let justSaved = false;
  const t = (key) => I18N[lang][key] || key;
  const setText = (id, text) => { $(id).textContent = text; };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function translate() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = t("title");
    for (const key of ["title", "subtitle", "selected-label", "agent-label", "catalog-label", "coverage-label", "routing-mode-label", "routing-mode-help", "pool-kicker", "pool-title", "search-label", "clear", "reset", "help", "coverage-title", "coverage-help", "workflow-kicker", "workflow-title"]) {
      const translations = {
        "selected-label": "selected", "agent-label": "agents", "catalog-label": "catalog", "coverage-label": "coverage",
        "routing-mode-label": "routingMode", "routing-mode-help": "routingModeHelp", "pool-kicker": "poolKicker", "pool-title": "poolTitle",
        "search-label": "searchLabel", all: "all", selectedOnly: "selectedOnly", clear: "clear", reset: "reset", help: "help",
        "coverage-title": "coverageTitle", "coverage-help": "coverageHelp", "workflow-kicker": "workflowKicker", "workflow-title": "workflowTitle",
      };
      setText(key, t(translations[key] || key));
    }
    $("search").placeholder = t("search");
    $("search").setAttribute("aria-label", t("searchLabel"));
    for (const option of $("routing-mode").children) option.textContent = t(option.value);
    setText("filter-all", t("all"));
    $("filter-all").setAttribute("aria-pressed", String(!selectedOnly));
    $("filter-selected").setAttribute("aria-pressed", String(selectedOnly));
    $("filter-all").className = selectedOnly ? "" : "active";
    $("filter-selected").className = selectedOnly ? "active" : "";
    $("apply").textContent = busy ? t("applying") : t("apply");
    $("coverage-list").replaceChildren();
    ROLE_IDS.forEach((id, index) => {
      const count = [...draft.values()].filter((row) => row.selected && row.roles.includes(id)).length;
      const row = el("div", `coverage-row${count ? " covered-role" : ""}`);
      const name = el("div", "coverage-name");
      name.append(el("span", "role-dot", String(index + 1).padStart(2, "0")), el("span", "", t(id)));
      row.append(name, el("span", "coverage-number", count ? `${count} ${t("covered")}` : "—"));
      $("coverage-list").append(row);
    });
    $("workflow-list").replaceChildren();
    t("workflow").forEach((text, index) => {
      const item = el("li");
      item.append(el("span", "workflow-number", `0${index + 1}`), el("span", "", text));
      $("workflow-list").append(item);
    });
    render();
  }

  function dirty() {
    const current = [...draft.values()].filter((row) => row.selected).map((row) => ({ model: row.model, roles: [...row.roles] }));
    return mode !== saved.mode || JSON.stringify(current) !== JSON.stringify(saved.models);
  }

  function rowIssue(row) {
    if (!row.selected || !saved.models.some((item) => item.model === row.model)) return "";
    if (!status?.sync || !Array.isArray(status.issues)) return "";
    return status.issues.find((item) => item.model === row.model)?.kind || "";
  }

  function modelProvider(model) {
    const value = model.split("/")[0];
    return value === "group" ? "ROUTING GROUP" : value === "auto" ? "AUTO ROUTE" : value.toUpperCase().slice(0, 22);
  }

  function modelLabel(row) {
    const info = catalog.find((item) => item.model === row.model);
    return info?.label || row.model;
  }

  function renderModel(row) {
    const selected = row.selected;
    const issue = rowIssue(row);
    const card = el("article", `model${selected ? " selected" : ""}`);
    const top = el("div", "model-top");
    const mark = el("span", "model-monogram", modelLabel(row).replace(/[·[\]].*$/, "").trim().slice(0, 1).toUpperCase());
    top.append(mark);
    const content = el("div", "model-content");
    const heading = el("div", "model-heading");
    const label = el("h3", "model-label", modelLabel(row));
    heading.append(label);
    const check = el("input", "model-check");
    check.type = "checkbox";
    check.checked = selected;
    check.disabled = busy;
    check.setAttribute("aria-label", `${t("add")}: ${modelLabel(row)}`);
    check.addEventListener("change", () => {
      if (check.checked) draft.set(row.model, { model: row.model, roles: [], selected: true });
      else draft.delete(row.model);
      justSaved = false;
      lastError = "";
      translate();
    });
    heading.append(check);
    content.append(heading, el("span", "model-provider", modelProvider(row.model)), el("code", "model-id", row.model));
    top.append(content);
    card.append(top);
    if (selected) {
      const roles = el("div", "roles-section");
      const roleHeading = el("div", "roles-heading");
      roleHeading.append(el("span", "roles-label", t("rolesLabel")), el("span", "roles-hint", t("optionalRoles")));
      roles.append(roleHeading);
      const list = el("div", "roles");
      for (const id of ROLE_IDS) {
        const role = el("label", `role role-${id}`);
        role.style.setProperty("--role-color", ROLE_COLORS[id]);
        const input = el("input");
        input.type = "checkbox";
        input.checked = row.roles.includes(id);
        input.disabled = busy;
        input.setAttribute("aria-label", t(id));
        input.addEventListener("change", () => {
          if (input.checked) row.roles.push(id);
          else row.roles = row.roles.filter((value) => value !== id);
          row.roles = ROLE_IDS.filter((value) => row.roles.includes(value));
          justSaved = false;
          lastError = "";
          translate();
        });
        role.append(input, el("span", "", t(id)));
        list.append(role);
      }
      roles.append(list);
      card.append(roles);
    }
    if (issue) card.append(el("div", "model-warning", t(issue)));
    return card;
  }

  function render() {
    const rows = [...catalog.map((item) => draft.get(item.model) || { model: item.model, roles: [], selected: false }), ...[...draft.values()].filter((row) => !catalog.some((item) => item.model === row.model))];
    const query = $("search").value.trim().toLowerCase();
    const visible = rows.filter((row) => (!selectedOnly || row.selected) && (!query || row.model.toLowerCase().includes(query) || modelLabel(row).toLowerCase().includes(query)));
    const pool = [...draft.values()].filter((row) => row.selected);
    setText("selected-count", String(pool.length));
    setText("agent-count", String(status?.sync?.agents?.length ?? saved.models.length));
    setText("catalog-count", String(catalog.length));
    setText("coverage-count", String(ROLE_IDS.filter((id) => pool.some((row) => row.roles.includes(id))).length));
    $("coverage-count").append(el("span", "stat-total", "/6"));
    setText("pool-count", `${rows.length} ${t("modelsUnit")}`);
    setText("coverage-fraction", `${ROLE_IDS.filter((id) => pool.some((row) => row.roles.includes(id))).length} / 6`);
    setText("filter-selected", `${t("selectedOnly")} · ${pool.length}`);
    const routingIssue = !status?.catalog?.ok || !status?.hook?.ok || (status?.sync?.conflicts?.length || status?.sync?.modified?.length);
    setText("router-status-text", t(routingIssue ? "issues" : status?.sync?.agents?.length ? "active" : draft.size ? "configured" : "inactive"));
    $("router-status").className = `router-status${routingIssue ? " warning" : draft.size ? " active" : ""}`;
    $("models").replaceChildren(...visible.map(renderModel));
    $("models").hidden = visible.length === 0;
    $("empty").hidden = visible.length !== 0;
    setText("empty-title", t(catalog.length ? "empty" : "noModels"));
    setText("empty-text", t(catalog.length ? "emptyText" : "noModelsText"));
    const messages = [];
    if (lastError) messages.push(lastError);
    else if (status && !status.catalog?.ok) messages.push(t("catalogError"));
    if (status && !status.hook?.ok) messages.push(t("hookError"));
    if (status?.sync?.conflicts?.length || status?.sync?.modified?.length) messages.push(t("errors"));
    $("notice").hidden = messages.length === 0;
    $("notice").textContent = messages.join(" ");
    $("apply").disabled = busy;
    $("reset").disabled = busy || !dirty();
    $("clear").disabled = busy || draft.size === 0;
    $("routing-mode").disabled = busy;
    $("routing-mode").value = mode;
    setText("save-status", lastError || (busy ? t("applying") : justSaved ? t("saved") : dirty() ? t("unsaved") : ""));
    $("save-status").className = `save-status${lastError ? " error" : justSaved ? " success" : ""}`;
  }

  function readStatus() {
    status = globalThis.__CLAUDE_SUBAGENT_ROUTER_STATUS__;
    if (status?.sync?.ok === false) return render();
    if (status && status.revision > lastRevision) lastRevision = status.revision;
    render();
  }

  function refreshSnapshot(name) {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `${name}.js?revision=${Date.now()}`;
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
    } catch (error) {
      lastError = `${t("saveError")}: ${error.message || error}`;
    } finally {
      busy = false;
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
    $("routing-mode").addEventListener("change", () => { mode = $("routing-mode").value; justSaved = false; lastError = ""; render(); });
    $("filter-all").addEventListener("click", () => { selectedOnly = false; translate(); });
    $("filter-selected").addEventListener("click", () => { selectedOnly = true; translate(); });
    $("clear").addEventListener("click", () => { draft.clear(); selectedOnly = false; justSaved = false; lastError = ""; translate(); });
    $("reset").addEventListener("click", () => { mode = saved.mode; draft = new Map(saved.models.map((row) => [row.model, { ...row, selected: true }])); justSaved = false; lastError = ""; translate(); });
    $("apply").addEventListener("click", apply);
    translate();
    readStatus();
    magpie.onVisibility((visible) => {
      if (!visible || busy) return;
      refreshSnapshot("status").then((ok) => { if (ok) readStatus(); });
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
