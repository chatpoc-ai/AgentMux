"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomBytes } = require("crypto");

const STATE_DIR = path.join(os.homedir(), ".agentmux");

/**
 * Put an `agentmux` shim on PATH for agent panes.
 *
 * Agents are told to run `agentmux ...`; without a wrapper they would have to
 * know the absolute path to cli/index.js and prefix every call with `node`.
 * Rewritten on every spawn so a moved checkout self-heals.
 *
 * @returns {string} directory to prepend to PATH, or "" if the CLI is missing
 */
function ensureCliWrapper() {
  const cliJs = path.join(__dirname, "..", "..", "cli", "index.js");
  try {
    if (!fs.existsSync(cliJs)) return "";
    const binDir = path.join(STATE_DIR, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const wrapper = path.join(binDir, "agentmux");
    const script = `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(cliJs)} "$@"\n`;
    fs.writeFileSync(wrapper, script, { mode: 0o755 });
    fs.chmodSync(wrapper, 0o755);
    return binDir;
  } catch (err) {
    console.error(`Failed to install agentmux CLI wrapper: ${err?.message || err}`);
    return "";
  }
}

/** @param {string} p */
function shSingleQuote(p) {
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
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
 * @param {string} o.command
 * @returns {string}
 */
function writeBootstrapScript(o) {
  const scriptPath = path.join(o.baseDir, `run_agent_${o.index}.sh`);
  let promptBody = String(o.promptBody || "");
  let delim;
  for (let i = 0; i < 5; i += 1) {
    delim = `AMUX_${randomBytes(12).toString("hex")}`;
    if (!promptBody.includes(delim)) break;
    if (i === 4) {
      throw new Error("Could not allocate heredoc delimiter for agent bootstrap");
    }
  }

  const binDir = ensureCliWrapper();
  const pathLine = binDir ? `export PATH=${shSingleQuote(binDir)}:"$PATH"\n` : "";

  const content = `#!/bin/sh
set -e
export AGENTMUX_GROUP_ID=${shSingleQuote(o.groupId)}
export AGENTMUX_SESSION_ID=${shSingleQuote(o.sessionName)}
export AGENTMUX_TERMINAL_ID=${shSingleQuote(o.terminalId || o.sessionName)}
export AGENTMUX_API_BASE=${shSingleQuote(o.apiBase)}
export AGENTMUX_TOKEN=${shSingleQuote(o.eventToken)}
${pathLine}exec ${o.command} "$(cat <<'${delim}'
${promptBody}
${delim}
)"
`;
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
  return scriptPath;
}

module.exports = {
  shSingleQuote,
  ensureCliWrapper,
  writeBootstrapScript,
};
