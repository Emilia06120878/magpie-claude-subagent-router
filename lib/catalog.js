import fs from "node:fs";
import path from "node:path";
import { MAX_MODELS, validModelId } from "./config.js";

const MAX_SETTINGS_BYTES = 4 * 1024 * 1024;

// Only these two public picker fields cross the host/page boundary. In
// particular, picker descriptions can identify a provider account.
export function publicCatalog(settings) {
  const rows = settings?.modelPicker?.options;
  if (!Array.isArray(rows)) return { ok: false, models: [], reason: "picker-missing" };
  const models = [];
  const seen = new Set();
  for (const row of rows) {
    if (models.length >= MAX_MODELS) break;
    if (!row || typeof row !== "object" || !validModelId(row.model) || seen.has(row.model)) continue;
    seen.add(row.model);
    const label = typeof row.label === "string" && row.label.trim()
      ? row.label.trim().slice(0, 200)
      : row.model;
    models.push({ model: row.model, label });
  }
  return { ok: true, models, reason: models.length ? "" : "picker-empty" };
}

function isMagpiePicker(settings) {
  const rows = settings?.modelPicker?.options;
  return Array.isArray(rows) && rows.length > 0 && rows.every((row) =>
    typeof row?.model === "string" && row.model.length > 0
    && typeof row?.description === "string" && row.description.endsWith("via magpie"));
}

export function readCatalog(claudeDir) {
  const filename = path.join(claudeDir, "settings.json");
  try {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > MAX_SETTINGS_BYTES) {
      return { ok: false, models: [], reason: "settings-unreadable" };
    }
    const settings = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return { ok: false, models: [], reason: "settings-invalid" };
    }
    if (settings?.modelPicker?.options?.length > 0 && !isMagpiePicker(settings)) {
      return { ok: false, models: [], reason: "picker-unmanaged" };
    }
    return publicCatalog(settings);
  } catch (error) {
    return {
      ok: false,
      models: [],
      reason: error?.code === "ENOENT" ? "settings-missing" : "settings-invalid",
    };
  }
}
