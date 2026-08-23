#!/usr/bin/env node
"use strict";

/**
 * `agentmux` — the CLI agents use to talk to the orchestrator.
 *
 * This exists to replace hand-written curl in the agent instructions. Agents
 * were being asked to embed escaped JSON inside a double-quoted shell string,
 * which breaks the moment a report contains a quote, newline, backtick or `$`
 * — i.e. almost always. Every text-bearing flag here accepts `-` to read the
 * value from stdin instead, so nothing has to be escaped.
 *
 * Identity comes from the environment exported by the bootstrap script, so a
 * bare `agentmux event --type done --summary "..."` works with no flags.
 */

const DEFAULT_URL = process.env.AGENTMUX_API_BASE || process.env.AGENTMUX_URL || "http://127.0.0.1:9988";
const TOKEN = process.env.AGENTMUX_TOKEN || "";
const PROJECT_ID = process.env.AGENTMUX_GROUP_ID || process.env.AGENTMUX_PROJECT_ID || "";
const SELF = process.env.AGENTMUX_SESSION_ID || process.env.AGENTMUX_TERMINAL_ID || "";

function usage() {
  console.log(`agentmux — AgentMux orchestrator CLI

Identity (exported into every agent pane; flags override):
  AGENTMUX_API_BASE   API base            (${DEFAULT_URL})
  AGENTMUX_TOKEN      event bus token     (${TOKEN ? "set" : "MISSING"})
  AGENTMUX_GROUP_ID   default --project   (${PROJECT_ID || "unset"})
  AGENTMUX_SESSION_ID default --from      (${SELF || "unset"})

Commands:
  agentmux health
  agentmux terminals
  agentmux run       --to <ref> --cmd <command>
  agentmux output    --to <ref> [--lines <n>]
  agentmux interrupt --to <ref>
  agentmux event     --type <type> [--summary <text>|-] [--detail <text>|-] [--severity <s>]
  agentmux message   --to <ref> --body <text>|-

A <ref> is a terminal id, a tmux session name, or a terminal label
("Agent 1"). Labels resolve within your own project first.

Any --summary/--detail/--body/--cmd value of "-" is read from stdin, which is
the safe way to pass multi-line text:

  printf '%s' "$REPORT" | agentmux event --type done --summary -

Examples:
  agentmux event --type done --summary "Tests green. Next: ship it."
  agentmux run --to "Agent 2" --cmd "npm test"
  agentmux output --to "Agent 2" --lines 80
  agentmux interrupt --to "Agent 2"
  agentmux message --to "Agent 2" --body "Rebase onto main before you continue."
`);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && (next === "-" || !next.startsWith("--"))) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
    });
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

/**
 * Resolve a flag that may be the literal "-" (meaning: read stdin).
 *
 * @param {Record<string, string | true>} flags
 * @param {string} name
 */
async function textFlag(flags, name) {
  const value = flags[name];
  if (value == null || value === true) return "";
  if (value === "-") return readStdin();
  return String(value);
}

async function api(method, pathname, body) {
  const url = `${DEFAULT_URL.replace(/\/$/, "")}${pathname}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-AgentMux-Token": TOKEN,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`cannot reach AgentMux at ${DEFAULT_URL}: ${error?.message || error}`);
  }
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`bad response (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || `request failed (${response.status})`);
  }
  return json;
}

function requireFlag(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
    usage();
    return;
  }

  const { flags, positional } = parseArgs(argv);
  const cmd = positional[0];
  const projectId = typeof flags.project === "string" ? flags.project : PROJECT_ID;
  const from = typeof flags.from === "string" ? flags.from : SELF;
  const out = (data) => console.log(JSON.stringify(data, null, 2));

  /**
   * @param {unknown} ref terminal id, tmux session name, or label
   * @param {string} action
   * @param {Record<string, string>} [extra]
   */
  const termUrl = (ref, action, extra = {}) => {
    const qs = new URLSearchParams(extra);
    // Scopes label lookups ("Agent 1") to the caller's own project.
    if (projectId) qs.set("project", projectId);
    const query = qs.toString();
    return `/api/terminals/${encodeURIComponent(String(ref))}/${action}${query ? `?${query}` : ""}`;
  };

  switch (cmd) {
    case "health":
      out(await api("GET", "/api/health"));
      return;

    case "terminals":
      out(await api("GET", "/api/terminals"));
      return;

    case "run": {
      const ref = requireFlag(flags.to, "--to");
      const command = requireFlag(await textFlag(flags, "cmd"), "--cmd");
      out(await api("POST", termUrl(ref, "run"), { command }));
      return;
    }

    case "output": {
      const ref = requireFlag(flags.to, "--to");
      const lines = flags.lines && flags.lines !== true ? Number(flags.lines) : 100;
      const result = await api("GET", termUrl(ref, "output", { lines: String(lines) }));
      // Raw text, not JSON — this is meant to be read, not parsed.
      process.stdout.write(`${result.output}\n`);
      return;
    }

    case "interrupt": {
      const ref = requireFlag(flags.to, "--to");
      out(await api("POST", termUrl(ref, "interrupt"), {}));
      return;
    }

    case "event": {
      requireFlag(projectId, "--project (or AGENTMUX_GROUP_ID)");
      const type = typeof flags.type === "string" ? flags.type : "done";
      const payload = {
        summary: await textFlag(flags, "summary"),
        detail: await textFlag(flags, "detail"),
      };
      if (typeof flags.severity === "string") payload.severity = flags.severity;
      if (!payload.detail) delete payload.detail;
      out(await api("POST", "/api/events", { projectId, type, from, payload }));
      return;
    }

    case "message": {
      requireFlag(projectId, "--project (or AGENTMUX_GROUP_ID)");
      const to = requireFlag(flags.to, "--to");
      const text = requireFlag(await textFlag(flags, "body"), "--body");
      out(
        await api("POST", "/api/events", {
          projectId,
          type: "message",
          from,
          to: String(to),
          text,
          appendEnter: true,
        }),
      );
      return;
    }

    default:
      throw new Error(`unknown command: ${cmd}`);
  }
}

main().catch((error) => {
  console.error(`agentmux: ${error?.message || error}`);
  process.exit(1);
});
