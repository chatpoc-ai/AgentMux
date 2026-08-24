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
const LANG_STORAGE_KEY = "agentmux.lang";
const SETTINGS_STORAGE_KEY = "agentmux.settings";

const filterHistoryEntries = (entries) =>
  (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry && entry.type !== "terminal_input",
  );

const I18N = {
  en: {
    appName: "AgentMux",
    showSidebar: "Show sidebar",
    hideSidebar: "Hide sidebar",
    newTerminal: "New terminal",
    projects: "Projects",
    newProject: "New project",
    deleteProject: "Delete project",
    settings: "Settings",
    inputLabel: "Input",
    sendToCurrentTerminal: "Send to current terminal",
    send: "Send",
    clear: "Clear",
    terminalEmptyTitle: "No active terminal",
    terminalEmptyBody: "Open a project on the left, then click a terminal.",
    projectHint: "Select a project first.",
    terminalHint: "Select a terminal first.",
    wsNotReady: "WebSocket not ready.",
    wsConnecting: "Connecting to AgentMux server…",
    wsConnected: "Connected.",
    wsDisconnected: "Disconnected from server.",
    wsFailed: "WebSocket connection failed.",
    workspaceSynced: "Workspace synced.",
    noProjects: "No projects yet. Click the folder-plus icon to add one.",
    projectRemoved: "Project removed.",
    terminalClosed: "Terminal closed.",
    referenceRemoved: "Reference removed.",
    linkedReference: "Linked {label}.",
    createdProject: "Created project {name}.",
    projectExists: "Project already exists: {name}.",
    createdTerminal: "Created {label}.",
    renamedTerminal: "Renamed terminal to {label}.",
    noVisibleFiles: "No visible files.",
    selectProjectFirst: "Select a project first.",
    fileTreeTitle: "File tree",
    referenceDir: "Reference directory",
    mainRoot: "Main",
    agentLabel: "Agent {n}",
    rootCwd: "Current Workspace",
    rootHome: "Home",
    rootProjects: "Projects",
    eventSource: "Event",
    eventFromYou: "You",
    evUserMessage: "User",
    evAgentReply: "Reply",
    evDone: "Done",
    evRequireConfirmation: "Confirm",
    evStatus: "Status",
    evTerminalInput: "Terminal input",
    modelCurrent: "Current",
    modelDefault: "Default",
    modelNoteCodex: "Codex model list is fixed from the available Codex models shown in the CLI picker.",
    modelNoteClaude: "Claude aliases track the latest release; type a full model id to pin a snapshot.",
    linkDirectory: "Link directory",
    removeLinkedRoot: "Remove linked directory",
    selectProjectFolder: "Select project folder",
    linkReferenceDir: "Link reference directory",
    chooseThisFolder: "Choose this folder",
    linkThisDir: "Link this directory",
    newFolder: "New folder",
    newTerminalTitle: "New terminal",
    newTerminalDesc: "Pick the agent CLI and model for this terminal.",
    pickProvider: "Agent CLI",
    pickModel: "Model",
    createTerminal: "Create terminal",
    newFolderPlaceholder: "Folder name",
    create: "Create",
    cancel: "Cancel",
    invalid_folder_name: "That folder name is not allowed.",
    folder_exists: "A folder with that name already exists.",
    loading: "Loading…",
    loadingFiles: "Loading file…",
    noFoldersHere: "No folders here.",
    noFileLoaded: "No file loaded.",
    closePreview: "Close preview",
    back: "Back",
    currentProjectNoEvents: "This project has no collaboration events yet.",
    inputPlaceholder: "Type command or text, Enter to send, Shift+Enter for newline",
    english: "English",
    chinese: "中文",
    language: "Language",
    treeOnly: "Tree only",
    treePreview: "Tree + preview",
    projectFiles: "Project files",
    manualInput: "Manual input",
    collaborationHistory: "Collaboration history",
    projectSelectHint: "Click a project, then choose a terminal.",
    rootRemoved: "Reference directory removed.",
    settingsOverview: "Configure the app language and the default CLI used for new terminals.",
    uiLanguage: "UI language",
    uiLanguageDesc: "Language used by the app UI",
    defaultCli: "Default terminal CLI",
    defaultCliDesc: "Default CLI for newly created terminals",
    defaultModel: "Default model",
    defaultModelDesc: "Default model for newly created terminals",
    settingsSubtitle: "General",
    backToApp: "Back to app",
    cursorCli: "Cursor Agent",
    codexCli: "Codex CLI",
    claudeCli: "Claude Code",
    cursorModel: "auto",
    codexModel: "GPT-5.4-Mini",
    settingsSaved: "Settings saved.",
    settingsApply: "Save settings",
    settingsSubtitle: "General",
    resizeSidebar: "Resize sidebar",
    resizeBottomPanel: "Resize bottom panel",
    resizeFilesPanel: "Resize files panel",
    doubleClickRename: "Double click to rename",
    closeTerminal: "Close terminal",
    confirmCloseTerminal: "Close terminal {label}?",
    details: "Details",
    serverError: "Server error",
    dismiss: "Dismiss",
  },
  zh: {
    appName: "AgentMux",
    showSidebar: "显示侧边栏",
    hideSidebar: "隐藏侧边栏",
    newTerminal: "新终端",
    projects: "项目",
    newProject: "新项目",
    deleteProject: "删除项目",
    settings: "设置",
    inputLabel: "输入",
    sendToCurrentTerminal: "发送到当前终端",
    send: "发送",
    clear: "清空",
    terminalEmptyTitle: "未激活终端",
    terminalEmptyBody: "先在左侧打开一个项目，然后点击对应终端。",
    projectHint: "请先选择一个项目。",
    terminalHint: "请选择一个终端。",
    wsNotReady: "WebSocket 未就绪。",
    wsConnecting: "正在连接 AgentMux 服务器…",
    wsConnected: "已连接。",
    wsDisconnected: "已从服务器断开。",
    wsFailed: "WebSocket 连接失败。",
    workspaceSynced: "工作区已同步。",
    noProjects: "当前还没有项目。点击左上角的新项目按钮添加一个。",
    projectRemoved: "项目已删除。",
    terminalClosed: "终端已关闭。",
    referenceRemoved: "引用目录已移除。",
    linkedReference: "已关联 {label}。",
    createdProject: "已创建项目 {name}。",
    projectExists: "项目已存在：{name}。",
    createdTerminal: "已创建 {label}。",
    renamedTerminal: "终端已重命名为 {label}。",
    noVisibleFiles: "没有可见文件。",
    selectProjectFirst: "请先选择一个项目。",
    fileTreeTitle: "文件树",
    referenceDir: "引用目录",
    mainRoot: "主目录",
    agentLabel: "终端 {n}",
    rootCwd: "当前工作区",
    rootHome: "用户目录",
    rootProjects: "项目目录",
    eventSource: "事件",
    eventFromYou: "你",
    evUserMessage: "用户",
    evAgentReply: "回复",
    evDone: "完成",
    evRequireConfirmation: "确认",
    evStatus: "状态",
    evTerminalInput: "终端输入",
    modelCurrent: "当前",
    modelDefault: "默认",
    modelNoteCodex: "Codex 的模型列表是固定的，取自 CLI 选择器里可用的模型。",
    modelNoteClaude: "Claude 别名会自动跟随最新版本；要锁定某个具体快照，直接输入完整的模型 id。",
    linkDirectory: "关联目录",
    removeLinkedRoot: "移除引用目录",
    selectProjectFolder: "选择项目文件夹",
    linkReferenceDir: "关联引用目录",
    chooseThisFolder: "选择这个文件夹",
    linkThisDir: "关联这个目录",
    newFolder: "新建文件夹",
    newTerminalTitle: "新建终端",
    newTerminalDesc: "为这个终端选择 CLI 和模型。",
    pickProvider: "CLI",
    pickModel: "模型",
    createTerminal: "创建终端",
    newFolderPlaceholder: "文件夹名称",
    create: "创建",
    cancel: "取消",
    invalid_folder_name: "文件夹名称不合法。",
    folder_exists: "同名文件夹已存在。",
    loading: "加载中…",
    loadingFiles: "正在加载文件…",
    noFoldersHere: "这里没有文件夹。",
    noFileLoaded: "未加载文件。",
    closePreview: "关闭预览",
    back: "返回上级",
    currentProjectNoEvents: "当前项目还没有协作事件。",
    inputPlaceholder: "输入命令或文本，Enter 发送，Shift+Enter 换行",
    english: "English",
    chinese: "中文",
    language: "语言",
    treeOnly: "仅树视图",
    treePreview: "树 + 预览",
    projectFiles: "项目文件",
    manualInput: "手动输入",
    collaborationHistory: "协作历史",
    projectSelectHint: "先点项目，再选终端。",
    rootRemoved: "引用目录已移除。",
    settingsOverview: "配置应用语言和新终端的默认 CLI。",
    uiLanguage: "界面语言",
    uiLanguageDesc: "应用界面显示语言",
    defaultCli: "默认终端 CLI",
    defaultCliDesc: "新终端默认使用的 CLI",
    defaultModel: "默认模型",
    defaultModelDesc: "新终端默认使用的模型",
    settingsSubtitle: "常规",
    backToApp: "返回应用",
    cursorCli: "Cursor Agent",
    codexCli: "Codex CLI",
    claudeCli: "Claude Code",
    cursorModel: "auto",
    codexModel: "GPT-5.4-Mini",
    settingsSaved: "设置已保存。",
    settingsApply: "保存设置",
    settingsSubtitle: "常规",
    resizeSidebar: "调整侧边栏",
    resizeBottomPanel: "调整底部面板",
    resizeFilesPanel: "调整文件面板",
    doubleClickRename: "双击改名",
    closeTerminal: "关闭终端",
    confirmCloseTerminal: "关闭终端 {label}？",
    details: "详情",
    serverError: "服务器错误",
    dismiss: "关闭",
  },
};

