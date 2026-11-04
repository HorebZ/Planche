import type { ItemContent, RepositoryIssueOptions, RepositoryIssues } from "../bindings.types";
import { fixtureFactory } from "./factory";
import { issueRecord } from "./issue.fixtures";

export const repositoryIssues = fixtureFactory<RepositoryIssues>({
  issues: [],
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
}[] {
  return Array.from({ length: 123 }, (_, index) => {
    const number = 123 - index;
    const content = issueRecord().content;
    if (content.kind !== "issue") {
      throw new Error("Issue fixture required");
    }

    return {
      issue: {
        ...content,
        id: `I_repo_${number}`,
        number,
        title: `Repository issue ${number}`,
        url: `https://github.com/HorebZ/Planche/issues/${number}`,
        state: number % 3 === 0 ? "closed" : "open",
        labels: repositoryIssueOptions().labels.filter(
          (label) => number % (label.name === "bug" ? 2 : 3) === 0,
        ),
      },
      milestone: number % 2 === 0 ? 1 : 2,
    };
  });
}
