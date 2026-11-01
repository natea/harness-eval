// Throwaway spike: validate issue-linked PRs as brownfield tasks (repo-parameterized).
// Env: REPO_DIR, GH_REPO, PKG, OUT_DIR, CANDS; optional EXTRAS (no-lock install extras), VALIDATE_PY.
// For each PR: base = merge^1; split diff into tests vs src; run touched test
// files at base+tests (BEFORE) and base+tests+src (GOLD x2). No model spend.
import { $ } from "bun";
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from "node:fs";

const S = import.meta.dir;
const REPO = process.env.REPO_DIR!;
const GH_REPO = process.env.GH_REPO!;
const PKG = process.env.PKG!;
const EXTRAS = process.env.EXTRAS ?? "dev";
const OUT = process.env.OUT_DIR!;
mkdirSync(OUT, { recursive: true });
const cands: { n: number; m: string; d: string; issues: { n: number; repo: string }[] }[] =
	JSON.parse(readFileSync(process.env.CANDS!, "utf8"));
const only = process.argv.slice(2).map(Number);
const CONC = 3;
let envLock: Promise<void> = Promise.resolve();

const isTest = (p: string) => /(^|\/)tests?\//.test(p) || /(^|\/)test_[^/]*\.py$/.test(p);
const testEnv = {
	...process.env,
	GITHUB_ACTIONS: "true",
	PQA_OFFLINE_TESTS: "true",
	LITELLM_LOCAL_MODEL_COST_MAP: "true",
	OPENAI_API_KEY: "",
	ANTHROPIC_API_KEY: "",
	GEMINI_API_KEY: "",
	CROSSREF_API_KEY: "",
	SEMANTIC_SCHOLAR_API_KEY: "",
	// Dead proxy: VCR playback intercepts before the network, so cassette tests still work,
	// but uncassetted live-API tests fail in seconds instead of retrying until timeout.
	HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9", ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "",
};

type Outcome = "pass" | "fail" | "fail-live" | "skip";
// A failure caused by a blocked/unauthenticated network call: the test needs a live API.
const LIVE_RE = /APIConnectionError|ProxyError|ConnectError|ClientConnectorError|AuthenticationError|api[_ ]key/i;
function parseJunit(xml: string): Record<string, Outcome> {
	const res: Record<string, Outcome> = {};
	const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
	for (const m of xml.matchAll(re)) {
		const attrs = m[1];
		const cls = /classname="([^"]*)"/.exec(attrs)?.[1] ?? "";
		const name = /\bname="([^"]*)"/.exec(attrs)?.[1] ?? "";
		const body = m[3] ?? "";
		const id = `${cls}::${name}`;
		res[id] = /<(failure|error)\b/.test(body) ? (LIVE_RE.test(body) ? "fail-live" : "fail") : /<skipped\b/.test(body) ? "skip" : "pass";
	}
	return res;
}

async function runTests(wt: string, files: string[], tag: string, n: number) {
	const xml = `${OUT}/${n}-${tag}.xml`;
	const log = `${OUT}/${n}-${tag}.log`;
	rmSync(xml, { force: true });
	const p = Bun.spawn(
		["uv", "run", "--no-sync", "pytest", ...files, "-p", "no:sugar", "-p", "no:cacheprovider",
			"--timeout", "90", "-o", "addopts=", `--junitxml=${xml}`, "-q"],
		{ cwd: wt, env: testEnv, stdout: Bun.file(log), stderr: Bun.file(`${log}.err`) },
	);
	const killer = setTimeout(() => p.kill(), 15 * 60_000);
	await p.exited;
	clearTimeout(killer);
	return existsSync(xml) ? parseJunit(readFileSync(xml, "utf8")) : null;
}

