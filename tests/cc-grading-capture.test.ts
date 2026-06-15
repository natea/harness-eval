import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "bun:test";
import { captureSession } from "../src/grading/cc-driver";

// Regression: the cc grading driver must not hang when the session starts a
// service that inherits its stdout, and must reap that service on completion /
// timeout (fix-cc-grading-driver-hang). These tests substitute the `claude`
// invocation with plain shell so they run offline with no auth or spend.

const work = mkdtempSync(join(tmpdir(), "he-cap-test-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

test("returns promptly and reaps a daemon that inherits the session's output", async () => {
	const marker = join(work, "daemon-was-alive.txt");
	// A background daemon inherits the session's (redirected) stdout and would
	// hold a live pipe open for 30s. The foreground command prints a result and
	// exits immediately. With file capture we must return on the foreground exit
	// (~0s), not wait 30s; and the group kill must stop the daemon before it can
	// write its marker 3s later.
	const shellCmd = `( sleep 3; touch ${JSON.stringify(marker)} ) & echo '{"type":"result","is_error":false,"result":"OK"}'`;

	const start = performance.now();
	const { output, exitCode, timedOut } = await captureSession(shellCmd, {
		timeoutMs: 30_000,
	});
	const elapsedMs = performance.now() - start;

	expect(timedOut).toBe(false);
	expect(exitCode).toBe(0);
	expect(output).toContain('"result":"OK"');
	// Did not block on the lingering daemon's inherited stdout.
	expect(elapsedMs).toBeLessThan(3_000);

	// The daemon was group-killed, so its delayed marker never lands.
	await new Promise((r) => setTimeout(r, 3_500));
	expect(existsSync(marker)).toBe(false);
});

test("timeout kills the whole session group and flags timedOut", async () => {
	const marker = join(work, "post-timeout.txt");
	// A foreground session that would run far past the timeout, plus a child that
	// would write a marker after the timeout if it survived the group kill.
	const shellCmd = `( sleep 10; touch ${JSON.stringify(marker)} ) ; sleep 10`;

	const start = performance.now();
	const { timedOut } = await captureSession(shellCmd, { timeoutMs: 800 });
	const elapsedMs = performance.now() - start;

	expect(timedOut).toBe(true);
	expect(elapsedMs).toBeLessThan(3_000); // killed near the timeout, not at 10s

	await new Promise((r) => setTimeout(r, 1_500));
	expect(existsSync(marker)).toBe(false); // group kill reaped the child
});
