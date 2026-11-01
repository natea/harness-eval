import { expect, test } from "bun:test";
import {
	AGENT_TEST_ENV,
	agentTestEnvScript,
	OFFLINE_TEST_ENV,
} from "../src/brownfield/testrun";
import { gatewayBindAddress } from "../src/gateway/run";

test("agents get the offline switches but no proxy or Anthropic key", () => {
	expect(AGENT_TEST_ENV.PQA_OFFLINE_TESTS).toBe("true");
	expect(AGENT_TEST_ENV.GITHUB_ACTIONS).toBe("true");
	expect(AGENT_TEST_ENV.LITELLM_LOCAL_MODEL_COST_MAP).toBe("true");
	expect(
		Object.keys(AGENT_TEST_ENV).filter((k) => k.endsWith("PROXY")),
	).toEqual([]);
	expect(AGENT_TEST_ENV.ANTHROPIC_API_KEY).toBeUndefined();
	// Grading keeps its proxy.
	expect(OFFLINE_TEST_ENV.HTTP_PROXY).toBe("http://127.0.0.1:9");
});

test("the script exports each switch", () => {
	const script = agentTestEnvScript();
	expect(script).toContain("export PQA_OFFLINE_TESTS='true'\n");
	expect(script).toContain("export OPENAI_API_KEY=''\n");
	expect(script).not.toContain("PROXY");
});

test("the gateway binds the bridge address on Linux, loopback elsewhere", () => {
	expect(gatewayBindAddress("linux", "172.17.0.1")).toBe("172.17.0.1");
	expect(gatewayBindAddress("darwin", "172.17.0.1")).toBeUndefined();
});
