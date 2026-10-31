import type { IssueDescription } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const issueDescription = fixtureFactory<IssueDescription>({
  body: "## Description\n\nDetails loaded on demand.",
  fetched_at: "2026-10-31T12:00:00Z",
});

export const MARKDOWN_BODY =
  "# Release notes\n\nShip **safe descriptions** with *keyboard navigation*.\n\n- Keep cached content\n- Retry failed requests\n\n1. Open an issue\n2. Read its description\n\n> Saved data stays available offline.\n\n```rust\nlet ready = true;\n```\n\nRead the [project](https://github.com/HorebZ/Planche) or [contact us](mailto:planche@example.com).\n\n![Board screenshot](https://example.com/blocked.png)";
