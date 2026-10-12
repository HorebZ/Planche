import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl"],
			radius: ["xs", "sm", "md", "lg", "xl", "window"],
			shadow: ["card", "drag", "pop", "window", "ring"],
			spacing: ["row", "control", "control-lg", "toolbar", "sidebar", "column"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
