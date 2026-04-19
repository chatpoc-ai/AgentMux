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
    const match = trimmed.match(/^([a-z0-9._-]+)\s*-\s*(.+?)\s*(?:\((current|default)\))?$/i);
    if (!match) continue;
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    models.push({
      id,
      label: match[2].trim(),
      current: match[3] === "current",
      default: match[3] === "default",
    });
  }
  return models;
}

function listModels() {
  try {
    const output = execFileSync("agent", ["--list-models"], {
      encoding: "utf8",
      env: { ...process.env, TERM: "xterm" },
    });
    return parseModelListOutput(output);
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
