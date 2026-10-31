import type { Card } from "../bindings.types";
import { fixtureFactory } from "./factory";

const item = { item_id: "PVTI_1", position: 0, pending: false, updated_by_sync: false };

export const issue = fixtureFactory<Extract<Card, { kind: "issue" }>>({
  ...item,
  kind: "issue",
  id: "I_1",
  number: 1,
  title: "Issue 1",
  url: "https://github.com/HorebZ/Planche/issues/1",
  repo: "HorebZ/Planche",
  state: "open",
  assignees: [],
  labels: [],
  details: {},
});

export const pullRequest = fixtureFactory<Extract<Card, { kind: "pull_request" }>>({
  ...item,
  kind: "pull_request",
  id: "PR_1",
  number: 1,
  title: "Pull request 1",
  url: "https://github.com/HorebZ/Planche/pull/1",
  repo: "HorebZ/Planche",
  state: "open",
  is_draft: false,
  assignees: [],
  labels: [],
  details: {},
});

export const draft = fixtureFactory<Extract<Card, { kind: "draft" }>>({
  ...item,
  kind: "draft",
  id: "DI_1",
  title: "Draft issue",
  assignees: [],
});

export const redacted = fixtureFactory<Extract<Card, { kind: "redacted" }>>({
  ...item,
  kind: "redacted",
});
