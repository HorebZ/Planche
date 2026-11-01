import type { Issue } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const issueRecord = fixtureFactory<Issue>({
  content: {
    kind: "issue",
    id: "I_standalone",
    number: 53,
    title: "Standalone issue",
    url: "https://github.com/HorebZ/Planche/issues/53",
    repo: "HorebZ/Planche",
    state: "open",
    assignees: [],
    labels: [],
  },
  complete: true,
  permissions: {
    assign: true,
    close: true,
    reopen: false,
    label: true,
    update: true,
    delete: false,
  },
  fetched_at: "2026-11-01T12:00:00Z",
});
