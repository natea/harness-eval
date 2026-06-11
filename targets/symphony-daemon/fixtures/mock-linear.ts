#!/usr/bin/env bun
/**
 * Mock Linear GraphQL API for functional evaluation (task 6.2, per Symphony
 * §17's test matrix). Serves a minimal Linear-compatible GraphQL surface:
 *   - issues(filter: ...) with state/project filtering and pagination
 *   - issue state refresh by ids
 * plus non-GraphQL control endpoints the evaluator uses to mutate state and
 * collect evidence:
 *   - POST /control/seed      {issues: [...]}            reset + seed
 *   - POST /control/set-state {id, state, stateType}     flip an issue
 *   - GET  /control/requests                              request log
 *
 * Run: bun src/fixtures/mock-linear.ts [port=4280]
 */

export interface MockIssue {
	id: string;
	identifier: string;
	title: string;
	description: string;
	priority: number;
	createdAt: string;
	state: { name: string; type: string };
	labels: string[];
	blockedBy: string[]; // issue ids that block this one
	projectSlugId: string;
}

interface RequestLogEntry {
	at: string;
	kind: string;
	query?: string;
	variables?: unknown;
	authHeader?: string;
}

const issues = new Map<string, MockIssue>();
const requestLog: RequestLogEntry[] = [];

function issueNode(i: MockIssue) {
	return {
		id: i.id,
		identifier: i.identifier,
		title: i.title,
		description: i.description,
		priority: i.priority,
		createdAt: i.createdAt,
		state: { name: i.state.name, type: i.state.type },
		labels: { nodes: i.labels.map((name) => ({ name })) },
		inverseRelations: {
			nodes: i.blockedBy.map((id) => ({
				type: "blocks",
				issue: { id, identifier: id },
			})),
		},
		project: { slugId: i.projectSlugId },
	};
}

function handleGraphql(
	body: { query?: string; variables?: Record<string, unknown> },
	auth: string | null,
) {
	const query = body.query ?? "";
	const variables = body.variables ?? {};
	requestLog.push({
		at: new Date().toISOString(),
		kind: "graphql",
		query: query.slice(0, 400),
		variables,
		authHeader: auth ?? undefined,
	});

	// State refresh by ids: query with `ids` variable typed [ID!].
	const ids = (variables.ids ?? variables.issueIds) as string[] | undefined;
	if (ids && Array.isArray(ids)) {
		const nodes = ids
			.map((id) => issues.get(id))
			.filter(Boolean)
			.map((i) => issueNode(i as MockIssue));
		return {
			data: {
				issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } },
			},
		};
	}

	// Candidate/terminal fetch: filter by state names/types in the query or variables.
	const all = [...issues.values()];
	const varBlob = JSON.stringify(variables) + query;
	let filtered = all;
	const stateNames = [
		...varBlob.matchAll(
			/"(Todo|In Progress|In Review|Human Review|Done|Canceled|Backlog)"/g,
		),
	].map((m) => m[1] as string);
	if (stateNames.length > 0)
		filtered = all.filter((i) => stateNames.includes(i.state.name));

	// Pagination: 2 per page via `after` cursor (index-based).
	const after =
		typeof variables.after === "string"
			? Number.parseInt(variables.after, 10)
			: 0;
	const pageSize = 2;
	const sorted = filtered.sort((a, b) =>
		a.createdAt.localeCompare(b.createdAt),
	);
	const page = sorted.slice(after, after + pageSize);
	const hasNextPage = after + pageSize < sorted.length;
	return {
		data: {
			issues: {
				nodes: page.map(issueNode),
				pageInfo: {
					hasNextPage,
					endCursor: hasNextPage ? String(after + pageSize) : null,
				},
			},
		},
	};
}

const port = Number(process.argv[2] ?? process.env.MOCK_LINEAR_PORT ?? 4280);

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		if (url.pathname === "/graphql" && req.method === "POST") {
			const auth = req.headers.get("authorization");
			const body = (await req.json()) as {
				query?: string;
				variables?: Record<string, unknown>;
			};
			return Response.json(handleGraphql(body, auth));
		}
		if (url.pathname === "/control/seed" && req.method === "POST") {
			const body = (await req.json()) as { issues: MockIssue[] };
			issues.clear();
			requestLog.length = 0;
			for (const i of body.issues) issues.set(i.id, i);
			return Response.json({ ok: true, count: issues.size });
		}
		if (url.pathname === "/control/set-state" && req.method === "POST") {
			const body = (await req.json()) as {
				id: string;
				state: string;
				stateType: string;
			};
			const issue = issues.get(body.id);
			if (!issue)
				return Response.json(
					{ ok: false, error: "no such issue" },
					{ status: 404 },
				);
			issue.state = { name: body.state, type: body.stateType };
			requestLog.push({
				at: new Date().toISOString(),
				kind: `control:set-state:${body.id}:${body.state}`,
			});
			return Response.json({ ok: true });
		}
		if (url.pathname === "/control/requests") {
			return Response.json(requestLog);
		}
		return new Response("not found", { status: 404 });
	},
});

console.log(JSON.stringify({ msg: "mock-linear listening", port }));
