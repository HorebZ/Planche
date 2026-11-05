import { useState } from "react";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { BoardColumn, BoardColumnScroll } from "@/components/ui/board-column";
import { BoardFilter, type BoardFilters, emptyFilters } from "@/components/ui/board-filter";
import { NoFilterResults } from "@/components/ui/board-states";
import { CommentComposer } from "@/components/ui/comment-composer";
import { DisplayMenu, type DisplayProperty } from "@/components/ui/display-menu";
import { DragHelpBar } from "@/components/ui/drag";
import { IssueActivityContent } from "@/components/ui/issue-activity";
import {
  CardPlaceholder,
  DraftField,
  IssueCard,
  type IssueCardData,
} from "@/components/ui/issue-card";
import {
  type DescriptionStatus,
  IssueDescriptionContent,
  IssueDescriptionEditor,
} from "@/components/ui/issue-description";
import { IssueDetail } from "@/components/ui/issue-detail";
import { IssueListGroup } from "@/components/ui/issue-list";
import { IssuePullRequestCount } from "@/components/ui/issue-metadata";
import { IssueResources } from "@/components/ui/issue-resources";
import { IssueTabPanel, IssueTabs } from "@/components/ui/issue-tabs";
import { LabelChip } from "@/components/ui/label-chip";
import { PriorityGlyph, ProgressRing } from "@/components/ui/planche-glyph";
import type { ProjectTone } from "@/components/ui/sidebar";
import { StatusChip, type StatusKey, StatusSquare, statusLabels } from "@/components/ui/status";
import type { IssueActivity } from "@/ipc/bindings.types";
import { Row, Section, State } from "../kit";

const activityPreview: IssueActivity = {
  entries: [
    {
      id: "created",
      kind: "created",
      author: "lea",
      created_at: "2026-11-03T09:00:00Z",
      body: null,
      subject: null,
    },
    {
      id: "comment",
      kind: "comment",
      author: "lea",
      created_at: "2026-11-03T10:00:00Z",
      body: "Ready for **review**.",
      subject: null,
    },
    {
      id: "assigned",
      kind: "assigned",
      author: "camille",
      created_at: "2026-11-03T10:01:00Z",
      body: null,
      subject: "lea",
    },
    {
      id: "label",
      kind: "labeled",
      author: "lea",
      created_at: "2026-11-03T10:02:00Z",
      body: null,
      subject: "enhancement",
    },
    {
      id: "closed",
      kind: "closed",
      author: null,
      created_at: "2026-11-03T10:03:00Z",
      body: null,
      subject: null,
    },
  ],
  pull_requests: [
    {
      id: "pr",
      repo: "HorebZ/Planche",
      number: 72,
      title: "Retain issue details in tabs",
      url: "https://github.com/HorebZ/Planche/pull/72",
      state: "merged",
      is_draft: false,
    },
  ],
  fetched_at: "2026-11-03T12:00:00Z",
};

