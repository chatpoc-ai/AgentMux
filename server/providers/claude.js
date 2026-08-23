"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { writeBootstrapScript } = require("./base");

function resolveClaudeBinary() {
  if (process.env.AGENTMUX_CLAUDE_BIN && fs.existsSync(process.env.AGENTMUX_CLAUDE_BIN)) {
    return process.env.AGENTMUX_CLAUDE_BIN;
  }
  try {
    const p = execFileSync("which", ["claude"], { encoding: "utf8" }).trim();
    if (p) return p;
  } catch {
    /* ignore */
  }
  return "claude";
}

/**
 * Aliases, not pinned ids: `claude --model` resolves `opus`/`sonnet`/`haiku`/
 * `fable` to the current release, so this list does not go stale the way a
 * hardcoded `claude-opus-4-7` does. Pass a full id via the UI's free-text
 * field if a specific snapshot is needed.
 */
function listModels() {
  return [
    { id: "sonnet", label: "Sonnet (latest)", current: false, default: true },
    { id: "opus", label: "Opus (latest)", current: false, default: false },
    { id: "haiku", label: "Haiku (latest)", current: false, default: false },
    { id: "fable", label: "Fable (latest)", current: false, default: false },
  ];
}

function getFlagParts() {
  if (Object.prototype.hasOwnProperty.call(process.env, "AGENTMUX_CLAUDE_FLAGS")) {
    const t = String(process.env.AGENTMUX_CLAUDE_FLAGS ?? "").trim();
    if (!t) return [];
    return t.split(/\s+/).filter(Boolean);
  }
  return ["--permission-mode", "bypassPermissions"];
}

/**
 * Claude Code shows a blocking "do you trust this folder?" prompt the first
 * time it runs in a directory. That prompt is a TUI dialog, so an agent
 * bootstrapped into a fresh tmux pane would just sit on it forever with no
 * one to answer. Marking the project cwd as accepted in ~/.claude.json ahead
 * of time skips it.
 *
 * Best-effort: a malformed or unwritable ~/.claude.json is not worth failing
 * the spawn over — the user can still answer the prompt by hand.
 *
 * @param {string} cwd
 */
function preTrustProjectDir(cwd) {
  if (!cwd) return;
  const claudeJson = path.join(os.homedir(), ".claude.json");
  try {
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(claudeJson, "utf8"));
    } catch {
      /* first run, or unreadable — start from an empty object */
    }
    if (!data || typeof data !== "object") data = {};
    if (!data.projects || typeof data.projects !== "object") data.projects = {};
    const proj = data.projects[cwd] || {};
    if (proj.hasTrustDialogAccepted) return;
    proj.hasTrustDialogAccepted = true;
    data.projects[cwd] = proj;
    const tmp = `${claudeJson}.agentmux.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, claudeJson);
  } catch (err) {
    console.error(`Failed to pre-trust ${cwd} for Claude: ${err?.message || err}`);
  }
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
 * @param {string} [o.cwd]
 */
function buildBootstrapScript(o) {
  preTrustProjectDir(o.cwd);
  const command = [
    JSON.stringify(resolveClaudeBinary()),
    ...getFlagParts().map((flag) => JSON.stringify(flag)),
    "--model",
    JSON.stringify(o.model || "sonnet"),
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
  id: "claude",
  label: "Claude Code",
  defaultModel: "sonnet",
  resolveBinary: resolveClaudeBinary,
  listModels,
  buildBootstrapScript,
};
