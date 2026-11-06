import { repositoryIssueSource } from "./repository-issues.fixtures";
import { user } from "./user.fixtures";

const labels = [
  { name: "feature", color: "4a7fd4" },
  { name: "design", color: "d65a92" },
  { name: "bug", color: "d73a4a" },
  { name: "perf", color: "d9a23b" },
  { name: "keyboard", color: "2ea3a3" },
  { name: "sync", color: "8a5cc7" },
];

const issues: [number, string, string[]][] = [
  [115, "Moonshot: boards that work at 30,000 feet", ["feature", "sync"]],
  [110, "Sketch a calmer command palette", ["design"]],
  [95, "Bring your own workflow", []],
  [121, "A tiny celebration when the last issue closes", ["design"]],
  [116, "Make the empty state feel like an invitation", ["design", "feature"]],
  [106, "Deep links that land exactly where you left off", ["feature"]],
  [101, "A home for the projects you follow", []],
  [122, "Make every drag feel magnetic", ["feature", "perf"]],
  [112, "Keep your place when the network takes a nap", ["bug", "sync"]],
  [119, "Spotlight search, minus the context switch", ["keyboard"]],
  [118, "One shortcut to pick up where you left off", []],
  [113, "Give pull requests their moment in the sun", ["feature"]],
  [123, "Dark mode, down to the last pixel", ["design"]],
  [120, "Turn any repo into a Planche", ["feature"]],
  [117, "Welcome aboard", []],
  [114, "Small icons. Big personality.", ["design"]],
];

export const SHOWCASE_DESCRIPTION =
  "A card should feel like it belongs exactly where you drop it. Let's make moving work across the board feel effortless.\n\n## The little details\n\n- Keep the card under your pointer\n- Make room before the drop\n- Preserve your place when GitHub syncs\n\nKeyboard navigation gets the same care. Small movements, fewer interruptions.";

export function repositoryShowcase() {
  const sources = repositoryIssueSource();
  const people = ["camille-r", "theo-m", "lea-b", "amina-m"];

  return issues.map(([number, title, names], index) => {
    const source = sources.find((source) => source.issue.number === number);
    if (!source) {
      throw new Error(`Missing showcase issue #${number}`);
    }
    const author = people[index % people.length];
    const assignee = people[(index + 1) % people.length];
    const assigned =
      source.status === "in_progress" || (source.status !== "ready" && index % 3 !== 0);

    return {
      ...source,
      issue: {
        ...source.issue,
        title,
        labels: labels.filter((label) => names.includes(label.name)),
        assignees: assigned ? [user({ id: `U_${assignee}`, login: assignee })] : [],
        details: {
          ...source.issue.details,
          author: { login: author, avatar_url: "" },
          created_at: new Date(Date.now() - (index + 2) * 86_400_000).toISOString(),
          updated_at: new Date(Date.now() - (index + 1) * 37 * 60_000).toISOString(),
          comment_count: [3, 0, 8, 1, 5, 2, 0, 12][index % 8],
          sub_issues:
            number === 115
              ? { completed: 1, total: 4 }
              : number === 122
                ? { completed: 3, total: 5 }
                : null,
          blocking: number === 116 ? 2 : 0,
        },
      },
    };
  });
}
