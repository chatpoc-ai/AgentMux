"use strict";

const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

const ROOT = path.join(__dirname, "..");

const DEFAULT_INSTRUCTION = `You run inside AgentMux. Report to the orchestrator using stdout lines:
AGENTMUX_EVENT:{"type":"done","payload":{}} or {"type":"require_confirmation","payload":{"question":"…"}}
Use env AGENTMUX_GROUP_ID and AGENTMUX_SESSION_ID. HTTP: POST $AGENTMUX_API_BASE/api/events with X-AgentMux-Token from the web UI.`;

/** @param {string} p */
function shSingleQuote(p) {
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}

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
 * 单文件启动脚本：heredoc 内嵌 instruction，避免 tmux paste / 独立 prompt 文件的竞态或路径丢失。
 * @param {object} o
 * @param {string} o.baseDir
 * @param {number} o.index
 * @param {string} o.agentBin
 * @param {string} o.groupId
 * @param {string} o.sessionName
 * @param {string} o.apiBase
 * @param {string} o.promptBody
 * @returns {string} 可执行脚本绝对路径
 */
function writeAgentBootstrapScript(o) {
  const scriptPath = path.join(o.baseDir, `run_agent_${o.index}.sh`);
  let promptBody = o.promptBody;
  let delim;
  for (let i = 0; i < 5; i++) {
    delim = `AMUX_${randomBytes(12).toString("hex")}`;
    if (!promptBody.includes(delim)) break;
    if (i === 4) {
      throw new Error("Could not allocate heredoc delimiter for agent bootstrap");
    }
  }

  const content = `#!/bin/sh
set -e
export AGENTMUX_GROUP_ID=${shSingleQuote(o.groupId)}
export AGENTMUX_SESSION_ID=${shSingleQuote(o.sessionName)}
export AGENTMUX_API_BASE=${shSingleQuote(o.apiBase)}
exec ${JSON.stringify(o.agentBin)} "$(cat <<'${delim}'
${promptBody}
${delim}
)"
`;
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
  return scriptPath;
}

module.exports = {
  loadInstructionTemplate,
  expandTemplate,
  buildPromptVars,
  writeAgentBootstrapScript,
  shSingleQuote,
  DEFAULT_INSTRUCTION,
};
