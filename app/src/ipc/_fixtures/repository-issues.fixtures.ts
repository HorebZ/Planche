import type {
  ItemContent,
  RepositoryIssueOptions,
  RepositoryIssueStatus,
  RepositoryIssues,
} from "../bindings.types";
import { fixtureFactory } from "./factory";
import { issueRecord } from "./issue.fixtures";

export const repositoryIssues = fixtureFactory<RepositoryIssues>({
  issues: [],
  columns: ["backlog", "ready", "in_progress", "review", "done"].map((status) => ({
    status: status as RepositoryIssueStatus,
    items: [],
  })),
  next_cursor: null,
  complete: true,
  fetched_at: "2026-11-04T12:00:00Z",
});
export const repositoryIssueOptions = fixtureFactory<RepositoryIssueOptions>({
  labels: [
    { name: "bug", color: "d73a4a" },
    { name: "help", color: "008672" },
  ],
  milestones: [
    { number: 1, title: "v1.3" },
    { number: 2, title: "Backlog" },
  ],
});

export function repositoryIssueSource(): {
  issue: Extract<ItemContent, { kind: "issue" }>;
  milestone: number;
  status: RepositoryIssueStatus;
}[] {
  return Array.from({ length: 123 }, (_, index) => {
    const number = 123 - index;
    const content = issueRecord().content;
    if (content.kind !== "issue") {
      throw new Error("Issue fixture required");
    }

    const state = number % 3 === 0 ? "closed" : "open";
    const status: RepositoryIssueStatus =
      state === "closed"
        ? "done"
        : number % 5 === 0
          ? "backlog"
          : number % 5 === 1
            ? "ready"
            : number % 5 === 2
              ? "in_progress"
              : "review";
    const draft = status === "backlog" && number % 2 === 0;

    return {
      status,
      issue: {
        ...content,
        id: `I_repo_${number}`,
        number,
        title: `Repository issue ${number}`,
        url: `https://github.com/HorebZ/Planche/issues/${number}`,
        state,
        assignees: status === "in_progress" ? [{ id: "U_dev", login: "dev", avatar_url: "" }] : [],
        details: {
          blocked_by: status === "backlog" && !draft ? 1 : 0,
          has_draft_pull_request: draft,
          pull_request_count: draft || status === "review" ? 1 : 0,
          pull_request:
            draft || status === "review"
              ? {
                  number: number + 200,
                  title: `Fix issue ${number}`,
                  state: "open",
                  is_draft: draft,
                }
              : null,
        },
        labels: repositoryIssueOptions().labels.filter(
          (label) => number % (label.name === "bug" ? 2 : 3) === 0,
        ),
      },
      milestone: number % 2 === 0 ? 1 : 2,
    };
  });
}
