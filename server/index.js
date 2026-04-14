"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { randomUUID } = require("crypto");
const { spawn, execFileSync } = require("child_process");
const express = require("express");
const WebSocket = require("ws");
const { parseEventLine, formatEventLine } = require("./event-bus");
const {
  loadInstructionTemplate,
  expandTemplate,
  buildPromptVars,
  writeAgentBootstrapScript,
  shSingleQuote,
} = require("./instruction");

const PORT = Number(process.env.PORT) || 9988;
const REPO_ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");
const NODE_MODULES = path.join(REPO_ROOT, "node_modules");

/** 与 HTTP /api/events 及终端内 curl 共用；生产环境务必设置 AGENTMUX_TOKEN */
const EVENT_TOKEN =
  process.env.AGENTMUX_TOKEN || "dev-insecure-change-me";

/** @param {string[]} args */
function tmux(args, opts = {}) {
  execFileSync("tmux", args, { stdio: "ignore", ...opts });
}

function resolveAgentBin() {
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

const AGENT_BIN = resolveAgentBin();

function safeSessionName(groupId, index) {
  const s = `amux_${groupId}_${index}`;
  return s.length > 200 ? s.slice(0, 200) : s;
}

class TerminalSession {
  constructor(groupId, index, cwd, logPath) {
    this.groupId = groupId;
    this.index = index;
    this.cwd = cwd;
    this.logPath = logPath;
    this.name = safeSessionName(groupId, index);
    /** @type {import('child_process').ChildProcess | null} */
    this.tail = null;
    /** tail 按行解析事件时未完结的缓冲 */
    this.lineBuffer = "";
  }
}

class AgentMuxServer {
  constructor() {
    /** @type {Map<string, TerminalSession[]>} */
    this.groups = new Map();
    /** @type {Map<string, import('ws').WebSocket>} */
    this.clients = new Map();
  }

  broadcast(groupId, msg) {
    const ws = this.clients.get(groupId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * @param {string} groupId
   * @param {string} sourceTerminalId 来源 tmux 会话名或 "browser" / "http"
   * @param {object} raw
   */
  emitEvent(groupId, sourceTerminalId, raw) {
    const ev = {
      type: raw.type || "event",
      from: raw.from ?? sourceTerminalId,
      to: raw.to,
      text: raw.text,
      payload: raw.payload,
      appendEnter: raw.appendEnter,
    };
    const enriched = {
      ...ev,
      id: randomUUID(),
      ts: Date.now(),
    };
    this.broadcast(groupId, { type: "bus_event", event: enriched });

    const to = ev.to;
    if (!to || typeof to !== "string") return;
    const list = this.groups.get(groupId);
    if (!list?.some((t) => t.name === to)) return;

    if (ev.text !== undefined && ev.text !== null) {
      this.sendTextToTerminal(
        groupId,
        to,
        String(ev.text),
        ev.appendEnter !== false,
      );
    } else {
      const forward = {
        type: ev.type,
        from: ev.from,
        payload: ev.payload,
      };
      const line = formatEventLine(forward);
      this.sendTextToTerminal(groupId, to, line, true);
    }
  }

  /**
   * @param {string} groupId
   * @param {string} terminalId
   * @param {string} text
   * @param {boolean} appendEnter 是否在末尾多一次 Enter
   */
  sendTextToTerminal(groupId, terminalId, text, appendEnter) {
    const list = this.groups.get(groupId);
    const term = list?.find((t) => t.name === terminalId);
    if (!term) return;
    const target = `${term.name}:0`;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      tmux(["send-keys", "-t", target, "-l", lines[i]]);
      if (i < lines.length - 1) {
        tmux(["send-keys", "-t", target, "Enter"]);
      }
    }
    if (appendEnter) {
      tmux(["send-keys", "-t", target, "Enter"]);
    }
  }

  /**
   * @param {string} groupId
   * @param {TerminalSession} term
   * @param {Buffer} chunk
   */
  processTailChunk(groupId, term, chunk) {
    term.lineBuffer += chunk.toString("utf8");
    const parts = term.lineBuffer.split("\n");
    term.lineBuffer = parts.pop() ?? "";
    let out = "";
    for (const line of parts) {
      const ev = parseEventLine(line);
      if (ev) {
        this.emitEvent(groupId, term.name, ev);
      } else {
        out += line + "\n";
      }
    }
    if (out) {
      this.broadcast(groupId, {
        type: "output",
        terminalId: term.name,
        data: out,
      });
    }
  }

  createGroup(cwd, initialCount) {
    const groupId = randomUUID().replace(/-/g, "").slice(0, 12);
    const baseDir = path.join(os.tmpdir(), "agentmux", groupId);
    fs.mkdirSync(baseDir, { recursive: true });

    const list = [];
    for (let i = 0; i < initialCount; i++) {
      list.push(this._spawnTerminal(groupId, i, cwd, baseDir));
    }
    this.groups.set(groupId, list);
    return groupId;
  }

  sendReady(groupId, cwd) {
    const list = this.groups.get(groupId);
    if (!list) return;
    this.broadcast(groupId, {
      type: "ready",
      groupId,
      cwd,
      agentBin: AGENT_BIN,
      eventToken: EVENT_TOKEN,
      eventHttpUrl: `http://127.0.0.1:${PORT}/api/events`,
      terminals: list.map((t) => ({
        id: t.name,
        index: t.index,
        logPath: t.logPath,
      })),
    });
  }

  _spawnTerminal(groupId, index, cwd, baseDir) {
    const logPath = path.join(baseDir, `w${index}.log`);
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    fs.writeFileSync(logPath, "");

    const term = new TerminalSession(groupId, index, cwd, logPath);
    const name = term.name;

    tmux(["new-session", "-d", "-s", name, "-c", cwd]);
    tmux([
      "pipe-pane",
      "-t",
      `${name}:0`,
      "-o",
      `cat >> ${shSingleQuote(logPath)}`,
    ]);

    this._startTail(groupId, term);

    const cwdResolved = path.resolve(cwd);
    const template = loadInstructionTemplate();
    const vars = buildPromptVars({
      groupId,
      cwdResolved,
      sessionName: name,
      port: PORT,
    });
    const expanded = expandTemplate(template, vars);
    const apiBase = `http://127.0.0.1:${PORT}`;
    const scriptPath = writeAgentBootstrapScript({
      baseDir,
      index,
      agentBin: AGENT_BIN,
      groupId,
      sessionName: name,
      apiBase,
      promptBody: expanded,
    });

    const runLine = `sh ${shSingleQuote(scriptPath)}`;
    tmux(["send-keys", "-t", `${name}:0`, "-l", runLine]);
    tmux(["send-keys", "-t", `${name}:0`, "Enter"]);

    return term;
  }

  _startTail(groupId, term) {
    const tail = spawn("tail", ["-f", "-n", "+0", term.logPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    term.tail = tail;
    tail.stdout.on("data", (buf) => {
      this.processTailChunk(groupId, term, buf);
    });
    tail.stderr.on("data", (buf) => {
      this.broadcast(groupId, {
        type: "error",
        message: buf.toString("utf8").trim(),
      });
    });
    tail.on("error", (err) => {
      this.broadcast(groupId, {
        type: "error",
        message: `tail failed: ${err.message}`,
      });
    });
    tail.on("close", () => {
      term.tail = null;
    });
  }

  addTerminal(groupId) {
    const list = this.groups.get(groupId);
    if (!list) return null;
    const cwd = list[0]?.cwd || process.cwd();
    const baseDir = path.join(os.tmpdir(), "agentmux", groupId);
    fs.mkdirSync(baseDir, { recursive: true });
    const index = list.length
      ? Math.max(...list.map((t) => t.index)) + 1
      : 0;
    const term = this._spawnTerminal(groupId, index, cwd, baseDir);
    list.push(term);
    this.broadcast(groupId, {
      type: "terminal_added",
      terminal: {
        id: term.name,
        index: term.index,
        logPath: term.logPath,
      },
    });
    return term;
  }

  sendInput(groupId, terminalId, data) {
    const list = this.groups.get(groupId);
    if (!list) return;
    const term = list.find((t) => t.name === terminalId);
    if (!term) return;
    try {
      tmux(["send-keys", "-t", `${term.name}:0`, "-l", data]);
    } catch (e) {
      this.broadcast(groupId, {
        type: "error",
        message: String(e?.message || e),
      });
    }
  }

  closeTerminal(groupId, terminalId) {
    const list = this.groups.get(groupId);
    if (!list) return;
    const idx = list.findIndex((t) => t.name === terminalId);
    if (idx === -1) return;
    const term = list[idx];
    if (term.tail) {
      term.tail.kill("SIGTERM");
      term.tail = null;
    }
    try {
      tmux(["kill-session", "-t", term.name]);
    } catch (e) {
      this.broadcast(groupId, {
        type: "error",
        message: `kill-session: ${e?.message || e}`,
      });
    }
    list.splice(idx, 1);
    this.broadcast(groupId, {
      type: "terminal_closed",
      terminalId,
      remaining: list.map((t) => ({ id: t.name, index: t.index })),
    });
    if (list.length === 0) {
      this.groups.delete(groupId);
    }
  }

  destroyGroup(groupId) {
    const list = this.groups.get(groupId);
    if (!list) return;
    for (const term of list) {
      if (term.tail) {
        term.tail.kill("SIGTERM");
        term.tail = null;
      }
      try {
        tmux(["kill-session", "-t", term.name]);
      } catch {
        /* ignore */
      }
    }
    this.groups.delete(groupId);
  }

  destroyAll() {
    for (const gid of [...this.groups.keys()]) {
      this.destroyGroup(gid);
    }
  }
}

const mux = new AgentMuxServer();

function shutdown() {
  mux.destroyAll();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const app = express();
app.use("/vendor/xterm", express.static(path.join(NODE_MODULES, "xterm")));
app.use(
  "/vendor/xterm-addon-fit",
  express.static(path.join(NODE_MODULES, "xterm-addon-fit")),
);
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, agentBin: AGENT_BIN });
});

app.post(
  "/api/events",
  express.json({ limit: "64kb" }),
  (req, res) => {
    const hdr = req.headers["x-agentmux-token"];
    const token =
      (typeof hdr === "string" && hdr) ||
      (typeof req.query.token === "string" && req.query.token) ||
      "";
    if (token !== EVENT_TOKEN) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const { groupId, type, from, to, text, payload, appendEnter } =
      req.body || {};
    const gid = groupId && String(groupId);
    if (!gid || !mux.groups.has(gid)) {
      res.status(404).json({ ok: false, error: "unknown_group" });
      return;
    }
    const source = from != null ? String(from) : "http";
    mux.emitEvent(gid, source, {
      type,
      to,
      text,
      payload,
      appendEnter,
    });
    res.json({ ok: true });
  },
);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  let groupId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (msg.type === "start") {
      if (groupId) {
        mux.destroyGroup(groupId);
        mux.clients.delete(groupId);
      }
      const cwd =
        (msg.cwd && String(msg.cwd).trim()) || process.cwd();
      const count = Math.min(
        16,
        Math.max(1, Number(msg.count) || 1),
      );
      groupId = mux.createGroup(path.resolve(cwd), count);
      mux.clients.set(groupId, ws);
      mux.sendReady(groupId, path.resolve(cwd));
      return;
    }

    if (!groupId && msg.type !== "start") {
      ws.send(
        JSON.stringify({
          type: "error",
          message: 'Send {"type":"start"} first.',
        }),
      );
      return;
    }

    switch (msg.type) {
      case "input": {
        const terminalId = String(msg.terminalId || "");
        const data = String(msg.data ?? "");
        mux.sendInput(groupId, terminalId, data);
        break;
      }
      case "add": {
        mux.addTerminal(groupId);
        break;
      }
      case "close": {
        mux.closeTerminal(groupId, String(msg.terminalId || ""));
        break;
      }
      case "emit_event": {
        const ev = msg.event && typeof msg.event === "object" ? msg.event : {};
        const from =
          (msg.fromTerminalId && String(msg.fromTerminalId)) || "browser";
        mux.emitEvent(groupId, from, ev);
        break;
      }
      case "shutdown": {
        mux.destroyGroup(groupId);
        mux.clients.delete(groupId);
        groupId = null;
        ws.send(JSON.stringify({ type: "shutdown_ok" }));
        break;
      }
      default:
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Unknown type: ${msg.type}`,
          }),
        );
    }
  });

  ws.on("close", () => {
    if (groupId) {
      mux.destroyGroup(groupId);
      mux.clients.delete(groupId);
    }
  });
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use (EADDRINUSE). Stop the other process, e.g.:\n` +
        `  lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n` +
        `  kill <PID>\n` +
        `Or use another port: PORT=9989 npm start`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`AgentMux listening on http://127.0.0.1:${PORT}`);
  console.log(`Resolved agent binary: ${AGENT_BIN}`);
  const instCustom = process.env.AGENTMUX_AGENT_INSTRUCTION_FILE;
  const instDefault = path.join(REPO_ROOT, "config", "agent-instruction.md");
  if (instCustom && fs.existsSync(instCustom)) {
    console.log(`Agent instruction file: ${instCustom}`);
  } else if (fs.existsSync(instDefault)) {
    console.log(`Agent instruction file: ${instDefault}`);
  } else {
    console.log(
      "Agent instruction: (built-in default; add config/agent-instruction.md to customize)",
    );
  }
  console.log(
    `Event bus: POST /api/events  Header: X-AgentMux-Token: <token>  (set AGENTMUX_TOKEN env)`,
  );
  if (!process.env.AGENTMUX_TOKEN) {
    console.warn(
      `Using default AGENTMUX_TOKEN (dev only): ${EVENT_TOKEN}`,
    );
  }
});
