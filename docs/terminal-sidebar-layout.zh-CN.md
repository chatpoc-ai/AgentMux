# 左侧终端列表 + 右侧主终端区：详细实现说明（历史文档）

**简体中文** · This historical document is Chinese-only; see [`Project_Architecture.md`](./Project_Architecture.md) for the current architecture in English.

> ## ⚠️ 这是一份历史文档，不要照着改代码
>
> 本文写于界面还是 `public/` 下原生 JS 的时期，通篇讲的是修改
> `public/index.html`、`public/styles.css`、`public/app.js` 以及
> `#tabs` / `#terminalHost` 这些 DOM 节点。
>
> **这套实现已被 React 取代**。当前界面全部在 [`src/App.jsx`](../src/App.jsx)，
> 侧栏与终端区的实际布局在那里，样式在 [`src/styles.css`](../src/styles.css)。
> `src/App.jsx` 对本文提到的 DOM id **没有任何引用**。
>
> `public/` 目录目前是遗留文件：Vite 会把它复制进 `dist/`，但页面入口是
> React 构建产物，那几个文件不会被加载。
>
> 保留本文是因为 §8 记录了迁移到 React 时的对照与注意事项，仍有参考价值。
> 若只想了解当前架构，请读 [`Project_Architecture.zh-CN.md`](./Project_Architecture.zh-CN.md)。

---

目标（当时）：**新建的 tmux 终端出现在左侧列表**；**右侧最大区域只显示当前选中会话的 xterm**。后端 WebSocket / tmux 协议 **不必改**；改动集中在 `public/index.html`、`public/styles.css`，`public/app.js` 仅在有新 DOM 需求时小改。

下文默认你已读过当前结构：`#tabs` 里动态插入 `.tab`，`#terminalHost` 挂 **单个** `Terminal` 实例，`scrollback` 按 `terminalId` 存缓冲（见 `renderTabs`、`setActive`、`appendOutput`、`ensureTerm`）。

---

## 1. 当前结构 vs 目标结构

### 1.1 现在（实现参考）

| 区域 | 文件中的节点 | 行为 |
|------|----------------|------|
| 顶栏 | `header.top` | cwd、数量、启动/新增/关闭 |
| 终端「标签」 | `nav#tabs.tabs` | **横向** flex + wrap，每项 `.tab` |
| 主区 | `main.main` → `.split` | 左 `#terminalHost`，右 `aside.event-panel` |
| 状态 | `#status` | 连接状态等 |

`app.js` 里 `tabsEl = document.getElementById("tabs")`，`terminalHost = document.getElementById("terminalHost")`。只要 **id 不变**，逻辑可原样复用。

### 1.2 目标

- 顶栏：保留（可略减垂直 padding）。
- **中间整块**改为 **左右两栏**：
  - **左栏**：标题「终端」+ **竖向** `#tabs`（可滚动）。
  - **右栏**：上为 **终端**（`flex:1` 吃满高度），下或侧为 **事件总线**（见 §4.3）。
- 底栏 `#status`：保留在 `main` 底部或全宽最下。

---

## 2. `index.html`：推荐 DOM（可直接按此改）

原则：**保留现有 id**（`cwd`、`count`、`btnLaunch`、`tabs`、`terminalHost`、`eventLog`、`status` 等），避免大改 `app.js`。

下面是一版 **与现有 id 对齐** 的骨架（省略与现有一致的 `script`/`link` 头尾，只展示 `body` 内从顶栏以下的重组思路）：

```html
<body>
  <header class="top">
    <!-- 与现有一致：h1、.controls、.hint -->
  </header>

  <main class="main">
    <div class="app-body">
      <!-- 可选：最左图标栏，见 §7 -->
      <!-- <nav class="icon-rail" aria-label="快捷">...</nav> -->

      <aside class="sidebar" aria-label="终端列表">
        <div class="sidebar-header">
          <h2 class="sidebar-title">终端</h2>
          <!-- 可选：与顶栏重复的「新增」可放这里，需额外绑 JS -->
        </div>
        <nav id="tabs" class="tabs tab-list" aria-label="终端会话"></nav>
      </aside>

      <section class="workspace" aria-label="工作区">
        <div class="terminal-pane">
          <div id="terminalHost"></div>
        </div>

        <aside class="event-panel" aria-label="事件总线">
          <!-- 与现有一致：#eventLog、表单、details 等 -->
        </aside>
      </section>
    </div>

    <div id="status" class="status" role="status"></div>
  </main>

  <!-- script 与现有一致 -->
</body>
```

**注意：**

- 原先 `#tabs` 在 `header` 与 `main` 之间；改后放进 `aside.sidebar`。**id 仍为 `tabs`**，`app.js` 无需改获取方式。
- `terminalHost` 外包一层 `.terminal-pane` 便于 **单独做 flex 与 min-height**，`ResizeObserver` 仍观察 `#terminalHost` 即可（与现有一致），或改为观察 `.terminal-pane`（二选一，见 §5）。

---

## 3. `styles.css`：具体规则

以下数值与仓库里现有暗色主题（`#0d1117`、`#161b22`、`#30363d`、`#388bfd`）一致，可按观感微调。

