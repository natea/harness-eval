import { expect, test } from "bun:test";
import { auditTranscript } from "../src/brownfield/audit";

const opts = {
	futureShas: ["6625d52de370b1fe23e76fe4bd243343865afe96"],
	prNumber: 1262,
	repo: "Future-House/paper-qa",
};

test("clean transcript", () => {
	const r = auditTranscript(
		'{"tool":"Read","input":{"file_path":"src/paperqa/core.py"}}',
		opts,
	);
	expect(r.verdict).toBe("clean");
	expect(r.findings).toEqual([]);
});

test("future commit sha disqualifies", () => {
	const r = auditTranscript("git log 6625d52d… found the fix", opts);
	expect(r.verdict).toBe("disqualified:solution-reach");
	expect(r.findings[0]?.kind).toBe("future-sha");
});

test("same-repo PR/issue URL disqualifies, another repo's does not", () => {
	const hit = auditTranscript(
		"see https://github.com/Future-House/paper-qa/pull/1262",
		opts,
	);
	expect(hit.verdict).toBe("disqualified:solution-reach");
	const other = auditTranscript(
		"see https://github.com/other/repo/pull/1262",
		opts,
	);
	expect(other.verdict).toBe("clean");
});

test("web tools are disqualifying, plain network commands are attempts", () => {
	const web = auditTranscript('{"tool":"WebFetch","input":{"url":"x"}}', opts);
	expect(web.verdict).toBe("disqualified:solution-reach");
	const fetch = auditTranscript(
		"curl https://api.github.com/repos/Future-House/paper-qa",
		opts,
	);
	expect(fetch.verdict).toBe("attempted");
	expect(fetch.attempts).toHaveLength(1);
});

test("a project issue URL quoted in repository output is not reaching", () => {
	const toolResult = JSON.stringify({
		type: "user",
		message: {
			content: [
				{
					type: "tool_result",
					content:
						'pytest.xfail("Per https://github.com/Future-House/paper-qa/issues/1140")',
				},
			],
		},
	});
	expect(auditTranscript(toolResult, opts).verdict).toBe("clean");
});

test("an assistant fetch of the project's PR disqualifies", () => {
	const action = JSON.stringify({
		type: "assistant",
		message: {
			content: [
				{
					type: "tool_use",
					name: "WebFetch",
					input: { url: "https://github.com/Future-House/paper-qa/pull/1262" },
				},
			],
		},
	});
	expect(auditTranscript(action, opts).verdict).toBe(
		"disqualified:solution-reach",
	);
});
