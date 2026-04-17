"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { randomUUID } = require("crypto");
const { spawn, execFileSync } = require("child_process");
const express = require("express");
const WebSocket = require("ws");
const {
  composeAgentPrompt,
  ensureExtraInstructionFile,
  buildPromptVars,
  getAgentFlagParts,
  writeAgentBootstrapScript,
  shSingleQuote,
} = require("./instruction");

const PORT = Number(process.env.PORT) || 9988;
const HOST = process.env.HOST || "0.0.0.0";
const REPO_ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const STATE_DIR = path.join(os.homedir(), ".agentmux");
const STATE_FILE = path.join(STATE_DIR, "projects.json");
const PROJECTS_DIR = path.join(STATE_DIR, "projects");
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
const EVENT_TOKEN =
  process.env.AGENTMUX_TOKEN || "dev-insecure-change-me";
const TREE_ENTRY_LIMIT = 200;
const DIRECTORY_PICKER_ROOTS = [
  { id: "cwd", label: "Current Workspace", path: REPO_ROOT },
  { id: "home", label: "Home", path: os.homedir() },
  { id: "projects", label: "Projects", path: path.join(os.homedir(), "Projects") },
].filter((item, index, list) => {
  if (!fs.existsSync(item.path)) return false;
  return list.findIndex((candidate) => candidate.path === item.path) === index;
});

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

/**
 * @param {string} value
 * @param {number} max
 */
function truncate(value, max) {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * @param {string} projectId
 * @param {number} index
 * @param {string} terminalId
 */
function safeSessionName(projectId, index, terminalId) {
  return truncate(`amux_${projectId}_${index}_${terminalId}`, 200);
}

/**
 * @param {string} cwd
 */
function defaultProjectName(cwd) {
  return path.basename(cwd) || cwd;
}

/**
 * @param {string} root
 * @param {string} [requested]
 */
function resolveProjectPath(root, requested = "") {
  const abs = path.resolve(root, requested || ".");
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error("path_outside_project");
  }
  return abs;
}

/**
 * @param {string} absPath
 */
function hasVisibleChildren(absPath) {
  try {
    const entries = fs.readdirSync(absPath, { withFileTypes: true });
    return entries.some(
      (entry) => entry.name !== ".git" && entry.name !== "node_modules",
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRoot
 * @param {string} absPath
 */
function listTreeEntries(projectRoot, absPath) {
  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    })
    .slice(0, TREE_ENTRY_LIMIT)
    .map((entry) => {
      const fullPath = path.join(absPath, entry.name);
      const relPath = path.relative(projectRoot, fullPath) || ".";
      return {
        name: entry.name,
        path: relPath,
        type: entry.isDirectory() ? "directory" : "file",
        hasChildren: entry.isDirectory() ? hasVisibleChildren(fullPath) : false,
      };
    });
}

function getNetworkUrls() {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item.family !== "IPv4" || item.internal) continue;
      urls.push(`http://${item.address}:${PORT}`);
    }
  }
  return urls;
}

/**
 * @param {string} requested
 */
function resolveChooserPath(requested = "") {
  if (!requested) {
    return DIRECTORY_PICKER_ROOTS[0]?.path || os.homedir();
  }
  return path.resolve(requested);
}

/**
 * @param {string} absPath
 */
function listDirectoryChoices(absPath) {
  const parent =
    path.dirname(absPath) !== absPath ? path.dirname(absPath) : null;
  const entries = fs
    .readdirSync(absPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== ".git" && entry.name !== "node_modules")
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
    .slice(0, TREE_ENTRY_LIMIT)
    .map((entry) => {
      const fullPath = path.join(absPath, entry.name);
      return {
        name: entry.name,
        path: fullPath,
      };
    });

  return {
    currentPath: absPath,
    parentPath: parent,
    entries,
  };
}

class TerminalSession {
  constructor(projectId, index, cwd, logPath) {
    this.projectId = projectId;
    this.index = index;
    this.cwd = cwd;
    this.logPath = logPath;
    this.id = randomUUID().replace(/-/g, "").slice(0, 8);
    this.name = safeSessionName(projectId, index, this.id);
    this.label = `Agent ${index + 1}`;
    /** @type {import('child_process').ChildProcess | null} */
    this.tail = null;
  }
}

