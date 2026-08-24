"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const { writeBootstrapScript } = require("./base");

/**
 * Last-resort model list.
 *
 * Only reached when `codex debug models` cannot be run at all. Deliberately
 * short: a long hardcoded list rots silently — the previous one had five
 * models that no longer exist and was missing every current one.
 */
const FALLBACK_MODELS = [{ slug: "gpt-5.4", display_name: "GPT-5.4", default_reasoning_level: "medium" }];

const CATALOG_TTL_MS = 5 * 60 * 1000;
/** @type {{ at: number, models: object[] } | null} */
let catalogCache = null;

function resolveCodexBinary() {
  if (process.env.AGENTMUX_CODEX_BIN && fs.existsSync(process.env.AGENTMUX_CODEX_BIN)) {
    return process.env.AGENTMUX_CODEX_BIN;
  }
  try {
    const p = execFileSync("which", ["codex"], { encoding: "utf8" }).trim();
    if (p) return p;
  } catch {
    /* ignore */
  }
  return "codex";
}

/**
 * Read the Codex model catalog.
 *
 * `codex debug models` renders the catalog as JSON, which is the CLI's own
 * source of truth — far better than a list copied into this file by hand.
 * The payload is large (~280KB of prompt templates we do not want), so only
 * the few fields used here are kept, and the result is cached: the settings
 * panel and the new-terminal dialog both hit this on every open.
 *
 * Falls back to `--bundled` (the catalog shipped inside the binary, no
 * refresh) before giving up on the static list.
 */
function readCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.models;
  }
  const bin = resolveCodexBinary();
  for (const args of [["debug", "models"], ["debug", "models", "--bundled"]]) {
    try {
      const raw = execFileSync(bin, args, {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const parsed = JSON.parse(raw);
      const models = Array.isArray(parsed?.models) ? parsed.models : [];
      if (!models.length) continue;
      catalogCache = { at: Date.now(), models };
      return models;
    } catch {
      /* try the next strategy */
    }
  }
  console.error("Could not read the Codex model catalog; using the fallback list.");
  catalogCache = { at: Date.now(), models: FALLBACK_MODELS };
  return catalogCache.models;
}

/**
 * Models the operator may pick, most capable first.
 *
 * `visibility` filters out internal entries (e.g. codex-auto-review), and
 * `priority` is the CLI's own ranking, so the top of the list matches what
 * Codex itself considers current.
 */
function listModels() {
  const models = readCatalog()
    .filter((m) => m?.slug && m.visibility !== "hide")
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  return models.map((m, index) => ({
    id: m.slug,
    label: m.display_name || m.slug,
    current: false,
    default: index === 0,
  }));
}

/** Top-ranked model in the catalog. */
function defaultModel() {
  return listModels()[0]?.id || FALLBACK_MODELS[0].slug;
}

/**
 * The model's own default reasoning level.
 *
 * Previously every Codex pane was pinned to "low" regardless of model, which
 * silently downgraded models whose own default is higher.
 *
 * @param {string} slug
 */
function defaultReasoningFor(slug) {
  const entry = readCatalog().find((m) => m?.slug === slug);
  return entry?.default_reasoning_level || "medium";
}

/**
 * @param {object} o
 * @param {string} o.baseDir
 * @param {number} o.index
 * @param {string} o.groupId
 * @param {string} o.sessionName
 * @param {string} o.eventToken
 * @param {string} [o.terminalId]
 * @param {string} o.apiBase
 * @param {string} o.promptBody
 * @param {string} o.model
 * @param {string} [o.reasoningEffort]
 */
function buildBootstrapScript(o) {
  const model = String(o.model || defaultModel());
  const effort = String(o.reasoningEffort || defaultReasoningFor(model));
  const command = [
    JSON.stringify(resolveCodexBinary()),
    "--no-alt-screen",
    "--dangerously-bypass-approvals-and-sandbox",
    "--model",
    JSON.stringify(model),
    "-c",
    JSON.stringify(`model_reasoning_effort=${effort}`),
  ].join(" ");
  return writeBootstrapScript({
    baseDir: o.baseDir,
    index: o.index,
    groupId: o.groupId,
    sessionName: o.sessionName,
    apiBase: o.apiBase,
    eventToken: o.eventToken,
    terminalId: o.terminalId,
    promptBody: o.promptBody,
    command,
  });
}

module.exports = {
  id: "codex",
  label: "Codex CLI",
  // Getter, not a constant: the catalog moves, and a stale literal here is
  // exactly what this rewrite is removing.
  get defaultModel() {
    return defaultModel();
  },
  resolveBinary: resolveCodexBinary,
  listModels,
  buildBootstrapScript,
};
