/**
 * CodingHarness brand mark for the studio nav. Inline SVG (no asset file) so it's
 * crisp at any size and theme-aware — the chip + wordmark draw from the `primary`
 * / `foreground` theme tokens, so it tracks light/dark. The mark is a `</>` code
 * glyph inside a rounded "harness" chip; the wordmark splits Coding / Harness.
 */
export function Logo() {
	return (
		<a
			href="/"
			aria-label="CodingHarness — home"
			className="mr-2 flex items-center gap-2 no-underline"
		>
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				role="img"
				aria-hidden="true"
			>
				<rect
					x="2"
					y="2"
					width="20"
					height="20"
					rx="5.5"
					fill="var(--primary)"
				/>
				<g
					stroke="var(--primary-foreground)"
					strokeWidth="1.7"
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M9 8.5 5.5 12 9 15.5" />
					<path d="M15 8.5 18.5 12 15 15.5" />
					<path d="M13.2 7.4 10.8 16.6" />
				</g>
			</svg>
			<span className="font-semibold tracking-tight">
				<span className="text-foreground">Coding</span>
				<span className="text-primary">Harness</span>
			</span>
		</a>
	);
}
