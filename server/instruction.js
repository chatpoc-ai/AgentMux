"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const DEFAULT_INSTRUCTION = `You run inside AgentMux. Report to the orchestrator using stdout lines:
AGENTMUX_EVENT:{"type":"done","payload":{}} or {"type":"require_confirmation","payload":{"question":"…"}}
Use env AGENTMUX_GROUP_ID and AGENTMUX_SESSION_ID. HTTP: POST $AGENTMUX_API_BASE/api/events with X-AgentMux-Token from the web UI.`;

/**
 * @returns {string}
 */
function loadInstructionTemplate() {
  const custom = process.env.AGENTMUX_AGENT_INSTRUCTION_FILE;
  if (custom && fs.existsSync(custom)) {
    return fs.readFileSync(custom, "utf8");
  }
  const def = path.join(ROOT, "config", "agent-instruction.md");
  if (fs.existsSync(def)) {
    return fs.readFileSync(def, "utf8");
  }
  return DEFAULT_INSTRUCTION;
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 */
function expandTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : "",
  );
}

/**
 * @param {object} o
 * @param {string} o.groupId
 * @param {string} o.cwdResolved
 * @param {string} o.sessionName
 * @param {number} o.port
 */
function buildPromptVars(o) {
  const apiBase = `http://127.0.0.1:${o.port}`;
  return {
    PORT: String(o.port),
    GROUP_ID: o.groupId,
    CWD: o.cwdResolved,
    SESSION_ID: o.sessionName,
    API_BASE: apiBase,
  };
}

/**
 * @param {string} agentBin
 * @param {string} promptFile absolute path, no newlines in path
 */
function buildZshLaunchLine(agentBin, promptFile) {
  const inner = `exec ${JSON.stringify(agentBin)} "$(cat ${JSON.stringify(promptFile)})"`;
  return `zsh -c ${JSON.stringify(inner)}`;
}

module.exports = {
  loadInstructionTemplate,
  expandTemplate,
  buildPromptVars,
  buildZshLaunchLine,
  DEFAULT_INSTRUCTION,
};
