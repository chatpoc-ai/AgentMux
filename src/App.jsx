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
import { createPortal } from "react-dom";
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
    conn_connecting: "Connecting to server",
    conn_open: "Server connected",
    conn_reconnecting: "Reconnecting to server…",
    conn_closed: "Server disconnected",
    conn_error: "Cannot reach server",
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
    modelNoteCodex: "Model list comes from the installed Codex CLI's own catalog.",
    modelNoteClaude: "Claude aliases track the latest release; type a full model id to pin a snapshot.",
    linkDirectory: "Link directory",
    removeLinkedRoot: "Remove linked directory",
    selectProjectFolder: "Select project folder",
    linkReferenceDir: "Link reference directory",
    chooseThisFolder: "Choose this folder",
    linkThisDir: "Link this directory",
    newFolder: "New folder",
    jumpToLatest: "Jump to latest",
    status_idle: "Idle",
    status_working: "Working",
    status_waiting: "Waiting for you",
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
    inputPlaceholder:
      "Type command or text, @ to address a terminal, Enter to send, Shift+Enter for newline",
    mentionListLabel: "Terminals you can address",
    mentionEmpty: "No terminal matches",
    mentionHint: "↑↓ to choose, Enter to insert, Tab to add another",
    mentionSwitched: "Switched to {name}",
    mentionBroadcast: "Sent to {names}",
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
    conn_connecting: "正在连接服务器",
    conn_open: "服务器已连接",
    conn_reconnecting: "正在重连服务器…",
    conn_closed: "与服务器断开",
    conn_error: "无法连接服务器",
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
    modelNoteCodex: "模型列表取自本机安装的 Codex CLI 自己的目录。",
    modelNoteClaude: "Claude 别名会自动跟随最新版本；要锁定某个具体快照，直接输入完整的模型 id。",
    linkDirectory: "关联目录",
    removeLinkedRoot: "移除引用目录",
    selectProjectFolder: "选择项目文件夹",
    linkReferenceDir: "关联引用目录",
    chooseThisFolder: "选择这个文件夹",
    linkThisDir: "关联这个目录",
    newFolder: "新建文件夹",
    jumpToLatest: "回到最新",
    status_idle: "空闲",
    status_working: "工作中",
    status_waiting: "等你回应",
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
    inputPlaceholder: "输入命令或文本，@ 指定终端，Enter 发送，Shift+Enter 换行",
    mentionListLabel: "可指定的终端",
    mentionEmpty: "没有匹配的终端",
    mentionHint: "↑↓ 选择，Enter 插入，Tab 继续添加",
    mentionSwitched: "已切换到 {name}",
    mentionBroadcast: "已发送给 {names}",
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

/**
 * Above this many models a chip grid stops being usable — Cursor exposes
 * roughly two hundred — so the picker switches to a native select, which also
 * behaves better on a phone.
 */
const MODEL_CHIP_LIMIT = 12;

/** WebSocket reconnect backoff: first retry after this, doubling up to the cap. */
/** Bounds for the auto-growing composer, in px. */
/** Bottom panel drag range. */
const BOTTOM_PANEL_MIN = 140;
const BOTTOM_PANEL_MAX = 800;

const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_MAX_HEIGHT = 200;

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 15000;

/** Picker root id -> dictionary key; unknown ids fall back to the server label. */
const PICKER_ROOT_KEYS = {
  cwd: "rootCwd",
  home: "rootHome",
  projects: "rootProjects",
};

/** Keep in sync with server/providers/index.js. */
const PROVIDER_IDS = ["cursor", "codex", "claude"];