class ProjectSession {
  constructor(cwd, name) {
    this.id = randomUUID().replace(/-/g, "").slice(0, 12);
    this.cwd = cwd;
    this.name = name || defaultProjectName(cwd);
    this.baseDir = path.join(PROJECTS_DIR, this.id);
    /** @type {TerminalSession[]} */
    this.terminals = [];
  }
}

function tmuxSessionExists(name) {
  try {
    execFileSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

class AgentMuxServer {
  constructor() {
    /** @type {Map<string, ProjectSession>} */
    this.projects = new Map();
    /** @type {Set<import("ws").WebSocket>} */
    this.clients = new Set();
    this._saveTimer = null;
  }

  persistSnapshot() {
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      projects: [...this.projects.values()].map((project) => ({
        id: project.id,
        cwd: project.cwd,
        name: project.name,
        terminals: project.terminals.map((term) => ({
          id: term.id,
          index: term.index,
          label: term.label,
          name: term.name,
          logPath: term.logPath,
        })),
      })),
    };
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, STATE_FILE);
    } catch (err) {
      console.error(`Failed to persist state: ${err?.message || err}`);
    }
  }

  schedulePersist() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.persistSnapshot();
    }, 120);
  }

  restoreFromDisk() {
    if (!fs.existsSync(STATE_FILE)) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    } catch (err) {
      console.error(`Failed to parse ${STATE_FILE}: ${err?.message || err}`);
      return;
    }
    for (const entry of data.projects || []) {
      if (!entry?.cwd || !fs.existsSync(entry.cwd)) continue;
      const project = new ProjectSession(entry.cwd, entry.name);
      project.id = entry.id || project.id;
      project.baseDir = path.join(PROJECTS_DIR, project.id);
      fs.mkdirSync(project.baseDir, { recursive: true });
      ensureExtraInstructionFile(project.baseDir);

      for (const termEntry of entry.terminals || []) {
        const logPath =
          termEntry.logPath ||
          path.join(project.baseDir, `w${termEntry.index}.log`);
        const term = new TerminalSession(
          project.id,
          termEntry.index,
          project.cwd,
          logPath,
        );
        term.id = termEntry.id || term.id;
        term.name = termEntry.name || term.name;
        term.label = termEntry.label || term.label;

        try {
          this._restoreTerminal(project, term);
          project.terminals.push(term);
        } catch (err) {
          console.error(
            `Failed to restore terminal ${term.name}: ${err?.message || err}`,
          );
        }
      }

      project.terminals.sort((a, b) => a.index - b.index);
      this.projects.set(project.id, project);
    }
    if (this.projects.size) {
      console.log(
        `Restored ${this.projects.size} project(s) from ${STATE_FILE}`,
      );
    }
  }

  /**
   * @param {ProjectSession} project
   * @param {TerminalSession} term
   */
  _restoreTerminal(project, term) {
    if (!fs.existsSync(term.logPath)) {
      fs.writeFileSync(term.logPath, "");
    }
    const alive = tmuxSessionExists(term.name);
    if (!alive) {
      // Recreate at default size on restore path (see _spawnTerminal note).
      tmux(["new-session", "-d", "-s", term.name, "-c", project.cwd]);
      tmux([
        "pipe-pane",
        "-t",
        `${term.name}:0`,
        "-o",
        `cat >> ${shSingleQuote(term.logPath)}`,
      ]);
      const vars = buildPromptVars({
        groupId: project.id,
        cwdResolved: project.cwd,
        sessionName: term.name,
        port: PORT,
      });
      const expanded = composeAgentPrompt(project.baseDir, vars);
      const apiBase = `http://127.0.0.1:${PORT}`;
      const scriptPath = writeAgentBootstrapScript({
        baseDir: project.baseDir,
        index: term.index,
        agentBin: AGENT_BIN,
        groupId: project.id,
        sessionName: term.name,
        apiBase,
        eventToken: EVENT_TOKEN,
        promptBody: expanded,
        agentFlagParts: getAgentFlagParts(),
      });
      const runLine = `sh ${shSingleQuote(scriptPath)}`;
      tmux(["send-keys", "-t", `${term.name}:0`, "-l", runLine]);
      tmux(["send-keys", "-t", `${term.name}:0`, "Enter"]);
    } else {
      try {
        tmux([
          "pipe-pane",
          "-t",
          `${term.name}:0`,
          "-o",
          `cat >> ${shSingleQuote(term.logPath)}`,
        ]);
      } catch {
        /* ignore */
      }
    }
    this._startTail(project, term);
  }

  /**
   * @param {ProjectSession} project
   */
  serializeProject(project) {
    return {
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      terminals: project.terminals.map((term) => ({
        id: term.id,
        index: term.index,
        label: term.label,
        tmuxSession: term.name,
      })),
    };
  }

  snapshotMessage() {
    return {
      type: "snapshot",
      projects: [...this.projects.values()].map((project) =>
        this.serializeProject(project),
      ),
      agentBin: AGENT_BIN,
      eventToken: EVENT_TOKEN,
    };
  }

  /**
   * @param {import("ws").WebSocket} ws
   */
  addClient(ws) {
    this.clients.add(ws);
    ws.send(JSON.stringify(this.snapshotMessage()));
  }

  /**
   * @param {import("ws").WebSocket} ws
   */
  removeClient(ws) {
    this.clients.delete(ws);
  }

  broadcast(message) {
    const raw = JSON.stringify(message);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  /**
   * @param {string} projectId
   * @param {string} sourceTerminalId
   * @param {object} raw
   */
  emitEvent(projectId, sourceTerminalId, raw) {
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
      projectId,
    };
    this.broadcast({ type: "bus_event", event: enriched });

    const to = ev.to;
    if (!to || typeof to !== "string") return;
    const project = this.projects.get(projectId);
    const target = project?.terminals.find((term) => term.id === to);
    if (!target) return;

    if (ev.text !== undefined && ev.text !== null) {
      this.sendTextToTerminal(projectId, target.id, String(ev.text), ev.appendEnter !== false);
      return;
    }

    const body = {
      projectId,
      groupId: projectId,
      type: ev.type,
      from: ev.from,
      payload: ev.payload,
    };
    const json = JSON.stringify(body);
    const curlLine =
      `curl -sS -X POST http://127.0.0.1:${PORT}/api/events` +
      ` -H ${shSingleQuote("Content-Type: application/json")}` +
      ` -H ${shSingleQuote(`X-AgentMux-Token: ${EVENT_TOKEN}`)}` +
      ` -d ${shSingleQuote(json)}`;
    this.sendTextToTerminal(projectId, target.id, curlLine, true);
  }

  /**
   * @param {string} projectId
   * @param {string} sourceTerminalId
   * @param {TerminalSession} term
   * @param {Buffer} chunk
   */
  processTailChunk(projectId, sourceTerminalId, term, chunk) {
    this.broadcast({
      type: "output",
      projectId,
      terminalId: sourceTerminalId,
      data: chunk.toString("utf8"),
    });
  }

  /**
   * @param {string} cwd
   * @param {number} initialCount
   * @param {string} [name]
   */
  createProject(cwd, initialCount, name) {
    const resolved = path.resolve(cwd || process.cwd());
    const existing = [...this.projects.values()].find(
      (project) => project.cwd === resolved,
    );
    if (existing) {
      return { project: existing, created: false };
    }
    const project = new ProjectSession(resolved, name?.trim());
    fs.mkdirSync(project.baseDir, { recursive: true });
    ensureExtraInstructionFile(project.baseDir);

    for (let index = 0; index < initialCount; index += 1) {
      project.terminals.push(this._spawnTerminal(project, index));
    }

    this.projects.set(project.id, project);
    this.broadcast({
      type: "project_created",
      project: this.serializeProject(project),
    });
    this.schedulePersist();
    return { project, created: true };
  }

  /**
   * @param {string} projectId
   */
  addTerminal(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return null;
    const index = project.terminals.length
      ? Math.max(...project.terminals.map((term) => term.index)) + 1
      : 0;
    const term = this._spawnTerminal(project, index);
    project.terminals.push(term);
    this.broadcast({
      type: "terminal_added",
      projectId,
      terminal: {
        id: term.id,
        index: term.index,
        label: term.label,
        tmuxSession: term.name,
      },
    });
    this.schedulePersist();
    return term;
  }

  /**
   * @param {ProjectSession} project
   * @param {number} index
   */
  _spawnTerminal(project, index) {
    const logPath = path.join(project.baseDir, `w${index}.log`);
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    fs.writeFileSync(logPath, "");

    const term = new TerminalSession(project.id, index, project.cwd, logPath);
    // Intentionally create the tmux session with its default size (80x24).
    // cursor-agent and other alt-screen TUIs are sensitive to PTY width;
    // if the pane is wider than what xterm renders (or vice versa), reverse-
    // video separators wrap and show as huge black bars. Keeping tmux at a
    // fixed, conservative size and letting xterm just display the bytes has
    // proven stable. DO NOT add -x/-y or later resize-window without
    // verifying cursor-agent still redraws cleanly on SIGWINCH.
    tmux(["new-session", "-d", "-s", term.name, "-c", project.cwd]);
    tmux([
      "pipe-pane",
      "-t",
      `${term.name}:0`,
      "-o",
      `cat >> ${shSingleQuote(logPath)}`,
    ]);

    this._startTail(project, term);

    const vars = buildPromptVars({
      groupId: project.id,
      cwdResolved: project.cwd,
      sessionName: term.name,
      port: PORT,
    });
    const expanded = composeAgentPrompt(project.baseDir, vars);
    const apiBase = `http://127.0.0.1:${PORT}`;
    const scriptPath = writeAgentBootstrapScript({
      baseDir: project.baseDir,
      index,
      agentBin: AGENT_BIN,
      groupId: project.id,
      sessionName: term.name,
      apiBase,
      eventToken: EVENT_TOKEN,
      promptBody: expanded,
      agentFlagParts: getAgentFlagParts(),
    });

    const runLine = `sh ${shSingleQuote(scriptPath)}`;
    tmux(["send-keys", "-t", `${term.name}:0`, "-l", runLine]);
    tmux(["send-keys", "-t", `${term.name}:0`, "Enter"]);

    return term;
  }

  /**
   * @param {ProjectSession} project
   * @param {TerminalSession} term
   */
  _startTail(project, term) {
    // -F follows the log across truncations/rotations; -n 0 skips the
    // historical log and only forwards *new* bytes. We deliberately do NOT
    // replay the log file (used to be `-n +0`): cursor-agent uses an
    // alt-screen TUI and the log contains every partial frame/cursor move.
    // Replaying that linearly onto a fresh xterm produces stacked/garbled
    // output. For historical view-on-switch we use tmux capture-pane.
    const tail = spawn("tail", ["-F", "-n", "0", term.logPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    term.tail = tail;
    tail.stdout.on("data", (buf) => {
      this.processTailChunk(project.id, term.id, term, buf);
    });
    tail.stderr.on("data", (buf) => {
      this.broadcast({
        type: "error",
        message: buf.toString("utf8").trim(),
      });
    });
    tail.on("error", (err) => {
      this.broadcast({
        type: "error",
        message: `tail failed: ${err.message}`,
      });
    });
    tail.on("close", () => {
      term.tail = null;
    });
  }

  /**
   * @param {string} projectId
   * @param {string} terminalId
   * @param {string} data
   */
  sendInput(projectId, terminalId, data) {
    const project = this.projects.get(projectId);
    const term = project?.terminals.find((item) => item.id === terminalId);
    if (!term) return;
    try {
      tmux(["send-keys", "-t", `${term.name}:0`, "-l", data]);
    } catch (e) {
      this.broadcast({
        type: "error",
        message: String(e?.message || e),
      });
    }
  }

  /**
   * Capture the current visible pane contents with ANSI escapes preserved.
   * This is the authoritative way to render a TUI's current frame when a
   * client attaches/switches/refreshes, because it reflects the post-redraw
   * state of the application rather than a replay of historical output.
   *
   * Flags:
   *   -p  send to stdout
   *   -e  include escape sequences (colors/styles)
   *   -J  join wrapped lines (avoids truncation of long logical lines)
   *
   * @param {string} projectId
   * @param {string} terminalId
   */
  capturePane(projectId, terminalId) {
    const project = this.projects.get(projectId);
    const term = project?.terminals.find((item) => item.id === terminalId);
    if (!term) return "";
    try {
      const raw = execFileSync(
        "tmux",
        ["capture-pane", "-t", `${term.name}:0`, "-p", "-e", "-J"],
        { encoding: "utf8" },
      );
      return raw.replace(/\n+$/, "");
    } catch {
      return "";
    }
  }

  /**
   * @param {string} projectId
   * @param {string} terminalId
   * @param {number} cols
   * @param {number} rows
   */
  /**
   * Intentional no-op.
   *
   * We used to propagate xterm's cols/rows into tmux via `resize-window`
   * so the pane matched the browser. That broke cursor-agent's TUI: the
   * redraw after SIGWINCH left stale reverse-video bars (the big black
   * blocks across the terminal). Keeping the pane at tmux's default size
   * avoids the bug — the client still sends `resize` messages, we just
   * ignore them here. Handler is kept so older clients don't get
   * "Unknown type: resize" errors.
   */
  resizeTerminal(_projectId, _terminalId, _cols, _rows) {
    /* no-op by design — see doc block above */
  }

  /**
   * @param {string} projectId
   * @param {string} terminalId
   * @param {string} label
   */
  renameTerminal(projectId, terminalId, label) {
    const project = this.projects.get(projectId);
    const term = project?.terminals.find((item) => item.id === terminalId);
    if (!term) return false;
    const nextLabel = label.trim();
    if (!nextLabel) return false;
    term.label = nextLabel;
    this.broadcast({
      type: "terminal_renamed",
      projectId,
      terminalId,
      label: term.label,
    });
    this.schedulePersist();
    return true;
  }

  /**
   * @param {string} projectId
   * @param {string} terminalId
   * @param {string} text
   * @param {boolean} appendEnter
   */
  sendTextToTerminal(projectId, terminalId, text, appendEnter) {
    const project = this.projects.get(projectId);
    const term = project?.terminals.find((item) => item.id === terminalId);
    if (!term) return;
    const target = `${term.name}:0`;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
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
   * @param {string} projectId
   * @param {string} terminalId
   */
  closeTerminal(projectId, terminalId) {
    const project = this.projects.get(projectId);
    if (!project) return;
    const index = project.terminals.findIndex((term) => term.id === terminalId);
    if (index === -1) return;
    const term = project.terminals[index];
    if (term.tail) {
      term.tail.kill("SIGTERM");
      term.tail = null;
    }
    try {
      tmux(["kill-session", "-t", term.name]);
    } catch (e) {
      this.broadcast({
        type: "error",
        message: `kill-session: ${e?.message || e}`,
      });
    }
    project.terminals.splice(index, 1);
    this.broadcast({
      type: "terminal_closed",
      projectId,
      terminalId,
      remaining: project.terminals.map((item) => ({
        id: item.id,
        index: item.index,
        label: item.label,
      })),
    });
    this.schedulePersist();
  }

  /**
   * @param {string} projectId
   */
  deleteProject(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return;
    for (const term of project.terminals) {
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
    this.projects.delete(projectId);
    try {
      fs.rmSync(project.baseDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    this.broadcast({ type: "project_deleted", projectId });
    this.schedulePersist();
  }

  destroyAll() {
    for (const projectId of [...this.projects.keys()]) {
      this.deleteProject(projectId);
    }
  }

  detachAll() {
    for (const project of this.projects.values()) {
      for (const term of project.terminals) {
        if (term.tail) {
          try { term.tail.kill("SIGTERM"); } catch { /* ignore */ }
          term.tail = null;
        }
      }
    }
  }
}

const mux = new AgentMuxServer();
mux.restoreFromDisk();

function shutdown() {
  mux.persistSnapshot();
  mux.detachAll();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    agentBin: AGENT_BIN,
    projects: mux.snapshotMessage().projects,
  });
});

app.get("/api/projects", (_req, res) => {
  res.json({
    ok: true,
    projects: [...mux.projects.values()].map((project) =>
      mux.serializeProject(project),
    ),
  });
});

app.get("/api/system/roots", (_req, res) => {
  res.json({
    ok: true,
    roots: DIRECTORY_PICKER_ROOTS,
  });
});

app.get("/api/system/directories", (req, res) => {
  try {
    const requested =
      typeof req.query.path === "string" ? req.query.path : "";
    const absPath = resolveChooserPath(requested);
    const stats = fs.statSync(absPath);
    if (!stats.isDirectory()) {
      res.status(400).json({ ok: false, error: "path_not_directory" });
      return;
    }
    res.json({
      ok: true,
      ...listDirectoryChoices(absPath),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error?.message || "directory_picker_failed",
    });
  }
});

app.get("/api/projects/:projectId/tree", (req, res) => {
  const project = mux.projects.get(String(req.params.projectId || ""));
  if (!project) {
    res.status(404).json({ ok: false, error: "unknown_project" });
    return;
  }
  const requested = typeof req.query.path === "string" ? req.query.path : "";
  try {
    const absPath = resolveProjectPath(project.cwd, requested);
    const stats = fs.statSync(absPath);
    if (!stats.isDirectory()) {
      res.status(400).json({ ok: false, error: "path_not_directory" });
      return;
    }
    res.json({
      ok: true,
      projectId: project.id,
      cwd: project.cwd,
      path: path.relative(project.cwd, absPath) || ".",
      entries: listTreeEntries(project.cwd, absPath),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error?.message || "tree_failed",
    });
  }
});

app.post("/api/events", (req, res) => {
  const hdr = req.headers["x-agentmux-token"];
  const token =
    (typeof hdr === "string" && hdr) ||
    (typeof req.query.token === "string" && req.query.token) ||
    "";
  if (token !== EVENT_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const { projectId, groupId, type, from, to, text, payload, appendEnter } =
    req.body || {};
  const id = String(projectId || groupId || "");
  if (!id || !mux.projects.has(id)) {
    res.status(404).json({ ok: false, error: "unknown_project" });
    return;
  }
  const source = from != null ? String(from) : "http";
  mux.emitEvent(id, source, {
    type,
    to,
    text,
    payload,
    appendEnter,
  });
  res.json({ ok: true });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
}

app.get("*", (_req, res) => {
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    res.status(503).send(
      [
        "React bundle missing.",
        "Run `npm run build` before `npm start` or use `npm run dev` for frontend development.",
      ].join(" "),
    );
    return;
  }
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  mux.addClient(ws);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "create_project": {
        const cwd = (msg.cwd && String(msg.cwd).trim()) || process.cwd();
        const count = Math.min(16, Math.max(1, Number(msg.count) || 1));
        const name = msg.name ? String(msg.name) : undefined;
        try {
          const stats = fs.statSync(path.resolve(cwd));
          if (!stats.isDirectory()) {
            throw new Error("cwd_not_directory");
          }
          const result = mux.createProject(cwd, count, name);
          if (!result.created) {
            ws.send(
              JSON.stringify({
                type: "project_existing",
                project: mux.serializeProject(result.project),
              }),
            );
          }
        } catch (error) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: error?.message || "create_project_failed",
            }),
          );
        }
        break;
      }
      case "add_terminal": {
        mux.addTerminal(String(msg.projectId || ""));
        break;
      }
      case "rename_terminal": {
        const ok = mux.renameTerminal(
          String(msg.projectId || ""),
          String(msg.terminalId || ""),
          String(msg.label || ""),
        );
        if (!ok) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "rename_terminal_failed",
            }),
          );
        }
        break;
      }
      case "close_terminal": {
        mux.closeTerminal(
          String(msg.projectId || ""),
          String(msg.terminalId || ""),
        );
        break;
      }
      case "delete_project": {
        mux.deleteProject(String(msg.projectId || ""));
        break;
      }
      case "input": {
        mux.sendInput(
          String(msg.projectId || ""),
          String(msg.terminalId || ""),
          String(msg.data ?? ""),
        );
        break;
      }
      case "resize": {
        mux.resizeTerminal(
          String(msg.projectId || ""),
          String(msg.terminalId || ""),
          Number(msg.cols),
          Number(msg.rows),
        );
        break;
      }
      case "request_snapshot": {
        const projectId = String(msg.projectId || "");
        const terminalId = String(msg.terminalId || "");
        setTimeout(() => {
          const data = mux.capturePane(projectId, terminalId);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "terminal_snapshot",
                projectId,
                terminalId,
                data,
              }),
            );
          }
        }, 80);
        break;
      }
      case "emit_event": {
        const projectId = String(msg.projectId || "");
        if (!projectId || !mux.projects.has(projectId)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "unknown_project",
            }),
          );
          break;
        }
        mux.emitEvent(projectId, "browser", msg.event && typeof msg.event === "object" ? msg.event : {});
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
    mux.removeClient(ws);
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

server.listen(PORT, HOST, () => {
  console.log(`AgentMux listening on http://${HOST}:${PORT}`);
  console.log(`Resolved agent binary: ${AGENT_BIN}`);
  const instCustom = process.env.AGENTMUX_AGENT_INSTRUCTION_FILE;
  const instDefault = path.join(REPO_ROOT, "config", "agent-instruction.md");
  if (instCustom && fs.existsSync(instCustom)) {
    console.log(`Agent instruction file: ${instCustom}`);
  } else if (fs.existsSync(instDefault)) {
    console.log(`Agent instruction file: ${instDefault}`);
  } else {
    console.log("Agent instruction file: using built-in default template");
  }
  const lanUrls = getNetworkUrls();
  if (lanUrls.length) {
    console.log("LAN URLs:");
    for (const url of lanUrls) {
      console.log(`  ${url}`);
    }
  }
});
