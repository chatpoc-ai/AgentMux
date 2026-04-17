import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const SIDEBAR_MIN = 260;
const SIDEBAR_MAX = 520;

/** Must match tmux default pane (server keeps sessions at default size; no resize-window). */
const TMUX_PANE_COLS = 80;
const TMUX_PANE_ROWS = 24;

function syncXtermToTmuxDims(term) {
  try {
    term.resize(TMUX_PANE_COLS, TMUX_PANE_ROWS);
  } catch {
    /* ignore */
  }
}

/** capture-pane often ends with extra newlines → phantom row below the real TUI line. */
function normalizeSnapshotPayload(data) {
  if (typeof data !== "string" || !data) return data;
  return data.replace(/\n+$/, "");
}

function wsUrl() {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function keyFor(projectId, terminalId) {
  return `${projectId}:${terminalId}`;
}

/** Same terminal as selected (WebSocket may use string IDs; normalize). */
function terminalMatches(at, projectId, terminalId) {
  if (!at) return false;
  return (
    String(at.projectId) === String(projectId) &&
    String(at.id) === String(terminalId)
  );
}

function sortProjects(projects) {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name));
}

function upsertProject(projects, project) {
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) return [...projects, project];
  const next = [...projects];
  next[index] = project;
  return next;
}

