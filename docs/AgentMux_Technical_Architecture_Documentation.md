# AgentMux Mac Technical Architecture

## 1. Overview

AgentMux Mac is a browser-based terminal orchestration UI for multiple tmux-backed agent sessions. It combines:

- tmux for execution
- Node.js + Express for the control plane
- WebSocket for live UI updates
- React for the desktop-like interface
- xterm.js for terminal rendering

The design separates two concerns:

- Execution surface: real tmux panes, manual terminal input, interactive CLIs
- Collaboration surface: event center, per-project history, file tree, file preview

## 2. Runtime Model

Each project has:

- one project root directory
- one or more tmux-backed terminals
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
- `terminal_input` for structured terminal-side events

Events are:

- appended to the project history
- broadcast to connected clients as `bus_event`
- optionally injected into a target terminal when routing is needed

### 3.2 Manual Terminal Input

Manual terminal input remains a direct execution action.
It is intentionally not mirrored into history unless the agent explicitly emits a structured event.

## 4. Terminal Output Flow

Current implementation:

1. tmux pane output is piped into a per-terminal log file
2. the server reads new bytes from that log file using `fs.watch` plus a short polling loop
3. the browser receives incremental `output` messages
4. when switching terminals, the server sends a `terminal_snapshot` based on `tmux capture-pane -p -e -J`

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

- `projects.json` for project/terminal state and project history
- project-specific directories under `~/.agentmux/projects/<projectId>/`
- terminal log files for each pane

The UI can be restored from disk after restart.

## 7. Comparison With the Original AgentMux

The original AgentMux emphasized:

- multiple fixed roles
- task/result markdown files
- `worklog.md` and `project-history.md`
- orchestration through file watching and tmux notifications

AgentMux Mac emphasizes:

- per-project collaboration history in the browser
- a unified event bus
- a terminal-first execution surface
- project file browsing and preview inside the same UI

The two systems share tmux-based execution, but the current version is more UI/event-driven and less dependent on task/result markdown files.

## 8. Summary

The current architecture is:

- tmux for execution
- file logs for durable terminal output
- `fs.watch` for directory/file change detection
- WebSocket events for live UI updates
- per-project history for collaboration state

This keeps manual terminal use intact while making collaborative messages and project state consistent across the UI.
