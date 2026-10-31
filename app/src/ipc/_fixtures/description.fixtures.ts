import type { IssueDescription } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const issueDescription = fixtureFactory<IssueDescription>({
  body: "## Description\n\nDetails loaded on demand.",
  fetched_at: "2026-10-31T12:00:00Z",
});
