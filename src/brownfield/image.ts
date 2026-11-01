/**
 * Per-task trial images (add-brownfield-track task 4.1, design D7).
 *
 * One Docker image per task: the trial image plus the task's sealed repo on branch
 * `work` at /home/ubuntu/workspace and its Python environment, built inside the
 * container with the same recipe validation uses (`buildEnvWith`). Every candidate's
 * trials start from these identical bytes, and nothing slow or networked runs inside
 * a trial. The issue file is not in the image: it is written at trial time, so one
 * image serves every issue variant.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "../providers/cli-container";
import { type Bundle, sha256 } from "./bundle";
import { buildEnvWith, type EnvResult, type EnvRunner, shq } from "./env";
import { buildSealedRepo, verifySealed } from "./seal";
import { projectName } from "./seed";
import { TRIAL_BRANCH } from "./workspace";

export const WORKSPACE = "/home/ubuntu/workspace";
/** Same uv as the host that validated the bundles. Bump deliberately (changes every tag). */
export const UV_VERSION = "0.11.13";
/** Bump when the recipe below changes; part of every image tag. */
const RECIPE = "1";
/**
 * Offline test settings baked into the image so the agent's own test runs replay
 * recordings. Proxy and credential variables are deliberately left out: a dead
 * proxy would also break the harness's route to the gateway.
 */
const BAKED_ENV: Record<string, string> = {
	GITHUB_ACTIONS: "true",
	PQA_OFFLINE_TESTS: "true",
	LITELLM_LOCAL_MODEL_COST_MAP: "true",
};

export interface TaskImageOptions {
	clone: string;
	baseImage: string;
	pkg?: string;
	extras?: string;
	python?: string;
	force?: boolean;
	binary?: string;
	log?: (m: string) => void;
}

export interface TaskImage {
	image: string;
	cached: boolean;
	envDigest: string | null;
	method?: EnvResult["method"];
	seconds: number;
}

/** Image tag: changes with the bundle, the base image, uv and the recipe. */
export function taskImageTag(
	bundle: Pick<Bundle, "repoDir" | "id">,
	taskYaml: string,
	baseImageId: string,
): string {
	const h = sha256(
		[taskYaml, baseImageId, UV_VERSION, RECIPE].join("\n"),
	).slice(0, 12);
	return `he-bf-${bundle.repoDir.toLowerCase()}:${bundle.id}-${h}`;
}

/** Docker CLI wrapper that throws with context on failure. */
function docker(binary: string) {
	return async (args: string[], what: string, timeoutMs = 120_000) => {
		const r = await cli(binary, args, { timeoutMs });
		if (r.exitCode !== 0)
			throw new Error(
				`task image: ${what} failed: ${(r.stderr || r.stdout).slice(0, 400)}`,
			);
		return r.stdout;
	};
}