### 3.1 全页与 `main`

在现有 `body { display: flex; flex-direction: column; min-height: 100vh; }` 基础上，保证 **主内容区可收缩**：

```css
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0; /* 关键：允许子项低于内容高度 */
}

.app-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden; /* 避免双滚动条；列表用内部滚动 */
}
```

### 3.2 左侧栏 `.sidebar`

```css
.sidebar {
  flex: 0 0 260px; /* 固定宽；可改为 minmax(220px, 28vw) 需 grid，见下 */
  max-width: min(320px, 40vw);
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid #30363d;
  background: #0d1117;
}

.sidebar-header {
  flex-shrink: 0;
  padding: 10px 12px;
  border-bottom: 1px solid #30363d;
}

.sidebar-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
```

### 3.3 竖向 `#tabs` 与 `.tab`

**替换**原 `.tabs` 的横向规则，改为：

```css
.tabs.tab-list {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* 去掉原 min-height: 44px 的「横条」感 */
}

.tab {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: #161b22;
  color: #c9d1d9;
  font-size: 0.875rem;
  cursor: pointer;
  text-align: left;
  min-height: 40px;
}

.tab span:first-of-type {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**关闭按钮**：现有 `.tab .close` 可保留；整行点击仍由 `tab.addEventListener("click", () => setActive(t.id))` 处理，关闭钮 **`stopPropagation`** 已存在，无需改逻辑。

### 3.4 右侧 `.workspace` 与 `#terminalHost`

```css
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.terminal-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 12px 0;
}

#terminalHost {
  flex: 1;
  min-height: 240px;
  min-width: 0;
  /* 原 padding 若写在 #terminalHost 上，可迁到 .terminal-pane */
}

#terminalHost .xterm {
  height: 100%;
}
```

### 3.5 事件面板 `.event-panel`（竖版主区内的两种摆法）

**方案 A — 终端与事件上下叠（适合「右侧全给终端」+ 事件在下方）**

```css
.event-panel {
  flex: 0 0 auto;
  max-height: min(40vh, 420px);
  min-height: 160px;
  border-left: none;
  border-top: 1px solid #30363d;
  overflow: auto;
}
```

**方案 B — 终端左、事件右（宽屏三栏：侧栏 | 终端 | 事件）**

把 `.workspace` 改成 `flex-direction: row`，`.terminal-pane` `flex:1`，`.event-panel` `flex:0 0 300px; max-height:none; border-top:none; border-left:1px solid #30363d`，并去掉 `max-height: min(70vh, 560px)` 这类限制，避免终端被压得过扁。

选型建议：先 **方案 A** 改动小；若事件区很少用，可加 **折叠**（`<details>` 或按钮切换 `.event-panel.collapsed { max-height: 36px; }` 仅露标题条）。

---

## 4. `app.js`：哪些要动、哪些不要动

### 4.1 一般 **不需要** 改的

| 内容 | 原因 |
|------|------|
| `tabsEl`、`terminalHost` 的 `getElementById` | id 保留 |
| `renderTabs()` 内创建 `.tab`、`dataset.tid`、`setActive`、关闭发 `close` | 行为不变 |
| `setActive` 里 `document.querySelectorAll(".tab")` | class 仍为 `tab` |
| `ensureTerm()` 里 `term.open(terminalHost)`、`ResizeObserver` 观察 `terminalHost` | 节点仍在 |
| `appendOutput`、`scrollback`、`ws` 消息处理 | 与布局无关 |

### 4.2 建议 **检查** 的点

1. **`setActive` 与 DOM 顺序**  
   仅当把 **标题**「终端」等放在 `#tabs` **内部** 时，不要用「`#tabs` 的第一个孩子」这种假设；当前实现是 `renderTabs` **清空并只插入 `.tab`**，无此问题。

2. **列表项文案**  
   `renderTabs` 里 `label.textContent = \`终端 ${t.index + 1}\``（约 319 行）。若要副标题（例如 cwd 缩写），需服务端是否在 `terminals` 消息里带 `cwd`；没有则只能显示序号或 `id` 前 8 位。可加：  
   `subtitle.className = "tab-sub"` + CSS 小号灰色一行。

3. **空列表**  
   `terminals.length === 0` 时 `#tabs` 为空，右侧 xterm 会 `reset()`。可选：在 `renderTabs` 末尾若 `terminals.length === 0`，插入一条 **占位** `div.tab-empty`（非 `.tab`），避免侧栏完全空白；**不要**给占位加 `.tab`，否则 `querySelectorAll(".tab")` 会混入。

### 4.3 `ResizeObserver`（约 252–259 行）

当前：

```javascript
const ro = new ResizeObserver(() => {
  try {
    fit?.fit();
  } catch {
    /* ignore */
  }
});
ro.observe(terminalHost);
```

侧栏宽度变化时，**右侧** `#terminalHost` 宽度会变，Observer 会触发，`fit()` 正确。若终端高度仍不对，再让 `.terminal-pane` 参与 flex 链并确认 **`min-height: 0`** 已加到 `.workspace` / `.terminal-pane`。

