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
    const url = `${window.location.origin}/api/events`;
    curlHint.textContent = `curl -sS -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -H "X-AgentMux-Token: ${tok}" \\
  -d '{"groupId":"${groupId}","type":"done","from":"${first}","payload":{}}'`;
  }

  const EVENT_LOG_MAX_ENTRIES = 80;

  function truncateText(s, max) {
    const t = String(s);
    return t.length <= max ? t : `${t.slice(0, max)}…`;
  }

  /** @param {string} sessionId */
  function terminalLabel(sessionId) {
    if (sessionId === "browser") return "浏览器";
    if (sessionId === "http") return "HTTP";
    const t = terminals.find((x) => x.id === sessionId);
    if (t) return `终端 ${t.index + 1}`;
    const m = String(sessionId).match(/_(\d+)$/);
    if (m) return `终端 ${Number(m[1]) + 1}`;
    return truncateText(sessionId, 28);
  }

  /**
   * @param {Record<string, unknown>} ev
   * @returns {{ timeStr: string, meta: string, body: string }}
   */
  function summarizeBusEvent(ev) {
    const ts = typeof ev.ts === "number" ? ev.ts : Date.now();
    const timeStr = new Date(ts).toLocaleString("zh-CN", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const type = String(ev.type ?? "event");
    const from = ev.from != null ? String(ev.from) : "";
    const fromL = terminalLabel(from);

    const payload =
      ev.payload && typeof ev.payload === "object"
        ? /** @type {Record<string, unknown>} */ (ev.payload)
        : null;

    if (type === "done") {
      const p = payload || {};
      const line =
        (p.result != null && String(p.result)) ||
        (p.summary != null && String(p.summary)) ||
        (p.message != null && String(p.message)) ||
        "";
      return {
        timeStr,
        meta: `${type} · ${fromL}`,
        body: line || "（完成，无摘要）",
      };
    }

    if (type === "require_confirmation") {
      const p = payload || {};
      const q =
        (p.question != null && String(p.question)) ||
        (p.message != null && String(p.message)) ||
        "";
      return {
        timeStr,
        meta: `${type} · ${fromL}`,
        body: q || "需要确认",
      };
    }

    if (type === "ping" && from === "browser") {
      const to = ev.to != null ? String(ev.to) : "";
      const toL = to ? terminalLabel(to) : "全部";
      const text = ev.text != null ? String(ev.text) : "";
      return {
        timeStr,
        meta: `浏览器 → ${toL}`,
        body: text ? truncateText(text, 220) : "（无注入文本，仅广播）",
      };
    }

    if (payload && Object.keys(payload).length) {
      const parts = [];
      for (const [k, v] of Object.entries(payload)) {
        parts.push(`${k}: ${truncateText(String(v), 140)}`);
      }
      return {
        timeStr,
        meta: `${type} · ${fromL}`,
        body: parts.join("\n"),
      };
    }

    if (ev.text != null && String(ev.text)) {
      return {
        timeStr,
        meta: `${type} · ${fromL}`,
        body: truncateText(String(ev.text), 220),
      };
    }

    return {
      timeStr,
      meta: `${type} · ${fromL}`,
      body: "（无附加内容）",
    };
  }

  function appendEventLog(ev) {
    if (!eventLog) return;
    const { timeStr, meta, body } = summarizeBusEvent(ev);
    const entry = document.createElement("div");
    entry.className = "event-log-entry";
    const metaRow = document.createElement("div");
    metaRow.className = "event-log-meta";
    const timeEl = document.createElement("span");
    timeEl.className = "event-log-time";
    timeEl.textContent = timeStr;
    const typeEl = document.createElement("span");
    typeEl.className = "event-log-type";
    typeEl.textContent = meta;
    metaRow.append(timeEl, typeEl);
    const bodyEl = document.createElement("div");
    bodyEl.className = "event-log-body";
    bodyEl.textContent = body;
    entry.append(metaRow, bodyEl);
    eventLog.prepend(entry);
    while (eventLog.children.length > EVENT_LOG_MAX_ENTRIES) {
      eventLog.removeChild(eventLog.lastChild);
    }
    eventLog.scrollTop = 0;
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
      scrollback.clear();
      if (eventLog) eventLog.replaceChildren();
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
          scrollback.clear();
          if (eventLog) eventLog.replaceChildren();
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
    btnEmit.addEventListener("click", async () => {
      if (!groupId || !eventToken) {
        setStatus("请先启动会话（事件需要 token）", true);
        return;
      }
      const type = (evType && evType.value.trim()) || "event";
      const to = evTo && evTo.value ? String(evTo.value) : undefined;
      const textRaw = evText ? evText.value : "";
      const appendEnter = !!(evAppendEnter && evAppendEnter.checked);
      /** @type {Record<string, unknown>} */
      const body = { groupId, type, from: "browser" };
      if (to) body.to = to;
      if (textRaw.length) {
        body.text = textRaw;
        body.appendEnter = appendEnter;
      }
      try {
        const r = await fetch("/api/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AgentMux-Token": eventToken,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          let detail = r.statusText;
          try {
            const j = await r.json();
            if (j && j.error) detail = String(j.error);
          } catch {
            /* ignore */
          }
          setStatus(`发送失败 HTTP ${r.status}: ${detail}`, true);
        }
      } catch (e) {
        setStatus(`发送失败：${e?.message || e}`, true);
      }
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
