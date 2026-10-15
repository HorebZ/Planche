import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { BoardColumn } from "@/components/ui/board-column";
import { DragBubble, DragHelpBar } from "@/components/ui/drag";
import { CardPlaceholder, IssueCard, type IssueCardData } from "@/components/ui/issue-card";
import { LabelChip } from "@/components/ui/label-chip";
import { StatusChip, type StatusKey, StatusSquare, statusLabels } from "@/components/ui/status";
import { Row, Section, State } from "../kit";

const portrait =
	"data:image/svg+xml," +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><rect width="18" height="18" fill="black"/><circle cx="9" cy="7" r="3" fill="white"/><ellipse cx="9" cy="15" rx="5" ry="4" fill="white"/></svg>`,
	);

const statuses = ["backlog", "todo", "doing", "review", "done"] as const satisfies readonly StatusKey[];

const labels = {
	bug: { name: "bug", color: "d73a4a" },
	enhancement: { name: "enhancement", color: "a2eeef" },
	design: { name: "design", color: "7057ff" },
	docs: { name: "docs", color: "0075ca" },
	help: { name: "help wanted", color: "fbca04" },
	keyboard: { name: "keyboard", color: "a2eeef" },
	feature: { name: "feature", color: "7057ff" },
} as const;

const camille = { login: "camille-r" };
const theo = { login: "theo-m" };
const lea = { login: "lea-b" };
const amina = { login: "amina-m" };

const openIssue = {
	kind: "issue",
	state: "open",
	repo: "app",
	number: 223,
	title: "Column counter ignores filtered cards",
	labels: [labels.bug],
	assignees: [lea],
} satisfies IssueCardData;

const dragCard = {
	kind: "issue",
	state: "open",
	repo: "app",
	number: 214,
	title: "Shortcut to move a card to the next column",
	labels: [labels.keyboard, labels.feature],
	assignees: [camille],
} satisfies IssueCardData;

const cardClass = "w-[218px]";

export function BoardSection() {
	return (
		<Section id="board" title="Card · Column · Label · Status · Avatar · Drag">
			{() => (
				<div className="flex flex-col gap-5">
					<Row label="avatar">
						<State label="18 fallback">
							<Avatar alt="Camille Roux" size={18} />
						</State>
						<State label="20 fallback">
							<Avatar alt="camille-r" size={20} />
						</State>
						<State label="18 image">
							<Avatar src={portrait} alt="Camille Roux" size={18} />
						</State>
						<State label="stack 20">
							<AvatarStack users={[camille, theo, lea, amina]} size={20} />
						</State>
						<State label="stack 20 on bg">
							<AvatarStack users={[camille, theo, lea, amina]} size={20} on="bg" />
						</State>
					</Row>
					<Row label="label">
						<LabelChip name={labels.bug.name} color={labels.bug.color} />
						<LabelChip name={labels.enhancement.name} color={labels.enhancement.color} />
						<LabelChip name={labels.design.name} color={labels.design.color} />
						<LabelChip name={labels.docs.name} color={labels.docs.color} />
						<LabelChip name={labels.help.name} color={labels.help.color} />
					</Row>
					<Row label="status">
						{statuses.map((status) => (
							<State key={status} label={status}>
								<span className="inline-flex items-center gap-2">
									<StatusSquare status={status} />
									<StatusChip status={status} />
								</span>
							</State>
						))}
					</Row>
					<Row label="card">
						<State label="default">
							<IssueCard {...openIssue} className={cardClass} />
						</State>
						<State label="hover">
							<IssueCard {...openIssue} className={cardClass} data-preview="hover" />
						</State>
						<State label="focus">
							<IssueCard {...openIssue} className={cardClass} data-preview="focus" />
						</State>
						<State label="selected">
							<IssueCard {...openIssue} className={cardClass} selected />
						</State>
						<State label="updated">
							<IssueCard {...openIssue} className={cardClass} updated />
						</State>
						<State label="pending">
							<IssueCard {...openIssue} className={cardClass} pending />
						</State>
						<State label="long title">
							<IssueCard
								{...openIssue}
								className={cardClass}
								title="Show linked pull requests in the issue detail when the title wraps onto a second line and then stops"
							/>
						</State>
						<State label="no labels">
							<IssueCard {...openIssue} className={cardClass} labels={[]} assignees={[]} />
						</State>
					</Row>
					<Row label="kind">
						<State label="issue open">
							<IssueCard {...openIssue} className={cardClass} />
						</State>
						<State label="issue closed">
							<IssueCard {...openIssue} className={cardClass} state="closed" title="Onboarding: token validation" />
						</State>
						<State label="issue draft">
							<IssueCard {...openIssue} className={cardClass} state="draft" title="Draft: offline mutation queue" />
						</State>
						<State label="pr open">
							<IssueCard
								kind="pr"
								state="open"
								className={cardClass}
								repo="sync"
								number={232}
								title="sync: exponential backoff on 502 errors"
								labels={[labels.enhancement]}
								assignees={[theo]}
							/>
						</State>
						<State label="pr merged">
							<IssueCard
								kind="pr"
								state="merged"
								className={cardClass}
								repo="app"
								number={229}
								title="Command palette: fuzzy search"
								labels={[labels.feature]}
								assignees={[camille]}
							/>
						</State>
						<State label="pr draft">
							<IssueCard
								kind="pr"
								state="draft"
								className={cardClass}
								repo="app"
								number={240}
								title="Draft: keyboard drag sensor"
								labels={[]}
								assignees={[camille]}
							/>
						</State>
						<State label="pr closed">
							<IssueCard
								kind="pr"
								state="closed"
								className={cardClass}
								repo="sync"
								number={227}
								title="Fix WebSocket memory leak"
								labels={[labels.bug]}
								assignees={[lea]}
							/>
						</State>
					</Row>
					<Row label="column" className="items-start">
						<State label="default">
							<BoardColumn status="todo" count={3}>
								<IssueCard {...openIssue} />
								<IssueCard
									kind="issue"
									state="open"
									repo="app"
									number={226}
									title="Show linked PRs in issue detail"
									labels={[labels.feature, labels.design]}
									assignees={[camille, lea]}
								/>
							</BoardColumn>
						</State>
						<State label="empty">
							<BoardColumn status="backlog" count={0} empty />
						</State>
						<State label="drop target · 3 + 1">
							<BoardColumn status="doing" count={3} dropTarget>
								<IssueCard
									kind="issue"
									state="open"
									repo="app"
									number={231}
									title="Drag and drop across columns with persisted order"
									labels={[labels.feature]}
									assignees={[camille]}
								/>
								<CardPlaceholder height={90} />
							</BoardColumn>
						</State>
						<State label="9 more">
							<BoardColumn status="done" count={12} hiddenCount={9}>
								<IssueCard
									kind="issue"
									state="closed"
									repo="app"
									number={220}
									title="Onboarding: token validation"
									labels={[]}
									assignees={[camille]}
								/>
							</BoardColumn>
						</State>
					</Row>
					<Row label="drag">
						<DragMock />
					</Row>
				</div>
			)}
		</Section>
	);
}

function DragMock() {
	return (
		<div className="relative pb-14">
			<div className="flex items-start gap-2.5">
				<BoardColumn status="backlog" name={statusLabels.backlog} count={6}>
					<IssueCard
						kind="issue"
						state="open"
						repo="app"
						number={218}
						title="Export board as Markdown"
						labels={[labels.feature]}
						assignees={[]}
					/>
					<IssueCard {...dragCard} dragState="ghost" />
					<IssueCard
						kind="issue"
						state="open"
						repo="sync"
						number={209}
						title="Disk cache for GraphQL responses"
						labels={[labels.docs]}
						assignees={[theo]}
					/>
				</BoardColumn>
				<BoardColumn status="doing" count={3} dropTarget>
					<IssueCard
						kind="issue"
						state="open"
						repo="app"
						number={231}
						title="Drag and drop across columns with persisted order"
						labels={[labels.feature]}
						assignees={[camille]}
					/>
					<CardPlaceholder height={90} />
					<IssueCard
						kind="pr"
						state="open"
						repo="sync"
						number={232}
						title="sync: exponential backoff on 502 errors"
						labels={[labels.enhancement]}
						assignees={[theo]}
					/>
				</BoardColumn>
			</div>
			<IssueCard {...dragCard} dragState="lifted" className="absolute top-[108px] left-[168px] z-10 w-[218px]" />
			<DragBubble className="absolute top-[196px] left-[250px] z-20">Move to In progress · position 2</DragBubble>
			<DragHelpBar className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2" />
		</div>
	);
}
