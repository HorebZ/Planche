import { DraftField } from "@/components/ui/issue-card";
import { useAuth } from "@/ipc/queries";
import { commandFor } from "@/keyboard/shortcuts";
import { draftKey, emptyDraft, useDrafts } from "@/stores/drafts";
import { useUi } from "@/stores/ui";
import type { DispatchResult } from "./useActions";

export type DraftSubmit = (title: string, observe?: (result: DispatchResult) => void) => Promise<DispatchResult>;

/** Session text and pending submissions survive blur, navigation and editor remounts. */
export function NewDraft({
	projectId,
	column,
	onSubmit,
}: {
	projectId: string;
	column: string | null;
	onSubmit: DraftSubmit;
}) {
	const auth = useAuth();
	const overlay = useUi((s) => s.overlay);
	const editor = overlay?.type === "draft" ? overlay.editor : "";
	const key = draftKey(auth.data?.id ?? "", projectId, column);
	const entry = useDrafts((s) => s.entries[key] ?? emptyDraft);
	const close = (focus: boolean) => {
		const state = useUi.getState();
		if (state.overlay?.type !== "draft" || state.overlay.editor !== editor) return;
		const target = state.selectedId
			? document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(state.selectedId)}"]`)
			: document.activeElement
					?.closest('[data-slot="board-column"], [data-slot="issue-list-group"]')
					?.querySelector<HTMLElement>('button[aria-label^="Add draft"]');
		state.open(null);
		if (focus) target?.focus();
	};
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				if (!auth.data?.id) return;
				const ticket = useDrafts.getState().begin(key, editor);
				if (!ticket) return;
				void onSubmit(ticket.title, (result) => {
					if (useDrafts.getState().finish(ticket, result)) close(true);
				});
			}}
		>
			<DraftField
				autoFocus
				disabled={!auth.data?.id}
				aria-busy={Boolean(entry.ticket)}
				value={entry.title}
				onChange={(event) => useDrafts.getState().edit(key, event.target.value)}
				onBlur={() => close(false)}
				onKeyDown={(event) => {
					if (commandFor(event.nativeEvent, "dialog") !== "dialog.close") return;
					event.preventDefault();
					useDrafts.getState().edit(key, "");
					close(true);
				}}
			/>
			{entry.message || !auth.data?.id ? (
				<p role="status" className="px-2 py-1 text-fg-3 text-xs">
					{entry.message || "Sign in to create a draft"}
				</p>
			) : null}
		</form>
	);
}
