---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## harness-eval specifics

This repo evaluates agentic coding frameworks (see README.md for the full
architecture). Things that keep work efficient and runs fair:

### Commands
- `bun run src/cli.ts validate [--target <name>]` — registry + target + fixtures; run after touching config/ or targets/
- `bun run src/cli.ts run --candidates a,b --trials N --provider {daytona,e2b,docker,macos-vz,worktree} [--snapshot tag] [--trial-minutes M] [--grade]` — REAL SPEND (subscription); always smoke n=1 before any matrix
- `bun scripts/grade-trial.ts <run-dir> <trial-id> [--driver cc|sdk] [--fresh] [--target <name>]` — post-hoc grading; checkpointed, resumable
- `bun run src/cli.ts report <run-dir> [--weights a,q,s,t]` — re-weight without re-running
- `bun run test` — NOT bare `bun test` (bare form path-matches archived workspaces under runs/ and fails)
- `bun run dashboard` — results UI on 127.0.0.1:4870

### Invariants (do not break)
- PRD/test-plan freeze: content hashes recorded per run; never edit targets/*/PRD.md or testplan.yaml casually — re-freeze deliberately and bump target version
- Fairness: all candidates in a run get the identical rendered base prompt; continuation prompts only from the registry allowlist; never add task hints to session scripts
- Secrets are env-only (.env, gitignored); the archiver redacts known patterns — add new key patterns to src/driver/archive.ts when adding providers
- Judge ≠ worker model; quality judging runs on the scrubbed workspace-blind copy only
- runs/ is gitignored artifact ground truth — never commit it, never mutate archived trials (grades.json/checkpoints are append-on-grade)

### Hard-won environment facts
- Worker auth: pass CLAUDE_CODE_OAUTH_TOKEN with ANTHROPIC_API_KEY explicitly blanked — Claude Code prefers the API key if both are set and will silently bill (or fail on) the API account
- Headless session output must redirect to a file in the sandbox, not the exec stream — agent-built daemons inherit stdout and hold the stream open forever
- Env for sandbox commands: export inside `bash -lc`, never `env K=V cmd | pipe` (only reaches the first command)
- Trial images run as uid-1000 `ubuntu` (Daytona toolbox requirement; E2B preserves image users); install tooling system-wide (e.g. BUN_INSTALL=/usr/local)
- Apple `container` CLI: no `cp` verb (provider uses exec+base64 copy), health is `system status`, flags are separate tokens
- E2B Hobby tier hard-caps sandbox lifetime at 1h — use --trial-minutes 40 or the preflight will (correctly) refuse
- Daytona free tier = 10GiB total memory → cloud concurrency 1 with a 4GiB orchestrator; quota accounting lags sandbox deletion (retry with backoff)
- Plugin "pins" for git-source plugins are assert-only (Claude Code installs HEAD); upstream movement fails the version assert by design — re-pin deliberately
- Long builds belong in the cloud orchestrator sandbox (laptop networks kill multi-minute API streams); use `setsid nohup ... < /dev/null` and write logs to files

### Branch discipline
- main: stable harness + dashboard + targets
- pluggable-providers: provider system (docker/e2b/macos-vz) until merged — don't mix provider work into main except deliberate cherry-picks
- OpenSpec governs scope: check `openspec list` / `openspec/changes/<name>/tasks.md`; mark task boxes as work lands; `openspec validate <change>` before committing spec edits
