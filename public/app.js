function main() {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;

  if (window.location.protocol === "file:") {
    statusEl.textContent =
      "请用浏览器打开 http://127.0.0.1:9988（或你配置的端口），不要双击打开本地 HTML 文件。";
    statusEl.classList.add("error");
    return;
  }

  const Terminal = window.Terminal;
  /** xterm-addon-fit UMD 把模块对象挂在 window.FitAddon，真正的类是 .FitAddon */
  const FitAddonCtor =
    typeof window.FitAddon === "function"
      ? window.FitAddon
      : window.FitAddon?.FitAddon;
  if (!Terminal || !FitAddonCtor) {
    statusEl.textContent =
      "未加载 xterm（请确认已 npm install，并由本服务提供 /vendor/xterm）。";
    statusEl.classList.add("error");
    return;
  }

  const cwdInput = document.getElementById("cwd");
  const countInput = document.getElementById("count");
  const btnLaunch = document.getElementById("btnLaunch");
  const btnAdd = document.getElementById("btnAdd");
  const btnShutdown = document.getElementById("btnShutdown");
  const tabsEl = document.getElementById("tabs");
  const terminalHost = document.getElementById("terminalHost");
  const eventLog = document.getElementById("eventLog");
  const evType = document.getElementById("evType");
  const evTo = document.getElementById("evTo");
  const evText = document.getElementById("evText");
  const evAppendEnter = document.getElementById("evAppendEnter");
  const btnEmit = document.getElementById("btnEmit");
  const curlHint = document.getElementById("curlHint");

  /** @type {WebSocket | null} */
  let ws = null;
  /** 递增，用于忽略旧 WebSocket 的 close/open */
  let wsGen = 0;

  /** @type {string | null} */
  let groupId = null;
  /** @type {string} */
  let eventToken = "";
  /** @type {string} */
  let eventHttpUrl = "";
  /** @type {{ id: string, index: number }[]} */
  let terminals = [];
  /** @type {string | null} */
  let activeId = null;

  /** @type {Map<string, string>} */
  const scrollback = new Map();

  /** @type {InstanceType<typeof Terminal> | null} */
  let term = null;
  let fit = null;

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("error", isError);
  }

  function refreshEvToSelect() {
    if (!evTo) return;
    evTo.innerHTML = "";
    for (const t of terminals) {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `终端 ${t.index + 1}`;
      evTo.appendChild(opt);
    }
  }

  function updateCurlHint() {
    if (!curlHint || !groupId) return;
    const first = terminals[0]?.id ?? "amux_…";
    const tok = eventToken || "(启动后显示 token)";
    const url = eventHttpUrl || `${window.location.origin}/api/events`;
    curlHint.textContent = `curl -sS -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "X-AgentMux-Token: ${tok}" \\
  -d '{"groupId":"${groupId}","type":"done","from":"${first}","payload":{}}'`;
  }

  function appendEventLog(ev) {
    if (!eventLog) return;
    const line = JSON.stringify(ev);
    const next = (eventLog.textContent ? `${eventLog.textContent}\n` : "") + line;
    eventLog.textContent = next.slice(-12000);
    eventLog.scrollTop = eventLog.scrollHeight;
  }

  function wsUrl() {
    const u = new URL(window.location.href);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws";
    u.search = "";
    u.hash = "";
    return u.toString();
  }

  function ensureTerm() {
    if (term) return;
    term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
      },
    });
    fit = new FitAddonCtor();
    term.loadAddon(fit);
    term.open(terminalHost);
    term.onData((data) => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !activeId) return;
      ws.send(
        JSON.stringify({
          type: "input",
          terminalId: activeId,
          data,
        }),
      );
    });
    const ro = new ResizeObserver(() => {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(terminalHost);
    window.addEventListener("resize", () => {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
    });
    queueMicrotask(() => {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
    });
  }

  function renderActive() {
    ensureTerm();
    if (!term || !fit) return;
    term.reset();
    const buf = activeId ? scrollback.get(activeId) ?? "" : "";
    term.write(buf);
    try {
      fit.fit();
    } catch {
      /* ignore */
    }
  }

  function setActive(id) {
    activeId = id;
    document.querySelectorAll(".tab").forEach((el) => {
      el.classList.toggle("active", el.dataset.tid === id);
    });
    renderActive();
  }

  function appendOutput(terminalId, data) {
    const prev = scrollback.get(terminalId) ?? "";
    const next = prev + data;
    const max = 512 * 1024;
    scrollback.set(
      terminalId,
      next.length > max ? next.slice(-max) : next,
    );
    if (terminalId === activeId && term) {
      term.write(data);
    }
  }

  function renderTabs() {
    tabsEl.innerHTML = "";
    for (const t of terminals) {
      const tab = document.createElement("div");
      tab.className = "tab";
      tab.dataset.tid = t.id;
      if (t.id === activeId) tab.classList.add("active");

      const label = document.createElement("span");
      label.textContent = `终端 ${t.index + 1}`;
      tab.appendChild(label);

      const close = document.createElement("button");
      close.type = "button";
      close.className = "close";
      close.setAttribute("aria-label", "关闭");
      close.textContent = "×";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "close", terminalId: t.id }));
        }
      });
      tab.appendChild(close);

      tab.addEventListener("click", () => setActive(t.id));
      tabsEl.appendChild(tab);
    }

    if (terminals.length && !terminals.some((x) => x.id === activeId)) {
      setActive(terminals[0].id);
    }
    if (!terminals.length) {
      activeId = null;
      if (term) term.reset();
    }
    refreshEvToSelect();
  }

  /**
   * @param {() => void} [onOpen]
   */
  function connect(onOpen) {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    const gen = ++wsGen;
    const socket = new WebSocket(wsUrl());
    ws = socket;

    socket.addEventListener("open", () => {
      if (gen !== wsGen) return;
      setStatus("已连接，正在创建 tmux 会话…");
      onOpen?.();
    });

    socket.addEventListener("close", () => {
      if (gen !== wsGen) return;
      setStatus("连接已断开（未预期断开时，tmux 会话可能已被服务端清理）");
      groupId = null;
      terminals = [];
      activeId = null;
      eventToken = "";
      eventHttpUrl = "";
      scrollback.clear();
      if (eventLog) eventLog.textContent = "";
      btnAdd.disabled = true;
      btnShutdown.disabled = true;
      renderTabs();
      if (term) term.reset();
    });

    socket.addEventListener("message", (ev) => {
      if (gen !== wsGen) return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "ready":
          groupId = msg.groupId;
          eventToken = String(msg.eventToken ?? "");
          eventHttpUrl = String(msg.eventHttpUrl ?? "");
          terminals = (msg.terminals || []).map((x) => ({
            id: x.id,
            index: x.index,
          }));
          scrollback.clear();
          for (const t of terminals) scrollback.set(t.id, "");
          btnAdd.disabled = false;
          btnShutdown.disabled = false;
          setStatus(
            `就绪 · ${msg.terminals?.length ?? 0} 个会话 · agent: ${msg.agentBin ?? "agent"}`,
          );
          renderTabs();
          updateCurlHint();
          break;
        case "terminal_added": {
          const t = msg.terminal;
          if (!t) break;
          terminals.push({ id: t.id, index: t.index });
          scrollback.set(t.id, "");
          setStatus(`已新增终端 ${t.index + 1}`);
          renderTabs();
          setActive(t.id);
          updateCurlHint();
          break;
        }
        case "terminal_closed": {
          const closed = msg.terminalId;
          scrollback.delete(closed);
          terminals = terminals.filter((x) => x.id !== closed);
          if (activeId === closed) activeId = null;
          renderTabs();
          if (terminals.length) {
            setActive(terminals[0].id);
          }
          updateCurlHint();
          break;
        }
        case "output":
          appendOutput(msg.terminalId, msg.data ?? "");
          break;
        case "bus_event":
          appendEventLog(msg.event ?? {});
          break;
        case "error":
          setStatus(msg.message || "错误", true);
          break;
        case "shutdown_ok":
          groupId = null;
          terminals = [];
          activeId = null;
          eventToken = "";
          eventHttpUrl = "";
          scrollback.clear();
          if (eventLog) eventLog.textContent = "";
          btnAdd.disabled = true;
          btnShutdown.disabled = true;
          renderTabs();
          setStatus("已关闭全部 tmux 会话");
          break;
        default:
          break;
      }
    });

    socket.addEventListener("error", () => {
      if (gen !== wsGen) return;
      setStatus(
        `WebSocket 无法连接 ${wsUrl()}。请确认已在项目目录运行 ./run.sh 或 npm start，并用同一地址打开本页。`,
        true,
      );
    });
  }

  btnLaunch.addEventListener("click", () => {
    const cwd = (cwdInput.value || "").trim();
    const count = Math.min(16, Math.max(1, Number(countInput.value) || 1));
    const payload = {
      type: "start",
      count,
      ...(cwd ? { cwd } : {}),
    };

    setStatus("正在连接 WebSocket…");

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return;
    }
    connect(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    });
  });

  btnAdd.addEventListener("click", () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "add" }));
  });

  btnShutdown.addEventListener("click", () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "shutdown" }));
  });

  if (btnEmit) {
    btnEmit.addEventListener("click", () => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !groupId) return;
      const type = (evType && evType.value.trim()) || "event";
      const to = evTo && evTo.value ? String(evTo.value) : undefined;
      const textRaw = evText ? evText.value : "";
      const appendEnter = !!(evAppendEnter && evAppendEnter.checked);
      /** @type {Record<string, unknown>} */
      const event = { type };
      if (to) event.to = to;
      if (textRaw.length) {
        event.text = textRaw;
        event.appendEnter = appendEnter;
      }
      ws.send(JSON.stringify({ type: "emit_event", event }));
    });
  }

  window.addEventListener("beforeunload", () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "shutdown" }));
      } catch {
        /* ignore */
      }
      ws.close();
    }
  });

  setStatus('点击「启动」创建 tmux 会话并运行 agent');
}

try {
  main();
} catch (e) {
  const el = document.getElementById("status");
  if (el) {
    el.textContent = `初始化失败：${e?.message || e}`;
    el.classList.add("error");
  }
}
