/**
 * GitHub access for the brownfield miner, through the `gh` CLI (auth comes from
 * the operator's `gh` login; nothing is stored). Everything here is fetch-only;
 * the reconstruction logic in snapshot.ts / baseline.ts is pure over these shapes
 * so it can be tested on recorded responses.
 */
import { $ } from "bun";

export type GhRunner = (args: string[]) => Promise<string>;

export const ghCli: GhRunner = async (args) => {
	const r = await $`gh ${args}`.quiet().nothrow();
	if (r.exitCode !== 0)
		throw new Error(
			`gh ${args.slice(0, 3).join(" ")} failed: ${r.stderr.toString().slice(0, 300)}`,
		);
	return r.stdout.toString();
};

const EDITS =
	"userContentEdits(first: 100) { nodes { editedAt deletedAt diff editor { login } } }";

/** One query per task: the PR (commits, reviews, files) and the issue (edits, comments, timeline). */
export const TASK_QUERY = `query($o:String!,$n:String!,$pr:Int!,$is:Int!){ repository(owner:$o,name:$n){
  pullRequest(number:$pr){ number createdAt mergedAt author{login} mergeCommit{oid}
    additions deletions
    closingIssuesReferences(first:10){ nodes{ number repository{ nameWithOwner } } }
    commits(first:250){ nodes{ commit{ oid authoredDate committedDate } } }
    reviews(first:100){ nodes{ submittedAt state author{login} } }
    files(first:100){ nodes{ path additions deletions } } }
  issue(number:$is){ number title body createdAt author{login} ${EDITS}
    comments(first:100){ nodes{ createdAt authorAssociation author{login __typename} body ${EDITS} } }
    timelineItems(first:250){ nodes{ __typename
      ... on LabeledEvent{ createdAt label{name} }
      ... on UnlabeledEvent{ createdAt label{name} }
      ... on RenamedTitleEvent{ createdAt previousTitle currentTitle }
      ... on AssignedEvent{ createdAt assignee{ ... on User{login} } }
      ... on UnassignedEvent{ createdAt assignee{ ... on User{login} } }
      ... on MilestonedEvent{ createdAt milestoneTitle }
      ... on DemilestonedEvent{ createdAt milestoneTitle }
      ... on ClosedEvent{ createdAt }
      ... on ReopenedEvent{ createdAt }
      ... on CrossReferencedEvent{ createdAt source{ __typename ... on PullRequest{number} ... on Issue{number} } }
      ... on ConnectedEvent{ createdAt subject{ ... on PullRequest{number} } }
    } } } } }`;

export interface Edit {
	editedAt: string;
	deletedAt?: string | null;
	diff: string | null;
	editor?: { login: string } | null;
}
export interface GhComment {
	createdAt: string;
	authorAssociation?: string;
	author: { login: string; __typename?: string } | null;
	body: string;
	userContentEdits: { nodes: Edit[] };
}
export interface TimelineEvent {
	__typename: string;
	createdAt?: string;
	label?: { name: string };
	previousTitle?: string;
	currentTitle?: string;
	assignee?: { login?: string } | null;
	milestoneTitle?: string;
	source?: { __typename: string; number?: number };
	subject?: { number?: number };
}
export interface GhIssue {
	number: number;
	title: string;
	body: string;
	createdAt: string;
	author: { login: string } | null;
	userContentEdits: { nodes: Edit[] };
	comments: { nodes: GhComment[] };
	timelineItems: { nodes: TimelineEvent[] };
}
export interface GhPullRequest {
	number: number;
	createdAt: string;
	mergedAt: string;
	author?: { login: string } | null;
	mergeCommit?: { oid: string } | null;
	additions?: number;
	deletions?: number;
	closingIssuesReferences?: {
		nodes: { number: number; repository?: { nameWithOwner: string } }[];
	};
	commits: {
		nodes: {
			commit: { oid?: string; authoredDate: string; committedDate: string };
		}[];
	};
	reviews?: {
		nodes: {
			submittedAt: string | null;
			state: string;
			author?: { login: string } | null;
		}[];
	};
	files?: { nodes: { path: string; additions: number; deletions: number }[] };
}
export interface TaskData {
	pullRequest: GhPullRequest;
	issue: GhIssue;
}

export async function fetchTaskData(
	repo: string,
	pr: number,
	issue: number,
	gh: GhRunner = ghCli,
): Promise<TaskData> {
	const [owner, name] = repo.split("/");
	const out = await gh([
		"api",
		"graphql",
		"-f",
		`query=${TASK_QUERY}`,
		"-F",
		`o=${owner}`,
		"-F",
		`n=${name}`,
		"-F",
		`pr=${pr}`,
		"-F",
		`is=${issue}`,
	]);
	const json = JSON.parse(out);
	if (json.errors?.length)
		throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
	return json.data.repository as TaskData;
}

export interface MergedPr {
	number: number;
	mergedAt: string;
	mergeCommit: { oid: string } | null;
	closingIssuesReferences: { number: number }[];
	files: { path: string }[];
}

/** Merged PRs (optionally since a date) that close at least one issue. */
export async function listMergedIssuePrs(
	repo: string,
	opts: { since?: string; limit?: number } = {},
	gh: GhRunner = ghCli,
): Promise<MergedPr[]> {
	const args = [
		"pr",
		"list",
		"-R",
		repo,
		"--state",
		"merged",
		"--limit",
		String(opts.limit ?? 1000),
	];
	if (opts.since) args.push("--search", `merged:>=${opts.since}`);
	args.push(
		"--json",
		"number,mergedAt,mergeCommit,closingIssuesReferences,files",
	);
	const prs: MergedPr[] = JSON.parse(await gh(args));
	return prs.filter((p) => p.closingIssuesReferences?.length);
}
