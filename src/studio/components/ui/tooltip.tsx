import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";
import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				sideOffset={sideOffset}
				className={cn(
					"z-50 max-w-[380px] rounded-md border border-border bg-popover px-2.5 py-2 text-[12px] leading-relaxed text-popover-foreground shadow-[0_4px_14px_rgba(0,0,0,0.5)]",
					className,
				)}
				{...props}
			/>
		</TooltipPrimitive.Portal>
	);
}

/** Info "ⓘ" trigger with a hover tooltip — used on scoring column headers. */
export function InfoTip({ text }: { text: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="ml-1 cursor-help text-muted-foreground">ⓘ</span>
			</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}
