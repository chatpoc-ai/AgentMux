# `run.sh` 使用说明

`run.sh` 用于在后台启动 AgentMux 的 Node 服务（`server/index.js`），并在启动前尽量释放占用的端口与旧进程，避免「端口已被占用」导致启动失败。

## 前置条件

- 项目根目录下可执行：`node server/index.js`
- 系统具备 `lsof`（用于检测/结束监听端口的进程）

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

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | HTTP 服务监听端口 | `9988` |

示例：指定端口 `3000` 启动：

```bash
PORT=3000 ./run.sh
```

### Cursor Agent 命令审批（服务端侧）

若通过 AgentMux 启动 Cursor `agent`，服务端默认可能使用 `--yolo`（自动执行 shell）。若希望恢复「每条命令需确认」，在 **执行 `./run.sh` 之前** 导出环境变量（子进程 `node` 会继承），例如：

```bash
export AGENTMUX_AGENT_FLAGS=
./run.sh
```

或按需使用例如 `AGENTMUX_AGENT_FLAGS=--force`（以 `server/instruction.js` 中的解析逻辑为准）。

该变量由服务端在拉起 `agent` 时读取，与 `run.sh` 脚本内容无直接耦合。

## 启动时做了什么

1. **根据 PID 文件停止旧实例**  
   若存在 `.agentmux.pid` 且其中 PID 仍在运行，会先 `kill`（必要时 `SIGKILL`），再删除 PID 文件。

2. **释放监听端口的进程**  
   对当前 `PORT` 上处于 `LISTEN` 的进程执行 `kill`（必要时 `SIGKILL`），避免端口被占用。

3. **端口仍不可用则退出**  
   若清理后端口仍被占用，脚本报错退出，并提示用 `lsof` 排查。

4. **后台启动服务**  
   使用 `nohup node server/index.js` 将标准输出与标准错误追加写入项目根目录下的 `agentmux.log`，并把新进程号写入 `.agentmux.pid`。

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
