# `run.sh` 使用说明

[English](run-sh.md) · **简体中文**

`run.sh` 用于**重新构建前端**并在后台启动 AgentMux 的 Node 服务（`server/index.js`），启动前会释放占用的端口与旧进程，避免「端口已被占用」导致启动失败。

改完代码后重跑这一条即可，不需要先手动停止旧实例。

## 前置条件

- 已执行 `npm install`（脚本会调用 `npm run build`）
- 项目根目录下可执行：`node server/index.js`
- 系统具备 `lsof`（用于检测/结束监听端口的进程）

> **Linux 注意**：部分精简镜像未预装 `lsof`（`apt install lsof`）。若不便安装，可跳过本脚本直接 `node server/index.js`，但需自行确保端口空闲。

## 基本用法

在项目根目录执行：

```bash
./run.sh
```

或使用 `bash` 显式调用：

```bash
bash run.sh
```

成功时会在终端打印：

- 本地访问地址（默认 `http://127.0.0.1:9988`）
- 进程 PID
- 日志文件路径

## 环境变量

脚本本身只读取并透传这两个：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | HTTP 服务监听端口 | `9988` |
| `HOST` | 监听地址 | `0.0.0.0` |

示例：只监听本机回环、端口 `3000`：

```bash
PORT=3000 HOST=127.0.0.1 ./run.sh
```

> 默认的 `0.0.0.0` 意味着**同网段任何人都能打开这个页面，而 Web UI 没有鉴权**。不在可信网络时应绑定 `127.0.0.1` 并通过 SSH 隧道访问。

其余变量（`AGENTMUX_TOKEN`、`AGENTMUX_LOG_MAX_BYTES` 等）由服务端读取，`export` 后同样会被继承。完整列表见 [`Project_Architecture.zh-CN.md`](./Project_Architecture.zh-CN.md) §10。

### 命令审批（服务端侧）

各 agent CLI 默认都以自动批准模式启动，不会逐条询问：

| CLI | 默认参数 | 覆盖变量 |
|-----|---------|---------|
| Cursor Agent | `--yolo` | `AGENTMUX_AGENT_FLAGS` |
| Codex CLI | `--dangerously-bypass-approvals-and-sandbox` | （固定） |
| Claude Code | `--permission-mode bypassPermissions` | `AGENTMUX_CLAUDE_FLAGS` |

若希望恢复「每条命令需确认」，在 **执行 `./run.sh` 之前** 导出对应变量为空（子进程 `node` 会继承）：

```bash
export AGENTMUX_AGENT_FLAGS=
export AGENTMUX_CLAUDE_FLAGS=
./run.sh
```

解析逻辑在 `server/providers/<cli>.js` 的 `getFlagParts()`。这些变量由服务端拉起 CLI 时读取，与 `run.sh` 脚本内容无直接耦合。

## 启动时做了什么

1. **根据 PID 文件停止旧实例**  
   若存在 `.agentmux.pid` 且其中 PID 仍在运行，会先 `kill`（必要时 `SIGKILL`），再删除 PID 文件。

2. **释放监听端口的进程**  
   对当前 `PORT` 上处于 `LISTEN` 的进程执行 `kill`（必要时 `SIGKILL`），避免端口被占用。

3. **端口仍不可用则退出**  
   若清理后端口仍被占用，脚本报错退出，并提示用 `lsof` 排查。

4. **构建前端**  
   执行 `npm run build` 产出 `dist/`。服务端托管的是构建产物，**跳过这一步页面不会更新**。

5. **后台启动服务**  
   使用 `nohup node server/index.js` 将标准输出与标准错误追加写入项目根目录下的 `agentmux.log`，并把新进程号写入 `.agentmux.pid`。

6. **等待启动就绪**  
   最多轮询约 5 秒确认端口进入监听。若进程提前退出或超时，脚本会打印 `agentmux.log` 末尾 40 行并以非零码退出。

## 日志与 PID

| 路径 | 说明 |
|------|------|
| `agentmux.log` | 服务运行日志（追加写入） |
| `.agentmux.pid` | 当前后台进程的 PID |

## 停止服务

任选其一：

```bash
kill "$(cat .agentmux.pid)"
```

或直接再次执行 `./run.sh`：脚本会先尝试停止旧 PID 与占用端口的进程，再启动新实例（**相当于替换为新的后台进程**）。

## 常见问题

**端口仍被占用**

按脚本提示执行：

```bash
lsof -nP -iTCP:9988 -sTCP:LISTEN
```

（若使用了自定义 `PORT`，将 `9988` 换成你的端口。）确认是否有其他程序占用后，结束对应进程或换用其他 `PORT`。

**无执行权限**

```bash
chmod +x run.sh
```
