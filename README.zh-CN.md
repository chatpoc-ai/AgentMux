# AgentMux

[English](README.md) · **简体中文**

一个浏览器界面，让多个 agent CLI 并排运行，每个跑在自己的 tmux 会话里。指定一个目录建项目，开一个终端，选它用哪家 CLI —— Cursor Agent、Codex CLI 或 Claude Code —— 然后在同一个页面里驱动它们全部，包括用同网段的手机。

**同一个项目里的终端可以跑不同的 CLI 和不同的模型**，这正是它的意义：一个 pane 跑 Claude，一个跑 Codex，一个跑 Cursor，同时在一个仓库里干活。

## 为什么要同时跑多个

**两份固定订阅比一份按量计费更便宜。** Claude Code 包含在 Claude Pro 里，[每月 $20](https://claude.com/pricing)；Codex 包含在 ChatGPT Plus 里，[每月 $20](https://learn.chatgpt.com/docs/pricing)。而在 Cursor 里，Claude、GPT 这类第三方模型从独立的额度池扣费，按"模型的 API 原价"计费，Cursor 自己的文档写着每日重度 agent 用户的用量花费是[每月 $60–100](https://cursor.com/docs/account/pricing)，这还不含席位费。四十美元封顶，对二十美元加一个会浮动的数。

按量计费还意味着账单取决于**工具发出多少 token**，而不只取决于哪个模型在回答——两个工具指向同一个模型，同样的任务花费可能相差很大。有一次[公开对比](https://www.futureproofing.dev/resources/ai-native-team/claude-code-vs-cursor-token-efficiency-2026)在同一个 Next.js 项目上测得：Claude Code 用了 33K token，Cursor Agent 用了 188K。请连同原作者的保留一起看——那是单次非受控测试，而且两边分别跑在 Opus 和 GPT-5 上，模型差异和工具差异混在一起。

**一边被限流不等于全部停摆。** 两家订阅都按滚动窗口计量并有周配额——Codex 会把自己的剩余额度直接打在状态栏上。旁边那个 pane 里已经跑着另一个 CLI，撞到窗口时只是换个 pane，而不是停下来。

**模型之间并不等价。** 让它们并排待在同一个仓库里，就能各自做擅长的事；拿不准的问题可以换一个再问一遍，不用重新交代项目背景。

这些都不需要这个应用——开两个 tmux 窗口一样能做。真正麻烦的是**盯着它们**：终端在手机上没法读，几个 pane 一起跑之后，谁在干活、谁在等你、各自做过什么，都不再一目了然。AgentMux 解决的是这一部分。

## 环境要求

- **tmux** —— 每个终端就是一个 tmux 会话
- **Node.js 18+** —— 无原生模块，`npm install` 不需要编译工具链
- `PATH` 中至少有一个 agent CLI：`agent`（Cursor）、`codex`、`claude`

macOS 和 Linux 都能跑。`run.sh` 用 `lsof` 清理端口，部分精简 Linux 镜像未预装 —— `apt install lsof`，或者直接 `node server/index.js` 启动。

## 启动

```bash
npm install
./run.sh
```

然后打开 <http://127.0.0.1:9988>。`run.sh` 会停掉旧实例、重新构建前端、后台启动服务；改完代码重跑这一条即可。停止用 `kill $(cat .agentmux.pid)`。

## 安全

**Web UI 没有任何鉴权**，而且 `HOST` 默认是 `0.0.0.0`。也就是说，能访问到这个端口的人就能拿到你机器上的一个终端 —— 而且里面的 agent 是以自动批准模式启动的。`X-AgentMux-Token` 只保护 agent 面向的 HTTP 接口，且默认值是个占位符。

在可信网络之外运行前，请至少做到：

- 绑定回环地址（`HOST=127.0.0.1`），通过 SSH 隧道或 Tailscale 之类的私有网络访问，或在前面套一层带鉴权的反向代理
- 把 `AGENTMUX_TOKEN` 改成你自己的值

## `agentmux` 命令

agent 的 `PATH` 里会有一个 `agentmux` 命令，通过环境变量连到正在运行的服务，用来上报进度和驱动其他 pane：

```bash
agentmux event  --type done --summary "测试全绿。下一步：无。"
agentmux run    --to "Agent 2" --cmd "npm test"   # 往另一个 pane 输入命令
agentmux output --to "Agent 2" --lines 80         # 读回那个 pane 的输出
agentmux interrupt --to "Agent 2"
agentmux message --to "Agent 2" --body -          # 从 stdin 读，适合多行文本
```

所有文本参数都接受 `-` 表示从 stdin 读取，这是传递含引号或换行内容的安全方式。其余用法见 `agentmux --help`。

## 配置

| 变量 | 用途 |
| --- | --- |
| `PORT`、`HOST` | 监听地址（默认 `9988`、`0.0.0.0`） |
| `AGENTMUX_TOKEN` | agent 面向 HTTP 接口的令牌 |
| `AGENT_BIN`、`AGENTMUX_CODEX_BIN`、`AGENTMUX_CLAUDE_BIN` | 覆盖各 CLI 的可执行路径 |
| `AGENTMUX_AGENT_FLAGS`、`AGENTMUX_CLAUDE_FLAGS` | 替换该 provider 的默认参数（设为空则恢复逐条确认） |
| `AGENTMUX_LOG_MAX_BYTES` | 每终端输出日志上限（默认 2MB） |
| `AGENTMUX_AGENT_INSTRUCTION_FILE` | 换用其他 bootstrap 指令文件 |

项目级、可跨重启保留的指令放在 `~/.agentmux/projects/<id>/extra-instruction.md`；共用模板是 [`config/agent-instruction.md`](config/agent-instruction.md)。

## 工作原理

```text
浏览器 xterm ──ws──> 服务端 ──tmux send-keys──> pane
pane ──pipe-pane──> 日志文件 ──增量读──> 服务端 ──ws──> 浏览器 xterm
```

状态存在 `~/.agentmux`。会话比服务进程活得久：重启时，仍在的 tmux 会话会被重新挂上，已消失的会**按各自创建时选定的 provider** 重建。

终端输出只推送给当前正在显示该终端的客户端。活动状态走另一条通道，是对每个 pane 渲染帧取哈希得出的一个很小的信号 —— 字节量无法用于此，因为空闲的 Claude Code pane 会持续重绘，而空闲的 Codex pane 一个字节都不发。

更多设计说明见 [`docs/`](docs/)，中英文都有。
