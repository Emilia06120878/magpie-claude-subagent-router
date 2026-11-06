export const ROLE_IDS = Object.freeze([
  "fast",
  "reasoning",
  "implementation",
  "review",
  "research",
  "general",
]);

export const ROLES = Object.freeze({
  fast: {
    en: "Fast execution",
    zh: "快速执行",
    descriptionEn: "Prefer this model for focused, low-latency execution and straightforward tasks.",
    descriptionZh: "适合范围明确、注重速度和执行效率的任务。",
  },
  reasoning: {
    en: "Complex reasoning",
    zh: "复杂推理",
    descriptionEn: "Prefer this model for difficult analysis, planning, debugging, and multi-step reasoning.",
    descriptionZh: "适合复杂分析、规划、调试和多步骤推理。",
  },
  implementation: {
    en: "Code implementation",
    zh: "代码实现",
    descriptionEn: "Prefer this model for writing and modifying code, tests, and technical artifacts.",
    descriptionZh: "适合编写和修改代码、测试及技术产物。",
  },
  review: {
    en: "Code review",
    zh: "代码审查",
    descriptionEn: "Prefer this model for reviewing correctness, regressions, security, and maintainability.",
    descriptionZh: "适合审查正确性、回归风险、安全性和可维护性。",
  },
  research: {
    en: "Exploration and research",
    zh: "探索研究",
    descriptionEn: "Prefer this model for exploring unfamiliar code, gathering evidence, and comparing approaches.",
    descriptionZh: "适合探索陌生代码、收集证据和比较方案。",
  },
  general: {
    en: "General tasks",
    zh: "通用任务",
    descriptionEn: "A general-purpose choice without a narrow task restriction.",
    descriptionZh: "适合一般任务，不限于某一狭窄用途。",
  },
});

export const MAX_MODELS = 200;
export const DEFAULT_MODE = "strict";
export const ROUTING_MODES = Object.freeze(["strict", "prefer"]);

export function validModelId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && value === value.trim()
    && !/[\u0000-\u001f\u007f]/.test(value);
}

export function normalizeOptions(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const input = Array.isArray(source.models) ? source.models : [];
  const models = [];
  const seen = new Set();
  for (const item of input) {
    if (models.length >= MAX_MODELS) break;
    const model = typeof item === "string" ? item : item?.model;
    if (!validModelId(model) || seen.has(model)) continue;
    seen.add(model);
    const wanted = new Set(Array.isArray(item?.roles) ? item.roles : []);
    models.push({ model, roles: ROLE_IDS.filter((role) => wanted.has(role)) });
  }
  return { version: 1, models, mode: ROUTING_MODES.includes(source.mode) ? source.mode : DEFAULT_MODE };
}
