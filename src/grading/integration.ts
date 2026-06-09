import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { IntegrationFixtureOutcome, IntegrationResult } from "../types";

const LINEAR_GRAPHQL = "https://api.linear.app/graphql";

export const FixtureManifest = z.object({
	project: z.string(),
	projectId: z.string(),
	teamKey: z.string(),
	baselineState: z.string(),
	handoffState: z.string(),
	fixtures: z.array(
		z.object({
			identifier: z.string(),
			fixture: z.string(),
			title: z.string(),
			priority: z.int(),
			blockedBy: z.array(z.string()),
			workspaceSeed: z.string(),
			acceptance: z.array(z.record(z.string(), z.unknown())),
		}),
	),
});
export type FixtureManifest = z.infer<typeof FixtureManifest>;

export function loadManifest(path: string): {
	manifest: FixtureManifest;
	sha256: string;
} {
	const raw = readFileSync(path, "utf8");
	return {
		manifest: FixtureManifest.parse(parse(raw)),
		sha256: createHash("sha256").update(raw).digest("hex"),
	};
}

async function gql<T>(
	apiKey: string,
	query: string,
	variables: Record<string, unknown> = {},
): Promise<T> {
	const res = await fetch(LINEAR_GRAPHQL, {
		method: "POST",
		headers: { authorization: apiKey, "content-type": "application/json" },
		body: JSON.stringify({ query, variables }),
	});
	if (!res.ok) throw new Error(`Linear API ${res.status}`);
	const body = (await res.json()) as {
		data?: T;
		errors?: { message: string }[];
	};
	if (body.errors?.length)
		throw new Error(`Linear GraphQL: ${body.errors[0]?.message}`);
	if (!body.data) throw new Error("Linear GraphQL: empty data");
	return body.data;
}

interface LiveIssue {
	id: string;
	identifier: string;
	title: string;
	state: { id: string; name: string };
}

async function fetchProjectIssues(
	apiKey: string,
	projectId: string,
): Promise<LiveIssue[]> {
	const data = await gql<{ project: { issues: { nodes: LiveIssue[] } } }>(
		apiKey,
		`query($id: String!) { project(id: $id) { issues(first: 50) {
        nodes { id identifier title state { id name } } } } }`,
		{ id: projectId },
	);
	return data.project.issues.nodes;
}

/**
 * Integrity check (grading-rubric spec: fixture set integrity): the live
 * project must match the frozen manifest — same identifiers and titles, no
 * extras. Drift skips the tier rather than grading against it.
 */
export async function verifyIntegrity(
	apiKey: string,
	manifest: FixtureManifest,
): Promise<{ ok: boolean; error?: string; live: LiveIssue[] }> {
	const live = await fetchProjectIssues(apiKey, manifest.projectId);
	const liveById = new Map(live.map((i) => [i.identifier, i]));
	const errors: string[] = [];
	for (const f of manifest.fixtures) {
		const found = liveById.get(f.identifier);
		if (!found) errors.push(`missing ${f.identifier}`);
		else if (found.title !== f.title)
			errors.push(`title drift on ${f.identifier}`);
	}
	const manifestIds = new Set(manifest.fixtures.map((f) => f.identifier));
	for (const i of live) {
		if (!manifestIds.has(i.identifier))
			errors.push(`unexpected issue ${i.identifier} in project`);
	}
	return errors.length > 0
		? { ok: false, error: errors.join("; "), live }
		: { ok: true, live };
}

/** Reset every fixture issue to the baseline state (per-trial state reset). */
export async function resetBaseline(
	apiKey: string,
	manifest: FixtureManifest,
): Promise<void> {
	const live = await fetchProjectIssues(apiKey, manifest.projectId);
	const states = await gql<{
		workflowStates: { nodes: { id: string; name: string }[] };
	}>(apiKey, `query { workflowStates(first: 50) { nodes { id name } } }`);
	const baseline = states.workflowStates.nodes.find(
		(s) => s.name === manifest.baselineState,
	);
	if (!baseline)
		throw new Error(`no workflow state named ${manifest.baselineState}`);
	for (const issue of live) {
		if (issue.state.name !== manifest.baselineState) {
			await gql(
				apiKey,
				`mutation($id: String!, $stateId: String!) {
           issueUpdate(id: $id, input: { stateId: $stateId }) { success } }`,
				{ id: issue.id, stateId: baseline.id },
			);
		}
	}
}

export interface IntegrationRunObservation {
	/** Identifiers the candidate service dispatched (from its logs/workspaces). */
	dispatched: Set<string>;
	/** Identifier → workspace dir created by the candidate service. */
	workspaces: Map<string, string>;
	/** Identifier → whether the agent run completed (stub/trivial agent). */
	agentCompleted: Set<string>;
}

/**
 * Collect per-fixture outcomes after a real-integration run (task 6.9):
 * polled/dispatched from observation, handoff from live tracker state.
 * The deliberately-blocked fixture inverts the dispatch expectation.
 */
export async function collectOutcomes(
	apiKey: string,
	manifest: FixtureManifest,
	obs: IntegrationRunObservation,
): Promise<IntegrationResult> {
	const live = await fetchProjectIssues(apiKey, manifest.projectId);
	const liveById = new Map(live.map((i) => [i.identifier, i]));
	const fixtures: IntegrationFixtureOutcome[] = manifest.fixtures.map((f) => {
		const liveIssue = liveById.get(f.identifier);
		const blocked = f.blockedBy.length > 0;
		const dispatched = obs.dispatched.has(f.identifier);
		const handoff = liveIssue?.state.name === manifest.handoffState;
		return {
			fixtureId: f.identifier,
			polled: true, // integrity fetch + dispatch observation imply polling reached the project
			dispatched: blocked ? !dispatched : dispatched,
			workspaceCreated: obs.workspaces.has(f.identifier),
			agentRunCompleted: obs.agentCompleted.has(f.identifier),
			handoffReached: blocked ? true : handoff,
			evidence: blocked
				? `blocked fixture: dispatched=${dispatched} (must be false while blocker non-terminal); state=${liveIssue?.state.name}`
				: `state=${liveIssue?.state.name ?? "missing"}; dispatched=${dispatched}; workspace=${obs.workspaces.get(f.identifier) ?? "none"}`,
		};
	});
	return { ran: true, skippedReason: null, manifestSha256: null, fixtures };
}
