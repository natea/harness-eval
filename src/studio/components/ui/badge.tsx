import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
	"inline-flex items-center rounded-[10px] px-2 py-0.5 text-[11px] font-medium",
	{
		variants: {
			variant: {
				default: "bg-secondary text-secondary-foreground",
				ok: "bg-success-bg text-success",
				warn: "bg-warn-bg text-warn",
				danger: "bg-danger-bg text-danger",
				outline: "border border-border text-muted-foreground",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

export function Badge({
	className,
	variant,
	...props
}: React.HTMLAttributes<HTMLSpanElement> &
	VariantProps<typeof badgeVariants>) {
	return (
		<span className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}
