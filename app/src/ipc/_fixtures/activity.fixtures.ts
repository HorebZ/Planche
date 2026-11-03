import type { IssueActivity } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const issueActivity = fixtureFactory<IssueActivity>({
  entries: [
    {
      id: "comment",
      kind: "comment",
      author: "lea",
      created_at: "2026-11-03T10:00:00Z",
      body: "Ready for **review**. See the [issue](#discussion).",
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
});
