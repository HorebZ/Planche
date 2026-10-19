import { useState } from "react";
import { DraftField } from "@/components/ui/issue-card";
import { commandFor } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";
import { focusCard } from "./Card";

function close() {
	const { open, selectedId } = useUi.getState();
	open(null);
	if (selectedId) focusCard(selectedId);
}

/** `C`: a title field at the top of the column. Enter creates the draft, Esc or a click away drops it. */
export function NewDraft({ onSubmit }: { onSubmit: (title: string) => void }) {
	const [title, setTitle] = useState("");
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				if (!title.trim()) return;
				onSubmit(title.trim());
				close();
			}}
		>
			<DraftField
				autoFocus
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				onBlur={() => useUi.getState().open(null)}
				onKeyDown={(event) => {
					if (commandFor(event.nativeEvent, "dialog") !== "dialog.close") return;
					event.preventDefault();
					close();
				}}
			/>
		</form>
	);
}
