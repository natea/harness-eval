import * as SliderPrimitive from "@radix-ui/react-slider";
import type * as React from "react";
import { cn } from "../../lib/utils";

export function Slider({
	className,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	return (
		<SliderPrimitive.Root
			className={cn(
				"relative flex w-full touch-none select-none items-center",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-secondary">
				<SliderPrimitive.Range className="absolute h-full bg-primary" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb className="block size-4 rounded-full border border-input bg-background shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
		</SliderPrimitive.Root>
	);
}