function getModelForCli(cli) {
  // "auto" and "sonnet" are aliases the CLIs resolve themselves, so they stay
  // valid as the catalogs move. Codex takes concrete version ids, so pinning
  // one here would rot; "" means "whatever the provider reports as default".
  if (cli === "codex") return "";
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
/** PageUp / PageDown as xterm would encode them. */
const PAGE_UP_SEQUENCE = `${String.fromCharCode(27)}[5~`;
const PAGE_DOWN_SEQUENCE = `${String.fromCharCode(27)}[6~`;

/**
 * Only the size xterm starts at, before its first fit. The pane follows the
 * window from then on; nothing is pinned to these.
 */
const TMUX_PANE_COLS = 80;
const TMUX_PANE_ROWS = 24;

/**
 * Whether the operator is typing somewhere that must not lose focus.
 *
 * A snapshot arrives for many reasons — resize, reconnect, and every message
 * sent from the composer, which requests one. Focusing the terminal on each
 * one pulled the caret out of the composer right after sending.
 */
function isTypingElsewhere() {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable === true;
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

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 7v4a3 3 0 0 1-3 3H6" />
      <path d="m9.5 10.5-3.5 3.5 3.5 3.5" />
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

/**
 * Mentions address a terminal by the name the sidebar shows, with its spaces
 * closed up. Deriving the handle from the visible label rather than slugging
 * it to ASCII keeps non-Latin names usable — a strict slug would erase a
 * Chinese label entirely and leave nothing to type.
 */
function mentionHandle(label) {
  return String(label ?? "")
    .trim()
    .replace(/[\s@]+/g, "-");
}

/**
 * One entry per terminal across every project, each carrying the aliases it
 * answers to. Cross-project mentions are the point: addressing a terminal is
 * also how you switch to it, so the list cannot stop at the active project.
 */
function buildMentionTargets(projects, t) {
  const targets = [];
  for (const project of projects || []) {
    for (const terminal of project.terminals || []) {
      const label = terminalLabel(terminal, t);
      targets.push({
        id: terminal.id,
        projectId: project.id,
        projectName: project.name,
        label,
        // The stored name, which stays "Agent 3" while the interface is in
        // Chinese. Kept so "@ag" still narrows the list for someone typing on
        // a Latin keyboard, and so the alias below survives a language switch.
        rawLabel: String(terminal.label ?? ""),
        cli: terminal.cli || "",
        index: terminal.index ?? 0,
        handle: mentionHandle(label),
      });
    }
  }
  // Two projects can each hold an "Agent 1". Disambiguate with a slice of the
  // terminal id, which stays put when the other one is renamed.
  const seen = new Map();
  for (const target of targets) {
    seen.set(target.handle, (seen.get(target.handle) || 0) + 1);
  }
  for (const target of targets) {
    if (seen.get(target.handle) > 1) {
      target.handle = `${target.handle}-${target.id.slice(0, 4)}`;
    }
  }
  return targets;
}

/**
 * Alias -> target, with every ambiguous alias dropped rather than resolved to
 * an arbitrary winner. Sending to the wrong agent is worse than not resolving:
 * the text lands in a pane the reader is not watching.
 */
function buildMentionAliases(targets) {
  const claims = new Map();
  const claim = (alias, target) => {
    const key = String(alias || "").toLowerCase();
    if (!key) return;
    const current = claims.get(key);
    if (current === undefined) claims.set(key, target);
    else if (current && current.id !== target.id) claims.set(key, null);
  };
  for (const target of targets) {
    claim(target.handle, target);
    claim(mentionHandle(target.label), target);
    claim(mentionHandle(target.rawLabel), target);
    // Provider aliases: "@codex" when there is only one, "@codex-2" always.
    if (target.cli) {
      claim(target.cli, target);
      claim(`${target.cli}-${target.index + 1}`, target);
    }
  }
  const aliases = new Map();
  for (const [key, target] of claims) {
    if (target) aliases.set(key, target);
  }
  return aliases;
}

const MENTION_SEPARATOR = /[,，]/;

/**
 * The "@..." token the caret currently sits in, or null. Requires whitespace
 * before the "@" so an email address in the message never opens the menu.
 *
 * A token can name several terminals, comma separated. `segmentStart` marks
 * the name being typed right now — everything before it is already settled,
 * and completing one name must not overwrite the others.
 */
function findMentionQuery(text, caret) {
  const upto = String(text ?? "").slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  const before = at > 0 ? upto[at - 1] : "";
  if (before && !/\s/.test(before)) return null;
  const token = upto.slice(at + 1);
  if (/[\s@]/.test(token)) return null;
  let segmentStart = at + 1;
  for (let i = 0; i < token.length; i += 1) {
    if (MENTION_SEPARATOR.test(token[i])) segmentStart = at + 2 + i;
  }
  return { start: at, end: caret, segmentStart, query: upto.slice(segmentStart) };
}

/**
 * Where a handle may end when no space follows it. CJK prose puts no spaces
 * around its punctuation, so an address and the sentence after it arrive as a
 * single token and the handle has to be cut out of it. Hyphen and underscore
 * are absent on purpose: handles contain them, and cutting there would
 * resolve "@agent-1" to "@agent".
 */
const MENTION_BOUNDARY = /[,.:;!?'"、，。：；！？…（）()[\]【】「」『』]/;

/**
 * Resolves one name, either exactly or as the longest prefix ending on a
 * punctuation boundary. Longest first so "@agent-12" is never read as
 * "@agent-1", and boundary-only so a handle is not clipped out of the middle
 * of an ordinary word. Returns how much of the name was consumed.
 */
function resolveMentionName(name, aliases) {
  const exact = aliases.get(name.toLowerCase());
  if (exact) return { target: exact, length: name.length };
  for (let cut = name.length - 1; cut > 0; cut -= 1) {
    if (!MENTION_BOUNDARY.test(name[cut])) continue;
    const candidate = aliases.get(name.slice(0, cut).toLowerCase());
    if (candidate) return { target: candidate, length: cut };
  }
  return null;
}

/**
 * First resolvable mention in the text, with the span it occupies so the
 * caller can lift it out. A token may address several terminals as
 * "@one,two" — names are taken while they resolve, and the span stops at the
 * first one that does not, so a stray comma stays in the message rather than
 * silently swallowing words. Unresolvable "@words" are left alone entirely:
 * they are ordinary text, and rewriting them would be a surprise.
 */
function resolveMentionTargets(text, aliases) {
  if (!aliases || !aliases.size) return null;
  const pattern = /(^|\s)@([^\s@]+)/g;
  const source = String(text ?? "");
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const token = match[2];
    const start = match.index + match[1].length;
    const targets = [];
    const seen = new Set();
    let cursor = 0;
    while (cursor < token.length) {
      let stop = cursor;
      while (stop < token.length && !MENTION_SEPARATOR.test(token[stop])) stop += 1;
      const hit = resolveMentionName(token.slice(cursor, stop), aliases);
      if (!hit) break;
      if (!seen.has(hit.target.id)) {
        seen.add(hit.target.id);
        targets.push(hit.target);
      }
      cursor += hit.length;
      // Only step over the separator when the name before it was whole; a
      // boundary-trimmed name means the rest is prose, not another address.
      if (cursor === stop && stop < token.length) cursor = stop + 1;
      else break;
    }
    if (targets.length) return { targets, start, end: start + 1 + cursor };
  }
  return null;
}

/** Drops the mention span and closes the gap it leaves behind. */
function stripMention(text, span) {
  const source = String(text ?? "");
  const head = source.slice(0, span.start);
  // "@codex, look at this" — the comma punctuated the address, so it goes with
  // it rather than leading the message the agent receives.
  const tail = source.slice(span.end).replace(/^[ \t]*[,，、:：;；][ \t]*/, " ");
  return `${head}${tail}`.replace(/[ \t]{2,}/g, " ").trim();
}

function matchesMentionQuery(target, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [
    target.handle,
    target.label,
    target.rawLabel,
    target.cli,
    target.projectName,
  ].some((field) =>
    String(field || "").toLowerCase().includes(needle),
  );
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
          // scrollToBottom has to wait for the write callback: write() queues
          // the data and parses it asynchronously, so scrolling immediately
          // after moves a viewport that has not received the rows yet, leaving
          // a freshly opened terminal parked partway up.
          term.write(normalizeSnapshotPayload(data), () => {
            try {
              term.scrollToBottom();
            } catch {
              /* terminal disposed while the write was queued */
            }
          });
          // Deliberately no fit() here. The server pushes a snapshot right
          // after it resizes a pane; fitting on receipt closed that into a
          // loop — fit, report the size, server resizes, snapshot, fit again —
          // which left the client and the pane at different widths, exactly
          // the mismatch the fixed size used to avoid. Sizing belongs to the
          // container observer alone.
        }
        window.requestAnimationFrame(() => {
        if (!terminalMatches(activeTerminalRef.current, projectId, terminalId)) {
          return;
        }
        if (isTypingElsewhere()) return;
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

    const fitTerminal = () => {
      if (disposed) return;
      try {
        fitAddon.fit();
      } catch {
        /* container not laid out yet */
      }
    };

    const markReady = () => {
      if (disposed) return;
      window.requestAnimationFrame(() => {
        if (isTypingElsewhere()) return;
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
      // Size it now, and again after layout. This used to hang off the first
      // onRender, which never fires for a pane that has produced no output —
      // so an empty terminal kept xterm's construction size while the pane
      // followed the window, and the two disagreed.
      fitTerminal();
      window.requestAnimationFrame(fitTerminal);
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
      // Re-fit so the pane follows the window. term.onResize fires only when
      // the computed cols/rows actually change, so this does not spam the
      // server with identical sizes.
      fitTerminal();
    });
    resizeObserver.observe(host);

    /**
     * Send the wheel to the pane when xterm has nothing of its own to scroll.
     *
     * An alt-screen TUI (Claude Code) draws to a buffer with no scrollback, so
     * tmux has no history to hand over and xterm's viewport never grows — the
     * wheel does nothing. Those applications scroll their own transcript on
     * PageUp/PageDown instead, which is what they tell you to use under tmux.
     *
     * Panes in the normal buffer (Codex with --no-alt-screen) do build xterm
     * scrollback, so this steps aside and lets xterm scroll natively.
     */
    const onWheel = (event) => {
      const viewport = host.querySelector(".xterm-viewport");
      if (viewport && viewport.scrollHeight > viewport.clientHeight) return;
      const active = activeTerminalRef.current;
      if (!active || !event.deltaY) return;
      event.preventDefault();
      onInputRef.current?.(
        active.projectId,
        active.id,
        event.deltaY < 0 ? PAGE_UP_SEQUENCE : PAGE_DOWN_SEQUENCE,
      );
    };
    host.addEventListener("wheel", onWheel, { passive: false });

    tryOpen();

    return () => {
      disposed = true;
      host.removeEventListener("wheel", onWheel);
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
          // Same guard as the snapshot and ready paths. This effect re-runs
          // whenever the project object is replaced — which activity alone
          // does — so without it the pane pulls the caret out of the composer
          // mid-sentence while an agent is producing output.
          if (isTypingElsewhere()) return;
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
  const composerInputRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRoots, setPickerRoots] = useState([]);
  const [pickerPath, setPickerPath] = useState("");
  const [pickerListing, setPickerListing] = useState(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  /** terminalId -> "idle" | "working" | "waiting", pushed by the server. */
  const [terminalStatuses, setTerminalStatuses] = useState({});
  const [filesPanelWidth, setFilesPanelWidth] = useState(310);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContentState, setFileContentState] = useState({});
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [pickerMode, setPickerMode] = useState("create");
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = window.localStorage.getItem("agentmux.bottomPanelHeight");
    const parsed = Number(saved);
    // Only a sanity range here; the real floor depends on the terminal's
    // natural height, which is not measurable yet at this point.
    return Number.isFinite(parsed)
      ? Math.min(BOTTOM_PANEL_MAX, Math.max(BOTTOM_PANEL_MIN, parsed))
      : 360;
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

  /**
   * @param {string} message
   * @param {string} [toneHint]
   * @param {{ silent?: boolean }} [options] silent keeps a routine message out
   *   of the toast stack — connecting and syncing happen constantly, and now
   *   that reconnects are automatic they are not worth interrupting for.
   */
  const setStatus = (message, toneHint, options = {}) => {
    if (!message || options.silent) return;
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

  // Only the visible pane's bytes are streamed; everything else arrives as the
  // much smaller terminal_status channel. Switching re-subscribes, and the
  // terminal component repaints from request_snapshot, so nothing is missed.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({ type: "subscribe_terminal", terminalId: activeTerminalId || null }),
    );
  }, [activeTerminalId, connectionState]);

  /**
   * Size the composer to its content: one line when empty, growing as the
   * draft does, and scrolling internally once it would take too much of the
   * panel. CSS alone cannot do this for a textarea — the height has to be
   * measured from scrollHeight.
   */
  const resizeComposer = useEffectEvent(() => {
    const el = composerInputRef.current;
    if (!el) return;
    // Collapse before measuring. Reading scrollHeight at height:auto reports
    // the element's current box when that exceeds the text, so an empty
    // composer would keep whatever height it last had.
    el.style.height = "0px";
    const content = el.scrollHeight;
    // Cap against the panel so a short panel keeps room for history. Computed
    // here rather than as a CSS percentage: a percentage resolves against a
    // parent this element sizes, which feeds back and runs away.
    const shell = composerShellRef.current;
    let cap = Math.max(
      COMPOSER_MIN_HEIGHT,
      Math.min(COMPOSER_MAX_HEIGHT, Math.round((shell?.clientHeight || 320) * 0.4)),
    );
    // Snap the cap down to a whole number of lines. Stopping mid-line leaves a
    // sliced row at the bottom edge, which reads as clipped rather than as
    // scrollable.
    const style = window.getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      const lines = Math.max(1, Math.floor((cap - padding) / lineHeight));
      // Ceil, not round: rounding down leaves the last line a fraction short,
      // which shows as a sliced row exactly like the mid-line stop it is meant
      // to avoid.
      cap = Math.max(COMPOSER_MIN_HEIGHT, Math.ceil(padding + lines * lineHeight));
    }
    el.style.height = `${Math.max(COMPOSER_MIN_HEIGHT, Math.min(content, cap))}px`;
  });

  useEffect(() => {
    resizeComposer();
  }, [composerText, resizeComposer]);

  // The first pass runs before layout has settled, and the cap depends on the
  // panel's height, which the operator can drag. Re-measure whenever the shell
  // changes size, and once more after the first frame.
  useEffect(() => {
    const shell = composerShellRef.current;
    const frame = requestAnimationFrame(() => resizeComposer());
    if (!shell || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(() => resizeComposer());
    observer.observe(shell);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [resizeComposer]);

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

  // The socket is rebuilt on demand rather than once per mount. A dropped
  // connection used to leave the page inert until a manual refresh, and it
  // drops for entirely routine reasons: `./run.sh` restarts the server, a
  // phone locks its screen and the browser suspends the tab, the network
  // switches between Wi-Fi and cellular, a laptop lid closes. None of those
  // mean anything is wrong — the tmux sessions carry on regardless.
  useEffect(() => {
    let disposed = false;
    let retryTimer = 0;
    let attempt = 0;

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      // Exponential backoff so a server that is genuinely down is not hammered,
      // capped low enough that coming back from a phone lock still feels quick.
      const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
      attempt += 1;
      // Jitter keeps several open tabs from retrying in lockstep.
      const wait = Math.round(base * (0.7 + Math.random() * 0.6));
      setConnectionState("reconnecting");
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        connect();
      }, wait);
    };

    /** Skip the backoff — used when something tells us the network is back. */
    const reconnectNow = () => {
      if (disposed) return;
      const current = socketRef.current;
      if (
        current &&
        (current.readyState === WebSocket.OPEN ||
          current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = 0;
      }
      attempt = 0;
      connect();
    };

    function connect() {
    if (disposed) return;
    const socket = new WebSocket(wsUrl());
    socketRef.current = socket;
    setStatus(t("wsConnecting"), "info", { silent: true });
    setConnectionState("connecting");

    socket.addEventListener("open", () => {
      attempt = 0;
      setConnectionState("open");
      setStatus(t("wsConnected"), "info", { silent: true });
    });

    socket.addEventListener("close", () => {
      if (disposed) return;
      setConnectionState("closed");
      scheduleReconnect();
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
          terminalApiRef.current?.appendOutput(
            message.projectId,
            message.terminalId,
            message.data || "",
          );
          break;
        }
        case "terminal_status": {
          setTerminalStatuses((prev) =>
            prev[message.terminalId] === message.status
              ? prev
              : { ...prev, [message.terminalId]: message.status },
          );
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

    }

    // A suspended tab's socket is often already dead by the time it is shown
    // again; both of these get the user back without waiting out the backoff.
    const onVisible = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reconnectNow);

    connect();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reconnectNow);
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, []);

  /**
   * Smallest bottom panel that still leaves the terminal fully visible.
   *
   * The pane is pinned to 80x24 and never resized (see the note on
   * _spawnTerminal), so the terminal has one natural height. Growing the area
   * beyond it only adds blank space, and the divider used to allow exactly
   * that; shrinking below it crops rows the operator then has to scroll the
   * surface to reach.
   */




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
        // A free range again: the terminal reflows to whatever height it is
        // given, so there is no size it must land on.
        const next = Math.min(
          BOTTOM_PANEL_MAX,
          Math.max(BOTTOM_PANEL_MIN, window.innerHeight - event.clientY),
        );
        setBottomPanelHeight(next);
      }
    };
    const onUp = () => {
      resizingRef.current = false;
      resizeTargetRef.current = null;
      document.body.classList.remove("is-resizing", "is-resizing-row", "is-resizing-col");
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
    // The bottom divider moves vertically; without this it showed the
    // left-right cursor while dragging, the opposite of what it does.
    document.body.classList.add(
      target === "bottom" ? "is-resizing-row" : "is-resizing-col",
    );
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

  // { start, end, query, index } while an "@..." token is under the caret.
  const [mentionMenu, setMentionMenu] = useState(null);

  const mentionTargets = useMemo(() => buildMentionTargets(projects, t), [projects, t]);
  const mentionAliases = useMemo(
    () => buildMentionAliases(mentionTargets),
    [mentionTargets],
  );
  const mentionMatches = useMemo(() => {
    if (!mentionMenu) return [];
    return mentionTargets.filter((target) =>
      matchesMentionQuery(target, mentionMenu.query),
    );
  }, [mentionMenu, mentionTargets]);
  const mentionActive = mentionMenu ? mentionMatches[mentionMenu.index] ?? null : null;

  // Recomputed from the caret rather than tracked incrementally: the caret can
  // move by click, arrow, or undo, and a menu that only followed typing would
  // keep offering completions for a token the reader has already left.
  // The token Escape was pressed on. Without it the keyup that follows the
  // Escape keydown re-opens the menu on the very same token, and dismissing
  // becomes impossible.
  const mentionDismissedRef = useRef(null);

  const syncMentionMenu = (element) => {
    if (!element) return;
    const next = findMentionQuery(element.value, element.selectionStart ?? 0);
    const dismissed = mentionDismissedRef.current;
    if (!next) mentionDismissedRef.current = null;
    else if (
      dismissed &&
      dismissed.start === next.start &&
      dismissed.query === next.query
    ) {
      setMentionMenu(null);
      return;
    } else {
      // Editing the token is a fresh request for suggestions.
      mentionDismissedRef.current = null;
    }
    setMentionMenu((current) => {
      if (!next) return null;
      // Same token, same query: keep whatever row the reader had highlighted.
      if (current && current.start === next.start && current.query === next.query) {
        return { ...current, end: next.end };
      }
      return { ...next, index: 0 };
    });
  };

  // Measured position for the portal below. The menu cannot live inside the
  // composer: the bottom panel clips its overflow, so an absolutely positioned
  // menu is cut off at the panel's top edge.
  const [mentionAnchor, setMentionAnchor] = useState(null);

  useLayoutEffect(() => {
    if (!mentionMenu) {
      setMentionAnchor(null);
      return;
    }
    const measure = () => {
      const field = composerInputRef.current?.parentElement;
      if (!field) return;
      const rect = field.getBoundingClientRect();
      setMentionAnchor({
        left: rect.left,
        width: rect.width,
        // Opens upward: the composer sits at the bottom of the window.
        bottom: window.innerHeight - rect.top + 8,
        maxHeight: Math.max(120, rect.top - 24),
      });
    };
    measure();
    // A fixed-position element does not follow the field on its own, so a
    // window resize would leave the menu behind at the old coordinates.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [mentionMenu, composerText, bottomPanelHeight, sidebarWidth]);

  const applyMention = (target, { keepOpen = false } = {}) => {
    if (!mentionMenu || !target) return;
    // Replaces only the name being typed. Names already settled ahead of it
    // in an "@one,two" token have to survive completing the next one.
    const before = composerText.slice(0, mentionMenu.segmentStart);
    const after = composerText.slice(mentionMenu.end);
    // A comma keeps the token open for another name; a space closes it, so
    // the menu does not immediately reopen on the handle just inserted.
    const insert = `${target.handle}${keepOpen ? "," : " "}`;
    setComposerText(`${before}${insert}${after}`);
    if (!keepOpen) setMentionMenu(null);
    const caret = before.length + insert.length;
    requestAnimationFrame(() => {
      const element = composerInputRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  };

  const sendComposer = () => {
    const mention = resolveMentionTargets(composerText, mentionAliases);
    const targets = mention?.targets ?? [];
    // The first name is the one the view follows: only one pane can be on
    // screen, and the first is the one the reader wrote down first.
    const lead = targets[0] ?? null;
    const fallbackReady = Boolean(activeProjectId && activeTerminalId);
    if (!lead && !fallbackReady) {
      setStatus(t("terminalHint"));
      return;
    }
    // Addressing a terminal is also how you move to it: the reply lands in
    // that pane, and reading it should not need a second trip to the sidebar.
    if (lead && (lead.projectId !== activeProjectId || lead.id !== activeTerminalId)) {
      setActiveProjectId(lead.projectId);
      setActiveTerminalId(lead.id);
    }
    const text = (mention ? stripMention(composerText, mention) : composerText).trim();
    if (!text) {
      // "@name" alone is a request to switch, not an empty message to send.
      setMentionMenu(null);
      if (!lead) return;
      setComposerText("");
      setStatus(t("mentionSwitched", { name: lead.label }));
      composerInputRef.current?.focus();
      return;
    }
    const recipients = targets.length
      ? targets
      : [{ projectId: activeProjectId, id: activeTerminalId }];
    for (const recipient of recipients) {
      send({
        type: "emit_event",
        projectId: recipient.projectId,
        event: {
          type: "user_message",
          from: "browser",
          to: recipient.id,
          text,
          appendEnter: true,
        },
      });
      send({
        type: "request_snapshot",
        projectId: recipient.projectId,
        terminalId: recipient.id,
      });
    }
    // Only one pane is visible, so a broadcast has to say out loud where the
    // other copies went.
    if (targets.length > 1) {
      setStatus(
        t("mentionBroadcast", { names: targets.map((one) => one.label).join("、") }),
      );
    }
    setComposerText("");
    setMentionMenu(null);
    // Sending is a deliberate move to the present, so it re-arms the follow
    // even if the reader had scrolled up: their own message, and the reply to
    // it, are what they now want to see.
    scrollHistoryToBottom();
    // Keep the caret here so a follow-up message can be typed straight away.
    // Sending requests a snapshot, and the terminal used to take focus when it
    // arrived; the guard above stops that, this makes the intent explicit.
    composerInputRef.current?.focus();
  };

  const handleComposerKeyDown = (event) => {
    // While the menu is open it owns the navigation keys. Enter completes the
    // mention instead of sending, which is the one place the two collide.
    if (mentionMenu && mentionMatches.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMentionMenu((current) =>
          current
            ? {
                ...current,
                index:
                  (current.index + step + mentionMatches.length) % mentionMatches.length,
              }
            : current,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        // Tab leaves the token open on a comma, so the next name can be picked
        // without retyping the "@".
        applyMention(mentionActive, { keepOpen: event.key === "Tab" });
        return;
      }
    }
    if (mentionMenu && event.key === "Escape") {
      event.preventDefault();
      mentionDismissedRef.current = {
        start: mentionMenu.start,
        query: mentionMenu.query,
      };
      setMentionMenu(null);
      return;
    }
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
  const historyRef = useRef(null);
  /** Mirrors historyAtBottom for effects that must not re-run when it flips. */
  const historyPinnedRef = useRef(true);
  /** Previous scrollTop, to tell a deliberate scroll from a container resize. */
  const historyLastTopRef = useRef(0);
  const [historyAtBottom, setHistoryAtBottom] = useState(true);
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

  /**
   * Pin the history to its end and record where that left it.
   *
   * Every programmatic scroll must update the remembered position, or the
   * next real scroll is compared against a stale one — a first scroll upward
   * was measured against 0 and read as moving *down*, so it never un-pinned.
   *
   * @param {HTMLElement | null} el
   */
  const pinHistoryToBottom = (el) => {
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    historyLastTopRef.current = el.scrollTop;
  };

  /**
   * Jump the history to its newest end.
   *
   * Instant, not smooth. Smooth scrolling is advisory — it is silently ignored
   * in some environments (observed here), and a follow that quietly does
   * nothing is worse than one without animation.
   */
  const scrollHistoryToBottom = () => {
    pinHistoryToBottom(historyRef.current);
    historyPinnedRef.current = true;
    setHistoryAtBottom(true);
  };

  /**
   * Follow new messages, but only while the reader is already at the bottom.
   *
   * This used to scroll unconditionally, so a message arriving while the
   * operator was reading further up yanked them back down mid-sentence.
   */
  useLayoutEffect(() => {
    if (!historyPinnedRef.current) return;
    const el = historyRef.current;
    if (!el) return;
    // Before paint, so the new message is never briefly visible below the fold.
    pinHistoryToBottom(el);
    // Again next frame: a bubble whose text wraps, or whose fonts settle late,
    // grows after this effect and would leave the tail cut off.
    const frame = requestAnimationFrame(() => {
      if (historyPinnedRef.current) pinHistoryToBottom(el);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeHistory]);

  /**
   * Re-evaluate the pinned state when the container resizes, not only when it
   * is scrolled.
   *
   * Growing the composer shrinks the history, which moves the bottom without
   * firing a scroll event — leaving the follow armed but the button's state
   * stale, or the view a little short of the end.
   */
  useEffect(() => {
    const el = historyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      // Next frame, not immediately: the composer's own auto-grow runs in a
      // separate effect, so the height can change once more after this fires
      // and measuring now lands a few pixels short of the end.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (historyPinnedRef.current) {
          pinHistoryToBottom(el);
          return;
        }
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        setHistoryAtBottom((current) => (current === atBottom ? current : atBottom));
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Switching project is a fresh conversation: always start at the newest end,
  // without the animation, and re-arm following.
  useEffect(() => {
    historyPinnedRef.current = true;
    setHistoryAtBottom(true);
    pinHistoryToBottom(historyRef.current);
  }, [activeProjectId]);

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
                                        className={`thread-dot ${terminalStatuses[terminal.id] || terminal.status || "idle"}`}
                                        title={t(
                                          `status_${terminalStatuses[terminal.id] || terminal.status || "idle"}`,
                                        )}
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
                  {/* Only shown when something is wrong: a healthy connection
                      needs no indicator, and reconnects are automatic. */}
                  {connectionState !== "open" ? (
                    <div className={`connection-pill ${connectionState}`}>
                      <span className="connection-dot" />
                      <span>{t(`conn_${connectionState}`)}</span>
                    </div>
                  ) : null}
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
                    {/* The form is a layout link, not just a wrapper: unstyled
                        it is a display:block box with min-height:auto, which
                        grows to the history's full height and breaks the chain
                        that keeps the composer pinned and the history scrolling. */}
                    <form
                      className="composer-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        sendComposer();
                      }}
                    >
                      <div className="composer-shell" ref={composerShellRef}>
                        <div
                          className="composer-history"
                          ref={historyRef}
                          aria-label={t("collaborationHistory")}
                          onScroll={(event) => {
                            const el = event.currentTarget;
                            // A few pixels of slack: sub-pixel heights rarely
                            // land exactly on zero.
                            const atBottom =
                              el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                            const movedUp = el.scrollTop < historyLastTopRef.current;
                            historyLastTopRef.current = el.scrollTop;
                            // Only a deliberate scroll away from the end stops
                            // the follow. Shrinking the container — which the
                            // composer does as it grows — pushes the bottom
                            // further down without the reader moving, and used
                            // to be read as "they scrolled up".
                            if (atBottom) historyPinnedRef.current = true;
                            else if (movedUp) historyPinnedRef.current = false;
                            const showJump = !atBottom && !historyPinnedRef.current;
                            setHistoryAtBottom((current) =>
                              current === !showJump ? current : !showJump,
                            );
                          }}
                        >
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
                        {/* Only while the reader has scrolled away from the
                            newest end; following is automatic otherwise. */}
                        {!historyAtBottom ? (
                          <button
                            type="button"
                            className="history-jump"
                            onClick={() => scrollHistoryToBottom()}
                          >
                            {t("jumpToLatest")}
                            <span aria-hidden="true">↓</span>
                          </button>
                        ) : null}

                        {/* The field wraps the textarea so controls can sit
                            inside it — send on the right today, attachments or
                            voice on the left later. */}
                        <div className="composer-field">
                        {/* Anchored to the field, opening upward: the composer
                            sits at the bottom of the window, so a menu that
                            dropped down would land off-screen. */}
                        {mentionMenu && mentionAnchor
                          ? createPortal(
                          <div
                            className="mention-menu"
                            role="listbox"
                            aria-label={t("mentionListLabel")}
                            style={{
                              left: `${mentionAnchor.left}px`,
                              width: `${mentionAnchor.width}px`,
                              bottom: `${mentionAnchor.bottom}px`,
                              maxHeight: `${mentionAnchor.maxHeight}px`,
                            }}
                          >
                            {mentionMatches.length ? (
                              <>
                                {mentionMatches.map((target, position) => (
                                  <button
                                    key={`${target.projectId}-${target.id}`}
                                    type="button"
                                    role="option"
                                    aria-selected={position === mentionMenu.index}
                                    className={`mention-item ${
                                      position === mentionMenu.index ? "active" : ""
                                    }`}
                                    // Keeps focus in the textarea, so the click
                                    // lands before a blur can close the menu.
                                    onMouseDown={(event) => event.preventDefault()}
                                    onMouseEnter={() =>
                                      setMentionMenu((current) =>
                                        current ? { ...current, index: position } : current,
                                      )
                                    }
                                    onClick={() => applyMention(target)}
                                  >
                                    <span
                                      className={`thread-dot ${
                                        terminalStatuses[target.id] || "idle"
                                      }`}
                                      aria-hidden="true"
                                    />
                                    <span className="mention-name">{target.label}</span>
                                    {target.cli ? (
                                      <span className="mention-cli">{target.cli}</span>
                                    ) : null}
                                    <span className="mention-handle">@{target.handle}</span>
                                    {projects.length > 1 ? (
                                      <span className="mention-project">
                                        {target.projectName}
                                      </span>
                                    ) : null}
                                  </button>
                                ))}
                                <div className="mention-hint">{t("mentionHint")}</div>
                              </>
                            ) : (
                              <div className="mention-empty">{t("mentionEmpty")}</div>
                            )}
                          </div>,
                          document.body,
                            )
                          : null}
                        <textarea
                          id="composer-input"
                          ref={composerInputRef}
                          rows={1}
                          className="composer-input"
                          value={composerText}
                          onChange={(event) => {
                            setComposerText(event.target.value);
                            syncMentionMenu(event.target);
                          }}
                          // The caret also moves by arrow, click, and undo, and
                          // the menu has to follow it, not only the typing.
                          onKeyUp={(event) => syncMentionMenu(event.currentTarget)}
                          onClick={(event) => syncMentionMenu(event.currentTarget)}
                          onBlur={() => setMentionMenu(null)}
                          aria-label={t("inputLabel")}
                          placeholder={t("inputPlaceholder")}
                          onKeyDown={handleComposerKeyDown}
                        />
                          <button
                            type="button"
                            className="composer-send"
                            onClick={sendComposer}
                            disabled={!composerText.trim()}
                            title={t("send")}
                            aria-label={t("send")}
                          >
                            <IconSend />
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
              modelOptions.length > MODEL_CHIP_LIMIT ? (
                <select
                  className="model-select"
                  aria-label={t("pickModel")}
                  value={newTerminalDialog.model || ""}
                  onChange={(event) =>
                    setNewTerminalDialog((prev) => ({ ...prev, model: event.target.value }))
                  }
                >
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                      {model.default ? ` · ${t("modelDefault")}` : ""}
                    </option>
                  ))}
                </select>
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
              )
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
