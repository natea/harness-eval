import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
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
					"z-50 max-w-[380px] rounded-md border border-border bg-popover px-2.5 py-2 text-[12px] leading-relaxed text-popover-foreground shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
					className,
				)}
				{...props}
			/>
		</TooltipPrimitive.Portal>
	);
}

/** Info icon trigger with a hover tooltip — used on scoring column headers. */
export function InfoTip({ text }: { text: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="ml-1 inline-flex cursor-help text-muted-foreground hover:text-foreground">
					<Info aria-hidden="true" className="size-3.5" />
				</span>
			</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}