async function validate(c: (typeof cands)[number]) {
	const r: Record<string, unknown> = { pr: c.n, merged: c.d.slice(0, 10), issues: c.issues };
	const crossRepo = c.issues.some((i) => i.repo !== GH_REPO);
	const files = (await $`git -C ${REPO} diff --name-only ${c.m}^ ${c.m}`.text()).trim().split("\n").filter(Boolean);
	const testFiles = files.filter(isTest);
	const srcFiles = files.filter((f) => !isTest(f));
	const srcCode = srcFiles.filter((f) => f.endsWith(".py"));
	const testPy = testFiles.filter((f) => /test_[^/]*\.py$/.test(f));
	const depsTouched = srcFiles.some((f) => /(^|\/)(uv|poetry|pdm|pixi)\.lock$|requirements[^/]*\.txt$|(^|\/)pyproject\.toml$|(^|\/)setup\.(py|cfg)$/.test(f));
	Object.assign(r, { files: files.length, srcFiles, testFiles, depsTouched });
	if (crossRepo) return { ...r, verdict: "skip:cross-repo-issue" };
	if (srcCode.length === 0) return { ...r, verdict: "skip:no-src-code-change" };
	if (testPy.length === 0) return { ...r, verdict: "skip:no-test-change" };

	const wt = `${OUT}/wt/${c.n}`;
	if (!existsSync(wt)) await $`git -C ${REPO} worktree add -f -q --detach ${wt} ${c.m}^`.quiet();
	await $`git -C ${wt} reset -q --hard ${c.m}^ && git -C ${wt} clean -qfd`.quiet();
	// macOS Finder litters ignored .DS_Store files; some upstream PRs commit one (e.g. #961).
	await $`find ${wt} -name .DS_Store -not -path '*/.venv/*' -delete`.nothrow().quiet();
	const tp = `${OUT}/${c.n}-tests.patch`, sp = `${OUT}/${c.n}-src.patch`;
	await $`git -C ${REPO} diff --binary ${c.m}^ ${c.m} -- ${testFiles} > ${tp}`.quiet();
	await $`git -C ${REPO} diff --binary ${c.m}^ ${c.m} -- ${srcFiles} > ${sp}`.quiet();

	// Env: uv.lock if present, else time-capped resolve (like RepoLaunch's pip proxy).
	const t0 = Date.now();
	const hasLock = existsSync(`${wt}/uv.lock`);
	const date = (await $`git -C ${REPO} show -s --format=%cI ${c.m}^`.text()).trim();
	// One env build at a time (parallel downloads flaked on a laptop network), retried, on the
	// era-appropriate Python (3.13 lacks wheels for old pins like dm-tree 0.1.9).
	const PY = process.env.VALIDATE_PY ?? "3.12";
	const build = () => hasLock
		? $`cd ${wt} && CMAKE_POLICY_VERSION_MINIMUM=3.5 UV_PYTHON=${PY} uv sync --frozen --all-extras --all-groups --reinstall-package ${PKG} 2>&1 || CMAKE_POLICY_VERSION_MINIMUM=3.5 UV_PYTHON=${PY} uv sync --frozen --all-groups --reinstall-package ${PKG} 2>&1 || CMAKE_POLICY_VERSION_MINIMUM=3.5 UV_PYTHON=${PY} uv sync --frozen --reinstall-package ${PKG} 2>&1`.nothrow().quiet()
		: $`cd ${wt} && rm -rf .venv && uv venv -q --python ${PY} && (uv pip install -q --exclude-newer ${date} -e ${`.[${EXTRAS}]`} --group dev pytest pytest-timeout pytest-asyncio 2>&1 || uv pip install -q --exclude-newer ${date} -e ${`.[${EXTRAS}]`} pytest pytest-timeout pytest-asyncio hypothesis pytest-env 2>&1 || uv pip install -q --exclude-newer ${date} -e . pytest pytest-timeout pytest-asyncio hypothesis 2>&1)`.nothrow().quiet();
	let env: Awaited<ReturnType<typeof build>>;
	await envLock;
	let release!: () => void;
	envLock = new Promise<void>((r) => (release = r));
	try {
		for (let attempt = 1; ; attempt++) {
			env = await build();
			const out = env.stdout.toString();
			if (env.exitCode === 0 || attempt >= 3 || !/error sending request|Failed to fetch|failed after \d+ retries/i.test(out)) break;
			await Bun.sleep(10_000 * attempt);
		}
	} finally { release(); }
	Object.assign(r, { env: hasLock ? "uv.lock" : `exclude-newer ${date}`, envSecs: Math.round((Date.now() - t0) / 1000) });
	writeFileSync(`${OUT}/${c.n}-env.log`, env.stdout);
	if (env.exitCode !== 0) return { ...r, verdict: "fail:env-build" };
	// Ensure pytest-timeout is available even on old lockfiles.
	await $`cd ${wt} && uv pip install -q pytest-timeout`.nothrow().quiet();

	if ((await $`git -C ${wt} apply --binary ${tp}`.nothrow().quiet()).exitCode !== 0) return { ...r, verdict: "fail:test-patch-apply" };
	// Only the tests the PR touched (whole files were too slow: blocked live-API tests retry).
	const sel = await $`python3 ${S}/touched.py ${wt} ${tp}`.nothrow().quiet();
	const run: string[] = sel.exitCode === 0 ? JSON.parse(sel.stdout.toString()) : testPy.filter((f) => existsSync(`${wt}/${f}`));
	Object.assign(r, { selected: run });
	if (run.length === 0) return { ...r, verdict: "fail:no-touched-tests" };
	const before = await runTests(wt, run, "before", c.n);
	if ((await $`git -C ${wt} apply --binary ${sp}`.nothrow().quiet()).exitCode !== 0) return { ...r, verdict: "fail:src-patch-apply" };
	const gold1 = await runTests(wt, run, "gold1", c.n);
	const gold2 = await runTests(wt, run, "gold2", c.n);
	if (!before || !gold1 || !gold2) return { ...r, verdict: depsTouched && (!gold1 || !gold2) ? "fail:dependency-change" : "fail:pytest-crashed-or-timeout" };

	const ids = new Set([...Object.keys(before), ...Object.keys(gold1), ...Object.keys(gold2)]);
	const liveBroken = new Set<string>();
	const f2p: string[] = [], p2p: string[] = [], flaky: string[] = [], broken: string[] = [], regress: string[] = [];
	for (const id of ids) {
		const norm = (o?: Outcome) => (o === "fail-live" ? "fail" : o);
		if (gold1[id] === "fail-live" || gold2[id] === "fail-live") liveBroken.add(id);
		const b = norm(before[id]) ?? "fail", g1 = norm(gold1[id]), g2 = norm(gold2[id]);
		if (g1 !== g2) flaky.push(id);
		else if (g1 === "pass" && b === "fail") f2p.push(id);
		else if (g1 === "pass" && b === "pass") p2p.push(id);
		else if (g1 === "fail" && b === "pass") regress.push(id);
		else if (g1 === "fail") broken.push(id);
	}
	Object.assign(r, { counts: { f2p: f2p.length, p2p: p2p.length, flaky: flaky.length, envBroken: broken.length, liveApi: broken.filter((id) => liveBroken.has(id)).length, goldRegress: regress.length }, f2p, flaky, broken });
	const verdict = f2p.length > 0 ? "VALID"
		: broken.some((id) => liveBroken.has(id)) ? "fail:needs-live-api"
		: "fail:no-fail-to-pass";
	return { ...r, verdict };
}

const queue = cands.filter((c) => only.length === 0 || only.includes(c.n));
const results: unknown[] = [];
async function worker() {
	while (queue.length) {
		const c = queue.shift()!;
		try {
			const r = await validate(c);
			console.log(`#${c.n} ${(r as any).verdict} ${JSON.stringify((r as any).counts ?? "")}`);
			results.push(r);
		} catch (e) {
			console.log(`#${c.n} error ${e}`);
			results.push({ pr: c.n, verdict: `error:${String(e).slice(0, 200)}` });
		}
		writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
	}
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log("DONE");
