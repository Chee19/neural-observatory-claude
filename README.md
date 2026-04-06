# Claude Token Visualiser

A local TypeScript frontend dashboard with a local **read-only** API server.

It automatically reads your `~/.claude` data and visualises:
- previous session metrics
- cumulative token/context usage
- known cost coverage
- per-session table

## Security model

- The API reads from one fixed path only: `~/.claude` (or `CLAUDE_DIR` if explicitly set).
- Only `GET` endpoints exist.
- Non-GET requests return `405`.
- No write APIs, no file create APIs, no delete APIs.
- The frontend has no file-picker and no mutation controls.

## Run

1. Build frontend assets:
```bash
npm run build
```

2. Start local read-only server:
```bash
npm run start
```

3. Open:
`http://localhost:4310`

## Dev mode

Single command (recommended):

```bash
npm run dev
```

This starts both:
- local read-only API (`:4310`)
- Vite dev server (`:5173`)

Alternative split terminals:

```bash
npm run dev:api
npm run dev:web
```

## Optional custom source path

By default the server reads `~/.claude`.
You can override with:

```bash
CLAUDE_DIR=/absolute/path/to/.claude npm run start
```