export async function buildTaskImage(
	bundle: Bundle,
	opts: TaskImageOptions,
): Promise<TaskImage> {
	const t0 = Date.now();
	const bin = opts.binary ?? "docker";
	const must = docker(bin);
	const log = opts.log ?? (() => {});
	const m = bundle.manifest;

	const baseId = (
		await must(
			["image", "inspect", "-f", "{{.Id}}", opts.baseImage],
			"inspect base image",
		)
	).trim();
	const taskYaml = readFileSync(join(bundle.dir, "task.yaml"), "utf8");
	const image = taskImageTag(bundle, taskYaml, baseId);
	if (!opts.force) {
		const have = await cli(bin, [
			"image",
			"inspect",
			"-f",
			'{{index .Config.Labels "he.bf.env-digest"}}',
			image,
		]);
		if (have.exitCode === 0)
			return {
				image,
				cached: true,
				envDigest: have.stdout.trim() || null,
				seconds: 0,
			};
	}

	const tmp = mkdtempSync(join(tmpdir(), "he-bfimg-"));
	const repo = join(tmp, "repo");
	const name = `he-bfimg-${bundle.id}-${Date.now().toString(36)}`;
	try {
		log(`sealing ${m.repo}@${m.baseSha.slice(0, 10)}`);
		await buildSealedRepo(opts.clone, m.baseSha, repo, {
			branch: TRIAL_BRANCH,
		});
		// Provisional bundles don't record the package; read it from the base
		// commit's pyproject.toml, as the worktree path does.
		const pkg = opts.pkg ?? m.env?.pkg ?? projectName(repo);
		if (!pkg)
			throw new Error(
				`${bundle.id}: no package name recorded or in pyproject.toml; pass --pkg`,
			);
		const problems = await verifySealed(repo, m.baseSha, [m.mergeSha]);
		if (problems.length)
			throw new Error(`${bundle.id}: not sealed: ${problems.join("; ")}`);

		await must(
			["run", "-d", "--name", name, opts.baseImage, "sleep", "infinity"],
			"start build container",
		);
		await must(
			["exec", "-u", "root", name, "mkdir", "-p", WORKSPACE],
			"mkdir workspace",
		);
		await must(
			["cp", `${repo}/.`, `${name}:${WORKSPACE}`],
			"copy repo",
			600_000,
		);
		await must(
			["exec", "-u", "root", name, "chown", "-R", "ubuntu:ubuntu", WORKSPACE],
			"chown workspace",
			600_000,
		);

		const sh = (
			cmd: string,
			env: Record<string, string> = {},
			timeoutMs = 1_800_000,
		) =>
			cli(
				bin,
				[
					"exec",
					"-w",
					WORKSPACE,
					...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
					name,
					"bash",
					"-lc",
					cmd,
				],
				{ timeoutMs },
			);
		log(`installing uv ${UV_VERSION}`);
		const uv = await sh(
			`curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | env UV_INSTALL_DIR=$HOME/.local/bin UV_NO_MODIFY_PATH=1 sh`,
		);
		if (uv.exitCode !== 0)
			throw new Error(
				`task image: uv install failed: ${uv.stderr.slice(0, 400)}`,
			);

		const PATH_PREFIX = `${WORKSPACE}/.venv/bin:/home/ubuntu/.local/bin`;
		const runner: EnvRunner = async (command, env) => {
			const r = await sh(`export PATH=${PATH_PREFIX}:$PATH; ${command}`, env);
			return { exitCode: r.exitCode, out: r.stdout + r.stderr };
		};
		const date = (await sh("git show -s --format=%cI HEAD")).stdout.trim();
		log(`building env (pkg ${pkg}, exclude-newer ${date})`);
		const env = await buildEnvWith(runner, {
			pkg,
			extras: opts.extras ?? m.env?.extras,
			python: opts.python ?? m.env?.python,
			excludeNewer: date,
		});
		if (!env.ok)
			throw new Error(
				`${bundle.id}: env build failed in container:\n${env.log.slice(-1500)}`,
			);

		// The env build must not touch tracked files; whatever it generated (venv,
		// egg-info, version files) is excluded so it never shows up in the agent's patch.
		const status = (await sh("git status --porcelain --untracked-files=normal"))
			.stdout;
		const modified = status.split("\n").filter((l) => l && !l.startsWith("??"));
		if (modified.length)
			throw new Error(
				`${bundle.id}: env build modified tracked files:\n${modified.join("\n")}`,
			);
		const generated = status
			.split("\n")
			.filter((l) => l.startsWith("?? "))
			.map((l) => `/${l.slice(3)}`);
		await sh(
			`printf '%s\\n' ${["/.venv/", ...generated].map(shq).join(" ")} >> .git/info/exclude`,
		);
		const clean = (await sh("git status --porcelain")).stdout.trim();
		if (clean)
			throw new Error(
				`${bundle.id}: workspace not clean after env build:\n${clean}`,
			);

		const changes = [
			`ENV PATH=${PATH_PREFIX}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
			...Object.entries(BAKED_ENV).map(([k, v]) => `ENV ${k}=${v}`),
			`LABEL he.bf.task=${m.repo}#${bundle.id}`,
			`LABEL he.bf.base-sha=${m.baseSha}`,
			`LABEL he.bf.env-digest=${env.digest ?? ""}`,
			`LABEL he.bf.env-method=${env.method}`,
		];
		await must(
			["commit", ...changes.flatMap((c) => ["--change", c]), name, image],
			"commit image",
			600_000,
		);
		log(`built ${image} in ${Math.round((Date.now() - t0) / 1000)}s`);
		return {
			image,
			cached: false,
			envDigest: env.digest,
			method: env.method,
			seconds: Math.round((Date.now() - t0) / 1000),
		};
	} finally {
		await cli(bin, ["rm", "-f", name], { timeoutMs: 60_000 });
		rmSync(tmp, { recursive: true, force: true });
	}
}
