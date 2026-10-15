import { cva, type VariantProps } from "class-variance-authority";
import { Clock, GitMerge, GitPullRequestDraft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { AvatarStack, type AvatarUser } from "@/components/ui/avatar";
import { type CardLabel, LabelChip } from "@/components/ui/label-chip";
import { cn } from "@/lib/cn";

const issueCardVariants = cva(
	"relative flex min-w-0 flex-col gap-[5px] rounded-lg bg-surface px-[9px] py-2 outline-none transition-[box-shadow,rotate,scale] ease-pl",
	{
		variants: {
			dragState: {
				none: "shadow-card hover:shadow-[var(--pl-shadow-card),0_0_0_1px_var(--pl-border-strong)] focus-visible:shadow-[var(--pl-shadow-card),0_0_0_2px_var(--pl-focus)]",
				lifted: "-rotate-2 scale-[1.02] shadow-drag",
				ghost: "shadow-card",
			},
		},
		defaultVariants: { dragState: "none" },
	},
);

type DragState = NonNullable<VariantProps<typeof issueCardVariants>["dragState"]>;

type CardBase = {
	/** Absent for drafts and redacted items. */
	repo?: string;
	number?: number;
	title: string;
	labels: CardLabel[];
	assignees: AvatarUser[];
};

export type IssueCardData = CardBase &
	(
		| { kind: "issue"; state: "open" | "closed" | "draft" }
		| { kind: "pr"; state: "open" | "closed" | "merged" | "draft" }
	);

export type IssueCardProps = IssueCardData & {
	selected?: boolean;
	updated?: boolean;
	pending?: boolean;
	dragState?: Exclude<DragState, "none">;
} & Omit<ComponentProps<"div">, "title" | "children">;

function ClosedIssueIcon() {
	return (
		<span className="grid size-3 place-items-center rounded-xs bg-status-done text-surface">
			<svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
				<path
					d="M2.2 6.3 4.7 8.8 9.8 3.4"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}

function DraftIssueIcon() {
	return (
		<svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
			<rect x="1" y="1" width="9" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />
		</svg>
	);
}

function kindIcon(card: IssueCardData) {
	let glyph: ReactNode;
	if (card.kind === "issue") {
		switch (card.state) {
			case "open":
				glyph = <span className="size-[11px] rounded-xs shadow-[inset_0_0_0_1.5px_var(--pl-fg-3)]" />;
				break;
			case "closed":
				glyph = <ClosedIssueIcon />;
				break;
			case "draft":
				glyph = <DraftIssueIcon />;
				break;
		}
	} else {
		switch (card.state) {
			case "open":
				glyph = <GitMerge className="size-[15px]" />;
				break;
			case "merged":
				glyph = <GitMerge className="size-[15px] text-status-done" />;
				break;
			case "draft":
				glyph = <GitPullRequestDraft className="size-[15px]" />;
				break;
			case "closed":
				glyph = <ClosedIssueIcon />;
				break;
		}
	}
	return (
		<span aria-hidden className="grid h-[17px] w-3.5 shrink-0 place-items-center text-fg-3">
			{glyph}
		</span>
	);
}

export function IssueCard(card: IssueCardProps) {
	const {
		kind,
		state,
		repo,
		number,
		title,
		labels,
		assignees,
		selected = false,
		updated = false,
		pending = false,
		dragState,
		className,
		tabIndex = 0,
		...props
	} = card;
	return (
		<div
			data-slot="issue-card"
			data-kind={kind}
			data-state={state}
			data-drag-state={dragState}
			tabIndex={tabIndex}
			className={cn(issueCardVariants({ dragState: dragState ?? "none" }), className)}
			{...props}
		>
			<div className="flex items-start gap-[7px]">
				{kindIcon(card)}
				<span className="line-clamp-2 min-w-0 text-pretty font-medium text-base">{title}</span>
			</div>
			{labels.length > 0 ? (
				<div className="flex flex-wrap gap-1 pl-[21px]">
					{labels.map((label) => (
						<LabelChip key={`${label.name}-${label.color}`} name={label.name} color={label.color} />
					))}
				</div>
			) : null}
			<div className="flex h-[18px] items-center gap-[5px] pl-[21px] font-mono text-2xs text-fg-3">
				{repo ? <span>{repo}</span> : null}
				{number != null ? <span className="text-fg-2">#{number}</span> : null}
				{pending ? (
					<span className="inline-flex items-center gap-[3px] font-medium font-sans text-warning">
						<Clock className="size-[13px]" aria-hidden />
						Pending
					</span>
				) : null}
				<span className="flex-1" />
				{assignees.length > 0 ? <AvatarStack users={assignees} size={18} /> : null}
			</div>
			{selected ? (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 rounded-lg bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--pl-accent)]"
				/>
			) : null}
			{updated ? <div aria-hidden className="absolute top-2 right-2 size-1.5 rounded-full bg-accent" /> : null}
			{dragState === "ghost" ? (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 rounded-lg bg-bg-sunken opacity-[0.72] shadow-[inset_0_0_0_1px_var(--pl-border-strong)]"
				/>
			) : null}
		</div>
	);
}

type CardPlaceholderProps = ComponentProps<"div"> & { height: number };

export function CardPlaceholder({ height, className, style, ...props }: CardPlaceholderProps) {
	return (
		<div
			aria-hidden
			data-slot="card-placeholder"
			style={{ height, ...style }}
			className={cn("rounded-lg bg-accent-soft opacity-90 shadow-[inset_0_0_0_1.5px_var(--pl-accent)]", className)}
			{...props}
		/>
	);
}
