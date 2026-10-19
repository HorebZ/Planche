import { Row, Section, State } from "../kit";

const colors = [
	"bg",
	"bg-sunken",
	"surface",
	"elevated",
	"hover",
	"active",
	"card",
	"primary",
	"primary-fg",
	"ring",
	"skeleton",
	"border",
	"border-strong",
	"fg",
	"fg-2",
	"fg-3",
	"accent",
	"accent-soft",
	"focus",
	"danger",
	"danger-soft",
	"success",
	"warning",
	"s-draft",
	"s-cancelled",
	"s-deleted",
	"s-todo",
	"s-doing",
	"s-review",
	"s-done",
];
const textSizes = ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl"];
const radii = ["xs", "sm", "md", "lg", "xl", "window"];
const shadows = ["card", "drag", "pop", "panel", "window"];

export function TokensSection() {
	return (
		<Section id="tokens" title="Tokens">
			{() => (
				<div className="flex flex-col gap-5">
					<Row label="colors">
						{colors.map((name) => (
							<State key={name} label={name}>
								<span
									className="block size-10 rounded-md shadow-[inset_0_0_0_1px_var(--pl-border)]"
									style={{ background: `var(--pl-${name})` }}
								/>
							</State>
						))}
					</Row>
					<Row label="type" className="items-baseline">
						{textSizes.map((size) => (
							<span key={size} style={{ fontSize: `var(--pl-text-${size})` }}>
								{size}
							</span>
						))}
						<span className="font-mono text-2xs text-fg-3">planche/app #226</span>
					</Row>
					<Row label="radius · shadow">
						{radii.map((r) => (
							<State key={r} label={`radius-${r}`}>
								<span
									className="block size-10 bg-surface shadow-card"
									style={{ borderRadius: `var(--pl-radius-${r})` }}
								/>
							</State>
						))}
						{shadows.map((s) => (
							<State key={s} label={`shadow-${s}`}>
								<span
									className="block h-10 w-16 rounded-lg bg-surface"
									style={{ boxShadow: `var(--pl-shadow-${s})` }}
								/>
							</State>
						))}
					</Row>
				</div>
			)}
		</Section>
	);
}
