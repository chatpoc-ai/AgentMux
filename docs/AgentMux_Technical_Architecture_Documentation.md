# AgentMux Technical Architecture

**English** · [简体中文](AgentMux_Technical_Architecture_Documentation.zh-CN.md)

## 1. Overview

AgentMux is a browser-based terminal orchestration UI for multiple tmux-backed agent sessions. It combines:

- tmux for execution
- Node.js + Express for the control plane
- WebSocket for live UI updates
- React for the desktop-like interface
- xterm.js for terminal rendering

The design separates two concerns:

- Execution surface: real tmux panes, manual terminal input, interactive CLIs
- Collaboration surface: event center, per-project history, file tree, file preview

Three agent CLIs are supported — Cursor Agent, Codex CLI, and Claude Code — and
the choice is per terminal, not global. One project can run panes on different
CLIs and different models at the same time.

## 2. Runtime Model

Each project has:

- one project root directory
- one or more tmux-backed terminals, each pinned to the CLI and model it was
  created with
- a persisted project history
- a per-project file tree view
- an optional file preview pane

Each tmux session writes output to a log file via `tmux pipe-pane`.
The server streams log growth to the browser and uses `tmux capture-pane` for full-frame refresh on terminal switch.

## 3. Communication Model

### 3.1 Event Center

All collaboration messages go through a server-side event center:

- `user_message`
- `agent_reply`
- `done`
- `require_confirmation`
- `status`
- `message` for text delivered to another terminal
- `terminal_input` for raw keystroke passthrough (not recorded as an event)

Agents emit these through the `agentmux` CLI, which is placed on their PATH at
spawn time and reads its identity from the bootstrap environment.

Events are:

- appended to the project history
- broadcast to connected clients as `bus_event`
- optionally injected into a target terminal when routing is needed

Recording happens before routing. An event with no target is a report aimed at
the operator — the documented `done` shape has none — and must still reach the
event log.

### 3.2 Manual Terminal Input

Manual terminal input remains a direct execution action.
It is intentionally not mirrored into history unless the agent explicitly emits a structured event.

## 4. Terminal Output Flow

Current implementation:

1. tmux pane output is piped into a per-terminal log file
2. the server reads new bytes from that log file using `fs.watch` plus a short polling loop
3. the browser receives incremental `output` messages, but only for the
   terminal it currently displays (`subscribe_terminal`)
4. when switching terminals, the server sends a `terminal_snapshot` based on `tmux capture-pane -p -e -J`

Because hidden panes are repainted from `capture-pane` when switched to, their
bytes are of no use to a client that is not showing them; broadcasting every
pane to every client would multiply traffic by the number of panes.

Activity therefore travels on its own much smaller channel. The server hashes
each pane's rendered frame once a second and emits `terminal_status`
(idle / working / waiting) only on a transition. Byte volume cannot serve this
purpose: an idle Claude Code pane redraws its TUI continuously, while an idle
Codex pane (`--no-alt-screen`) emits nothing at all.

Why this model:

- preserves incremental output for live UI
- avoids replays that can corrupt alt-screen TUIs
- keeps full terminal state available on switch

## 5. File Tree and Preview

The right panel has two modes:

- tree only
- tree + preview

The file tree is refreshed when the project directory changes.
The server watches each project root and emits `project_tree_changed` only on actual filesystem change.

The preview pane:

- opens when a file is selected
- shows markdown rendering for `.md`
- shows line-numbered plain text for other files
- refreshes when the directory watcher reports a change in the active project

## 6. Persistence

State is stored in `~/.agentmux/`:

- `projects.json` for project/terminal state (including each terminal's CLI and
  model) and project history
- `settings.json` for UI language and the defaults offered to new terminals
- `bin/agentmux`, the CLI shim placed on each agent's PATH
- project-specific directories under `~/.agentmux/projects/<projectId>/`
- terminal log files for each pane

Terminal logs are a transport buffer, not an archive. Bytes are streamed as they
arrive and never replayed, so the files are capped and recycled — an idle Claude
Code pane would otherwise write roughly 280MB a day.

The UI can be restored from disk after restart. Live tmux sessions are
reattached; dead ones are respawned with the provider each was created with.

## 7. Comparison With the Original AgentMux

The original AgentMux emphasized:

- multiple fixed roles
- task/result markdown files
- `worklog.md` and `project-history.md`
- orchestration through file watching and tmux notifications

AgentMux emphasizes:

- per-project collaboration history in the browser
- a unified event bus
- a terminal-first execution surface
- project file browsing and preview inside the same UI

The two systems share tmux-based execution, but the current version is more UI/event-driven and less dependent on task/result markdown files.

## 8. Summary

The current architecture is:

- tmux for execution, and for the authoritative current frame
- capped file logs as the transport for incremental terminal output
- `fs.watch` for directory/file change detection
- WebSocket for live UI updates, with terminal bytes scoped to the visible pane
  and activity carried separately as frame-derived status
- per-project history for collaboration state

This keeps manual terminal use intact while making collaborative messages and project state consistent across the UI.
