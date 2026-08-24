"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const { writeBootstrapScript } = require("./base");

function resolveCursorBinary() {
  if (process.env.AGENT_BIN && fs.existsSync(process.env.AGENT_BIN)) {
    return process.env.AGENT_BIN;
  }
  try {
    const p = execFileSync("which", ["agent"], { encoding: "utf8" }).trim();
    if (p) return p;
  } catch {
    /* ignore */
  }
  return "agent";
}

function parseModelListOutput(output) {
  const models = [];
  const seen = new Set();
  for (const line of String(output || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(Loading|Available models|Tip:|WARNING:|Continue anyway\?|Error:)/i.test(trimmed)) {
      continue;
    }
    const match = trimmed.match(/^([a-z0-9._-]+)\s*-\s*(.+)$/i);
    if (!match) continue;
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);

    // The marker is a trailing parenthetical that may combine both flags:
    // "auto - Auto (current, default)". Only strip it when it contains
    // nothing else — real labels carry parentheses of their own, e.g.
    // "Claude Fable 5 1M Thinking (NO ZDR)".
    let label = match[2].trim();
    let isCurrent = false;
    let isDefault = false;
    const tail = label.match(/\(([^)]*)\)$/);
    if (tail && /^\s*(current|default)(\s*,\s*(current|default))*\s*$/i.test(tail[1])) {
      isCurrent = /current/i.test(tail[1]);
      isDefault = /default/i.test(tail[1]);
      label = label.slice(0, tail.index).trim();
    }

    models.push({ id, label, current: isCurrent, default: isDefault });
  }
  return models;
}

const MODELS_TTL_MS = 5 * 60 * 1000;
/** @type {{ at: number, models: object[] } | null} */
let modelsCache = null;

/**
 * Cursor exposes a couple of hundred models and the list only changes on CLI
 * updates, so cache it: the settings panel and the new-terminal dialog both
 * hit this on every open, and each miss is a process spawn.
 */
function listModels() {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL_MS) {
    return modelsCache.models;
  }
  try {
    const output = execFileSync(resolveCursorBinary(), ["--list-models"], {
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, TERM: "xterm" },
    });
    const models = parseModelListOutput(output);
    if (models.length) modelsCache = { at: Date.now(), models };
    return models;
  } catch (err) {
    console.error(`Failed to list Cursor models: ${err?.message || err}`);
    return [];
  }
}

function getFlagParts() {
  if (
    !Object.prototype.hasOwnProperty.call(
      process.env,
      "AGENTMUX_AGENT_FLAGS",
    )
  ) {
    return ["--yolo"];
  }
  const t = String(process.env.AGENTMUX_AGENT_FLAGS ?? "").trim();
  if (!t) return [];
  return t.split(/\s+/).filter(Boolean);
}

/**
 * @param {object} o
 * @param {string} o.baseDir
 * @param {number} o.index
 * @param {string} o.groupId
 * @param {string} o.sessionName
 * @param {string} o.apiBase
 * @param {string} o.eventToken
 * @param {string} [o.terminalId]
 * @param {string} o.promptBody
 * @param {string} o.model
 * @param {string[]} [o.extraFlags]
 */
function buildBootstrapScript(o) {
  const flags = [...getFlagParts()];
  const command = [
    JSON.stringify(resolveCursorBinary()),
    ...flags.map((flag) => JSON.stringify(flag)),
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
    command: `${command} --model ${JSON.stringify(o.model || "auto")}`,
  });
}

module.exports = {
  id: "cursor",
  label: "Cursor Agent",
  defaultModel: "auto",
  resolveBinary: resolveCursorBinary,
  listModels,
  buildBootstrapScript,
};
