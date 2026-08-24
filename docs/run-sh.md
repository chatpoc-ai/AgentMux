# `run.sh`

[English](run-sh.md) · [简体中文](run-sh.zh-CN.md)

`run.sh` **rebuilds the frontend** and starts the AgentMux server
(`server/index.js`) in the background, clearing the port and any previous
instance first so startup does not fail on "address already in use".

Re-run it after changing code; there is no need to stop the old instance by hand.

## Requirements

- `npm install` has been run (the script calls `npm run build`)
- `node server/index.js` is runnable from the repository root
- `lsof` is available (used to find and stop whatever holds the port)

> **On Linux**: some minimal images do not ship `lsof` (`apt install lsof`). If
> installing it is inconvenient, skip this script and run
> `node server/index.js` directly — but then make sure the port is free yourself.

## Usage

From the repository root:

```bash
./run.sh
```

or explicitly through bash:

```bash
bash run.sh
```

On success it prints the local URL (default <http://127.0.0.1:9988>), the LAN
URL, the PID, and the log path.

## Environment

The script itself reads and passes through only these two:

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP listen port | `9988` |
| `HOST` | Listen address | `0.0.0.0` |

Listen on loopback only, port 3000:

```bash
PORT=3000 HOST=127.0.0.1 ./run.sh
```

> The `0.0.0.0` default means **anyone on the same network can open the page,
> and the web UI has no authentication**. Outside a trusted network, bind
> `127.0.0.1` and reach it over an SSH tunnel.

Everything else (`AGENTMUX_TOKEN`, `AGENTMUX_LOG_MAX_BYTES`, …) is read by the
server and inherited if exported. Full list in
[`Project_Architecture.md`](./Project_Architecture.md) §10.

### Command approval

Every agent CLI is started in auto-approve mode and will not ask per command:

| CLI | Default flags | Override |
|-----|--------------|----------|
| Cursor Agent | `--yolo` | `AGENTMUX_AGENT_FLAGS` |
| Codex CLI | `--dangerously-bypass-approvals-and-sandbox` | (fixed) |
| Claude Code | `--permission-mode bypassPermissions` | `AGENTMUX_CLAUDE_FLAGS` |

To restore per-command confirmation, export the relevant variable as empty
**before** running `./run.sh` (the `node` child inherits it):

```bash
export AGENTMUX_AGENT_FLAGS=
export AGENTMUX_CLAUDE_FLAGS=
./run.sh
```

Parsing lives in `getFlagParts()` in `server/providers/<cli>.js`. These
variables are read by the server when it launches a CLI; they are not coupled to
`run.sh` itself.

## What it does

1. **Stop the previous instance by PID file**
   If `.agentmux.pid` exists and that PID is alive, `kill` it (`SIGKILL` if
   needed), then remove the file.

2. **Free the port**
   `kill` whatever is `LISTEN`ing on `PORT` (`SIGKILL` if needed).

3. **Bail out if the port is still busy**
   Exits with an error and an `lsof` command to investigate.

4. **Build the frontend**
   Runs `npm run build` to produce `dist/`. The server serves the build output,
   so **skipping this leaves the page unchanged**.

5. **Start in the background**
   `nohup node server/index.js`, appending stdout and stderr to `agentmux.log`,
   writing the new PID to `.agentmux.pid`.

6. **Wait for readiness**
   Polls for up to about 5 seconds for the port to listen. If the process exits
   early or the wait times out, it prints the last 40 lines of `agentmux.log`
   and exits non-zero.

## Log and PID

| Path | Purpose |
|------|---------|
| `agentmux.log` | Server log (appended) |
| `.agentmux.pid` | PID of the current background process |

## Stopping

Either:

```bash
kill "$(cat .agentmux.pid)"
```

or just run `./run.sh` again — it stops the old process and the port holder
before starting a replacement.

## Troubleshooting

**Port still busy**

```bash
lsof -nP -iTCP:9988 -sTCP:LISTEN
```

(substitute your `PORT`). Identify the holder, stop it, or pick another port.

**Not executable**

```bash
chmod +x run.sh
```
