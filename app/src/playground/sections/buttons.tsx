import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Row, Section, State } from "../kit";

const states = [
	{ label: "default", preview: undefined, disabled: false },
	{ label: "hover", preview: "hover", disabled: false },
	{ label: "focus-visible", preview: "focus", disabled: false },
	{ label: "disabled", preview: undefined, disabled: true },
] as const;

export function ButtonsSection() {
	return (
		<Section id="buttons" title="Button · Kbd">
			{() => (
				<div className="flex flex-col gap-5">
					<Row label="primary">
						{states.map((s) => (
							<State key={s.label} label={s.label}>
								<Button variant="primary" data-preview={s.preview} disabled={s.disabled}>
									New issue
									<Kbd variant="onAccent" size="sm">
										C
									</Kbd>
								</Button>
							</State>
						))}
					</Row>
					{(["secondary", "ghost", "danger"] as const).map((variant) => (
						<Row key={variant} label={variant}>
							{states.map((s) => (
								<State key={s.label} label={s.label}>
									<Button variant={variant} data-preview={s.preview} disabled={s.disabled}>
										{variant === "danger" ? "Sign out" : variant === "ghost" ? "Filter" : "Secondary"}
									</Button>
								</State>
							))}
						</Row>
					))}
					<Row label="icon · sm">
						{states.map((s) => (
							<State key={s.label} label={s.label}>
								<Button variant="ghost" size="icon" aria-label="More" data-preview={s.preview} disabled={s.disabled}>
									<MoreHorizontal />
								</Button>
							</State>
						))}
						<State label="sm">
							<Button variant="ghost" size="sm" className="bg-hover">
								Undo
								<Kbd size="sm">⌘Z</Kbd>
							</Button>
						</State>
					</Row>
					<Row label="kbd">
						<State label="default">
							<Kbd>⌘K</Kbd>
						</State>
						<State label="default">
							<Kbd>⇧M</Kbd>
						</State>
						<State label="default">
							<Kbd>esc</Kbd>
						</State>
						<State label="sm">
							<Kbd size="sm">C</Kbd>
						</State>
						<State label="plain">
							<Kbd variant="plain" size="inline">
								⌘⇧C
							</Kbd>
						</State>
					</Row>
				</div>
			)}
		</Section>
	);
}
