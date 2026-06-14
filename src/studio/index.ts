#!/usr/bin/env bun
/**
 * harness-eval Eval Studio (local, read-only by default; run-launch added in
 * task 3). Served via Bun.serve HTML imports; Tailwind is processed by
 * bun-plugin-tailwind (see bunfig.toml).
 *   bun run studio            # http://127.0.0.1:4871
 *   bun run studio --port N
 */
import index from "./index.html";

const portIdx = process.argv.indexOf("--port");
const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 4871;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port,
	routes: { "/": index },
	development: { hmr: true, console: true },
});

console.log(`Eval Studio: http://127.0.0.1:${server.port}`);