可选增强：`ro.observe(terminalPane)`（需 `const terminalPane = document.querySelector(".terminal-pane")` 或在 HTML 给 pane 加 id），**同时 observe 两个** 一般不必，保留 `terminalHost` 即可。

---

## 5. xterm 行为与主题

`ensureTerm` 里主题（约 234–237 行）与 `body` 背景 `#0d1117` 一致。若侧栏用略浅/略深背景，**不必**改 xterm 背景；若右主区单独换色，可把 `theme.background` 改成与 `.terminal-pane` 一致。

字体行高：侧栏变窄不影响 xterm；**列数** 由 `fit` 根据 `#terminalHost` 宽度计算，侧栏固定宽后，**主区变窄**，列数减少属正常现象。

---

## 6. 无障碍与键盘（可选增强）

- `nav#tabs`：已有 `aria-label`；可为当前项加 `aria-current="true"`（在 `setActive` 里对选中 `.tab` 设置，其余移除）。
- **方向键切换会话**：在 `tabsEl` 上监听 `keydown`，对 `.tab` 做 `roving tabindex` 或 focus 下一项，属于体验增强，非必须。

---

## 7. 可选：最左「图标栏」

与 Cursor 类似：再窄一列 **仅图标**，宽度 `48px`～`52px`，`flex-shrink: 0`，`border-right`。HTML 放在 `.app-body` 最前：

```html
<nav class="icon-rail" aria-label="快捷操作">
  <!-- 占位按钮，后续再接路由/设置 -->
</nav>
```

```css
.icon-rail {
  flex: 0 0 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 8px;
  border-right: 1px solid #30363d;
  background: #161b22;
}
```

**与终端列表无关**；`#tabs` 仍在 `.sidebar` 内。

---

## 8. 用 React 重做同一布局时的对照

若后续用 Vite + React，**逻辑仍是一份**：`terminals[]`、`activeId`、单例 `Terminal` + `Map` 滚动缓冲。

### 8.1 组件拆分建议

- `AppShell`：`header` + `main` 内 `.app-body`。
- `TerminalSidebar`：渲染列表；props：`terminals`、`activeId`、`onSelect(id)`、`onClose(id)`。
- `TerminalView`：一个 `div ref={hostRef}`，`useEffect` 里 `new Terminal` + `FitAddon` + `ResizeObserver(hostRef.current)`，cleanup 里 `term.dispose()`。
- `EventPanel`：现有表单 + `#eventLog` 对应 state。

### 8.2 严格注意

- `Terminal` 实例放 **`useRef`**，不要 `useState(term)`。
- 父组件重渲染时 **不要** 无条件 `new Terminal`；`useEffect(..., [])` 只执行一次。
- 切换 `activeId`：子组件或 hook 里 `term.reset()` + 写入 `scrollback.get(activeId)`，与 `renderActive` 相同。

### 8.3 开发时代理 WebSocket（示例）

`vite.config.js` 片段（端口与 `server/index.js` 的 `PORT` 一致，默认 9988）：

```javascript
export default {
  server: {
    proxy: {
      "/ws": { target: "ws://127.0.0.1:9988", ws: true },
      "/api": "http://127.0.0.1:9988",
    },
  },
};
```

生产构建仍可由 Express 托管 `dist`，或同源部署。

---

## 9. 验收清单（自测）

- [ ] 启动多终端后，**左侧列表纵向增加**，顺序与 `terminals` 一致。
- [ ] 点击某项，**仅右侧**显示对应会话内容；输入进入对应 tmux。
- [ ] 拖动窗口宽度、出现/消失滚动条时，**xterm 自动 reflow**，无大面积裁切。
- [ ] 关闭某会话：列表项消失，若关的是当前项，**自动切到另一项**（现有逻辑已处理 `activeId` 失效）。
- [ ] 断开 WebSocket：列表清空，终端 reset，与现有一致。
- [ ] 事件面板折叠/展开后，终端区高度变化，`fit` 仍正常（若做了折叠）。

---

## 10. 相关文件索引

| 文件 | 内容 |
|------|------|
| `public/index.html` | 侧栏 / 工作区 DOM |
| `public/styles.css` | `.app-body`、`.sidebar`、`.tabs`、`.workspace`、`.terminal-pane` |
| `public/app.js` | `renderTabs`、`setActive`、`ensureTerm`、`terminalHost` |
| `server/index.js` | 静态目录 `public`、WebSocket `/ws`；纯 UI 重构 **通常不修改** |

---

## 11. 小结

- **核心**：把 `#tabs` 放进左侧 **竖向滚动** 容器，右侧 **flex 列** 里让 `#terminalHost` 占满剩余高度；**整条链 `min-height: 0`**。
- **逻辑**：保持 `id` 与 `.tab` / `dataset.tid`，`app.js` 可基本不动。
- **事件区**：先 **上下叠** 最快；再按需改三栏或折叠。

按 §2–§3 改完 HTML/CSS 后，若出现异常，优先检查 **flex 子项是否缺少 `min-height: 0`** 与 **`#tabs` 的 `overflow-y: auto`**。
