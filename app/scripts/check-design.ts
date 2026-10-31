import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const palette =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const rules: { name: string; pattern: RegExp }[] = [
  {
    name: "raw hex color",
    pattern: /(?:["'`[(,_]|:\s*)#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  },
  {
    name: "raw color function",
    pattern: /(?<![a-zA-Z-])(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/,
  },
  {
    name: "Tailwind palette class",
    pattern: new RegExp(`(?<![\\w-])[a-z]+-(?:${palette})-\\d{2,3}\\b|-black\\b`),
  },
  { name: "dark: utility", pattern: /(?<![\w-])dark:/ },
];

const tokensFile = join("src", "styles", "tokens.css");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(path);
    }

    return /\.(tsx?|css)$/.test(entry.name) && relative(".", path) !== tokensFile ? [path] : [];
  });
}

export function findViolations(path: string, source: string): string[] {
  return source
    .split("\n")
    .flatMap((line, i) =>
      rules
        .filter((rule) => rule.pattern.test(line))
        .map((rule) => `${path}:${i + 1}: ${rule.name}: ${line.trim()}`),
    );
}

if (import.meta.main) {
  const files = process.argv.length > 2 ? process.argv.slice(2) : sourceFiles("src");
  const violations = files.flatMap((file) => findViolations(file, readFileSync(file, "utf8")));

  for (const violation of violations) {
    console.error(violation);
  }

  process.exit(violations.length > 0 ? 1 : 0);
}
