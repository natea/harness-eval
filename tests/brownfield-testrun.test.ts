import { expect, test } from "bun:test";
import { waitWithGroupKill } from "../src/brownfield/testrun";

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

// A parent that ignores SIGTERM-forwarding concerns: it starts a grandchild and
// waits, like `uv run` → pytest.
const spawnTree = () => {
	const p = Bun.spawn(["bash", "-c", "sleep 60 & echo $!; wait"], {
		detached: true,
		stdout: "pipe",
	});
	return p;
};

const readPid = async (p: ReturnType<typeof spawnTree>) => {
	const reader = p.stdout.getReader();
	const { value } = await reader.read();
	reader.releaseLock();
	return Number(new TextDecoder().decode(value).trim());
};

test("wall clock kills the whole process group, not just the direct child", async () => {
	const p = spawnTree();
	const grandchild = await readPid(p);
	expect(alive(grandchild)).toBe(true);
	const timedOut = await waitWithGroupKill(p, 200, 500);
	expect(timedOut).toBe(true);
	await Bun.sleep(100);
	expect(alive(grandchild)).toBe(false);
});

test("leftover processes are reaped after a normal exit", async () => {
	const p = Bun.spawn(["bash", "-c", "sleep 60 & echo $!"], {
		detached: true,
		stdout: "pipe",
	});
	const grandchild = await readPid(p);
	const timedOut = await waitWithGroupKill(p, 10_000);
	expect(timedOut).toBe(false);
	await Bun.sleep(100);
	expect(alive(grandchild)).toBe(false);
});
