"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { randomUUID } = require("crypto");
const { execFileSync } = require("child_process");
const express = require("express");
const WebSocket = require("ws");
const {
  composeAgentPrompt,
  ensureExtraInstructionFile,
  buildPromptVars,
  shSingleQuote,
} = require("./instruction");
const {
  getProvider,
  listModelOptions,
  listProviders,
} = require("./providers");

const PORT = Number(process.env.PORT) || 9988;
const HOST = process.env.HOST || "0.0.0.0";
const REPO_ROOT = path.join(__dirname, "..");
const DIST_DIR = path.join(REPO_ROOT, "dist");
const STATE_DIR = path.join(os.homedir(), ".agentmux");
const STATE_FILE = path.join(STATE_DIR, "projects.json");
const SETTINGS_FILE = path.join(STATE_DIR, "settings.json");
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


function defaultSettings() {
  return {
    language: "en",
    cli: "cursor",
    model: "auto",
  };
}

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

function makeProjectRoot(id, label, absPath, kind = "linked") {
  return {
    id,
    label,
    path: absPath,
    kind,
  };
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

function getProjectRoot(project, rootId = "main") {
  if (!project) return null;
  return project.roots.find((root) => root.id === rootId) || project.roots[0] || null;
}

function sanitizeHistoryEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry && entry.type !== "terminal_input",
  );
}

function getProviderDefaultModel(cli = "cursor") {
  return getProvider(cli).defaultModel;
}

