// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";
import { render } from "@/test-support";
import { IssueCommentCount, IssueMetadata, IssuePullRequestCount } from "./issue-metadata";

test("metadata displays the creator avatar and relative creation and update dates", () => {
  vi.setSystemTime(new Date("2026-11-05T13:00:00Z"));
  const { container } = render(
    <IssueMetadata
      author={{ login: "HorebZ", avatarUrl: "https://avatars.githubusercontent.com/u/1" }}
      createdAt="2026-10-31T13:00:00Z"
      updatedAt="2026-11-05T12:00:00Z"
    />,
  );

  expect(
    container.querySelector('[title="Created by HorebZ"] [data-slot="avatar"]'),
  ).not.toBeNull();
  expect(container.textContent).toContain("HorebZOpened 5d ago·Updated 1h ago");
  expect([...container.querySelectorAll("time")].map((time) => time.dateTime)).toEqual([
    "2026-10-31T13:00:00Z",
    "2026-11-05T12:00:00Z",
  ]);
});

test.each([
  ["2026-11-05T12:59:50Z", "just now"],
  ["2026-11-05T12:45:00Z", "15m ago"],
  ["2026-11-06T12:00:00Z", "just now"],
])("relative dates handle short and future times: %s", (updatedAt, expected) => {
  vi.setSystemTime(new Date("2026-11-05T13:00:00Z"));
  const { container } = render(<IssueMetadata updatedAt={updatedAt} />);

  expect(container.textContent).toBe(`Updated ${expected}`);
});

test("old cache entries and malformed dates do not invent metadata", () => {
  const { container } = render(<IssueMetadata createdAt="invalid" />);

  expect(container.querySelector('[data-slot="issue-metadata"]')).toBeNull();
});

test("comment totals distinguish zero from unavailable counts", () => {
  const { container } = render(
    <>
      <IssueCommentCount />
      <IssueCommentCount count={0} />
      <IssueCommentCount count={2} />
    </>,
  );

  expect(container.querySelectorAll('[data-slot="issue-comment-count"]')).toHaveLength(2);
  expect(container.querySelector('[aria-label="0 comments"]')?.textContent).toBe("0");
  expect(container.querySelector('[aria-label="2 comments"]')?.textContent).toBe("2");
});

test.each([
  ["open", false, "open", "lucide-git-pull-request"],
  ["open", true, "draft", "lucide-git-pull-request-draft"],
  ["closed", true, "closed", "lucide-git-pull-request-closed"],
  ["merged", false, "merged", "lucide-git-merge"],
] as const)("linked PRs use their %s state and draft flag %s", (state, is_draft, label, icon) => {
  const { container } = render(
    <IssuePullRequestCount
      count={1}
      pullRequest={{ number: 42, title: "Fix the issue", state, is_draft }}
    />,
  );

  const indicator = container.querySelector('[data-slot="issue-pr-count"]');
  expect(indicator?.textContent).toBe("1");
  expect(indicator?.getAttribute("aria-label")).toBe(`Pull request #42: Fix the issue (${label})`);
  expect(indicator?.querySelector(`svg.${icon}`)).not.toBeNull();
});

test("missing PRs are omitted and multiple linked PRs keep a neutral total", () => {
  const { container } = render(
    <>
      <IssuePullRequestCount />
      <IssuePullRequestCount count={0} />
      <IssuePullRequestCount
        count={3}
        pullRequest={{ number: 42, title: "One of several", state: "merged", is_draft: false }}
      />
    </>,
  );

  expect(container.querySelectorAll('[data-slot="issue-pr-count"]')).toHaveLength(1);
  expect(container.querySelector('[aria-label="3 linked pull requests"]')?.textContent).toBe("3");
  expect(container.querySelector("svg.lucide-git-pull-request")).not.toBeNull();
});
