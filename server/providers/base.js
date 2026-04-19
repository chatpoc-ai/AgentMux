"use strict";

const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

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

  const content = `#!/bin/sh
set -e
export AGENTMUX_GROUP_ID=${shSingleQuote(o.groupId)}
export AGENTMUX_SESSION_ID=${shSingleQuote(o.sessionName)}
export AGENTMUX_API_BASE=${shSingleQuote(o.apiBase)}
export AGENTMUX_TOKEN=${shSingleQuote(o.eventToken)}
exec ${o.command} "$(cat <<'${delim}'
${promptBody}
${delim}
)"
`;
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
  return scriptPath;
}

module.exports = {
  shSingleQuote,
  writeBootstrapScript,
};
