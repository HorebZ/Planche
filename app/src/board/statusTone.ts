import type { StatusKey } from "@/components/ui/status";

/** GitHub's single-select option colors, mapped onto the five status tones. */
const tones: Record<string, StatusKey> = {
	GRAY: "backlog",
	BLUE: "todo",
	YELLOW: "doing",
	ORANGE: "doing",
	PURPLE: "review",
	GREEN: "done",
	RED: "backlog",
	PINK: "backlog",
};

/** `null` is the "No <field>" column. */
export function statusTone(color: string | null): StatusKey {
	return (color && tones[color]) || "backlog";
}
