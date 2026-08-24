# AgentMux 技术架构

[English](AgentMux_Technical_Architecture_Documentation.md) · **简体中文**

## 1. 总览

AgentMux 是一个基于浏览器的终端编排界面，管理多个 tmux 支撑的 agent 会话。它组合了：

- tmux 负责执行
- Node.js + Express 作为控制面
- WebSocket 提供实时 UI 更新
- React 构建类桌面界面
- xterm.js 负责终端渲染

设计上把两件事分开：

- 执行面：真实的 tmux pane、手工终端输入、交互式 CLI
- 协作面：事件中心、按项目的历史、文件树、文件预览

支持三种 agent CLI —— Cursor Agent、Codex CLI、Claude Code —— 且**选择是按终端而非全局的**。同一个项目可以让不同 pane 同时跑不同的 CLI 和不同的模型。

## 2. 运行时模型

每个项目有：

- 一个项目根目录
- 一个或多个 tmux 支撑的终端，**每个固定使用创建时选定的 CLI 与模型**
- 一份持久化的项目历史
- 按项目的文件树视图
- 可选的文件预览面板

每个 tmux 会话通过 `tmux pipe-pane` 把输出写入日志文件。服务端把日志的增长推送到浏览器，并在切换终端时用 `tmux capture-pane` 做整帧刷新。

## 3. 通信模型

### 3.1 事件中心

所有协作消息都走服务端的事件中心：

- `user_message`
- `agent_reply`
- `done`
- `require_confirmation`
- `status`
- `message`，投递给另一个终端的文本
- `terminal_input`，裸键盘透传（不记为事件）

agent 通过 `agentmux` 命令发出这些事件。该命令在 spawn 时被放入 agent 的 `PATH`，身份信息从 bootstrap 环境变量读取。

事件会：

- 追加进项目历史
- 以 `bus_event` 广播给已连接的客户端
- 需要路由时，注入到目标终端

**先记录再路由**：没有目标的事件是给操作者看的上报——文档中 `done` 的标准形态就没有目标——必须进入事件日志。

### 3.2 手工终端输入

手工终端输入是直接的执行动作。它**刻意不镜像进历史**，除非 agent 显式发出一条结构化事件。

## 4. 终端输出流

当前实现：

1. tmux pane 的输出经管道写入每终端一个日志文件
2. 服务端用 `fs.watch` 加一个短轮询循环，从该文件读取新字节
3. 浏览器收到增量 `output` 消息，但**只针对它当前显示的终端**（`subscribe_terminal`）
4. 切换终端时，服务端基于 `tmux capture-pane -p -e -J` 发送 `terminal_snapshot`

为什么是这个模型：

- 保留增量输出以驱动实时 UI
- 避免重放破坏 alt-screen TUI
- 切换时仍能拿到完整终端状态

隐藏 pane 的字节对没在看它的客户端毫无用处（切过去时会整帧重绘），全量广播等于把流量乘以 pane 数量。

因此活动状态走一条独立且小得多的通道。服务端每秒对每个 pane 的渲染帧取哈希，**只在状态跳变时**发出 `terminal_status`（idle / working / waiting）。字节量无法胜任：空闲的 Claude Code pane 会持续重绘 TUI，而空闲的 Codex pane（`--no-alt-screen`）一个字节都不发。

## 5. 文件树与预览

右侧面板有两种模式：

- 仅文件树
- 文件树 + 预览

项目目录变化时会刷新文件树。服务端监视每个项目根目录，**仅在文件系统真正发生变化时**发出 `project_tree_changed`。

预览面板：

- 选中文件时打开
- `.md` 渲染为 Markdown
- 其他文件显示带行号的纯文本
- 当目录监视器报告当前项目有变化时刷新

## 6. 持久化

状态存放在 `~/.agentmux/`：

- `projects.json` —— 项目与终端状态（含每个终端的 CLI 与模型）以及项目历史
- `settings.json` —— UI 语言，以及新建终端时提供的默认值
- `bin/agentmux` —— 放入每个 agent `PATH` 的 CLI wrapper
- `~/.agentmux/projects/<projectId>/` 下的项目专属目录
- 每个 pane 的终端日志文件

终端日志是**传输缓冲，不是归档**。字节到达即推送，从不回放，因此文件有上限并会循环回收——否则一个空闲的 Claude Code pane 每天要写约 280MB。

重启后 UI 可从磁盘恢复。仍在的 tmux 会话被重新挂上；已消失的按各自创建时的 provider 重建。

## 7. 与初代 AgentMux 的对比

初代 AgentMux 强调：

- 多个固定角色
- task/result markdown 文件
- `worklog.md` 与 `project-history.md`
- 通过文件监视和 tmux 通知来编排

AgentMux 强调：

- 浏览器内按项目的协作历史
- 统一的事件总线
- 终端优先的执行面
- 在同一界面内浏览与预览项目文件

两者共享基于 tmux 的执行方式，但当前版本更偏 UI/事件驱动，对 task/result markdown 文件的依赖更少。

## 8. 小结

当前架构是：

- tmux 负责执行，也提供权威的当前帧
- 有上限的日志文件作为增量终端输出的传输载体
- `fs.watch` 负责目录/文件变更检测
- WebSocket 提供实时 UI 更新，终端字节限定于可见 pane，活动状态作为帧派生的信号单独传输
- 按项目的历史承载协作状态

这样既保留了手工使用终端的完整体验，又让协作消息与项目状态在整个 UI 中保持一致。
