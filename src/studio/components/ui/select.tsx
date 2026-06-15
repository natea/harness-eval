import * as SelectPrimitive from "@radix-ui/react-select";
import type * as React from "react";
import { cn } from "../../lib/utils";

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
	className,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
	return (
		<SelectPrimitive.Trigger
			className={cn(
				"flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-card px-2.5 text-[13px] text-foreground hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50",
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon className="text-muted-foreground">
				▼
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

export function SelectContent({
	className,
	children,
	position = "popper",
	...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				position={position}
				className={cn(
					"z-50 max-h-72 min-w-[10rem] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-[0_4px_14px_rgba(0,0,0,0.5)]",
					position === "popper" && "translate-y-1",
					className,
				)}
				{...props}
			>
				<SelectPrimitive.Viewport className="p-0">
					{children}
				</SelectPrimitive.Viewport>
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

export function SelectItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-[13px] outline-none data-[highlighted]:bg-muted data-[state=checked]:text-foreground",
				className,
			)}
			{...props}
		>
			<span className="absolute left-2 text-primary-hover">
				<SelectPrimitive.ItemIndicator>✓</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}
