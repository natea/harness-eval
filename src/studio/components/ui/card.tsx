import type * as React from "react";
import { cn } from "../../lib/utils";

export function Card({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-card text-card-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function CardHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("px-4 pt-3.5 pb-2", className)} {...props} />;
}

export function CardTitle({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h3
			className={cn("text-sm font-semibold leading-none", className)}
			{...props}
		/>
	);
}

export function CardContent({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("px-4 pb-4", className)} {...props} />;
}
