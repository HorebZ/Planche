import { ChevronDown, CircleCheck, CircleDot } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IssueCardData } from "@/components/ui/issue-card";
import { LabelSummary } from "@/components/ui/label-summary";
import type { RepositoryIssueFilter, RepositoryIssueOptions } from "@/ipc/bindings.types";

export function RepositoryIssueFilters({
  filter,
  options,
  onChange,
}: {
  filter: RepositoryIssueFilter;
  options: RepositoryIssueOptions | null;
  onChange: (filter: RepositoryIssueFilter) => void;
}) {
  const labels = [
    ...new Set([...(options?.labels.map((label) => label.name) ?? []), ...filter.labels]),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <fieldset
        className="flex gap-1"
        aria-label="Issue state"
      >
        {(["open", "closed", "all"] as const).map((state) => (
          <Button
            key={state}
            size="sm"
            variant={filter.state === state ? "secondary" : "ghost"}
            aria-pressed={filter.state === state}
            onClick={() => onChange({ ...filter, state })}
          >
            {state === "open" ? "Open" : state === "closed" ? "Closed" : "All"}
          </Button>
        ))}
      </fieldset>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Filter by milestone"
          >
            {filter.milestone === null
              ? "All milestones"
              : (options?.milestones.find((milestone) => milestone.number === filter.milestone)
                  ?.title ?? `Milestone #${filter.milestone}`)}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 overflow-y-auto">
          <DropdownMenuRadioGroup
            value={String(filter.milestone ?? "all")}
            onValueChange={(value) =>
              onChange({ ...filter, milestone: value === "all" ? null : Number(value) })
            }
          >
            <DropdownMenuRadioItem value="all">All milestones</DropdownMenuRadioItem>
            {options?.milestones.map((milestone) => (
              <DropdownMenuRadioItem
                key={milestone.number}
                value={String(milestone.number)}
              >
                {milestone.title}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Filter by labels"
          >
            {filter.labels.length ? `${filter.labels.length} labels (any)` : "All labels"}
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-80 overflow-y-auto">
          {labels.length ? (
            labels.map((label) => (
              <DropdownMenuCheckboxItem
                key={label}
                checked={filter.labels.includes(label)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  onChange({
                    ...filter,
                    labels: checked
                      ? [...filter.labels, label]
                      : filter.labels.filter((name) => name !== label),
                  })
                }
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))
          ) : (
            <p className="px-2 py-1 text-fg-3 text-sm">No labels loaded</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {(filter.milestone !== null || filter.labels.length > 0) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...filter, milestone: null, labels: [] })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

export function RepositoryIssueList({
  issues,
  selected,
  onOpen,
  onSelect,
}: {
  issues: (IssueCardData & { id: string })[];
  selected?: string | null;
  onOpen: (id: string) => void;
  onSelect?: (id: string) => void;
}) {
  return issues.length ? (
    <ul
      aria-label="Repository issues"
      className="divide-y divide-line"
    >
      {issues.map((issue) => (
        <li key={issue.id}>
          <button
            type="button"
            data-item-id={issue.id}
            aria-label={`Open issue #${issue.number}: ${issue.title}`}
            aria-current={selected === issue.id ? "true" : undefined}
            onFocus={() => onSelect?.(issue.id)}
            onClick={() => onOpen(issue.id)}
            className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-hover focus-visible:shadow-ring aria-[current=true]:bg-active"
          >
            {issue.state === "closed" ? (
              <CircleCheck
                aria-label="Closed"
                className="mt-0.5 size-4 shrink-0 text-status-review"
              />
            ) : (
              <CircleDot
                aria-label="Open"
                className="mt-0.5 size-4 shrink-0 text-success"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block break-words font-medium text-sm">{issue.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-fg-3 text-xs">
                <span>
                  #{issue.number} · {issue.state === "closed" ? "Closed" : "Open"}
                </span>
                <LabelSummary labels={issue.labels} />
              </span>
            </span>
            <AvatarStack
              users={issue.assignees}
              size={18}
              on="bg"
            />
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="p-6 text-fg-3 text-sm">No issues match these filters.</p>
  );
}
