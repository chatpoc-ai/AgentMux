"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const DEFAULT_INSTRUCTION = `You run inside AgentMux. Report only via HTTP: POST $AGENTMUX_API_BASE/api/events with X-AgentMux-Token: $AGENTMUX_TOKEN; emit done after work. Keep responses terse and technical. Use the pattern [thing] [action] [reason]. [next step]. Put that in payload.result. Write to the operator in {{LANGUAGE}}. Do not print the token in chat.`;

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
 * Merge `config/agent-instruction.md` (or env override) with optional
 * `~/.agentmux/projects/<id>/extra-instruction.md`. The extra file survives
 * server restarts and is re-injected whenever we spawn a **new** agent
 * (new tmux session). Live chat history is still held by the running
 * cursor-agent process — if tmux dies, only this persisted text + template
 * return on the next bootstrap.
 *
 * @param {string} projectBaseDir
 * @param {Record<string, string>} vars
 */
function composeAgentPrompt(projectBaseDir, vars) {
  const template = loadInstructionTemplate();
  let body = expandTemplate(template, vars);
  const extraPath = path.join(projectBaseDir, "extra-instruction.md");
  if (fs.existsSync(extraPath)) {
    try {
      const extra = fs.readFileSync(extraPath, "utf8").trim();
      if (extra) {
        body +=
          "\n\n---\n## Project notes (from extra-instruction.md, persists across restarts)\n\n" +
          extra;
      }
    } catch {
      /* ignore */
    }
  }
  return body;
}

/**
 * Create a placeholder so users know where to put standing rules.
 * @param {string} projectBaseDir
 */
function ensureExtraInstructionFile(projectBaseDir) {
  const p = path.join(projectBaseDir, "extra-instruction.md");
  if (fs.existsSync(p)) return;
  fs.mkdirSync(projectBaseDir, { recursive: true });
  fs.writeFileSync(
    p,
    [
      "# Long-term instructions for this project",
      "",
      "# Merged into the cursor-agent bootstrap whenever this tmux session is",
      "# created or recreated (new terminal, dead session, server restart).",
      "# In-chat turns are not replayed — put durable rules and context here.",
      "",
    ].join("\n"),
    "utf8",
  );
}

/**
 * @param {object} o
 * @param {string} o.groupId
 * @param {string} o.cwdResolved
 * @param {string} o.sessionName
 * @param {number} o.port
 */
/**
 * Interface language code -> the name to put in front of an agent. The agents
 * are told a language name, not a code: "zh" is a tag for software, and the
 * thing reading this is a language model.
 */
const LANGUAGE_NAMES = {
  en: "English",
  zh: "Chinese (简体中文)",
};

function languageName(code) {
  return LANGUAGE_NAMES[String(code || "").toLowerCase()] || LANGUAGE_NAMES.en;
}

function buildPromptVars(o) {
  const apiBase = `http://127.0.0.1:${o.port}`;
  return {
    PORT: String(o.port),
    GROUP_ID: o.groupId,
    CWD: o.cwdResolved,
    SESSION_ID: o.sessionName,
    API_BASE: apiBase,
    LANGUAGE: languageName(o.language),
  };
}

module.exports = {
  languageName,
  loadInstructionTemplate,
  expandTemplate,
  composeAgentPrompt,
  ensureExtraInstructionFile,
  buildPromptVars,
  shSingleQuote,
  DEFAULT_INSTRUCTION,
};
