import { expect, test } from "bun:test";
import { hostEnv, parseJunit } from "../src/brownfield/testrun";

test("hostEnv keeps only the allowlist (no AGENT=1 style operator vars)", () => {
	const saved = process.env.AGENT;
	process.env.AGENT = "1";
	try {
		const env = hostEnv();
		expect(env.AGENT).toBeUndefined();
		expect(env.PATH).toBe(process.env.PATH);
	} finally {
		if (saved === undefined) delete process.env.AGENT;
		else process.env.AGENT = saved;
	}
});

test("junit outcomes distinguish live-api failures", () => {
	const xml = `<testsuites><testsuite>
<testcase classname="tests.a" name="ok" />
<testcase classname="tests.a" name="boom"><failure>AssertionError</failure></testcase>
<testcase classname="tests.a" name="net"><failure>APIConnectionError</failure></testcase>
</testsuite></testsuites>`;
	const out = parseJunit(xml);
	expect(out["tests.a::ok"]).toBe("pass");
	expect(out["tests.a::boom"]).toBe("fail");
	expect(out["tests.a::net"]).toBe("fail-live");
});