function formatTemplate(text, vars = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] == null ? "" : String(vars[key]),
  );
}

function defaultAppSettings() {
  return {
    language: "en",
    cli: "cursor",
    model: "auto",
  };
}

/** Picker root id -> dictionary key; unknown ids fall back to the server label. */
const PICKER_ROOT_KEYS = {
  cwd: "rootCwd",
  home: "rootHome",
  projects: "rootProjects",
};

/** Keep in sync with server/providers/index.js. */
const PROVIDER_IDS = ["cursor", "codex", "claude"];

function getModelForCli(cli) {
  if (cli === "codex") return "gpt-5.4-mini";
  if (cli === "claude") return "sonnet";
  return "auto";
}

/**
 * Only reached when GET /api/providers fails; the live list (with each
 * provider's real defaultModel) normally comes from the server.
 *
 * @param {(key: string) => string} t
 */
function fallbackProviderOptions(t) {
  return PROVIDER_IDS.map((id) => ({
    id,
    label: t(`${id}Cli`),
    defaultModel: getModelForCli(id),
  }));
}

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

function summarizeEvent(event) {
  if (!event || typeof event !== "object") return "";
  if (typeof event.payload?.summary === "string" && event.payload.summary.trim()) {
    return event.payload.summary.trim();
  }
  if (typeof event.text === "string" && event.text.trim()) return event.text.trim();
  if (typeof event.payload?.result === "string" && event.payload.result.trim()) {
    return event.payload.result.trim();
  }
  if (typeof event.payload === "string" && event.payload.trim()) {
    return event.payload.trim();
  }
  return "";
}

/**
 * Terminal labels are assigned by the server ("Agent 3") and persisted, so the
 * stored value is an English string. Translate that default on the way out,
 * but leave anything the operator renamed exactly as they typed it.
 *
 * @param {{ label?: string }} terminal
 * @param {(key: string, vars?: object) => string} t
 */
function terminalLabel(terminal, t) {
  const label = String(terminal?.label ?? "");
  const match = /^Agent (\d+)$/.exec(label);
  return match ? t("agentLabel", { n: match[1] }) : label;
}

function formatEventOrigin(event, project, t) {
  if (!event || typeof event !== "object") return t("eventSource");
  if (event.from === "browser") return t("eventFromYou");
  if (project && typeof event.from === "string") {
    const match = project.terminals?.find(
      (terminal) => terminal.tmuxSession === event.from || terminal.id === event.from,
    );
    if (match?.label) return terminalLabel(match, t);
  }
  if (typeof event.from === "string" && event.from.trim()) return event.from;
  return t("eventSource");
}

function formatEventTarget(event, project, t) {
  if (!event || typeof event !== "object") return "";
  if (project && typeof event.to === "string") {
    const match = project.terminals?.find(
      (terminal) => terminal.tmuxSession === event.to || terminal.id === event.to,
    );
    if (match?.label) return terminalLabel(match, t);
  }
  if (typeof event.to === "string" && event.to.trim()) return event.to;
  return "";
}

/** Event type -> dictionary key. Unlisted types fall through to the raw type. */
const EVENT_KIND_KEYS = {
  user_message: "evUserMessage",
  agent_reply: "evAgentReply",
  done: "evDone",
  require_confirmation: "evRequireConfirmation",
  status: "evStatus",
  terminal_input: "evTerminalInput",
};

function formatEventKind(event, t) {
  const type = typeof event?.type === "string" ? event.type : "event";
  const key = EVENT_KIND_KEYS[type];
  return key ? t(key) : type;
}

function getEventDetail(event) {
  if (!event || typeof event !== "object") return "";
  if (typeof event.payload?.detail === "string" && event.payload.detail.trim()) {
    return event.payload.detail.trim();
  }
  if (typeof event.payload?.summary === "string" && event.payload.summary.trim()) {
    return event.payload.summary.trim();
  }
  if (typeof event.payload?.result === "string" && event.payload.result.trim()) {
    return event.payload.result.trim();
  }
  return "";
}

function detectFileMode(fileName = "") {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript";
  }
  return "text";
}

function formatPreviewLines(content = "") {
  const text = String(content ?? "");
  const lines = text.split("\n");
  return lines.map((line, index) => ({
    number: index + 1,
    text: line,
  }));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInlineMarkdown(text) {
  const safe = escapeHtml(text);
  return safe
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function parseMarkdownDocument(content = "") {
  const lines = String(content ?? "").split("\n");
  const out = [];
  const outline = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(<div key={`md-${key++}`} className="md-empty-line" />);
      i += 1;
      continue;
    }
    if (/^```/.test(trimmed)) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(
        <pre key={`md-${key++}`} className="md-code-block">
          {codeLines.join("\n")}
        </pre>,
      );
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const slug = text
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || `heading-${key}`;
      outline.push({ level, text, id: slug });
      out.push(
        <div
          key={`md-${key++}`}
          id={slug}
          className={`md-heading md-heading-${level}`}
          dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(text) }}
        />,
      );
      i += 1;
      continue;
    }
    if (/^---+$/.test(trimmed)) {
      out.push(<hr key={`md-${key++}`} className="md-divider" />);
      i += 1;
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      out.push(
        <blockquote
          key={`md-${key++}`}
          className="md-blockquote"
          dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(quoteLines.join(" ")) }}
        />,
      );
      continue;
    }
    if (/^([-*+])\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^([-*+])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-*+])\s+/, ""));
        i += 1;
      }
      out.push(
        <ul key={`md-${key++}`} className="md-list">
          {items.map((item, itemIndex) => (
            <li
              key={`md-${key}-${itemIndex}`}
              dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(item) }}
            />
          ))}
        </ul>,
      );
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim()) {
      para.push(lines[i].trim());
      i += 1;
      if (i < lines.length && /^(\s*$|#{1,6}\s|```|>\s?|([-*+])\s+)/.test(lines[i])) break;
    }
    out.push(
      <p
        key={`md-${key++}`}
        className="md-paragraph"
        dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(para.join(" ")) }}
      />,
    );
  }
  return { blocks: out, outline };
}

