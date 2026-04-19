"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const { writeBootstrapScript } = require("./base");

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

function listModels() {
  return [
    { id: "gpt-5.4", label: "gpt-5.4", current: false, default: true },
    { id: "gpt-5.2-codex", label: "gpt-5.2-codex", current: false, default: false },
    { id: "gpt-5.1-codex-max", label: "gpt-5.1-codex-max", current: false, default: false },
    { id: "gpt-5.4-mini", label: "gpt-5.4-mini", current: true, default: false },
    { id: "gpt-5.3-codex", label: "gpt-5.3-codex", current: false, default: false },
    { id: "gpt-5.2", label: "gpt-5.2", current: false, default: false },
    { id: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini", current: false, default: false },
  ];
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
 * @param {string} [o.reasoningEffort]
 */
function buildBootstrapScript(o) {
  const model = String(o.model || "gpt-5.4-mini");
  const effort = String(o.reasoningEffort || "low");
  const command =
    [
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
    promptBody: o.promptBody,
    command,
  });
}

module.exports = {
  id: "codex",
  label: "Codex CLI",
  defaultModel: "gpt-5.4-mini",
  resolveBinary: resolveCodexBinary,
  listModels,
  buildBootstrapScript,
};
