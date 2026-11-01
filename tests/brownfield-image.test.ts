import { expect, test } from "bun:test";
import { taskImageTag } from "../src/brownfield/image";

test("task image tag is lowercase, docker-valid, and changes with bundle or base image", () => {
	const b = { repoDir: "Future-House__paper-qa", id: "pr1311-issue1310" };
	const t = taskImageTag(b, "yaml-a", "sha256:base1");
	expect(t).toMatch(
		/^he-bf-future-house__paper-qa:pr1311-issue1310-[0-9a-f]{12}$/,
	);
	expect(taskImageTag(b, "yaml-a", "sha256:base1")).toBe(t);
	expect(taskImageTag(b, "yaml-b", "sha256:base1")).not.toBe(t);
	expect(taskImageTag(b, "yaml-a", "sha256:base2")).not.toBe(t);
});
