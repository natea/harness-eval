import type * as React from "react";
import { cn } from "../../lib/utils";

export function Table({
	className,
	...props
}: React.HTMLAttributes<HTMLTableElement>) {
	return (
		<div className="relative w-full overflow-auto">
			<table
				className={cn("w-full caption-bottom text-sm", className)}
				{...props}
			/>
		</div>
	);
}

export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) {
	return <thead className="[&_tr]:border-b [&_tr]:border-border" {...props} />;
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
	return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}

export function TableRow({
	className,
	...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
	return (
		<tr
			className={cn(
				"border-b border-border transition-colors hover:bg-muted",
				className,
			)}
			{...props}
		/>
	);
}

export function TableHead({
	className,
	...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
	return (
		<th
			className={cn(
				"h-9 px-2 text-left align-middle text-[12px] font-semibold uppercase tracking-wide text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function TableCell({
	className,
	...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
	return <td className={cn("px-2 py-1.5 align-middle", className)} {...props} />;
}
