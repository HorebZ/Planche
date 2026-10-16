import { useEffect } from "react";

type Shortcut = { key: string; meta?: boolean; shift?: boolean; label: string };

/** Every keyboard shortcut of the app. */
export const shortcuts = {
	hideSidebar: { key: "h", meta: true, shift: true, label: "⌘⇧H" },
	settings: { key: ",", meta: true, label: "⌘," },
	palette: { key: "k", meta: true, label: "⌘K" },
	syncNow: { key: "r", meta: true, label: "⌘R" },
} as const satisfies Record<string, Shortcut>;

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut) {
	return (
		event.key.toLowerCase() === shortcut.key &&
		event.metaKey === (shortcut.meta ?? false) &&
		event.shiftKey === (shortcut.shift ?? false) &&
		!event.altKey &&
		!event.ctrlKey
	);
}

export function useShortcut(shortcut: Shortcut, run: () => void) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!matchesShortcut(event, shortcut)) return;
			event.preventDefault();
			run();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shortcut, run]);
}