function sendRawToTerminal(project, terminalId, data) {
  const term = project?.terminals.find((item) => item.id === terminalId);
  if (!term) return false;
  term.lastReadPos = 0;
  try {
    tmux(["send-keys", "-t", `${term.name}:0`, "-l", data]);
    return true;
  } catch (e) {
    return false;
  }
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
    this.lastReadPos = 0;
    /** @type {NodeJS.Timeout[]} */
    this.streamTimers = [];
    /** @type {fs.FSWatcher | null} */
    this.streamWatcher = null;
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
    /** @type {Array<{id:string,label:string,path:string,kind:string}>} */
    this.roots = [makeProjectRoot("main", "主目录", cwd, "main")];
    /** @type {Array<object>} */
    this.history = [];
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
    /** @type {Map<string, fs.FSWatcher>} */
    this.projectWatchers = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.projectRefreshTimers = new Map();
    this.settings = this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const json = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
        return {
          ...defaultSettings(),
          ...(json && typeof json === "object" ? json : {}),
        };
      }
    } catch {
      /* ignore */
    }
    return defaultSettings();
  }

  persistSettings() {
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      const tmp = `${SETTINGS_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.settings, null, 2));
      fs.renameSync(tmp, SETTINGS_FILE);
    } catch (err) {
      console.error(`Failed to persist settings: ${err?.message || err}`);
    }
  }

  updateSettings(next) {
    this.settings = {
      ...defaultSettings(),
      ...this.settings,
      ...(next || {}),
    };
    if (this.settings.cli !== "codex" && this.settings.cli !== "cursor") {
      this.settings.cli = "cursor";
    }
    if (!this.settings.model) {
      this.settings.model = getProviderDefaultModel(this.settings.cli);
    }
    this.persistSettings();
    this.broadcast({ type: "settings_updated", settings: this.settings });
    return this.settings;
  }

  persistSnapshot() {
    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      settings: this.settings,
      projects: [...this.projects.values()].map((project) => ({
        id: project.id,
        cwd: project.cwd,
        name: project.name,
        roots: project.roots.map((root) => ({
          id: root.id,
          label: root.label,
          path: root.path,
          kind: root.kind,
        })),
        history: project.history.slice(-200),
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
      project.roots = Array.isArray(entry.roots) && entry.roots.length
        ? entry.roots
            .filter((root) => root?.path && fs.existsSync(root.path))
            .map((root) =>
              makeProjectRoot(
                root.id || randomUUID().replace(/-/g, "").slice(0, 12),
                root.label || path.basename(root.path) || "Reference",
                root.path,
                root.kind || "linked",
              ),
            )
        : [makeProjectRoot("main", "主目录", project.cwd, "main")];
      if (!project.roots.some((root) => root.kind === "main")) {
        project.roots.unshift(makeProjectRoot("main", "主目录", project.cwd, "main"));
      }

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

      project.history = sanitizeHistoryEntries(entry.history).slice(-200);
      project.terminals.sort((a, b) => a.index - b.index);
      this.projects.set(project.id, project);
      this._ensureProjectWatchers(project);
    }
    if (this.projects.size) {
      console.log(
        `Restored ${this.projects.size} project(s) from ${STATE_FILE}`,
      );
    }
  }

  /**
   * @param {ProjectSession} project
   */
  _ensureProjectWatchers(project) {
    for (const root of project.roots || []) {
      const key = `${project.id}:${root.id}`;
      if (this.projectWatchers.has(key)) continue;
      try {
        const watcher = fs.watch(root.path, { recursive: true }, () => {
          const existing = this.projectRefreshTimers.get(key);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(() => {
            this.projectRefreshTimers.delete(key);
            this.broadcast({
              type: "project_tree_changed",
              projectId: project.id,
              rootId: root.id,
            });
          }, 200);
          this.projectRefreshTimers.set(key, timer);
        });
        this.projectWatchers.set(key, watcher);
      } catch (err) {
        console.error(
          `Failed to watch project root ${project.id}:${root.id}: ${err?.message || err}`,
        );
      }
    }
  }

  /**
   * @param {string} projectId
   */
  _clearProjectWatcher(projectId) {
    for (const [key, watcher] of [...this.projectWatchers.entries()]) {
      if (!key.startsWith(`${projectId}:`)) continue;
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
      this.projectWatchers.delete(key);
    }
    for (const [key, timer] of [...this.projectRefreshTimers.entries()]) {
      if (!key.startsWith(`${projectId}:`)) continue;
      clearTimeout(timer);
      this.projectRefreshTimers.delete(key);
    }
  }

  /**
   * @param {string} projectId
   * @param {string} rootId
   */
  _clearProjectRootWatcher(projectId, rootId) {
    const key = `${projectId}:${rootId}`;
    const watcher = this.projectWatchers.get(key);
    if (watcher) {
      try {
        watcher.close();
      } catch {
        /* ignore */
      }
      this.projectWatchers.delete(key);
    }
    const timer = this.projectRefreshTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.projectRefreshTimers.delete(key);
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
    try {
      term.lastReadPos = fs.statSync(term.logPath).size;
    } catch {
      term.lastReadPos = 0;
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
      const cli = this.settings?.cli === "codex" ? "codex" : "cursor";
      const provider = getProvider(cli);
      const model = String(this.settings?.model || provider.defaultModel);
      const vars = buildPromptVars({
        groupId: project.id,
        cwdResolved: project.cwd,
        sessionName: term.name,
        port: PORT,
      });
      const expanded = composeAgentPrompt(project.baseDir, vars);
      const apiBase = `http://127.0.0.1:${PORT}`;
      const scriptPath = provider.buildBootstrapScript({
        baseDir: project.baseDir,
        index: term.index,
        groupId: project.id,
        sessionName: term.name,
        apiBase,
        eventToken: EVENT_TOKEN,
        promptBody: expanded,
        model,
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
    this._startLogStreaming(project, term);
  }

  /**
   * @param {ProjectSession} project
   */
  serializeProject(project) {
    return {
      id: project.id,
      name: project.name,
      cwd: project.cwd,
      roots: project.roots.map((root) => ({
        id: root.id,
        label: root.label,
        path: root.path,
        kind: root.kind,
      })),
      history: sanitizeHistoryEntries(project.history).slice(-200),
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
      settings: this.settings,
      agentBin: getProvider(this.settings.cli).resolveBinary(),
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
      groupId: projectId,
    };
    const project = this.projects.get(projectId);

    const to = ev.to;
    if (!to || typeof to !== "string") return;
    const target = project?.terminals.find((term) => term.id === to);
    if (!target) return;

    if (ev.type === "terminal_input") {
      sendRawToTerminal(project, target.id, String(ev.text ?? ""));
      return;
    }

    if (project) {
      project.history = [...project.history, enriched].slice(-200);
      this.schedulePersist();
    }
    this.broadcast({ type: "bus_event", event: enriched });

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
      project.terminals.push(this._spawnTerminal(project, index, this.settings));
    }

    this.projects.set(project.id, project);
    this._ensureProjectWatchers(project);
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
    const term = this._spawnTerminal(project, index, this.settings);
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

  addProjectRoot(projectId, absPath, label) {
    const project = this.projects.get(projectId);
    if (!project) return null;
    const resolved = path.resolve(absPath || "");
    if (!resolved || !fs.existsSync(resolved)) return null;
    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) return null;
    if (project.roots.some((root) => root.path === resolved)) {
      return project.roots.find((root) => root.path === resolved) || null;
    }
    const root = makeProjectRoot(
      randomUUID().replace(/-/g, "").slice(0, 12),
      label || path.basename(resolved) || "Reference",
      resolved,
      "linked",
    );
    project.roots.push(root);
    this._ensureProjectWatchers(project);
    this.schedulePersist();
    this.broadcast({
      type: "project_root_added",
      projectId,
      root,
    });
    return root;
  }

  removeProjectRoot(projectId, rootId) {
    const project = this.projects.get(projectId);
    if (!project) return false;
    if (!rootId || rootId === "main") return false;
    const index = project.roots.findIndex(
      (root) => root.id === rootId || root.path === rootId,
    );
    if (index === -1) return false;
    const [removed] = project.roots.splice(index, 1);
    this._clearProjectRootWatcher(projectId, removed.id);
    this.schedulePersist();
    this.broadcast({
      type: "project_root_removed",
      projectId,
      rootId: removed.id,
    });
    return true;
  }

  /**
   * @param {ProjectSession} project
   * @param {number} index
   */
  _spawnTerminal(project, index, settings = this.settings) {
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

    this._startLogStreaming(project, term);

    const cli = settings?.cli === "codex" ? "codex" : "cursor";
    const provider = getProvider(cli);
    const model = String(settings?.model || provider.defaultModel);
    const vars = buildPromptVars({
      groupId: project.id,
      cwdResolved: project.cwd,
      sessionName: term.name,
      port: PORT,
    });
    const expanded = composeAgentPrompt(project.baseDir, vars);
    const apiBase = `http://127.0.0.1:${PORT}`;
    const scriptPath = provider.buildBootstrapScript({
      baseDir: project.baseDir,
      index,
      groupId: project.id,
      sessionName: term.name,
      apiBase,
      eventToken: EVENT_TOKEN,
      promptBody: expanded,
      model,
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
  _startLogStreaming(project, term) {
    const readFn = () => this._readLogChunk(project.id, term.id, term);

    const poll = setInterval(readFn, 80);
    term.streamTimers.push(poll);

    try {
      term.streamWatcher = fs.watch(term.logPath, readFn);
    } catch {
      /* fallback to polling only */
    }

    readFn();
  }

  /**
   * @param {string} projectId
   * @param {string} terminalId
   * @param {TerminalSession} term
   */
  _readLogChunk(projectId, terminalId, term) {
    try {
      const stat = fs.statSync(term.logPath);
      if (stat.size <= term.lastReadPos) {
        if (stat.size < term.lastReadPos) {
          term.lastReadPos = 0;
        } else {
          return;
        }
      }

      const fd = fs.openSync(term.logPath, "r");
      const len = stat.size - term.lastReadPos;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, term.lastReadPos);
      fs.closeSync(fd);
      term.lastReadPos = stat.size;

      if (buf.length > 0) {
        this.processTailChunk(projectId, terminalId, term, buf);
      }
    } catch {
      /* file may be temporarily unavailable */
    }
  }

  /**
   * @param {TerminalSession} term
   */
  _stopLogStreaming(term) {
    for (const timer of term.streamTimers) {
      clearInterval(timer);
    }
    term.streamTimers = [];
    if (term.streamWatcher) {
      try {
        term.streamWatcher.close();
      } catch {
        /* ignore */
      }
      term.streamWatcher = null;
    }
  }

  /**
   * @param {string} projectId
   * @param {string} terminalId
   * @param {string} data
   */
  sendInput(projectId, terminalId, data) {
    const project = this.projects.get(projectId);
    sendRawToTerminal(project, terminalId, data);
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
    this._stopLogStreaming(term);
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
      this._stopLogStreaming(term);
      try {
        tmux(["kill-session", "-t", term.name]);
      } catch {
        /* ignore */
      }
    }
    this.projects.delete(projectId);
    this._clearProjectWatcher(projectId);
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
        this._stopLogStreaming(term);
      }
    }
    for (const projectId of [...this.projects.keys()]) {
      this._clearProjectWatcher(projectId);
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
    agentBin: getProvider(mux.settings.cli).resolveBinary(),
    settings: mux.settings,
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

app.get("/api/providers", (_req, res) => {
  res.json({
    ok: true,
    providers: listProviders(),
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

app.get("/api/settings/model-options", (req, res) => {
  const cli = String(req.query.cli || "cursor");
  const provider = getProvider(cli);
  res.json({
    ok: true,
    cli,
    supported: true,
    defaultModel: provider.defaultModel,
    models: listModelOptions(cli),
    note: cli === "codex"
      ? "Codex model list is fixed from the available Codex models shown in the CLI picker."
      : "",
  });
});

app.get("/api/projects/:projectId/tree", (req, res) => {
  const project = mux.projects.get(String(req.params.projectId || ""));
  if (!project) {
    res.status(404).json({ ok: false, error: "unknown_project" });
    return;
  }
  const rootId = typeof req.query.rootId === "string" ? req.query.rootId : "main";
  const requested = typeof req.query.path === "string" ? req.query.path : "";
  try {
    const root = getProjectRoot(project, rootId);
    if (!root) {
      res.status(404).json({ ok: false, error: "unknown_root" });
      return;
    }
    const absPath = resolveProjectPath(root.path, requested);
    const stats = fs.statSync(absPath);
    if (!stats.isDirectory()) {
      res.status(400).json({ ok: false, error: "path_not_directory" });
      return;
    }
    res.json({
      ok: true,
      projectId: project.id,
      cwd: root.path,
      rootId: root.id,
      rootLabel: root.label,
      path: path.relative(root.path, absPath) || ".",
      entries: listTreeEntries(root.path, absPath),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error?.message || "tree_failed",
    });
  }
});

app.get("/api/projects/:projectId/file", (req, res) => {
  const project = mux.projects.get(String(req.params.projectId || ""));
  if (!project) {
    res.status(404).json({ ok: false, error: "unknown_project" });
    return;
  }
  const rootId = typeof req.query.rootId === "string" ? req.query.rootId : "main";
  const requested = typeof req.query.path === "string" ? req.query.path : "";
  if (!requested) {
    res.status(400).json({ ok: false, error: "missing_path" });
    return;
  }
  try {
    const root = getProjectRoot(project, rootId);
    if (!root) {
      res.status(404).json({ ok: false, error: "unknown_root" });
      return;
    }
    const absPath = resolveProjectPath(root.path, requested);
    const stats = fs.statSync(absPath);
    if (!stats.isFile()) {
      res.status(400).json({ ok: false, error: "path_not_file" });
      return;
    }
    const maxBytes = 256 * 1024;
    const data = fs.readFileSync(absPath);
    const truncated = data.length > maxBytes;
    res.json({
      ok: true,
      projectId: project.id,
      rootId: root.id,
      path: path.relative(root.path, absPath) || path.basename(absPath),
      name: path.basename(absPath),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      truncated,
      content: data.slice(0, maxBytes).toString("utf8"),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error?.message || "file_failed",
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
      case "update_settings": {
        mux.updateSettings(msg.settings && typeof msg.settings === "object" ? msg.settings : {});
        break;
      }
      case "add_terminal": {
        mux.addTerminal(String(msg.projectId || ""));
        break;
      }
      case "add_project_root": {
        const projectId = String(msg.projectId || "");
        const absPath = String(msg.path || "").trim();
        const label = msg.label ? String(msg.label).trim() : "";
        const root = mux.addProjectRoot(projectId, absPath, label);
        if (!root) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "add_project_root_failed",
            }),
          );
        }
        break;
      }
      case "remove_project_root": {
        const ok = mux.removeProjectRoot(
          String(msg.projectId || ""),
          String(msg.rootId || ""),
        );
        if (!ok) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "remove_project_root_failed",
            }),
          );
        }
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
        const projectId = String(msg.projectId || "");
        const terminalId = String(msg.terminalId || "");
        if (!projectId || !mux.projects.has(projectId)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "unknown_project",
            }),
          );
          break;
        }
        mux.emitEvent(projectId, terminalId, {
          type: "terminal_input",
          from: terminalId,
          to: terminalId,
          text: String(msg.data ?? ""),
          appendEnter: false,
        });
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
  console.log(`Resolved agent binary: ${getProvider(mux.settings.cli).resolveBinary()}`);
  console.log(`Settings: ${JSON.stringify(mux.settings)}`);
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
