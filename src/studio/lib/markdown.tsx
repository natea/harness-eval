/**
 * Dependency-free renderers for the input-spec viewer (input-spec-viewer): turn a
 * PRD's Markdown into styled React nodes and a test plan's YAML into a
 * syntax-coloured block. Hand-rolled (no marked/highlight.js) — the studio is
 * Bun-first and these inputs are simple, structured documents we control. Builds
 * React elements directly (no dangerouslySetInnerHTML), styled with the theme
 * tokens so it tracks light/dark.
 */
import type { ReactNode } from "react";

// ---- Markdown ----

// Bold / italic / link. Deliberately NO backtick here — a backtick inside a
// regex literal breaks the Bun TSX lexer — so `code` spans are split out first
// (below) by scanning for backtick pairs. Groups: 1 **bold**(2) 3 *it*(4)
// 5 _it_(6) 7 [text(8)](url 9).
const FMT =
	/(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;

function formatted(text: string, kp: string): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let i = 0;
	FMT.lastIndex = 0;
	let m = FMT.exec(text);
	while (m) {
		if (m.index > last) out.push(text.slice(last, m.index));
		const k = `${kp}f${i++}`;
		if (m[1]) out.push(<strong key={k}>{m[2]}</strong>);
		else if (m[3]) out.push(<em key={k}>{m[4]}</em>);
		else if (m[5]) out.push(<em key={k}>{m[6]}</em>);
		else if (m[7])
			out.push(
				<a
					key={k}
					href={m[9]}
					target="_blank"
					rel="noreferrer"
					className="text-primary-hover hover:underline"
				>
					{m[8]}
				</a>,
			);
		last = FMT.lastIndex;
		m = FMT.exec(text);
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

/** Inline rendering: pull out `code` spans (scanning for backtick pairs, never a
 *  regex), then bold/italic/links on the rest. */
function inline(text: string, kp: string): ReactNode[] {
	const BT = "`"; // backtick, kept out of every regex
	const out: ReactNode[] = [];
	let rest = text;
	let n = 0;
	while (rest.length) {
		const s = rest.indexOf(BT);
		const e = s === -1 ? -1 : rest.indexOf(BT, s + 1);
		if (s === -1 || e === -1) {
			out.push(...formatted(rest, `${kp}-${n}`));
			break;
		}
		if (s > 0) out.push(...formatted(rest.slice(0, s), `${kp}-${n}`));
		out.push(
			<code
				key={`${kp}c${n}`}
				className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
			>
				{rest.slice(s + 1, e)}
			</code>,
		);
		rest = rest.slice(e + 1);
		n++;
	}
	return out;
}

const H = [
	"text-lg font-bold",
	"text-base font-bold",
	"text-sm font-semibold",
	"text-sm font-semibold text-muted-foreground",
	"text-[13px] font-semibold text-muted-foreground",
	"text-[13px] font-semibold text-muted-foreground",
];

/** Render Markdown source to styled React nodes (block-level + inline). */
export function Markdown({ source }: { source: string }): ReactNode {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	const blocks: ReactNode[] = [];
	let i = 0;
	let key = 0;
	const kk = () => `b${key++}`;

	while (i < lines.length) {
		const line = lines[i] ?? "";

		// fenced code block
		if (/^\s*```/.test(line)) {
			const buf: string[] = [];
			i++;
			while (i < lines.length && !/^\s*```/.test(lines[i] ?? "")) {
				buf.push(lines[i] ?? "");
				i++;
			}
			i++; // closing fence
			blocks.push(
				<pre
					key={kk()}
					className="overflow-x-auto rounded bg-muted p-2 font-mono text-[11px]"
				>
					{buf.join("\n")}
				</pre>,
			);
			continue;
		}

		// heading
		const h = /^(#{1,6})\s+(.*)$/.exec(line);
		if (h) {
			const lvl = h[1]?.length ?? 1;
			blocks.push(
				<div key={kk()} className={`mt-3 ${H[lvl - 1]}`}>
					{inline(h[2] ?? "", kk())}
				</div>,
			);
			i++;
			continue;
		}

		// horizontal rule
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
			blocks.push(<hr key={kk()} className="border-border" />);
			i++;
			continue;
		}

		// blockquote
		if (/^\s*>\s?/.test(line)) {
			const buf: string[] = [];
			while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? "")) {
				buf.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
				i++;
			}
			blocks.push(
				<blockquote
					key={kk()}
					className="border-border border-l-2 pl-3 text-muted-foreground"
				>
					{inline(buf.join(" "), kk())}
				</blockquote>,
			);
			continue;
		}

		// unordered / ordered list
		const isUl = /^\s*[-*]\s+/.test(line);
		const isOl = /^\s*\d+\.\s+/.test(line);
		if (isUl || isOl) {
			const items: ReactNode[] = [];
			const re = isUl ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/;
			while (i < lines.length && re.test(lines[i] ?? "")) {
				items.push(
					<li key={kk()}>{inline((lines[i] ?? "").replace(re, ""), kk())}</li>,
				);
				i++;
			}
			blocks.push(
				isUl ? (
					<ul key={kk()} className="list-disc space-y-0.5 pl-5">
						{items}
					</ul>
				) : (
					<ol key={kk()} className="list-decimal space-y-0.5 pl-5">
						{items}
					</ol>
				),
			);
			continue;
		}

		// blank line
		if (line.trim() === "") {
			i++;
			continue;
		}

		// paragraph (consume consecutive non-blank, non-special lines)
		const buf: string[] = [];
		while (i < lines.length) {
			const l = lines[i] ?? "";
			if (
				l.trim() === "" ||
				/^\s*```/.test(l) ||
				/^(#{1,6})\s+/.test(l) ||
				/^\s*>\s?/.test(l) ||
				/^\s*[-*]\s+/.test(l) ||
				/^\s*\d+\.\s+/.test(l) ||
				/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)
			)
				break;
			buf.push(l);
			i++;
		}
		blocks.push(
			<p key={kk()} className="text-[13px] leading-relaxed">
				{inline(buf.join("\n"), kk())}
			</p>,
		);
	}

	return <div className="space-y-2">{blocks}</div>;
}

// ---- YAML ----

function yamlValue(v: string, kp: string): ReactNode {
	if (v === "") return null;
	if (/^#/.test(v))
		return <span className="text-muted-foreground italic">{v}</span>;
	if (/^(["']).*\1$/.test(v) || /^[^0-9[{].*[^}\]]?$/.test(v)) {
		// inline trailing comment?
		const c = v.match(/^(.*?)(\s+#.*)$/);
		if (c)
			return (
				<>
					<span className="text-success">{c[1]}</span>
					<span className="text-muted-foreground italic">{c[2]}</span>
				</>
			);
		return <span className="text-success">{v}</span>;
	}
	if (/^(true|false|null|yes|no|~)$/i.test(v) || /^-?\d/.test(v))
		return <span className="text-warn">{v}</span>;
	return <span key={kp}>{v}</span>;
}

function yamlLine(line: string, kp: string): ReactNode {
	if (/^\s*#/.test(line))
		return <span className="text-muted-foreground italic">{line}</span>;
	const m = /^(\s*)(-\s+)?(.*)$/.exec(line);
	if (!m) return line;
	const [, indent = "", dash = "", rest = ""] = m;
	const kv = /^([\w.$-]+)(:)(\s*)(.*)$/.exec(rest);
	return (
		<>
			{indent}
			{dash && <span className="text-muted-foreground">{dash}</span>}
			{kv ? (
				<>
					<span className="text-primary">{kv[1]}</span>
					<span className="text-muted-foreground">:</span>
					{kv[3]}
					{yamlValue(kv[4] ?? "", `${kp}v`)}
				</>
			) : (
				yamlValue(rest, `${kp}r`)
			)}
		</>
	);
}

/** Syntax-coloured YAML block. */
export function YamlBlock({
	source,
	className,
}: {
	source: string;
	className?: string;
}): ReactNode {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	return (
		<pre
			className={`overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-relaxed ${className ?? ""}`}
		>
			{lines.map((l, idx) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
				<div key={idx}>{yamlLine(l, `y${idx}`) || " "}</div>
			))}
		</pre>
	);
}
