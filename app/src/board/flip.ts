import type { ItemId } from "@/ipc/bindings";

export type Rect = { left: number; top: number };

function cardElement(id: ItemId) {
	return document.querySelector<HTMLElement>(`[data-slot="issue-card"][data-item-id="${id}"]`);
}

/** Where the card is on screen now, before the board moves it. */
export function cardRect(id: ItemId): Rect | null {
	const rect = cardElement(id)?.getBoundingClientRect();
	return rect ? { left: rect.left, top: rect.top } : null;
}

/**
 * Slides the card from `from` to where it is now, in the slow motion token. Returns false
 * when the card has not moved yet, so the caller can wait for the commit that moves it.
 */
export function flip(id: ItemId, from: Rect, lifted = false) {
	const element = cardElement(id);
	if (!element) return false;
	const to = element.getBoundingClientRect();
	const dx = from.left - to.left;
	const dy = from.top - to.top;
	if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return false;
	const style = getComputedStyle(document.documentElement);
	const duration = Number.parseFloat(style.getPropertyValue("--pl-dur-slow"));
	element.animate(
		[
			{ transform: `translate(${dx}px, ${dy}px)${lifted ? " rotate(-2deg) scale(1.02)" : ""}`, zIndex: 10 },
			{ transform: "none", zIndex: 10 },
		],
		{ duration: Number.isNaN(duration) ? 200 : duration, easing: style.getPropertyValue("--pl-ease") || "ease-out" },
	);
	return true;
}
