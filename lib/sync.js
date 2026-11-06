import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { agentDescription, agentDocument, agentName } from "./agents.js";
import { atomicWrite } from "./atomic.js";
import { ROUTE_VERSION, routePath } from "./routing.js";

export const GENERATOR = "magpie-claude-subagent-router@1";
const OWNERSHIP = ".claude-subagent-router.json";
const MAX_DOCUMENT_BYTES = 64 * 1024;

function hash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function statePath(agentsDir) {
  return path.join(agentsDir, OWNERSHIP);
}

function readState(agentsDir) {
  try {
    const value = JSON.parse(fs.readFileSync(statePath(agentsDir), "utf8"));
    const files = value?.generator === GENERATOR && value.files && typeof value.files === "object" && !Array.isArray(value.files)
      ? Object.fromEntries(Object.entries(value.files).filter(([name, row]) =>
        /^router-[a-z0-9-]+\.md$/.test(name)
        && typeof row?.name === "string"
        && /^[a-f0-9]{64}$/.test(row?.hash)
        && typeof row?.model === "string"))
      : {};
    return { files };
  } catch {
    // Invalid state must never turn into permission to overwrite user files.
    return { files: {} };
  }
}

function unchanged(filename, expectedHash) {
  try {
    if (fs.statSync(filename).size > MAX_DOCUMENT_BYTES) return false;
    return hash(fs.readFileSync(filename, "utf8")) === expectedHash;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function syncAgents(claudeDir, configuration, catalog) {
  const agentsDir = path.join(claudeDir, "agents");
  const previous = readState(agentsDir);
  const nextFiles = {};
  const available = new Set((catalog.models || []).map((row) => row.model));
  const desired = configuration.models.filter((row) => available.has(row.model));
  const stale = configuration.models.filter((row) => !available.has(row.model));
  const result = {
    ok: true,
    written: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    conflicts: [],
    modified: [],
    stale: stale.map((row) => row.model),
    agents: [],
  };

  const staleModels = new Set(stale.map((row) => row.model));
  const hasPreviousState = Object.keys(previous.files).length > 0 || fs.existsSync(statePath(agentsDir));
  if (!hasPreviousState && desired.length === 0) return result;

  fs.mkdirSync(agentsDir, { recursive: true });
  for (const row of desired) {
    const name = agentName(row.model);
    const basename = `${name}.md`;
    const filename = path.join(agentsDir, basename);
    const content = agentDocument(row.model, row.roles);
    const digest = hash(content);
    const was = previous.files[basename];
    const exists = fs.existsSync(filename);
    if (was) {
      if (exists && !unchanged(filename, was.hash)) {
        // Ownership ends at the first manual edit, including a future sync
        // with an empty pool. Never overwrite or remove the user's version.
        result.modified.push(basename);
        nextFiles[basename] = was;
        continue;
      }
    } else if (exists) {
      result.conflicts.push(basename);
      continue;
    }
    if (exists && unchanged(filename, digest)) {
      result.unchanged++;
    } else {
      atomicWrite(filename, content);
      if (exists) result.updated++;
      else result.written++;
    }
    nextFiles[basename] = { name, model: row.model, hash: digest };
    result.agents.push({ name, model: row.model, roles: row.roles });
  }

  for (const [basename, was] of Object.entries(previous.files)) {
    if (nextFiles[basename]) continue;
    if (staleModels.has(was.model)) {
      // A temporarily unavailable selection stays intact until the user
      // explicitly deselects it or clears the whole pool.
      nextFiles[basename] = was;
      continue;
    }
    const filename = path.join(agentsDir, basename);
    if (!fs.existsSync(filename)) continue;
    // Even a file still wanted can be renamed in the next desired set only
    // after checking it is byte-for-byte the last generated document.
    if (unchanged(filename, was.hash)) {
      fs.unlinkSync(filename);
      result.removed++;
    }
  }
  atomicWrite(statePath(agentsDir), `${JSON.stringify({ generator: GENERATOR, files: nextFiles }, null, 2)}\n`);
  const route = {
    version: ROUTE_VERSION,
    mode: configuration.mode,
    agents: result.agents.map((row) => ({ ...row, description: agentDescription(row.model, row.roles) })),
  };
  atomicWrite(routePath(claudeDir), `${JSON.stringify(route, null, 2)}\n`);
  return result;
}
