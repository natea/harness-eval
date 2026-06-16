/**
 * OS-level process reaping for the macos-vz provider (harden-container-teardown).
 *
 * When Apple `container` wedges (a trial's agent-built daemon holds the
 * exec/vsock channel open, so the guest never acknowledges exit), `container
 * delete --force` / `kill` / even `system stop` block indefinitely and the
 * apiserver serializes every later command behind the stuck runtime helper —
 * the whole CLI freezes and the VM's committed memory is never freed (see
 * docs/MACOS-VZ-SETUP.md → Troubleshooting).
 *
 * This is the last rung of the teardown ladder: kill the trial's OWN processes
 * at the OS level — the `container-runtime-linux … --uuid <name>` helper and
 * the paired `Virtualization.VirtualMachine`. The VM is matched by an open-file
 * check against the trial's container directory, so a VM that does not belong to
 * this trial is never signalled.
 */
import { cli } from "./cli-container";

/** A bounded process command runner (injectable for tests). */
export type ProcRunner = (
	binary: string,
	args: string[],
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const RUNTIME_HELPER = "container-runtime-linux";
const VM_PROCESS = "Virtualization.VirtualMachine";

/** Parse whitespace/newline-separated PIDs (pgrep output) into positive ints. */
export function parsePids(stdout: string): number[] {
	return stdout
		.split(/\s+/)
		.map((s) => Number(s))
		.filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * True iff an `lsof -p <pid>` dump shows the process holding a file under this
 * trial's container directory — the safety guard that keeps the reap from ever
 * killing an unrelated VM. The Apple runtime stores per-container state under
 * `…/com.apple.container/containers/<name>/`.
 */
export function lsofOwnedBy(lsofOutput: string, name: string): boolean {
	return lsofOutput.includes(`/containers/${name}/`);
}

const defaultRun: ProcRunner = (binary, args) =>
	cli(binary, args, { timeoutMs: 10_000 });

/**
 * Reap the OS processes belonging to one wedged Apple-container trial. Returns
 * the number of processes signalled (0 if none matched — caller treats that as
 * "nothing to free here"). Never throws; never signals a VM that does not own
 * this trial's container files.
 */
export async function reapAppleContainer(
	name: string,
	run: ProcRunner = defaultRun,
): Promise<number> {
	// Runtime helper(s) for this exact uuid — unambiguous, name-scoped match.
	const rt = await run("pgrep", [
		"-f",
		`${RUNTIME_HELPER}.*--uuid ${name}`,
	]).catch(() => ({ exitCode: 1, stdout: "", stderr: "" }));
	const runtimePids = parsePids(rt.stdout);

	// Candidate guest VMs, filtered to those that actually own this trial's
	// files. launchd reparents these to pid 1, so we cannot pair by ppid — the
	// open-file check is the reliable (and safe) association.
	const vm = await run("pgrep", ["-f", VM_PROCESS]).catch(() => ({
		exitCode: 1,
		stdout: "",
		stderr: "",
	}));
	const vmPids: number[] = [];
	for (const pid of parsePids(vm.stdout)) {
		const l = await run("lsof", ["-p", String(pid)]).catch(() => ({
			exitCode: 1,
			stdout: "",
			stderr: "",
		}));
		if (lsofOwnedBy(l.stdout, name)) vmPids.push(pid);
	}

	const targets = [...new Set([...runtimePids, ...vmPids])];
	if (targets.length === 0) return 0;
	await run("kill", ["-9", ...targets.map(String)]).catch(() => ({
		exitCode: 1,
		stdout: "",
		stderr: "",
	}));
	return targets.length;
}
