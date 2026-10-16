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
export function statusTone(color: string | null, name?: string): StatusKey {
	const key = name?.toLowerCase().replace(/[ _-]/g, "");
	const statuses: Record<string, StatusKey> = {
		draft: "draft",
		todo: "todo",
		inprogress: "progress",
		inreview: "review",
		done: "done",
		cancelled: "cancelled",
		canceled: "cancelled",
		deleted: "deleted",
	};
	return (key && statuses[key]) || (color && tones[color]) || "backlog";
}