const portrait =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><rect width="18" height="18" fill="black"/><circle cx="9" cy="7" r="3" fill="white"/><ellipse cx="9" cy="15" rx="5" ry="4" fill="white"/></svg>`,
  );

const statuses = [
  "draft",
  "todo",
  "progress",
  "review",
  "done",
  "cancelled",
  "deleted",
] as const satisfies readonly StatusKey[];

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
  author: { ...camille, avatarUrl: portrait },
  createdAt: "2026-10-31T12:00:00Z",
  updatedAt: "2026-11-05T12:00:00Z",
  commentCount: 2,
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

const cardClass = "w-[calc(var(--spacing-column)-10px)]";

export function BoardSection() {
  return (
    <Section
      id="board"
      title="Card · Column · Label · Status · Avatar · Drag"
    >
      {() => (
        <div className="flex flex-col gap-5">
          <Row label="issue detail">
            {(["issue", "draft", "redacted", "missing"] as const).map((kind) => (
              <State
                key={kind}
                label={kind}
                className="relative h-[440px] w-full overflow-hidden rounded-xl bg-bg shadow-panel"
              >
                <IssueDetail
                  itemId={kind}
                  item={
                    kind === "missing"
                      ? null
                      : kind === "issue"
                        ? openIssue
                        : {
                            ...openIssue,
                            number: undefined,
                            repo: undefined,
                            title: kind === "draft" ? "A project draft" : "Redacted item",
                            assignees: [],
                            labels: [],
                          }
                  }
                  project="Planche"
                  status={{ name: "Todo", tone: "todo" }}
                  notice={
                    kind === "draft"
                      ? "This draft has no GitHub issue page yet."
                      : kind === "redacted"
                        ? "Content unavailable with your current access."
                        : kind === "missing"
                          ? "This item is no longer in the project."
                          : undefined
                  }
                  editable={kind === "issue" || kind === "draft"}
                  expanded
                  onExpandedChange={() => {}}
                  onBack={() => {}}
                  onPrevious={() => {}}
                  onNext={() => {}}
                  onStatus={() => {}}
                  onAssign={() => {}}
                  onGitHub={kind === "redacted" || kind === "missing" ? undefined : () => {}}
                />
              </State>
            ))}
          </Row>
          <Row label="issue side panel · full width in a narrow container">
            <IssuePanelPreview />
          </Row>
          <Row label="retained issue tabs · overflow and keyboard navigation">
            <IssueTabsPreview />
          </Row>
          <Row label="issue description">
            {(
              [
                "loading",
                "refreshing",
                "ready",
                "offline",
                "error",
                "unavailable",
              ] as const satisfies DescriptionStatus[]
            ).map((status) => (
              <State
                key={status}
                label={status}
                className="w-full rounded-xl bg-bg p-4"
              >
                <IssueDescriptionContent
                  onOpenLink={() => {}}
                  sourceUrl="https://github.com/HorebZ/Planche/issues/35"
                  status={status}
                  body={
                    ["ready", "refreshing", "offline"].includes(status)
                      ? "# Release notes\n\nA **formatted** description with a [link](https://github.com/HorebZ/Planche). References: #61635 and other/repo#42.\n\n- Keep drafts\n- Restore focus\n\n```rust\nlet ready = true;\n```\n\n![Screenshot](https://example.com/blocked.png)"
                      : undefined
                  }
                  onRetry={() => {}}
                />
              </State>
            ))}
          </Row>
          <Row label="edit issue description">
            {(["editing", "saving", "error", "queued", "refused"] as const).map((state) => (
              <State
                key={state}
                label={state}
                className="w-full rounded-xl bg-bg p-4"
              >
                {state === "queued" || state === "refused" ? (
                  <IssueDescriptionContent
                    status="ready"
                    body="Updated **description**."
                    pending={state === "queued"}
                    syncError={state === "refused" ? "GitHub refused the update" : undefined}
                    onEdit={() => {}}
                    onRetry={() => {}}
                    onOpenLink={() => {}}
                  />
                ) : (
                  <DescriptionEditorPreview state={state} />
                )}
              </State>
            ))}
          </Row>
          <Row label="comment composer">
            {(
              [
                "empty",
                "ready",
                "saving",
                "locked",
                "queued",
                "uncertain",
                "failed",
                "sent",
              ] as const
            ).map((state) => (
              <State
                key={state}
                label={state}
                className="w-full rounded-xl bg-bg p-4"
              >
                <CommentComposer
                  value={state === "empty" ? "" : "Ready for **review**."}
                  onChange={() => {}}
                  onSubmit={() => {}}
                  permitted={state !== "locked"}
                  submitting={state === "saving"}
                  onRetry={() => {}}
                  onOpenLink={() => {}}
                  submissions={
                    ["queued", "uncertain", "failed", "sent"].includes(state)
                      ? [
                          {
                            request_id: "preview",
                            body: "Saved comment text.",
                            status: state as "queued" | "uncertain" | "failed" | "sent",
                            error:
                              state === "failed"
                                ? "Publication could not be confirmed. Check GitHub before retrying."
                                : null,
                            entry: null,
                          },
                        ]
                      : []
                  }
                />
              </State>
            ))}
          </Row>
          <Row label="issue resources">
            {(["empty", "dependencies", "pull requests"] as const).map((state) => (
              <State
                key={state}
                label={state}
                className="w-full rounded-xl bg-bg p-4"
              >
                <IssueResources
                  blockedBy={state === "dependencies" ? 2 : 0}
                  blocking={state === "dependencies" ? 1 : 0}
                  pullRequests={
                    state === "pull requests"
                      ? ["open", "closed", "merged", "draft"].map((state) => ({
                          ...activityPreview.pull_requests[0],
                          id: state,
                          state:
                            state === "draft" ? "open" : (state as "open" | "closed" | "merged"),
                          is_draft: state === "draft",
                        }))
                      : []
                  }
                  onOpenLink={() => {}}
                />
              </State>
            ))}
          </Row>
          <Row label="issue activity">
            {(
              [
                "loading",
                "refreshing",
                "ready",
                "offline",
                "error",
                "unavailable",
                "empty",
              ] as const
            ).map((status) => (
              <State
                key={status}
                label={status}
                className="w-full rounded-xl bg-bg p-4"
              >
                <IssueActivityContent
                  status={status === "empty" ? "ready" : status}
                  activity={
                    status === "empty"
                      ? { ...activityPreview, entries: [], pull_requests: [] }
                      : ["ready", "refreshing", "offline", "error"].includes(status)
                        ? activityPreview
                        : undefined
                  }
                  sourceUrl="https://github.com/HorebZ/Planche/issues/56"
                  onRetry={() => {}}
                  onOpenLink={() => {}}
                />
              </State>
            ))}
          </Row>
          <Row label="avatar">
            <State label="18 fallback">
              <Avatar
                alt="Camille Roux"
                size={18}
              />
            </State>
            <State label="20 fallback">
              <Avatar
                alt="camille-r"
                size={20}
              />
            </State>
            <State label="18 image">
              <Avatar
                src={portrait}
                alt="Camille Roux"
                size={18}
              />
            </State>
            {(["rest", "hover", "focus"] as const).map((state) => (
              <State
                key={state}
                label={`unassigned · ${state}`}
              >
                <div
                  className="group/assignees"
                  data-preview={state === "rest" ? undefined : state}
                >
                  <AvatarStack
                    users={[]}
                    size={18}
                  />
                </div>
              </State>
            ))}
            <State label="stack 20">
              <AvatarStack
                users={[camille, theo, lea, amina]}
                size={20}
              />
            </State>
            <State label="stack 20 on bg">
              <AvatarStack
                users={[camille, theo, lea, amina]}
                size={20}
                on="bg"
              />
            </State>
          </Row>
          <Row label="linked pull requests">
            {(["open", "draft", "closed", "merged"] as const).map((state) => (
              <State
                key={state}
                label={state}
              >
                <IssuePullRequestCount
                  count={1}
                  pullRequest={{
                    number: 42,
                    title: "Fix the issue",
                    state: state === "draft" ? "open" : state,
                    is_draft: state === "draft",
                  }}
                />
              </State>
            ))}
            <State label="multiple">
              <IssuePullRequestCount count={3} />
            </State>
          </Row>
          <Row label="label">
            <LabelChip
              name={labels.bug.name}
              color={labels.bug.color}
            />
            <LabelChip
              name={labels.enhancement.name}
              color={labels.enhancement.color}
            />
            <LabelChip
              name={labels.design.name}
              color={labels.design.color}
            />
            <LabelChip
              name={labels.docs.name}
              color={labels.docs.color}
            />
            <LabelChip
              name={labels.help.name}
              color={labels.help.color}
            />
          </Row>
          <Row label="status">
            {statuses.map((status) => (
              <State
                key={status}
                label={status}
              >
                <span className="inline-flex items-center gap-2">
                  <StatusSquare status={status} />
                  <StatusChip status={status} />
                </span>
              </State>
            ))}
          </Row>
          <Row label="priority and progress">
            {(["none", "low", "medium", "high", "urgent"] as const).map((priority) => (
              <State
                key={priority}
                label={priority}
              >
                <PriorityGlyph priority={priority} />
              </State>
            ))}
            <ProgressRing value={0} />
            <ProgressRing value={0.4} />
            <ProgressRing value={1} />
          </Row>
          <Row label="list">
            <div className="w-full">
              <IssueListGroup
                name="Todo"
                status="todo"
                draft={
                  <DraftField
                    value="Draft kept in List"
                    onChange={() => {}}
                  />
                }
                onAddDraft={() => {}}
                items={[{ ...openIssue, id: "preview" }]}
                onOpen={() => {}}
              />
            </div>
          </Row>
          <Row label="collapsed list group">
            <div className="w-full">
              <IssueListGroup
                name="Todo"
                status="todo"
                expanded={false}
                onExpandedChange={() => {}}
                items={[{ ...openIssue, id: "collapsed-preview" }]}
                onOpen={() => {}}
              />
            </div>
          </Row>
          <Row label="card">
            <FilterPreview />
            <DisplayPreview />
            <State label="default">
              <IssueCard
                {...openIssue}
                className={cardClass}
                priority="high"
                createdAt="2026-10-13"
                subIssues={{ completed: 2, total: 5 }}
                pullRequestCount={1}
                pullRequest={{
                  number: 240,
                  title: "Fix the column counter",
                  state: "merged",
                  is_draft: false,
                }}
                blockedBy={1}
                blocking={2}
              />
            </State>
            <State label="hover">
              <IssueCard
                {...openIssue}
                className={cardClass}
                data-preview="hover"
              />
            </State>
            <State label="focus">
              <IssueCard
                {...openIssue}
                className={cardClass}
                data-preview="focus"
              />
            </State>
            <State label="selected">
              <IssueCard
                {...openIssue}
                className={cardClass}
                selected
              />
            </State>
            <State label="updated">
              <IssueCard
                {...openIssue}
                className={cardClass}
                updated
              />
            </State>
            <State label="long title">
              <IssueCard
                {...openIssue}
                className={cardClass}
                title="Show linked pull requests in the issue detail when the title wraps onto a second line and then stops"
              />
            </State>
            <State label="long URL title">
              <IssueCard
                {...openIssue}
                className={cardClass}
                title="https://github.com/Planche/Planche/issues/very-long-ticket-title-without-spaces-that-must-stay-inside-the-card-and-truncate-instead-of-overflowing-the-board-column-or-making-the-card-grow-indefinitely"
              />
            </State>
            <State label="no labels">
              <IssueCard
                {...openIssue}
                className={cardClass}
                labels={[]}
                assignees={[]}
              />
            </State>
          </Row>
          <Row label="kind">
            <State label="issue open">
              <IssueCard
                {...openIssue}
                className={cardClass}
              />
            </State>
            <State label="issue closed">
              <IssueCard
                {...openIssue}
                className={cardClass}
                state="closed"
                title="Onboarding: token validation"
              />
            </State>
            <State label="issue draft">
              <IssueCard
                {...openIssue}
                className={cardClass}
                state="draft"
                title="Draft: offline mutation queue"
              />
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
          <Row
            label="column"
            className="items-start"
          >
            <State label="default">
              <BoardColumn
                status="todo"
                count={3}
              >
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
              <DraftColumnPreview />
            </State>
            <State label="bottom fade · scroll">
              <BoardColumn
                status="todo"
                count={3}
                className="h-[260px]"
              >
                <BoardColumnScroll>
                  <div className="flex flex-col gap-2">
                    <IssueCard {...openIssue} />
                    <IssueCard {...dragCard} />
                    <IssueCard
                      {...openIssue}
                      title="Keep the last card readable after scrolling"
                    />
                  </div>
                </BoardColumnScroll>
              </BoardColumn>
            </State>
            <State label="drop target · 3 + 1">
              <BoardColumn
                status="doing"
                count={3}
                dropTarget
              >
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
              <BoardColumn
                status="done"
                count={12}
                hiddenCount={9}
              >
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

function IssuePanelPreview() {
  const [opened, setOpened] = useState(true);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-slot="issue-panel-preview"
      className="@container relative flex h-[440px] w-full overflow-hidden rounded-xl bg-bg shadow-panel"
    >
      <div
        className={`min-w-0 flex-1 ${opened ? (expanded ? "invisible" : "@min-[960px]:visible invisible") : ""}`}
      >
        <IssueListGroup
          name="Todo"
          status="todo"
          items={[{ ...openIssue, id: "panel-preview" }]}
          onOpen={() => setOpened(true)}
        />
      </div>
      {opened ? (
        <IssueDetail
          itemId="panel-preview"
          item={{ ...openIssue, priority: "low" }}
          project="Planche"
          status={{ name: "Todo", tone: "todo" }}
          editable
          expanded={expanded}
          onExpandedChange={setExpanded}
          onBack={() => setOpened(false)}
          onStatus={() => {}}
          onAssign={() => {}}
          onGitHub={() => {}}
        >
          <IssueDescriptionContent
            status="ready"
            body={
              "Keep the **board or list** visible while reading an issue.\n\n- Close to return to the collection\n- Expand for more space"
            }
            onRetry={() => {}}
            onOpenLink={() => {}}
          />
          <IssueActivityContent
            status="ready"
            activity={activityPreview}
            blockedBy={2}
            blocking={1}
            onRetry={() => {}}
            onOpenLink={() => {}}
          />
        </IssueDetail>
      ) : null}
    </div>
  );
}

function IssueTabsPreview() {
  const [tabs, setTabs] = useState<
    {
      id: string;
      title: string;
      project: string;
      kind?: "board";
      tone?: ProjectTone;
      closable?: boolean;
      status?: StatusKey;
    }[]
  >([
    {
      id: "source",
      title: "Planche / Cabane",
      project: "Planche",
      kind: "board",
      tone: "doing",
      closable: false,
    },
    {
      id: "issue-223",
      title: "Issue 223: column counter ignores filtered cards",
      project: "Planche",
      status: "todo",
    },
    {
      id: "issue-226",
      title: "Issue 226: show linked PRs in issue detail",
      project: "Planche",
      status: "progress",
    },
    {
      id: "issue-219",
      title: "Issue 219: compare Solo and Team",
      project: "Website",
      status: "done",
    },
  ]);
  const [active, setActive] = useState<string>("issue-223");

  return (
    <div
      data-slot="issue-tabs-preview"
      className="flex h-[440px] w-full overflow-hidden bg-bg-sunken"
    >
      <IssueTabs
        tabs={tabs}
        active={active}
        onSelect={setActive}
        onAdd={() => {
          const id = crypto.randomUUID();

          setTabs([
            ...tabs,
            { id, title: "Planche / Cabane", project: "Planche", kind: "board", tone: "doing" },
          ]);
          setActive(id);
        }}
        onClose={(id) => {
          setTabs(tabs.filter((tab) => tab.id !== id));
          if (active === id) {
            setActive("source");
          }
        }}
      >
        {tabs.map((tab) => (
          <IssueTabPanel
            key={tab.id}
            value={tab.id}
          >
            {tab.kind === "board" ? (
              <IssueListGroup
                name="Todo"
                status="todo"
                items={[{ ...openIssue, id: "preview" }]}
                onOpen={() => setActive("issue-223")}
              />
            ) : (
              <IssueDetail
                itemId={tab.id}
                item={{ ...openIssue, title: tab.title }}
                project={tab.project}
                status={{ name: statusLabels[tab.status ?? "draft"], tone: tab.status ?? "draft" }}
                editable
                expanded
                active={active === tab.id}
                onBack={() => setActive("source")}
                onStatus={() => {}}
                onAssign={() => {}}
              />
            )}
          </IssueTabPanel>
        ))}
      </IssueTabs>
    </div>
  );
}

function DragMock() {
  return (
    <div className="relative pb-14">
      <div className="flex items-start gap-2.5">
        <BoardColumn
          status="backlog"
          name={statusLabels.backlog}
          count={6}
        >
          <IssueCard
            kind="issue"
            state="open"
            repo="app"
            number={218}
            title="Export board as Markdown"
            labels={[labels.feature]}
            assignees={[]}
          />
          <IssueCard
            {...dragCard}
            dragState="ghost"
          />
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
        <BoardColumn
          status="doing"
          count={3}
          dropTarget
        >
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
      <IssueCard
        {...dragCard}
        dragState="lifted"
        className="absolute top-[108px] left-[168px] z-10 w-[218px]"
      />
      <DragHelpBar className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2" />
    </div>
  );
}

function DraftColumnPreview() {
  const [drafting, setDrafting] = useState(false);

  return (
    <BoardColumn
      status="backlog"
      count={0}
      empty={!drafting}
      onAddDraft={() => setDrafting(true)}
    >
      {drafting ? (
        <DraftField
          autoFocus
          aria-label="Draft title"
          onBlur={() => setDrafting(false)}
        />
      ) : null}
    </BoardColumn>
  );
}

function DisplayPreview() {
  const [layout, setLayout] = useState<"board" | "list">("board");
  const [hidden, setHidden] = useState<DisplayProperty[]>([]);

  return (
    <div className="flex w-[218px] flex-col gap-2">
      <DisplayMenu
        layout={layout}
        onLayoutChange={setLayout}
        hidden={hidden}
        onChange={(property, visible) =>
          setHidden((current) =>
            visible ? current.filter((item) => item !== property) : [...current, property],
          )
        }
      />
      <IssueCard
        {...openIssue}
        hiddenProperties={hidden}
        labels={[
          { ...labels.feature, name: "A long label name that needs truncation" },
          labels.bug,
          labels.design,
          labels.docs,
          labels.keyboard,
        ]}
      />
    </div>
  );
}

function FilterPreview() {
  const [selected, setSelected] = useState<BoardFilters>({
    ...emptyFilters,
    statuses: ["todo"],
    assignees: ["me"],
    labels: ["bug"],
  });

  return (
    <div className="flex w-[300px] flex-col gap-2">
      <BoardFilter
        selected={selected}
        onChange={setSelected}
        groups={[
          {
            key: "statuses",
            name: "Status",
            options: [
              { id: "todo", name: "Todo", status: "todo" },
              { id: null, name: "No Status", status: "draft" },
            ],
          },
          { key: "assignees", name: "Assignee", options: [{ id: "me", name: "Me (camille-r)" }] },
          {
            key: "labels",
            name: "Label",
            options: [
              { id: "bug", name: "bug" },
              { id: "feature", name: "feature" },
            ],
          },
          {
            key: "repositories",
            name: "Repository",
            options: [{ id: "planche/app", name: "planche/app" }],
          },
        ]}
      />
      <NoFilterResults onReset={() => setSelected(emptyFilters)} />
    </div>
  );
}

function DescriptionEditorPreview({ state }: { state: "editing" | "saving" | "error" }) {
  const [body, setBody] = useState("Updated **description**.\n\n- Ready for review");

  return (
    <IssueDescriptionEditor
      value={body}
      onChange={setBody}
      onSave={() => {}}
      onCancel={() => {}}
      saving={state === "saving"}
      error={state === "error" ? "Could not save the description. Your text is still here." : null}
      onOpenLink={() => {}}
    />
  );
}
