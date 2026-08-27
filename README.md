# AgentMux

**English** · [简体中文](README.zh-CN.md)

A browser UI for running several agent CLIs side by side, each in its own tmux
session. Point it at a directory, start a terminal, pick which agent runs in
it — Cursor Agent, Codex CLI, or Claude Code — and drive them all from one
page, including from a phone on the same network.

Terminals in the same project can run different CLIs and different models at
the same time, which is the point: one pane on Claude, one on Codex, one on
Cursor, all working in the same repo.

Type `@` in the message box to address one of them by name. The message goes
to that terminal and the view follows it, so switching agents mid-thought does
not mean going back to the sidebar first. `@one,two` sends the same message to
both.

## Why run more than one

### The cost is a ceiling, not a meter

| | Monthly | Once the allowance is gone |
|---|---|---|
| [Claude Pro](https://claude.com/pricing) — includes Claude Code | $20 | Rate limited until the window resets |
| [ChatGPT Plus](https://learn.chatgpt.com/docs/pricing) — includes Codex | $20 | Rate limited until the window resets |
| [Cursor Pro](https://cursor.com/docs/account/pricing) | $20 | Keeps going, billed at the model's API price |

The two CLIs stop; the metered seat keeps spending. Cursor's own
documentation puts daily agent users at **$60–100/month in usage** on top of
the seat.

That difference survives moving upmarket, which is the part that matters for
anyone doing this seriously:

| Setup | Monthly | Shape |
|---|---|---|
| Claude Pro + ChatGPT Plus | $40 | Fixed |
| Claude Max + ChatGPT Plus | from $120 | Fixed |
| Claude Max + ChatGPT Pro | from $200 | Fixed |
| Cursor Pro, agent work on frontier models | $20 + usage | Open-ended |

Two hundred dollars of subscriptions is a lot of capacity, and it is a number
you know before the month starts rather than after it ends.

### The bill depends on the tool, not only the model

Metered billing charges for tokens sent, so the same model can cost very
different amounts depending on which harness is feeding it. Cursor splits this
across two pools — its own models, and third-party models "charged at the
model's API price" — and agent work on a frontier model lands in the second
one, where a single session can consume a double-digit dollar amount of the
allowance. The allowance is money already paid; running out of it changes when
that is felt, not what was spent.

There is also nothing to check. A metered bill turns on a token count produced
by the tool being billed for, which you cannot verify from outside. A fixed
subscription has nothing to verify.

One [public comparison](https://www.futureproofing.dev/resources/ai-native-team/claude-code-vs-cursor-token-efficiency-2026)
of the same Next.js build measured 33K tokens through Claude Code against 188K
through Cursor Agent. Read it with the caveats its authors give: a single
untimed test, and one that mixes the models with the tools, since the two sides
ran on Opus and GPT-5 respectively.

### A limit on one is not a limit on all

Both subscriptions meter in rolling windows with weekly caps — Codex prints its
own remaining budget in its status line. With a second CLI already running in
the next pane, hitting a window means switching panes rather than stopping.

### The models are not interchangeable

Having them side by side in one repo lets you put each on what it is good at,
and get a second opinion on anything you are unsure about, without
re-explaining the project.

---

None of that needs this app — two tmux windows would do. What gets hard is
watching them: terminals are unreadable on a phone, and with several panes
running it stops being obvious which one is working, which is waiting on you,
and what any of them have done. That is the part AgentMux is for.

## Requirements

- **tmux** — every terminal is a tmux session
- **Node.js 18+** — no native modules, so `npm install` needs no toolchain
- At least one agent CLI on `PATH`: `agent` (Cursor), `codex`, or `claude`

macOS and Linux both work. `run.sh` uses `lsof` for port cleanup, which some
minimal Linux images do not ship — `apt install lsof`, or start the server
directly with `node server/index.js`.

## Start

```bash
npm install
./run.sh
```

Then open <http://127.0.0.1:9988>. `run.sh` stops any previous instance,
rebuilds the UI, and starts the server in the background; re-run it after
changing code. Stop with `kill $(cat .agentmux.pid)`.

## Security

**There is no authentication on the web UI**, and `HOST` defaults to
`0.0.0.0`, so anyone who can reach the port gets a terminal on your machine —
with agents started in auto-approve mode. The `X-AgentMux-Token` guard covers
only the agent-facing HTTP endpoints, and its default value is a placeholder.

Before running this anywhere but a trusted network:

- bind to loopback (`HOST=127.0.0.1`) and reach it over an SSH tunnel or a
  private network such as Tailscale, or put an authenticating proxy in front
- set `AGENTMUX_TOKEN` to something of your own

## The `agentmux` CLI

Agents get an `agentmux` command on their `PATH`, wired to the running server
via environment variables, so they can report progress and drive other panes:

```bash
agentmux event  --type done --summary "Tests green. Next: none."
agentmux run    --to "Agent 2" --cmd "npm test"   # type into another pane
agentmux output --to "Agent 2" --lines 80         # read that pane back
agentmux interrupt --to "Agent 2"
agentmux message --to "Agent 2" --body -          # stdin, for multi-line text
```

Any text flag accepts `-` to read from stdin, which is the safe way to pass
anything containing quotes or newlines. Run `agentmux --help` for the rest.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT`, `HOST` | Listen address (default `9988`, `0.0.0.0`) |
| `AGENTMUX_TOKEN` | Token for the agent-facing HTTP endpoints |
| `AGENT_BIN`, `AGENTMUX_CODEX_BIN`, `AGENTMUX_CLAUDE_BIN` | Override a CLI's binary |
| `AGENTMUX_AGENT_FLAGS`, `AGENTMUX_CLAUDE_FLAGS` | Replace a provider's default flags (empty restores per-command prompts) |
| `AGENTMUX_LOG_MAX_BYTES` | Cap per-terminal output logs (default 2MB) |
| `AGENTMUX_AGENT_INSTRUCTION_FILE` | Use a different bootstrap instruction file |

Per-project instructions that survive restarts go in
`~/.agentmux/projects/<id>/extra-instruction.md`; the shared template is
[`config/agent-instruction.md`](config/agent-instruction.md), where `{{LANGUAGE}}`
expands to the interface language so agents answer in the one you are reading.
Changing it in Settings tells the panes already running, too.

## How it works

```text
browser xterm ──ws──> server ──tmux send-keys──> pane
pane ──pipe-pane──> log file ──tail──> server ──ws──> browser xterm
```

State lives in `~/.agentmux`. Sessions outlive the server: on restart, live
tmux sessions are reattached and dead ones are respawned with the provider
each was created with.

Terminal output is streamed only to clients currently displaying that
terminal. Activity travels separately, as a small status signal derived from
hashing each pane's rendered frame — byte volume is not usable for this, since
an idle Claude Code pane redraws continuously while an idle Codex pane emits
nothing at all.

Further design notes are in [`docs/`](docs/), in English and Chinese.

## License

[MIT](LICENSE) © 2026 Rong Gu
