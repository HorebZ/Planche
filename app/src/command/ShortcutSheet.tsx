import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { keysOf, type Scope, shortcuts } from "@/keyboard/shortcuts";
import { useUi } from "@/stores/ui";

const scopes: Record<Scope, string> = {
	global: "Anywhere",
	board: "On the board",
	menu: "In the Status menu",
	palette: "In the palette",
	dialog: "In a dialog or a field",
};

/** One row per command and scope, with every key that runs it. */
function rows(scope: Scope) {
	const byCommand = new Map<string, { label: string; keys: string[][] }>();
	for (const s of shortcuts.filter((s) => s.scope === scope)) {
		const row = byCommand.get(s.command) ?? { label: s.label, keys: [] };
		row.keys.push(keysOf(s.key));
		byCommand.set(s.command, row);
	}
	return [...byCommand.values()];
}

/** `?`: every shortcut of the table, by scope. */
export function ShortcutSheet() {
	const open = useUi((s) => s.overlay?.type === "help");
	return (
		<Dialog open={open} onOpenChange={(next) => useUi.getState().open(next ? { type: "help" } : null)}>
			<DialogContent className="max-h-[calc(100vh-120px)] max-w-[560px] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>Letter shortcuts stay silent while you type in a field.</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-x-6 gap-y-4">
					{(Object.keys(scopes) as Scope[]).map((scope) => (
						<section key={scope} className="flex flex-col gap-0.5">
							<h3 className="mb-1 font-semibold text-2xs text-fg-3">{scopes[scope]}</h3>
							{rows(scope).map((row) => (
								<div key={row.label} className="flex h-[26px] items-center gap-2 text-sm">
									<span className="min-w-0 flex-1 truncate">{row.label}</span>
									{row.keys.map((keys) => (
										<span key={keys.join()} className="flex gap-[3px]">
											{keys.map((key) => (
												<Kbd key={key}>{key}</Kbd>
											))}
										</span>
									))}
								</div>
							))}
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