const TerminalWorkspace = forwardRef(function TerminalWorkspace(
  { activeTerminal, onInput, onResize, onRequestSnapshot },
  ref,
) {
  const hostRef = useRef(null);
  const terminalRef = useRef(null);

  // Keep routing refs in sync with props on every render — NOT in useEffect.
  // If we only updated in useEffect, keydown could fire after paint but before
  // effects ran, and onData would still send input to the previous terminal.
  const activeTerminalRef = useRef(activeTerminal);
  const onInputRef = useRef(onInput);
  const onRequestSnapshotRef = useRef(onRequestSnapshot);
  activeTerminalRef.current = activeTerminal;
  onInputRef.current = onInput;
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
      try {
        term.reset();
        if (data) {
          term.write(normalizeSnapshotPayload(data));
          term.scrollToBottom();
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
      onResize?.(at.projectId, at.id, cols, rows);
    });
    terminalRef.current = term;

    let opened = false;
    let disposed = false;

    const markReady = () => {
      if (disposed) return;
      try {
        fitAddon.fit();
        syncXtermToTmuxDims(term);
      } catch {
        /* ignore */
      }
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
      if (rect.width < 20 || rect.height < 20) return;
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
    };

    const resizeObserver = new ResizeObserver(() => {
      if (!opened) {
        tryOpen();
        return;
      }
      /* intentionally no fit()+resize here — see markReady comment */
    });
    resizeObserver.observe(host);
    tryOpen();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
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
    //   2) ask the server for a fresh `capture-pane` snapshot
    // Live `appendOutput` deltas then continue from the current frame.
    // useLayoutEffect: reset runs before paint / before most WS callbacks.
    const placeholder = activeTerminal
      ? ""
      : "\r\nSelect a terminal from the sidebar.\r\n";
    const applySwitch = () => {
      try {
        term.reset();
        if (placeholder) term.write(placeholder);
        if (activeTerminal) {
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
    applySwitch();
  }, [activeTerminal]);

  useEffect(() => {
    if (!activeTerminal) return;
    const raf = window.requestAnimationFrame(() => {
      const host = hostRef.current;
      const term = terminalRef.current;
      const termEl = term?.element;
      const screenEl = termEl?.querySelector?.(".xterm-screen");
      const viewportEl = termEl?.querySelector?.(".xterm-viewport");
      console.debug("[amux terminal diag]", {
        host: host?.getBoundingClientRect?.(),
        termElement: termEl?.getBoundingClientRect?.(),
        screen: screenEl?.getBoundingClientRect?.(),
        viewport: viewportEl?.getBoundingClientRect?.(),
        cols: term?.cols,
        rows: term?.rows,
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeTerminal]);

  const appendOutput = useEffectEvent((projectId, terminalId, data) => {
    const term = terminalRef.current;
    if (!term) return;
    if (!terminalMatches(activeTerminalRef.current, projectId, terminalId)) {
      return;
    }
    try {
      term.write(data);
      term.scrollToBottom();
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

function TreeNode({
  node,
  rootId,
  t,
  expanded,
  onToggle,
  loadedEntry,
  depth,
  onOpenFile,
  activePreviewKey,
}) {
  const isOpen = !!expanded[node.path];
  const childState = loadedEntry?.[node.path];
  const children = childState?.entries ?? [];
  const isPreviewActive =
    node.type === "file" && activePreviewKey === `${rootId}:${node.path}`;

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-row ${node.type} ${isPreviewActive ? "preview-active" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() =>
          node.type === "file" ? onOpenFile?.(node) : onToggle(node)
        }
      >
        <span className="tree-caret">
          {node.type === "directory" ? <IconChevron open={isOpen} /> : "·"}
        </span>
        <span className="tree-name">{node.name}</span>
      </button>
      {node.type === "directory" && isOpen ? (
        <div className="tree-children">
          {childState?.loading ? (
            <div className="tree-loading">{t("loading")}</div>
          ) : childState?.error ? (
            <div className="tree-error">{childState.error}</div>
          ) : children.length ? (
            children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                rootId={rootId}
                expanded={expanded}
                onToggle={onToggle}
                loadedEntry={loadedEntry}
                depth={depth + 1}
                onOpenFile={onOpenFile}
                activePreviewKey={activePreviewKey}
              />
            ))
          ) : (
            <div className="tree-empty">{t("noFoldersHere")}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DirectoryPickerModal({
  open,
  mode,
  t,
  roots,
  currentPath,
  listing,
  loading,
  creating,
  onClose,
  onOpenPath,
  onSelect,
  onCreateFolder,
}) {
  const [newFolderName, setNewFolderName] = useState("");
  const [namingFolder, setNamingFolder] = useState(false);
  const [makingFolder, setMakingFolder] = useState(false);
  const newFolderInputRef = useRef(null);

  useEffect(() => {
    if (namingFolder) newFolderInputRef.current?.focus();
  }, [namingFolder]);

  // Drop a half-typed name when the picker closes or navigates elsewhere.
  useEffect(() => {
    setNamingFolder(false);
    setNewFolderName("");
  }, [open, currentPath]);

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    if (!name || makingFolder) return;
    setMakingFolder(true);
    const created = await onCreateFolder(currentPath, name);
    setMakingFolder(false);
    // On success the parent navigates into the new folder, which resets this
    // form via the currentPath effect above; on failure keep the text so the
    // operator can correct it rather than retype.
    if (created) setNamingFolder(false);
  };

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="picker-modal" onClick={(event) => event.stopPropagation()}>
        <div className="picker-header">
          <div>
            <p className="picker-eyebrow">{t("projectFiles")}</p>
            <h2>{mode === "link" ? t("linkReferenceDir") : t("selectProjectFolder")}</h2>
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
              {PICKER_ROOT_KEYS[root.id] ? t(PICKER_ROOT_KEYS[root.id]) : root.label}
            </button>
          ))}
        </div>

        <div className="picker-current-path">{currentPath || t("loading")}</div>

        <div className="picker-actions">
          {listing?.parentPath ? (
            <button type="button" className="picker-nav" onClick={() => onOpenPath(listing.parentPath)}>
              {t("back")}
            </button>
          ) : null}
          {currentPath ? (
            <button
              type="button"
              className="picker-submit"
              disabled={creating}
              onClick={() => onSelect(currentPath)}
            >
              {creating
                ? `${t("loading")}...`
                : mode === "link"
                  ? t("linkThisDir")
                  : t("chooseThisFolder")}
            </button>
          ) : null}
          {currentPath && !namingFolder ? (
            <button type="button" className="picker-nav" onClick={() => setNamingFolder(true)}>
              + {t("newFolder")}
            </button>
          ) : null}
        </div>

        {namingFolder ? (
          <div className="picker-new-folder">
            <input
              ref={newFolderInputRef}
              type="text"
              className="picker-new-folder-input"
              placeholder={t("newFolderPlaceholder")}
              value={newFolderName}
              disabled={makingFolder}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitNewFolder();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setNamingFolder(false);
                  setNewFolderName("");
                }
              }}
            />
            <button
              type="button"
              className="picker-submit"
              disabled={makingFolder || !newFolderName.trim()}
              onClick={submitNewFolder}
            >
              {makingFolder ? `${t("loading")}...` : t("create")}
            </button>
            <button
              type="button"
              className="picker-nav"
              disabled={makingFolder}
              onClick={() => {
                setNamingFolder(false);
                setNewFolderName("");
              }}
            >
              {t("cancel")}
            </button>
          </div>
        ) : null}

        <div className="picker-list">
          {loading ? <div className="picker-empty">{t("loading")}</div> : null}
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
            <div className="picker-empty">{t("noFoldersHere")}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return parsed?.language === "zh" ? "zh" : "en";
      } catch {
        /* ignore */
      }
    }
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    return saved === "zh" ? "zh" : "en";
  });
  const [appSettings, setAppSettings] = useState(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          ...defaultAppSettings(),
          ...parsed,
        };
      } catch {
        /* ignore */
      }
    }
    return defaultAppSettings();
  });
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
  const [activeTreeRootByProject, setActiveTreeRootByProject] = useState({});
  const [editingTerminalKey, setEditingTerminalKey] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [newTerminalDialog, setNewTerminalDialog] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRoots, setPickerRoots] = useState([]);
  const [pickerPath, setPickerPath] = useState("");
  const [pickerListing, setPickerListing] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [flashingTerminals, setFlashingTerminals] = useState({});
  const flashTimersRef = useRef(new Map());
  const [filesPanelWidth, setFilesPanelWidth] = useState(310);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContentState, setFileContentState] = useState({});
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [pickerMode, setPickerMode] = useState("create");
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = window.localStorage.getItem("agentmux.bottomPanelHeight");
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? Math.min(800, Math.max(320, parsed)) : 760;
  });
  const [composerText, setComposerText] = useState("");
  const [projectHistories, setProjectHistories] = useState({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [modelOptionsNoteKey, setModelOptionsNoteKey] = useState("");
  const [providerOptions, setProviderOptions] = useState([]);
  const [providerOptionsLoading, setProviderOptionsLoading] = useState(false);
  const modelOptionsCacheRef = useRef(new Map());
  const modelOptionsRequestRef = useRef("");
  const providerOptionsLoadedRef = useRef(false);
  const resizeTargetRef = useRef(null);
  const terminalShellRef = useRef(null);
  const bottomPanelRef = useRef(null);
  const t = (key, vars) => formatTemplate(I18N[lang]?.[key] || I18N.en[key] || key, vars);

  useEffect(() => {
    const next = {
      ...defaultAppSettings(),
      ...appSettings,
      language: lang,
    };
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang, appSettings]);

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
  const previewResizeRef = useRef(null);
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
      setStatus(t("wsNotReady"));
      return;
    }
    socket.send(JSON.stringify(payload));
  };

  const saveSettings = (next) => {
    const normalized = {
      ...defaultAppSettings(),
      ...appSettings,
      ...(next || {}),
    };
    if (!PROVIDER_IDS.includes(normalized.cli)) {
      normalized.cli = "cursor";
    }
    if (!normalized.model) {
      normalized.model = getModelForCli(normalized.cli);
    }
    if (!normalized.language) {
      normalized.language = "en";
    }
    setAppSettings(normalized);
    setLang(normalized.language === "zh" ? "zh" : "en");
    send({ type: "update_settings", settings: normalized });
  };

  const loadModelOptions = useEffectEvent(async (cli) => {
    const cached = modelOptionsCacheRef.current.get(cli);
    if (cached) {
      setModelOptions(cached.models || []);
      setModelOptionsNoteKey(cached.noteKey || "");
      setModelOptionsLoading(false);
      return;
    }
    if (modelOptionsRequestRef.current === cli) return;
    modelOptionsRequestRef.current = cli;
    setModelOptionsLoading(true);
    try {
      const response = await fetch(`/api/settings/model-options?cli=${encodeURIComponent(cli)}`);
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setModelOptions(Array.isArray(json.models) ? json.models : []);
      setModelOptionsNoteKey(json.noteKey || "");
      modelOptionsCacheRef.current.set(cli, {
        models: Array.isArray(json.models) ? json.models : [],
        noteKey: json.noteKey || "",
      });
      if (json.defaultModel && !appSettings.model) {
        setAppSettings((prev) => ({
          ...prev,
          model: json.defaultModel,
        }));
      }
    } catch {
      setModelOptions([]);
      setModelOptionsNoteKey("");
    } finally {
      setModelOptionsLoading(false);
      modelOptionsRequestRef.current = "";
    }
  });

  const loadProviderOptions = useEffectEvent(async () => {
    if (providerOptionsLoadedRef.current) return;
    providerOptionsLoadedRef.current = true;
    setProviderOptionsLoading(true);
    try {
      const response = await fetch("/api/providers");
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setProviderOptions(Array.isArray(json.providers) ? json.providers : []);
    } catch {
      setProviderOptions(fallbackProviderOptions(t));
    } finally {
      setProviderOptionsLoading(false);
    }
  });

  useEffect(() => {
    if (!settingsOpen) return;
    loadProviderOptions();
    loadModelOptions(appSettings.cli);
  }, [settingsOpen, appSettings.cli, loadModelOptions, loadProviderOptions]);

  // The new-terminal dialog needs the same lists, keyed off its own selection
  // rather than the global default.
  useEffect(() => {
    if (!newTerminalDialog) return;
    loadProviderOptions();
    loadModelOptions(newTerminalDialog.cli);
  }, [newTerminalDialog, loadModelOptions, loadProviderOptions]);

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

  useEffect(() => {
    window.localStorage.setItem(
      "agentmux.bottomPanelHeight",
      String(bottomPanelHeight),
    );
  }, [bottomPanelHeight]);

  const ensureSelection = (nextProjects) => {
    const currentProject =
      nextProjects.find((project) => project.id === activeRef.current.projectId) ??
      null;
    const currentTerminal =
      currentProject?.terminals.find(
        (terminal) => terminal.id === activeRef.current.terminalId,
      ) ??
      null;
    setActiveProjectId(currentProject?.id ?? null);
    setActiveTerminalId(currentTerminal?.id ?? null);
  };

  const loadTree = useEffectEvent(async (projectId, rootId = "main", treePath = ".") => {
    const project = projects.find((item) => item.id === projectId) || null;
    const root = project?.roots?.find((item) => item.id === rootId) || project?.roots?.[0] || null;
    if (!root) return;
    setTreeState((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}),
        [root.id]: {
          ...(prev[projectId]?.[root.id] || {}),
          [treePath]: {
            entries: prev[projectId]?.[root.id]?.[treePath]?.entries || [],
            loading: true,
            error: "",
          },
        },
      },
    }));
    try {
      const query =
        treePath && treePath !== "."
          ? `&path=${encodeURIComponent(treePath)}`
          : "";
      const response = await fetch(
        `/api/projects/${projectId}/tree?rootId=${encodeURIComponent(root.id)}${query}`,
      );
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setTreeState((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          [root.id]: {
            ...(prev[projectId]?.[root.id] || {}),
            [treePath]: {
              entries: json.entries || [],
              loading: false,
              error: "",
            },
          },
        },
      }));
    } catch (error) {
      setTreeState((prev) => ({
        ...prev,
        [projectId]: {
          ...(prev[projectId] || {}),
          [root.id]: {
            ...(prev[projectId]?.[root.id] || {}),
            [treePath]: {
              entries: [],
              loading: false,
              error: error?.message || "Failed to load tree",
            },
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
      setStatus(error?.message || t("selectProjectFirst"));
    } finally {
      setPickerLoading(false);
    }
  });

  /**
   * Create a folder under the browsed path and step into it, so the operator
   * can immediately hit "choose this folder".
   *
   * @returns {Promise<boolean>} whether the folder was created
   */
  const createFolder = useEffectEvent(async (parentPath, name) => {
    try {
      const response = await fetch("/api/system/directories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: parentPath, name }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setPickerPath(json.currentPath);
      setPickerListing(json);
      return true;
    } catch (error) {
      // Server error codes double as dictionary keys; t() falls back to the
      // raw code for anything unmapped.
      setStatus(t(error?.message || "create_directory_failed"), "error");
      return false;
    }
  });

  const openFile = useEffectEvent(async (projectId, rootId, filePath, fileName) => {
    const initialWidth = Math.min(
      Math.max(420, window.innerWidth * 0.34),
      window.innerWidth * 0.45,
    );
    const initialHeight = Math.min(
      Math.max(360, window.innerHeight * 0.62),
      window.innerHeight * 0.82,
    );
    setPreviewSize({ width: initialWidth, height: initialHeight });
    setSelectedFile({
      projectId,
      rootId,
      path: filePath,
      name: fileName,
    });
    setFileContentState((prev) => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}),
        loading: true,
        error: "",
      },
    }));
    try {
      const response = await fetch(
        `/api/projects/${projectId}/file?rootId=${encodeURIComponent(rootId)}&path=${encodeURIComponent(filePath)}`,
      );
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setFileContentState((prev) => ({
        ...prev,
        [projectId]: {
          loading: false,
          error: "",
          file: json,
        },
      }));
    } catch (error) {
      setFileContentState((prev) => ({
        ...prev,
        [projectId]: {
          loading: false,
          error: error?.message || t("loadingFiles"),
          file: null,
        },
      }));
    }
  });

  const refreshSelectedFile = useEffectEvent(async () => {
    if (!selectedFile) return;
    try {
      const response = await fetch(
        `/api/projects/${selectedFile.projectId}/file?rootId=${encodeURIComponent(selectedFile.rootId || "main")}&path=${encodeURIComponent(selectedFile.path)}`,
      );
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || response.statusText);
      }
      setFileContentState((prev) => {
        const current = prev[selectedFile.projectId];
        if (current?.file?.mtimeMs && json.mtimeMs && current.file.mtimeMs === json.mtimeMs) {
          return prev;
        }
        return {
          ...prev,
          [selectedFile.projectId]: {
            loading: false,
            error: "",
            file: json,
          },
        };
      });
    } catch (error) {
      setFileContentState((prev) => ({
        ...prev,
        [selectedFile.projectId]: {
          loading: false,
          error: error?.message || t("loadingFiles"),
          file: prev[selectedFile.projectId]?.file || null,
        },
      }));
    }
  });

  const closeFilePreview = () => {
    setSelectedFile(null);
  };

  const selectTreeRoot = (projectId, rootId) => {
    setActiveTreeRootByProject((prev) => ({
      ...prev,
      [projectId]: rootId,
    }));
  };

  const startPreviewResize = (event) => {
    if (!selectedFile) return;
    event.preventDefault();
    event.stopPropagation();
    const pane = event.currentTarget.closest(".files-preview-pane");
    const rect = pane?.getBoundingClientRect();
    if (!rect) return;
    previewResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startW: rect.width,
      startH: rect.height,
    };
    const onMove = (moveEvent) => {
      const state = previewResizeRef.current;
      if (!state) return;
      const nextWidth = Math.min(0.98 * window.innerWidth, Math.max(320, state.startW + (moveEvent.clientX - state.startX)));
      const nextHeight = Math.min(0.95 * window.innerHeight, Math.max(220, state.startH + (moveEvent.clientY - state.startY)));
      setPreviewSize({ width: nextWidth, height: nextHeight });
    };
    const onUp = () => {
      previewResizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    activeRef.current = {
      projectId: activeProjectId,
      terminalId: activeTerminalId,
    };
  }, [activeProjectId, activeTerminalId]);

  useEffect(() => {
    const socket = new WebSocket(wsUrl());
    socketRef.current = socket;
    setStatus(t("wsConnecting"));
    setConnectionState("connecting");

    socket.addEventListener("open", () => {
      setConnectionState("open");
      setStatus(t("wsConnected"));
    });

    socket.addEventListener("close", () => {
      setConnectionState("closed");
      setStatus(t("wsDisconnected"));
    });

    socket.addEventListener("error", () => {
      setConnectionState("error");
      setStatus(t("wsFailed"));
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
          const serverSettings = message.settings || {};
          const nextSettings = {
            ...defaultAppSettings(),
            ...serverSettings,
          };
          setAppSettings(nextSettings);
          if (nextSettings.language === "zh") {
            setLang("zh");
          } else {
            setLang("en");
          }
          setProjects(nextProjects);
          setActiveTreeRootByProject((prev) => {
            const next = { ...prev };
            for (const project of nextProjects) {
              if (!next[project.id]) next[project.id] = "main";
            }
            return next;
          });
          setProjectHistories(() =>
            Object.fromEntries(
              nextProjects.map((project) => [
                project.id,
                filterHistoryEntries(project.history).slice(-200),
              ]),
            ),
          );
          ensureSelection(nextProjects);
          setStatus(
            nextProjects.length
            ? t("workspaceSynced")
            : t("noProjects"),
          );
          break;
        }
        case "settings_updated": {
          const nextSettings = {
            ...defaultAppSettings(),
            ...(message.settings || {}),
          };
          setAppSettings(nextSettings);
          setLang(nextSettings.language === "zh" ? "zh" : "en");
          setStatus(t("settingsSaved"));
          break;
        }
        case "project_created": {
          setProjectHistories((prev) => ({
            ...prev,
            [message.project.id]: filterHistoryEntries(message.project.history).slice(-200),
          }));
          setProjects((prev) => {
            const next = sortProjects(upsertProject(prev, message.project));
            ensureSelection(next);
            return next;
          });
          setActiveTreeRootByProject((prev) => ({
            ...prev,
            [message.project.id]: "main",
          }));
          setExpandedProjects((prev) => ({
            ...prev,
            [message.project.id]: true,
          }));
          setActiveProjectId(message.project.id);
          setActiveTerminalId(null);
          setPickerOpen(false);
          setCreatingProject(false);
          setStatus(t("createdProject", { name: message.project.name }));
          break;
        }
        case "project_existing": {
          const nextProject = message.project;
          setProjectHistories((prev) => ({
            ...prev,
            [nextProject.id]: filterHistoryEntries(nextProject.history).slice(-200),
          }));
          setProjects((prev) => {
            const next = sortProjects(upsertProject(prev, nextProject));
            ensureSelection(next);
            return next;
          });
          setActiveTreeRootByProject((prev) => ({
            ...prev,
            [nextProject.id]: "main",
          }));
          setExpandedProjects((prev) => ({
            ...prev,
            [nextProject.id]: true,
          }));
          setActiveProjectId(nextProject.id);
          setActiveTerminalId(null);
          setPickerOpen(false);
          setCreatingProject(false);
          setStatus(t("projectExists", { name: nextProject.name }));
          break;
        }
        case "project_deleted": {
          setProjects((prev) => {
            const next = prev.filter((project) => project.id !== message.projectId);
            ensureSelection(next);
            return next;
          });
          setSelectedFile((prev) =>
            prev?.projectId === message.projectId ? null : prev,
          );
          setProjectHistories((prev) => {
            const next = { ...prev };
            delete next[message.projectId];
            return next;
          });
          setExpandedProjects((prev) => {
            const next = { ...prev };
            delete next[message.projectId];
            return next;
          });
          setActiveTreeRootByProject((prev) => {
            const next = { ...prev };
            delete next[message.projectId];
            return next;
          });
          setStatus(t("projectRemoved"));
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
          setStatus(t("createdTerminal", { label: terminalLabel(message.terminal, t) }));
          break;
        }
        case "project_root_added": {
          setProjects((prev) =>
            prev.map((project) =>
              project.id === message.projectId
                ? {
                    ...project,
                    roots: [...(project.roots || []), message.root].sort((a, b) =>
                      a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "main" ? -1 : 1,
                    ),
                  }
                : project,
            ),
          );
          setStatus(t("linkedReference", { label: message.root?.label || t("referenceDir") }));
          break;
        }
        case "project_root_removed": {
          const rootId = String(message.rootId || "");
          setProjects((prev) =>
            prev.map((project) =>
              project.id === message.projectId
                ? {
                    ...project,
                    roots: (project.roots || []).filter((root) => root.id !== rootId),
                  }
                : project,
            ),
          );
          setTreeState((prev) => {
            const projectTrees = prev[message.projectId];
            if (!projectTrees) return prev;
            const nextProjectTrees = { ...projectTrees };
            delete nextProjectTrees[rootId];
            return {
              ...prev,
              [message.projectId]: nextProjectTrees,
            };
          });
          setActiveTreeRootByProject((prev) => {
            const currentRootId = prev[message.projectId] || "main";
            if (currentRootId !== rootId) return prev;
            return {
              ...prev,
              [message.projectId]: "main",
            };
          });
          setSelectedFile((prev) =>
            prev?.projectId === message.projectId && prev.rootId === rootId
              ? null
              : prev,
          );
          setStatus(t("referenceRemoved"));
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
          setStatus(t("renamedTerminal", { label: message.label }));
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
        case "bus_event": {
          const eventData = message.event || {};
          const projectId = String(eventData.projectId || eventData.groupId || "");
          if (projectId) {
            setProjectHistories((prev) => {
              const current = prev[projectId] || [];
              return {
                ...prev,
                [projectId]: filterHistoryEntries([...current, eventData]).slice(-200),
              };
            });
          }
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
          setStatus(t("terminalClosed"));
          break;
        }
        case "project_tree_changed": {
          if (activeProjectId === message.projectId) {
            const rootId = activeTreeRootByProject[message.projectId] || "main";
            const shouldRefreshCurrentRoot =
              !message.rootId || message.rootId === rootId;
            const shouldRefreshSelectedFile =
              selectedFile?.projectId === message.projectId &&
              (!message.rootId || message.rootId === selectedFile.rootId);
            if (shouldRefreshCurrentRoot) {
              loadTree(message.projectId, rootId, ".");
            }
            if (shouldRefreshSelectedFile) {
              refreshSelectedFile();
            }
          }
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
          const msg = message.message || t("serverError");
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
    const onMove = (event) => {
      if (!resizingRef.current) return;
      const target = resizeTargetRef.current;
      if (target === "sidebar") {
        const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, event.clientX));
        setSidebarWidth(next);
      } else if (target === "files") {
        const next = Math.min(640, Math.max(200, window.innerWidth - event.clientX));
        setFilesPanelWidth(next);
      } else if (target === "bottom") {
        const next = Math.min(800, Math.max(140, window.innerHeight - event.clientY));
        setBottomPanelHeight(next);
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
    setPickerMode("create");
    setPickerOpen(true);
    setCreatingProject(false);
    try {
      const roots = await loadPickerRoots();
      await openDirectory(roots[0]?.path || "");
    } catch (error) {
      setStatus(error?.message || t("selectProjectFirst"));
    }
  };

  const openReferencePicker = async () => {
    if (!activeProject) {
      setStatus(t("selectProjectFirst"));
      return;
    }
    setPickerMode("link");
    setPickerOpen(true);
    setCreatingProject(false);
    try {
      const roots = await loadPickerRoots();
      await openDirectory(roots[0]?.path || "");
    } catch (error) {
      setStatus(error?.message || t("selectProjectFirst"));
    }
  };

  const selectProjectDirectory = (selectedPath) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setStatus(t("wsNotReady"));
      return;
    }
    if (creatingProject) return;
    if (pickerMode === "link") {
      setPickerOpen(false);
      send({
        type: "add_project_root",
        projectId: activeProjectId,
        path: selectedPath,
        label: selectedPath.split("/").filter(Boolean).pop() || "Reference",
      });
      return;
    }
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
      setStatus(t("selectProjectFirst"));
      return;
    }
    // Seed from the global default, which is the common case; the whole point
    // of the dialog is that a project can mix providers per terminal.
    setNewTerminalDialog({
      projectId: activeProjectId,
      cli: appSettings.cli,
      model: appSettings.model || "",
    });
  };

  const confirmNewTerminal = () => {
    if (!newTerminalDialog) return;
    send({
      type: "add_terminal",
      projectId: newTerminalDialog.projectId,
      cli: newTerminalDialog.cli,
      model: newTerminalDialog.model,
    });
    setNewTerminalDialog(null);
  };

  const sendComposer = () => {
    if (!activeProjectId || !activeTerminalId) {
      setStatus(t("terminalHint"));
      return;
    }
    const text = composerText.trim();
    if (!text) return;
    send({
      type: "emit_event",
      projectId: activeProjectId,
      event: {
        type: "user_message",
        from: "browser",
        to: activeTerminalId,
        text,
        appendEnter: true,
      },
    });
    send({
      type: "request_snapshot",
      projectId: activeProjectId,
      terminalId: activeTerminalId,
    });
    setComposerText("");
  };

  const handleComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendComposer();
  };

  const activeTreeRootId = activeProject
    ? activeTreeRootByProject[activeProject.id] || "main"
    : "main";
  const treeRoot = activeProject
    ? treeState[activeProject.id]?.[activeTreeRootId]?.["."]
    : null;

  useEffect(() => {
    if (
      activeProject &&
      !treeState[activeProject.id]?.[activeTreeRootId]?.["."]?.entries
    ) {
      loadTree(activeProject.id, activeTreeRootId, ".");
    }
  }, [activeProject, activeTreeRootId, treeState, loadTree]);

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
    if (!treeState[activeProject.id]?.[activeTreeRootId]?.[node.path]) {
      loadTree(activeProject.id, activeTreeRootId, node.path);
    }
  };
  const activeTreeExpanded = activeProject
    ? expandedDirectories[activeProject.id] || {}
    : {};
  const activeHistory = activeProject ? projectHistories[activeProject.id] || [] : [];
  const composerShellRef = useRef(null);
  const historyEndRef = useRef(null);
  const previewFile =
    selectedFile && fileContentState[selectedFile.projectId]?.file
      ? fileContentState[selectedFile.projectId].file
      : null;
  const previewMode = detectFileMode(previewFile?.name || selectedFile?.name || "");
  const previewLines = formatPreviewLines(previewFile?.content || "");
  const markdownDoc =
    previewMode === "markdown" && previewFile?.content
      ? parseMarkdownDocument(previewFile.content)
      : { blocks: [], outline: [] };
  const activePreviewKey = selectedFile
    ? `${selectedFile.rootId || "main"}:${selectedFile.path}`
    : "";

  useEffect(() => {
    const target = composerShellRef.current || historyEndRef.current;
    target?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [activeProjectId, activeHistory]);

  useEffect(() => {
    if (!activeProject) return;
    if (!treeState[activeProject.id]?.[activeTreeRootId]?.["."]?.entries) {
      loadTree(activeProject.id, activeTreeRootId, ".");
    }
  }, [activeProject, activeTreeRootId, treeState, loadTree]);

  useEffect(() => {
    if (!activeTerminal) return;
    const raf = window.requestAnimationFrame(() => {
      const terminalShellEl = terminalShellRef.current;
      const bottomPanelEl = bottomPanelRef.current;
      const gridEl = bottomPanelEl?.querySelector?.(".bottom-panel-grid");
      const cardEls = bottomPanelEl?.querySelectorAll?.(".bottom-card");
      console.debug("[amux bottom diag]", {
        terminalShell: terminalShellEl?.getBoundingClientRect?.(),
        bottomPanel: bottomPanelEl?.getBoundingClientRect?.(),
        grid: gridEl?.getBoundingClientRect?.(),
        cards: Array.from(cardEls || []).map((el) => el.getBoundingClientRect()),
        bottomPanelHeight,
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeTerminal, bottomPanelHeight]);

  return (
    <>
      <div className="app-shell">
        {sidebarVisible ? (
          <>
            <aside className="sidebar-v2" style={{ width: `${sidebarWidth}px` }}>
              <div className="sidebar-topbar">
                <button
                  type="button"
                  className="sidebar-icon-button sidebar-collapse-button"
                  onClick={() => setSidebarVisible(false)}
                  title={t("hideSidebar")}
                >
                  <IconSidebar />
                </button>
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
                  <span>{t("newTerminal")}</span>
                </button>
              </div>

              <div className="sidebar-section">
                <div className="sidebar-section-header">
                  <span>{t("projects")}</span>
                  <button
                    type="button"
                    className="sidebar-mini-button"
                    onClick={openPicker}
                    title={t("newProject")}
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
                            title={t("deleteProject")}
                          >
                            {t("deleteProject")}
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
                                      title={t("doubleClickRename")}
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
                                          {terminalLabel(terminal, t)}
                                          {terminal.cli ? (
                                            <span className="thread-provider">
                                              {t(`${terminal.cli}Cli`)}
                                              {terminal.model ? ` · ${terminal.model}` : ""}
                                            </span>
                                          ) : null}
                                        </span>
                                      )}
                                    </div>
                                    {!isEditing ? (
                                      <button
                                        type="button"
                                        className="thread-close"
                                        title={t("closeTerminal")}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          if (
                                            !window.confirm(
                                              t("confirmCloseTerminal", { label: terminalLabel(terminal, t) }),
                                            )
                                          ) {
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

              <button type="button" className="settings-button" onClick={() => setSettingsOpen(true)}>
                <span className="settings-icon">
                  <IconSettings />
                </span>
                <span>{t("settings")}</span>
              </button>
            </aside>

            <div
              className="sidebar-resizer"
              onMouseDown={startResize("sidebar")}
              role="separator"
              aria-orientation="vertical"
              aria-label={t("hideSidebar")}
            />
          </>
        ) : (
          null
        )}

        <main className="workspace-v3">
          <div className="workspace-content">
            <section className="terminal-column" style={{ flex: 1, minWidth: 0 }}>
              <div
                className="terminal-surface terminal-surface-top"
                ref={terminalShellRef}
                style={{
                  height: `calc(100% - ${bottomPanelHeight}px - 2px)`,
                }}
              >
                <div className="mac-chrome">
                  {!sidebarVisible ? (
                    <button
                      type="button"
                      className="sidebar-reopen inline"
                      onClick={() => setSidebarVisible(true)}
                      title={t("showSidebar")}
                    >
                      <IconSidebar />
                    </button>
                  ) : null}
                  <div className="terminal-title">
                    {activeTerminal
                      ? `${activeTerminal.projectName} / ${terminalLabel(activeTerminal, t)}`
                      : t("appName")}
                  </div>
                </div>
                <div className="terminal-shell">
                  {activeTerminal ? (
                    <TerminalWorkspace
                      ref={terminalApiRef}
                      activeTerminal={activeTerminal}
                      onInput={(projectId, terminalId, data) =>
                        send({
                          type: "emit_event",
                          projectId,
                          event: {
                            type: "terminal_input",
                            from: "browser",
                            to: terminalId,
                            text: data,
                            appendEnter: false,
                          },
                        })
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
                      <h2>{t("terminalEmptyTitle")}</h2>
                      <p>{t("terminalEmptyBody")}</p>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="terminal-bottom-resizer"
                onMouseDown={startResize("bottom")}
                role="separator"
                aria-orientation="horizontal"
                aria-label={t("resizeBottomPanel")}
              />

              <aside
                className="bottom-panel"
                ref={bottomPanelRef}
                style={{ height: `${bottomPanelHeight}px` }}
              >
                <div className="bottom-panel-grid simple">
                  <section className="bottom-card composer-card">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        sendComposer();
                      }}
                    >
                      <div className="composer-shell" ref={composerShellRef}>
                        <div className="composer-history" aria-label={t("collaborationHistory")}>
                          {activeHistory.length ? (
                            activeHistory.map((event) => {
                              const text = summarizeEvent(event);
                              const detail = getEventDetail(event);
                              const fromUser = event.from === "browser";
                              return (
                                <div
                                  key={event.id || `${event.ts || 0}-${event.type || "event"}`}
                                  className={`history-item ${
                                    fromUser ? "from-user" : "from-agent"
                                  } history-${event.type || "event"}`}
                                >
                                  <div className="history-meta">
                                    <span className="history-origin">
                                      {formatEventOrigin(event, activeProject, t)}
                                    </span>
                                    <span className="history-type">
                                      {formatEventKind(event, t)}
                                    </span>
                                    {formatEventTarget(event, activeProject, t) ? (
                                      <span className="history-target">
                                        {"→"} {formatEventTarget(event, activeProject, t)}
                                      </span>
                                    ) : null}
                                  </div>
                                  {text ? <div className="history-text">{text}</div> : null}
                                  {detail && detail !== text ? (
                                    <details
                                      className="history-details"
                                      open={
                                        event.type === "done" ||
                                        event.type === "agent_reply" ||
                                        event.type === "require_confirmation"
                                      }
                                    >
                                      <summary>{t("details")}</summary>
                                      <div className="history-detail-text">
                                        {detail}
                                      </div>
                                    </details>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <div className="history-empty">{t("currentProjectNoEvents")}</div>
                          )}
                          <div ref={historyEndRef} />
                        </div>
                        <textarea
                          id="composer-input"
                          className="composer-input"
                          value={composerText}
                          onChange={(event) => setComposerText(event.target.value)}
                          aria-label={t("inputLabel")}
                          placeholder={t("inputPlaceholder")}
                          onKeyDown={handleComposerKeyDown}
                        />
                        <div className="composer-toolbar">
                          <button
                            type="button"
                            className="composer-send"
                            onClick={sendComposer}
                          >
                            {t("send")}
                          </button>
                        </div>
                      </div>
                    </form>
                  </section>
                </div>
              </aside>
            </section>

            <div
              className="sidebar-resizer files-resizer"
              onMouseDown={startResize("files")}
              role="separator"
              aria-orientation="vertical"
              aria-label={t("resizeFilesPanel")}
            />

            <aside
              className="files-panel"
              style={{ width: `${filesPanelWidth}px` }}
            >
              <div className="files-header">
                <span>{activeProject ? activeProject.name : t("fileTreeTitle")}</span>
                <div className="files-header-actions">
                  {activeProject ? (
                    <button
                      type="button"
                      className="files-link-button"
                      onClick={openReferencePicker}
                    >
                      {t("linkDirectory")}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="files-root-strip">
                {activeProject?.roots?.map((root) => {
                  const isActive = activeTreeRootId === root.id;
                  const canRemove = root.kind !== "main";
                  return (
                    <span key={root.id} className={`files-root-chip-wrap ${isActive ? "active" : ""}`}>
                      <button
                        type="button"
                        className={`files-root-chip ${isActive ? "active" : ""}`}
                        onClick={() => {
                          selectTreeRoot(activeProject.id, root.id);
                          if (!treeState[activeProject.id]?.[root.id]?.["."]?.entries) {
                            loadTree(activeProject.id, root.id, ".");
                          }
                        }}
                        title={root.path}
                      >
                        {root.kind === "main" ? t("mainRoot") : root.label}
                      </button>
                      {canRemove ? (
                        <button
                          type="button"
                          className="files-root-remove"
                          title={t("removeLinkedRoot")}
                            onClick={() =>
                              send({
                                type: "remove_project_root",
                                projectId: activeProject.id,
                                rootId: String(root.id || ""),
                              })
                            }
                          >
                          ×
                        </button>
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <div
                className={`files-body ${selectedFile ? "split" : "tree-only"}`}
              >
                <div className="files-tree-pane">
                  {!activeProject ? (
                    <div className="tree-empty">{t("selectProjectFirst")}</div>
                  ) : treeRoot?.loading ? (
                    <div className="tree-loading">{t("loading")}</div>
                  ) : treeRoot?.error ? (
                    <div className="tree-error">{treeRoot.error}</div>
                  ) : treeRoot?.entries?.length ? (
                    treeRoot.entries.map((node) => (
                      <TreeNode
                        key={node.path}
                        node={node}
                        rootId={activeTreeRootId}
                        t={t}
                        expanded={activeTreeExpanded}
                        onToggle={toggleDirectory}
                        loadedEntry={treeState[activeProject.id]?.[activeTreeRootId]}
                        depth={0}
                        onOpenFile={(fileNode) =>
                          openFile(
                            activeProject.id,
                            activeTreeRootId,
                            fileNode.path,
                            fileNode.name,
                          )
                        }
                        activePreviewKey={activePreviewKey}
                      />
                    ))
                  ) : (
                    <div className="tree-empty">{t("noVisibleFiles")}</div>
                  )}
                </div>
                {selectedFile ? (
                  <div className="files-preview-pane">
                    <button
                      type="button"
                      className="file-preview-close"
                      onClick={closeFilePreview}
                      aria-label={t("closePreview")}
                      title={t("closePreview")}
                    >
                      ×
                    </button>
                    {fileContentState[selectedFile.projectId]?.loading ? (
                      <div className="tree-loading">{t("loadingFiles")}</div>
                    ) : fileContentState[selectedFile.projectId]?.error ? (
                      <div className="tree-error">
                        {fileContentState[selectedFile.projectId].error}
                      </div>
                    ) : fileContentState[selectedFile.projectId]?.file ? (
                      <>
                        {previewMode === "markdown" ? (
                          <div className={`file-preview-content mode-${previewMode}`}>
                            <div className="md-render">
                              {markdownDoc.blocks}
                            </div>
                          </div>
                        ) : (
                          <div className={`file-preview-content mode-${previewMode}`}>
                            <div className="file-preview-line-nums" aria-hidden="true">
                              {previewLines.map((line) => (
                                <div key={line.number} className="file-preview-line-num">
                                  {line.number}
                                </div>
                              ))}
                            </div>
                            <pre className="file-preview-code">
                              {previewLines.map((line) => (
                                <div key={line.number} className="file-preview-line">
                                  {line.text || "\u00a0"}
                                </div>
                              ))}
                            </pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="tree-empty">{t("noFileLoaded")}</div>
                    )}
                  </div>
                ) : null}
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
              aria-label={t("dismiss")}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {newTerminalDialog ? (
        <div className="modal-backdrop" onClick={() => setNewTerminalDialog(null)}>
          <div className="picker-modal" onClick={(event) => event.stopPropagation()}>
            <div className="picker-header">
              <div>
                <p className="picker-eyebrow">{t("newTerminalTitle")}</p>
                <h2>{t("newTerminalDesc")}</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setNewTerminalDialog(null)}>
                ×
              </button>
            </div>

            <div className="settings-label">{t("pickProvider")}</div>
            <div className="settings-select-group" role="group" aria-label={t("pickProvider")}>
              {(providerOptions.length ? providerOptions : fallbackProviderOptions(t)).map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`settings-select ${newTerminalDialog.cli === provider.id ? "active" : ""}`}
                  onClick={() =>
                    setNewTerminalDialog((prev) => ({
                      ...prev,
                      cli: provider.id,
                      // Switching provider invalidates the old model id.
                      model: provider.defaultModel || getModelForCli(provider.id),
                    }))
                  }
                >
                  {provider.label}
                </button>
              ))}
            </div>

            <div className="settings-label">{t("pickModel")}</div>
            {modelOptionsLoading && !modelOptions.length ? (
              <div className="settings-note">{t("loading")}</div>
            ) : (
              <div className="settings-select-group" role="group" aria-label={t("pickModel")}>
                {modelOptions.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={`settings-select ${newTerminalDialog.model === model.id ? "active" : ""}`}
                    onClick={() => setNewTerminalDialog((prev) => ({ ...prev, model: model.id }))}
                  >
                    <span className="settings-select-name">{model.label}</span>
                    {model.default ? <span className="settings-select-tag">{t("modelDefault")}</span> : null}
                  </button>
                ))}
              </div>
            )}
            {modelOptionsNoteKey ? <div className="settings-note">{t(modelOptionsNoteKey)}</div> : null}

            <div className="picker-actions">
              <button type="button" className="picker-submit" onClick={confirmNewTerminal}>
                {t("createTerminal")}
              </button>
              <button type="button" className="picker-nav" onClick={() => setNewTerminalDialog(null)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DirectoryPickerModal
        open={pickerOpen}
        mode={pickerMode}
        t={t}
        roots={pickerRoots}
        currentPath={pickerPath}
        listing={pickerListing}
        loading={pickerLoading}
        creating={creatingProject}
        onClose={() => setPickerOpen(false)}
        onOpenPath={openDirectory}
        onSelect={selectProjectDirectory}
        onCreateFolder={createFolder}
      />

      {settingsOpen ? (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="settings-shell" onClick={(event) => event.stopPropagation()}>
            <aside className="settings-sidebar">
              <button type="button" className="settings-back" onClick={() => setSettingsOpen(false)}>
                ← {t("backToApp")}
              </button>
              <div className="settings-nav">
                <button type="button" className="settings-nav-item active">
                  {t("settingsSubtitle")}
                </button>
              </div>
            </aside>
            <section className="settings-main">
              <div className="settings-main-header">
                <h1>{t("settings")}</h1>
                <button
                  type="button"
                  className="close-button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label={t("dismiss")}
                >
                  ×
                </button>
              </div>
              <p className="settings-overview">{t("settingsOverview")}</p>

              <div className="settings-card">
                <div className="settings-row">
                  <div className="settings-copy">
                    <div className="settings-label">{t("uiLanguage")}</div>
                    <div className="settings-description">
                      {t("uiLanguageDesc")}
                    </div>
                  </div>
                  <div className="language-toggle settings-toggle" aria-label={t("uiLanguage")}>
                    <button
                      type="button"
                      className={`language-chip ${lang === "en" ? "active" : ""}`}
                      onClick={() => saveSettings({ language: "en" })}
                    >
                      {t("english")}
                    </button>
                    <button
                      type="button"
                      className={`language-chip ${lang === "zh" ? "active" : ""}`}
                      onClick={() => saveSettings({ language: "zh" })}
                    >
                      {t("chinese")}
                    </button>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-copy">
                    <div className="settings-label">{t("defaultCli")}</div>
                    <div className="settings-description">
                      {t("defaultCliDesc")}
                    </div>
                  </div>
                  <div className="settings-select-group" role="group" aria-label={t("defaultCli")}>
                    {providerOptionsLoading && !providerOptions.length ? (
                      <div className="settings-note">{t("loading")}</div>
                    ) : (
                      (providerOptions.length
                        ? providerOptions
                        : fallbackProviderOptions(t)
                      ).map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          className={`settings-select ${appSettings.cli === provider.id ? "active" : ""}`}
                          onClick={() => {
                            saveSettings({
                              cli: provider.id,
                              model: provider.defaultModel || getModelForCli(provider.id),
                            });
                          }}
                        >
                          {provider.label}
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-copy">
                    <div className="settings-label">{t("defaultModel")}</div>
                    <div className="settings-description">
                      {t("defaultModelDesc")}
                    </div>
                  </div>
                  {appSettings.cli === "cursor" ? (
                    <div className="settings-model-list" role="listbox" aria-label={t("defaultModel")}>
                      {modelOptionsLoading ? (
                        <div className="settings-note">{t("loading")}</div>
                      ) : (
                        (modelOptions.length ? modelOptions : [{ id: "auto", label: "auto", current: true }]).map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            className={`settings-select model-item ${appSettings.model === model.id ? "active" : ""}`}
                            onClick={() => saveSettings({ model: model.id })}
                          >
                            <span className="settings-select-name">{model.label}</span>
                            {model.current ? <span className="settings-select-tag">{t("modelCurrent")}</span> : null}
                            {model.default ? <span className="settings-select-tag">{t("modelDefault")}</span> : null}
                          </button>
                        ))
                      )}
                      {modelOptionsNoteKey ? <div className="settings-note">{t(modelOptionsNoteKey)}</div> : null}
                    </div>
                  ) : (
                    <div className="settings-model-list codex-list" role="listbox" aria-label={t("defaultModel")}>
                      {modelOptionsLoading ? (
                        <div className="settings-note">{t("loading")}</div>
                      ) : (
                        modelOptions.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            className={`settings-select model-item ${appSettings.model === model.id ? "active" : ""}`}
                            onClick={() => saveSettings({ model: model.id })}
                          >
                            <span className="settings-select-name">{model.label}</span>
                            {model.current ? <span className="settings-select-tag">{t("modelCurrent")}</span> : null}
                            {model.default ? <span className="settings-select-tag">{t("modelDefault")}</span> : null}
                          </button>
                        ))
                      )}
                      {modelOptionsNoteKey ? <div className="settings-note">{t(modelOptionsNoteKey)}</div> : null}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
