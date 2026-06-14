import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn class-name combiner: clsx for conditionals + tailwind-merge for conflicts. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
