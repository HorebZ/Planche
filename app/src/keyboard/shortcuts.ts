import { useEffect } from "react";

type Shortcut = { key: string; meta?: boolean; label: string };

/** Every keyboard shortcut of the app. */
export const shortcuts = {
	syncNow: { key: "r", meta: true, label: "⌘R" },
} as const satisfies Record<string, Shortcut>;

function matches(event: KeyboardEvent, shortcut: Shortcut) {
	return event.key.toLowerCase() === shortcut.key && event.metaKey === (shortcut.meta ?? false);
}

export function useShortcut(shortcut: Shortcut, run: () => void) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!matches(event, shortcut)) return;
			event.preventDefault();
			run();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [shortcut, run]);
}
