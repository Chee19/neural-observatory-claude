<div align="center">
  <img src="./public/pwa-icon.svg" alt="Neural Observatory logo" width="88" height="88" />
  <h1>Neural Observatory</h1>
  <p><strong>Claude usage, at a glance.</strong></p>
  <p>A local dashboard for exploring Claude Code sessions, token usage, and context trends.</p>

  <p>
    <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&amp;logo=typescript&amp;logoColor=white" alt="TypeScript 5.9" />
    <img src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&amp;logo=react&amp;logoColor=white" alt="React 19" />
    <img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&amp;logo=vite&amp;logoColor=white" alt="Vite 8" />
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-34D399?style=flat-square" alt="MIT license" /></a>
  </p>

  <p>
    <a href="#overview">Overview</a> &nbsp;·&nbsp;
    <a href="#quick-start">Quick start</a> &nbsp;·&nbsp;
    <a href="#development">Development</a> &nbsp;·&nbsp;
    <a href="#data-source">Data source</a> &nbsp;·&nbsp;
    <a href="#security-model">Security</a>
  </p>
</div>

---

## Overview

Neural Observatory is a Claude token visualiser built with TypeScript and React. It reads your local `~/.claude` data through a **read-only Node.js API** and brings your usage into one dashboard.

| Explore | What you can see |
| :--- | :--- |
| **Session insights** | Previous session metrics and a sortable, filterable session table |
| **Token usage** | Input, output, cache, and cumulative context token totals |
| **Usage trends** | Context usage across sessions and daily activity |
| **Cost coverage** | Known session costs and the share of sessions with cost data |
| **Agents, tools & skills** | Invocation counts, skill mentions, and local file inventory |
| **Session details** | Project log summaries, model usage, and efficiency scores |

## Quick start

### Prerequisites

- **Node.js** 20.19+, 22.12+, or 24+.
- **Bun** to install dependencies from the included `bun.lock`.
- A local **Claude Code data directory** at `~/.claude`, or a custom path set with `CLAUDE_DIR`.

### Install & launch

```bash
git clone https://github.com/Chee19/neural-observatory-claude.git
cd neural-observatory-claude
bun install --frozen-lockfile
npm run dev
```

The combined development command starts the API on **port 4310** and the Vite frontend on **port 5173**. Open `http://localhost:5173` to view the dashboard.

> **Shell note:** `npm run dev` uses `zsh`. If it is unavailable, use the separate terminal commands below.

## Development

Run the API and frontend separately when you want independent logs or restarts:

**Terminal 1 — API**

```bash
npm run dev:api
```

**Terminal 2 — frontend**

```bash
npm run dev:web
```

Vite proxies `/api` requests to the local server on port 4310.

### Available commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start the API and Vite together |
| `npm run dev:api` | Start the read-only API server |
| `npm run dev:web` | Start the Vite development server |
| `npm run build` | Type-check the project and build frontend assets |
| `npm run start` | Serve the API and built frontend on port 4310 |
| `npm test` | Run the existing Node.js tests |
| `npm run lint` | Check the project with ESLint |

### Build & run

```bash
npm run build
npm run start
```

The Node.js server serves the generated `dist` assets alongside the API at `http://localhost:4310`.

## Data source

By default, the server reads `~/.claude`. To use another Claude data directory, set `CLAUDE_DIR` when starting the server:

```bash
CLAUDE_DIR=/absolute/path/to/.claude npm run start
```

The same override works in development:

```bash
CLAUDE_DIR=/absolute/path/to/.claude npm run dev:api
```

> **Cost coverage:** Costs are sourced from available `.claude/backups/.claude.json.backup.*` files. Sessions without cost records are shown as unknown rather than estimated.

## Security model

The dashboard is designed for inspecting local usage data:

- The primary data source is `~/.claude`, or the directory explicitly set with `CLAUDE_DIR`.
- API endpoints accept **`GET` only**; other methods return **`405 Method Not Allowed`**.
- There are no APIs for writing, creating, or deleting files.
- The frontend provides no file picker or data mutation controls.

## License

Released under the [MIT License](./LICENSE).