function IconSidebar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="17" height="16" rx="4" />
      <path d="M9 6.5v11" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconFolder({ open = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h4l2 2h6A2.5 2.5 0 0 1 20.5 10.5v7A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z" />
      {open ? <path d="M6 12h12" /> : null}
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="m7.5 10 2.5 2-2.5 2M12.5 14h4" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.75 14 5l2.5-.25 1.25 2 2 1-.5 2.5 1.25 2-1.25 2 .5 2.5-2 1-1.25 2L14 19l-2 1.25L10 19l-2.5.25-1.25-2-2-1 .5-2.5-1.25-2 1.25-2-.5-2.5 2-1 1.25-2L10 5z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

function IconChevron({ open = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {open ? <path d="m6 9 6 6 6-6" /> : <path d="m9 6 6 6-6 6" />}
    </svg>
  );
}

const TerminalWorkspace = forwardRef(function TerminalWorkspace(
  { activeTerminal, onInput, onResize, onRequestSnapshot },
  ref,
) {
  const hostRef = useRef(null);
  const terminalRef = useRef(null);
  const terminalReadyRef = useRef(false);
  const pendingWritesRef = useRef([]);

  // Keep routing refs in sync with props on every render — NOT in useEffect.
  // If we only updated in useEffect, keydown could fire after paint but before
  // effects ran, and onData would still send input to the previous terminal.
  const activeTerminalRef = useRef(activeTerminal);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onRequestSnapshotRef = useRef(onRequestSnapshot);
  activeTerminalRef.current = activeTerminal;
  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  onRequestSnapshotRef.current = onRequestSnapshot;
  // Route live output with activeTerminalRef (synced every render), same as
  // onData — never use a separate "output key" ref: it can lag one frame and
  // drop all tail bytes while the sidebar still shows that terminal.

  // Render a full-frame snapshot (from `tmux capture-pane`) into xterm.
  // We reset the terminal first so the new frame starts from a clean state.
  // DO NOT attempt to merge this with incremental `appendOutput` data: the
  // snapshot already represents the current state and replaying old deltas
  // on top would stack frames and produce the classic "black bars" bug.
  const writeSnapshot = useEffectEvent((projectId, terminalId, data) => {
    const term = terminalRef.current;
    if (!term) return;
    if (!terminalMatches(activeTerminalRef.current, projectId, terminalId)) {
      return;
    }
    const write = () => {
      try {
        term.reset();
        if (data) {
          term.write(normalizeSnapshotPayload(data));
          syncXtermToTmuxDims(term);
        }
        window.requestAnimationFrame(() => {
          if (!terminalMatches(activeTerminalRef.current, projectId, terminalId)) {
            return;
          }
          try {
            term.focus();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
    };
    if (terminalReadyRef.current) {
      write();
    } else {
      pendingWritesRef.current.push({
        __switch: true,
        text: normalizeSnapshotPayload(data || ""),
      });
    }
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host || terminalRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"SF Mono", "JetBrains Mono", Menlo, monospace',
      fontSize: 14,
      cols: TMUX_PANE_COLS,
      rows: TMUX_PANE_ROWS,
      convertEol: true,
      allowTransparency: false,
      theme: {
        background: "#fbfbf9",
        foreground: "#20252f",
        cursor: "#20252f",
        cursorAccent: "#fbfbf9",
        selectionBackground: "rgba(51, 65, 85, 0.18)",
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.onData((data) => {
      const at = activeTerminalRef.current;
      if (!at) return;
      onInputRef.current?.(at.projectId, at.id, data);
    });
    term.onResize(({ cols, rows }) => {
      const at = activeTerminalRef.current;
      if (!at) return;
      onResizeRef.current?.(at.projectId, at.id, cols, rows);
    });
    terminalRef.current = term;
    terminalReadyRef.current = false;

    let opened = false;
    let disposed = false;
    let openTimer = 0;

    const flushPending = () => {
      const pending = pendingWritesRef.current.splice(0);
      for (const chunk of pending) {
        try {
          if (chunk && typeof chunk === "object" && chunk.__switch) {
            term.reset();
            term.write(chunk.text);
            syncXtermToTmuxDims(term);
          } else {
            term.write(chunk);
          }
        } catch {
          /* ignore */
        }
      }
    };

    const markReady = () => {
      if (disposed || terminalReadyRef.current) return;
      try {
        fitAddon.fit();
        syncXtermToTmuxDims(term);
      } catch {
        /* ignore */
      }
      // Do not call fit()+resize() again on ResizeObserver while streaming:
      // repeated reflow desyncs cursor vs incremental tail bytes (looks like
      // "no output until switch tab"). Fixed 80×24 matches tmux PTY; host
      // resize does not change cols/rows.
      terminalReadyRef.current = true;
      flushPending();
      window.requestAnimationFrame(() => {
        try {
          term.focus();
        } catch {
          /* ignore */
        }
      });
    };

    const tryOpen = () => {
      if (opened || disposed) return;
      const rect = host.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 40) return;
      opened = true;
      try {
        term.open(host);
      } catch {
        opened = false;
        return;
      }
      const renderDisposable = term.onRender(() => {
        renderDisposable.dispose();
        markReady();
      });
      openTimer = window.setTimeout(() => {
        renderDisposable.dispose();
        markReady();
      }, 500);
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!opened) {
        tryOpen();
        return;
      }
      /* intentionally no fit()/resize here — see markReady comment */
    });
    resizeObserver.observe(host);
    tryOpen();

    return () => {
      disposed = true;
      if (openTimer) window.clearTimeout(openTimer);
      resizeObserver.disconnect();
      terminalReadyRef.current = false;
      pendingWritesRef.current = [];
      try {
        term.dispose();
      } catch {
        /* ignore */
      }
      terminalRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const term = terminalRef.current;
    if (!term) return;
    // On every active-terminal change we:
    //   1) reset xterm (no carry-over from the previous terminal)
    //   2) send a resize (currently a server no-op, kept for future use)
    //   3) ask the server for a fresh `capture-pane` snapshot
    // Live `appendOutput` deltas begin flowing afterwards; this avoids
    // replaying the log file, which would re-apply alt-screen differential
    // updates out of order and produce the "black bars" rendering bug.
    // useLayoutEffect: reset runs before paint / before most WS callbacks.
    pendingWritesRef.current = [];
    const placeholder = activeTerminal
      ? ""
      : "\r\nSelect a terminal from the sidebar.\r\n";
    const applySwitch = () => {
      try {
        term.reset();
        if (placeholder) term.write(placeholder);
        if (activeTerminal) {
          onResizeRef.current?.(
            activeTerminal.projectId,
            activeTerminal.id,
            term.cols,
            term.rows,
          );
          onRequestSnapshotRef.current?.(
            activeTerminal.projectId,
            activeTerminal.id,
          );
        }
        window.requestAnimationFrame(() => {
          try {
            term.focus();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
    };
    if (terminalReadyRef.current) {
      applySwitch();
    } else {
      pendingWritesRef.current.push({ __switch: true, text: placeholder });
    }
  }, [activeTerminal]);

  const appendOutput = useEffectEvent((projectId, terminalId, data) => {
    const term = terminalRef.current;
    if (!term) return;
    if (!terminalMatches(activeTerminalRef.current, projectId, terminalId)) {
      return;
    }
    if (!terminalReadyRef.current) {
      pendingWritesRef.current.push(data);
      return;
    }
    try {
      term.write(data);
    } catch {
      /* ignore */
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      appendOutput,
      writeSnapshot,
    }),
    [appendOutput, writeSnapshot],
  );

  return (
    <div
      ref={hostRef}
      className="terminal-canvas"
      onMouseDown={() => {
        try {
          terminalRef.current?.focus();
        } catch {
          /* ignore */
        }
      }}
    />
  );
});

function TreeNode({ node, expanded, onToggle, loadedEntry, depth }) {
  const isOpen = !!expanded[node.path];
  const childState = loadedEntry?.[node.path];
  const children = childState?.entries ?? [];

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-row ${node.type}`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() => onToggle(node)}
      >
        <span className="tree-caret">
          {node.type === "directory" ? <IconChevron open={isOpen} /> : "·"}
        </span>
        <span className="tree-name">{node.name}</span>
      </button>
      {node.type === "directory" && isOpen ? (
        <div className="tree-children">
          {childState?.loading ? (
            <div className="tree-loading">Loading…</div>
          ) : childState?.error ? (
            <div className="tree-error">{childState.error}</div>
          ) : children.length ? (
            children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                expanded={expanded}
                onToggle={onToggle}
                loadedEntry={loadedEntry}
                depth={depth + 1}
              />
            ))
          ) : (
            <div className="tree-empty">Empty</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DirectoryPickerModal({
  open,
  roots,
  currentPath,
  listing,
  loading,
  creating,
  onClose,
  onOpenPath,
  onSelect,
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="picker-header">
          <div>
            <p className="picker-eyebrow">服务器目录选择</p>
            <h2>选择项目文件夹</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="picker-roots">
          {roots.map((root) => (
            <button
              key={root.id}
              type="button"
              className={`root-chip ${currentPath?.startsWith(root.path) ? "active" : ""}`}
              onClick={() => onOpenPath(root.path)}
            >
              {root.label}
            </button>
          ))}
        </div>

        <div className="picker-current-path">{currentPath || "Loading…"}</div>

        <div className="picker-actions">
          {listing?.parentPath ? (
            <button
              type="button"
              className="picker-nav"
              onClick={() => onOpenPath(listing.parentPath)}
            >
              返回上级
            </button>
          ) : null}
          {currentPath ? (
            <button
              type="button"
              className="picker-submit"
              disabled={creating}
              onClick={() => onSelect(currentPath)}
            >
              {creating ? "创建中…" : "选择这个文件夹"}
            </button>
          ) : null}
        </div>

        <div className="picker-list">
          {loading ? <div className="picker-empty">Loading…</div> : null}
          {!loading && listing?.entries?.length
            ? listing.entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className="picker-entry"
                  onClick={() => onOpenPath(entry.path)}
                >
                  <span className="picker-entry-icon">
                    <IconFolder open={false} />
                  </span>
                  <span>{entry.name}</span>
                </button>
              ))
            : null}
          {!loading && !listing?.entries?.length ? (
            <div className="picker-empty">No folders here.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Map());
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeTerminalId, setActiveTerminalId] = useState(null);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [treeState, setTreeState] = useState({});
  const [expandedDirectories, setExpandedDirectories] = useState({});
  const [editingTerminalKey, setEditingTerminalKey] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRoots, setPickerRoots] = useState([]);
  const [pickerPath, setPickerPath] = useState("");
  const [pickerListing, setPickerListing] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [flashingTerminals, setFlashingTerminals] = useState({});
  const flashTimersRef = useRef(new Map());
  const [filesPanelWidth, setFilesPanelWidth] = useState(310);
  const resizeTargetRef = useRef(null);

  const setStatus = (message, toneHint) => {
    if (!message) return;
    const lower = String(message).toLowerCase();
    const tone =
      toneHint ||
      (lower.includes("error") ||
      lower.includes("fail") ||
      lower.includes("not ready") ||
      lower.includes("not connected") ||
      lower.includes("disconnected")
        ? "error"
        : "info");
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
    toastTimersRef.current.set(id, timer);
  };

  const dismissToast = (id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const socketRef = useRef(null);
  const activeRef = useRef({ projectId: null, terminalId: null });
  const resizingRef = useRef(false);
  const terminalApiRef = useRef(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const activeTerminal = useMemo(() => {
    if (!activeProject) return null;
    const terminal =
      activeProject.terminals.find((item) => item.id === activeTerminalId) ?? null;
    return terminal
      ? {
          ...terminal,
          projectId: activeProject.id,
          projectName: activeProject.name,
          cwd: activeProject.cwd,
        }
      : null;
  }, [activeProject, activeTerminalId]);

  const send = (payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus("WebSocket not ready.");
      return;
    }
    socket.send(JSON.stringify(payload));
  };

  // NOTE: The server currently treats `resize` as a no-op (see
  // `resizeTerminal` in server/index.js). We still emit it because:
  //   1) it's debounced, so spam is bounded;
  //   2) we piggy-back a `request_snapshot` shortly after, which pulls a
  //      fresh `tmux capture-pane` frame — that's what actually refreshes
  //      the displayed terminal when xterm resizes or the user switches.
  // If you ever re-enable PTY resize on the server, keep the snapshot call
  // below: cursor-agent's TUI needs a clean repaint to look correct.
  const resizeStateRef = useRef({
    timer: 0,
    last: { key: "", cols: 0, rows: 0 },
  });
  const sendResize = (projectId, terminalId, cols, rows) => {
    const key = `${projectId}:${terminalId}`;
    const state = resizeStateRef.current;
    if (
      state.last.key === key &&
      state.last.cols === cols &&
      state.last.rows === rows
    ) {
      return;
    }
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      state.timer = 0;
      state.last = { key, cols, rows };
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({ type: "resize", projectId, terminalId, cols, rows }),
      );
      window.setTimeout(() => {
        const s = socketRef.current;
        if (!s || s.readyState !== WebSocket.OPEN) return;
        s.send(
          JSON.stringify({
            type: "request_snapshot",
            projectId,
            terminalId,
          }),
        );
      }, 140);
    }, 120);
  };

  const ensureSelection = (nextProjects) => {
    const currentProject =
      nextProjects.find((project) => project.id === activeRef.current.projectId) ??
      nextProjects[0] ??
      null;
    const currentTerminal =
      currentProject?.terminals.find(
        (terminal) => terminal.id === activeRef.current.terminalId,
      ) ??
      currentProject?.terminals[0] ??
      null;
    setActiveProjectId(currentProject?.id ?? null);
    setActiveTerminalId(currentTerminal?.id ?? null);
  };

  const loadTree = useEffectEvent(async (projectId, treePath = ".") => {
    setTreeState((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}),
        [treePath]: {
          entries: prev[projectId]?.[treePath]?.entries || [],
          loading: true,
          error: "",
        },
      },
    }));
    try {
      const query =
        treePath && treePath !== "."
          ? `?path=${encodeURIComponent(treePath)}`
          : "";
      const response = await fetch(`/api/projects/${projectId}/tree${query}`);
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setTreeState((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          [treePath]: {
            entries: json.entries || [],
            loading: false,
            error: "",
          },
        },
      }));
    } catch (error) {
      setTreeState((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          [treePath]: {
            entries: [],
            loading: false,
            error: error?.message || "Failed to load tree",
          },
        },
      }));
    }
  });

  const loadPickerRoots = useEffectEvent(async () => {
    const response = await fetch("/api/system/roots");
    const json = await response.json();
    if (response.ok && json.ok) {
      setPickerRoots(json.roots || []);
      return json.roots || [];
    }
    throw new Error(json.error || response.statusText);
  });

  const openDirectory = useEffectEvent(async (directoryPath) => {
    setPickerLoading(true);
    try {
      const query = directoryPath
        ? `?path=${encodeURIComponent(directoryPath)}`
        : "";
      const response = await fetch(`/api/system/directories${query}`);
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setPickerPath(json.currentPath);
      setPickerListing(json);
    } catch (error) {
      setStatus(error?.message || "Failed to browse directories.");
    } finally {
      setPickerLoading(false);
    }
  });

  useEffect(() => {
    activeRef.current = {
      projectId: activeProjectId,
      terminalId: activeTerminalId,
    };
  }, [activeProjectId, activeTerminalId]);

  useEffect(() => {
    const socket = new WebSocket(wsUrl());
    socketRef.current = socket;
    setStatus("Connecting to AgentMux server…");
    setConnectionState("connecting");

    socket.addEventListener("open", () => {
      setConnectionState("open");
      setStatus("Connected.");
    });

    socket.addEventListener("close", () => {
      setConnectionState("closed");
      setStatus("Disconnected from server.");
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
      setStatus("WebSocket connection failed.");
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (message.type) {
        case "snapshot": {
          const nextProjects = sortProjects(message.projects || []);
          setProjects(nextProjects);
          ensureSelection(nextProjects);
          setStatus(
            nextProjects.length
              ? "Workspace synced."
              : "No projects yet. Click the folder-plus icon to add one.",
          );
          break;
        }
        case "project_created": {
          setProjects((prev) => {
            const next = sortProjects(upsertProject(prev, message.project));
            ensureSelection(next);
            return next;
          });
          setExpandedProjects((prev) => ({
            ...prev,
            [message.project.id]: true,
          }));
          setActiveProjectId(message.project.id);
          setActiveTerminalId(message.project.terminals[0]?.id ?? null);
          setPickerOpen(false);
          setCreatingProject(false);
          setStatus(`Created project ${message.project.name}.`);
          break;
        }
        case "project_existing": {
          const nextProject = message.project;
          setProjects((prev) => {
            const next = sortProjects(upsertProject(prev, nextProject));
            ensureSelection(next);
            return next;
          });
          setExpandedProjects((prev) => ({
            ...prev,
            [nextProject.id]: true,
          }));
          setActiveProjectId(nextProject.id);
          setActiveTerminalId(nextProject.terminals[0]?.id ?? null);
          setPickerOpen(false);
          setCreatingProject(false);
          setStatus(`Project already exists: ${nextProject.name}.`);
          break;
        }
        case "project_deleted": {
          setProjects((prev) => {
            const next = prev.filter((project) => project.id !== message.projectId);
            ensureSelection(next);
            return next;
          });
          setExpandedProjects((prev) => {
            const next = { ...prev };
            delete next[message.projectId];
            return next;
          });
          setStatus("Project removed.");
          break;
        }
        case "terminal_added": {
          setProjects((prev) =>
            prev.map((project) =>
              project.id === message.projectId
                ? {
                    ...project,
                    terminals: [...project.terminals, message.terminal].sort(
                      (a, b) => a.index - b.index,
                    ),
                  }
                : project,
            ),
          );
          setExpandedProjects((prev) => ({
            ...prev,
            [message.projectId]: true,
          }));
          setActiveProjectId(message.projectId);
          setActiveTerminalId(message.terminal.id);
          setStatus(`Created ${message.terminal.label}.`);
          break;
        }
        case "terminal_renamed": {
          setProjects((prev) =>
            prev.map((project) =>
              project.id === message.projectId
                ? {
                    ...project,
                    terminals: project.terminals.map((terminal) =>
                      terminal.id === message.terminalId
                        ? { ...terminal, label: message.label }
                        : terminal,
                    ),
                  }
                : project,
            ),
          );
          setStatus(`Renamed terminal to ${message.label}.`);
          break;
        }
        case "terminal_snapshot": {
          terminalApiRef.current?.writeSnapshot(
            message.projectId,
            message.terminalId,
            message.data || "",
          );
          break;
        }
        case "terminal_closed": {
          setProjects((prev) => {
            const next = prev.map((project) =>
              project.id === message.projectId
                ? {
                    ...project,
                    terminals: project.terminals.filter(
                      (terminal) => terminal.id !== message.terminalId,
                    ),
                  }
                : project,
            );
            ensureSelection(next);
            return next;
          });
          setStatus("Terminal closed.");
          break;
        }
        case "output": {
          const key = keyFor(message.projectId, message.terminalId);
          terminalApiRef.current?.appendOutput(
            message.projectId,
            message.terminalId,
            message.data || "",
          );
          const existing = flashTimersRef.current.get(key);
          if (existing) window.clearTimeout(existing);
          setFlashingTerminals((prev) =>
            prev[key] ? prev : { ...prev, [key]: true },
          );
          const timer = window.setTimeout(() => {
            flashTimersRef.current.delete(key);
            setFlashingTerminals((prev) => {
              if (!prev[key]) return prev;
              const next = { ...prev };
              delete next[key];
              return next;
            });
          }, 220);
          flashTimersRef.current.set(key, timer);
          break;
        }
        case "error": {
          setCreatingProject(false);
          const msg = message.message || "Server error";
          if (/^Unknown type:/i.test(msg)) break;
          setStatus(msg);
          break;
        }
        default:
          break;
      }
    });

    return () => {
      socketRef.current = null;
      socket.close();
      for (const timer of flashTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      flashTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (activeProject && !treeState[activeProject.id]?.["."]?.entries) {
      loadTree(activeProject.id, ".");
    }
  }, [activeProject, treeState, loadTree]);

  useEffect(() => {
    const onMove = (event) => {
      if (!resizingRef.current) return;
      const target = resizeTargetRef.current;
      if (target === "sidebar") {
        const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, event.clientX));
        setSidebarWidth(next);
      } else if (target === "files") {
        const next = Math.min(640, Math.max(200, window.innerWidth - event.clientX));
        setFilesPanelWidth(next);
      }
    };
    const onUp = () => {
      resizingRef.current = false;
      resizeTargetRef.current = null;
      document.body.classList.remove("is-resizing");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (target) => () => {
    resizingRef.current = true;
    resizeTargetRef.current = target;
    document.body.classList.add("is-resizing");
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setCreatingProject(false);
    try {
      const roots = await loadPickerRoots();
      await openDirectory(roots[0]?.path || "");
    } catch (error) {
      setStatus(error?.message || "Failed to open directory picker.");
    }
  };

  const selectProjectDirectory = (selectedPath) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setStatus("WebSocket not connected.");
      return;
    }
    if (creatingProject) return;
    setCreatingProject(true);
    setPickerOpen(false);
    const name = selectedPath.split("/").filter(Boolean).pop() || "Project";
    send({
      type: "create_project",
      cwd: selectedPath,
      name,
      count: 1,
    });
  };

  const createTerminal = () => {
    if (!activeProjectId) {
      setStatus("Select a project first.");
      return;
    }
    send({ type: "add_terminal", projectId: activeProjectId });
  };

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
    setActiveProjectId(projectId);
  };

  const beginRename = (projectId, terminal) => {
    setEditingTerminalKey(keyFor(projectId, terminal.id));
    setEditingLabel(terminal.label);
  };

  const commitRename = (projectId, terminalId) => {
    if (!editingLabel.trim()) {
      setEditingTerminalKey(null);
      return;
    }
    send({
      type: "rename_terminal",
      projectId,
      terminalId,
      label: editingLabel.trim(),
    });
    setEditingTerminalKey(null);
  };

  const toggleDirectory = (node) => {
    if (!activeProject || node.type !== "directory") return;
    setExpandedDirectories((prev) => ({
      ...prev,
      [activeProject.id]: {
        ...(prev[activeProject.id] || {}),
        [node.path]: !(prev[activeProject.id] || {})[node.path],
      },
    }));
    if (!treeState[activeProject.id]?.[node.path]) {
      loadTree(activeProject.id, node.path);
    }
  };

  const treeRoot = activeProject ? treeState[activeProject.id]?.["."] : null;
  const activeTreeExpanded = activeProject
    ? expandedDirectories[activeProject.id] || {}
    : {};
  return (
    <>
      <div className="app-shell">
        {sidebarVisible ? (
          <>
            <aside className="sidebar-v2" style={{ width: `${sidebarWidth}px` }}>
              <div className="sidebar-topbar">
                <button
                  type="button"
                  className="sidebar-icon-button"
                  onClick={() => setSidebarVisible(false)}
                  title="Hide sidebar"
                >
                  <IconSidebar />
                </button>
                <span
                  className={`connection-dot ${connectionState}`}
                  title={`Connection: ${connectionState}`}
                />
              </div>

              <div className="sidebar-actions">
                <button
                  type="button"
                  className="sidebar-action primary"
                  onClick={createTerminal}
                >
                  <span className="action-icon">
                    <IconTerminal />
                  </span>
                  <span>新终端</span>
                </button>
              </div>

              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <span>项目</span>
                  <button
                    type="button"
                    className="sidebar-mini-button"
                    onClick={openPicker}
                    title="新项目"
                  >
                    <IconPlus />
                  </button>
                </div>

                <div className="project-list-v2">
                  {projects.map((project) => {
                    const open = !!expandedProjects[project.id];
                    const isActive = activeProjectId === project.id;
                    return (
                      <div
                        key={project.id}
                        className={`project-item ${isActive ? "active" : ""}`}
                      >
                        <div className="project-row">
                          <button
                            type="button"
                            className="project-trigger"
                            onClick={() => toggleProject(project.id)}
                          >
                            <span className="project-icon">
                              <IconFolder open={open} />
                            </span>
                            <span className="project-name">{project.name}</span>
                            <span className="project-arrow">
                              <IconChevron open={open} />
                            </span>
                          </button>
                          <button
                            type="button"
                            className="project-delete"
                            onClick={() =>
                              send({
                                type: "delete_project",
                                projectId: project.id,
                              })
                            }
                            title="删除项目"
                          >
                            删除
                          </button>
                        </div>
                        {open ? (
                          <div className="project-threads">
                            {project.terminals.map((terminal) => {
                              const editKey = keyFor(project.id, terminal.id);
                              const isEditing = editingTerminalKey === editKey;
                              const isSelected =
                                activeProjectId === project.id &&
                                activeTerminalId === terminal.id;
                              return (
                                <div
                                  key={terminal.id}
                                  className={`thread-item ${isSelected ? "selected" : ""}`}
                                >
                                  <div className="thread-row">
                                    <div
                                      className="thread-trigger compact"
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => {
                                        if (isEditing) return;
                                        setActiveProjectId(project.id);
                                        setActiveTerminalId(terminal.id);
                                      }}
                                      onDoubleClick={() => {
                                        if (isEditing) return;
                                        beginRename(project.id, terminal);
                                      }}
                                      title="双击改名"
                                    >
                                      <span
                                        className={`thread-dot ${flashingTerminals[editKey] ? "active" : ""}`}
                                      />
                                      {isEditing ? (
                                        <input
                                          autoFocus
                                          className="thread-input"
                                          value={editingLabel}
                                          onChange={(event) =>
                                            setEditingLabel(event.target.value)
                                          }
                                          onBlur={() =>
                                            commitRename(project.id, terminal.id)
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              commitRename(project.id, terminal.id);
                                            }
                                            if (event.key === "Escape") {
                                              setEditingTerminalKey(null);
                                            }
                                          }}
                                        />
                                      ) : (
                                        <span className="thread-label">
                                          {terminal.label}
                                        </span>
                                      )}
                                    </div>
                                    {!isEditing ? (
                                      <button
                                        type="button"
                                        className="thread-close"
                                        title="关闭终端"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          if (!window.confirm(`关闭终端 ${terminal.label}？`)) {
                                            return;
                                          }
                                          send({
                                            type: "close_terminal",
                                            projectId: project.id,
                                            terminalId: terminal.id,
                                          });
                                        }}
                                      >
                                        ×
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button type="button" className="settings-button">
                <span className="settings-icon">
                  <IconSettings />
                </span>
                <span>设置</span>
              </button>
            </aside>

            <div
              className="sidebar-resizer"
              onMouseDown={startResize("sidebar")}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
            />
          </>
        ) : (
          <button
            type="button"
            className="sidebar-reopen"
            onClick={() => setSidebarVisible(true)}
            title="Show sidebar"
          >
            <IconSidebar />
          </button>
        )}

        <main className="workspace-v3">
          <div className="workspace-content">
            <section className="terminal-surface" style={{ flex: 1, minWidth: 0 }}>
              <div className="mac-chrome">
                <span className="mac-dot red" />
                <span className="mac-dot yellow" />
                <span className="mac-dot green" />
                <div className="terminal-title">
                  {activeTerminal
                    ? `${activeTerminal.projectName} / ${activeTerminal.label}`
                    : "AgentMux"}
                </div>
              </div>
              <div className="terminal-shell">
                {activeTerminal ? (
                  <TerminalWorkspace
                    ref={terminalApiRef}
                    activeTerminal={activeTerminal}
                    onInput={(projectId, terminalId, data) =>
                      send({ type: "input", projectId, terminalId, data })
                    }
                    onResize={sendResize}
                    onRequestSnapshot={(projectId, terminalId) =>
                      send({ type: "request_snapshot", projectId, terminalId })
                    }
                  />
                ) : (
                  <div className="terminal-empty-state">
                    <div className="terminal-empty-icon">
                      <IconTerminal />
                    </div>
                    <h2>未激活终端</h2>
                    <p>先在左侧打开一个项目，然后点击对应终端。</p>
                  </div>
                )}
              </div>
            </section>

            <div
              className="sidebar-resizer files-resizer"
              onMouseDown={startResize("files")}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize files panel"
            />

            <aside
              className="files-panel"
              style={{ width: `${filesPanelWidth}px` }}
            >
              <div className="files-header">
                <span>{activeProject ? activeProject.name : "文件树"}</span>
                {activeProject ? (
                  <button
                    type="button"
                    className="thread-action"
                    onClick={() => loadTree(activeProject.id, ".")}
                  >
                    刷新
                  </button>
                ) : null}
              </div>
              <div className="files-body">
                {!activeProject ? (
                  <div className="tree-empty">先选择一个项目。</div>
                ) : treeRoot?.loading ? (
                  <div className="tree-loading">Loading…</div>
                ) : treeRoot?.error ? (
                  <div className="tree-error">{treeRoot.error}</div>
                ) : treeRoot?.entries?.length ? (
                  treeRoot.entries.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      expanded={activeTreeExpanded}
                      onToggle={toggleDirectory}
                      loadedEntry={treeState[activeProject.id]}
                      depth={0}
                    />
                  ))
                ) : (
                  <div className="tree-empty">No visible files.</div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-message">{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <DirectoryPickerModal
        open={pickerOpen}
        roots={pickerRoots}
        currentPath={pickerPath}
        listing={pickerListing}
        loading={pickerLoading}
        creating={creatingProject}
        onClose={() => setPickerOpen(false)}
        onOpenPath={openDirectory}
        onSelect={selectProjectDirectory}
      />
    </>
  );
}
