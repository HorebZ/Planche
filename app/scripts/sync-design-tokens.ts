import { readFileSync, writeFileSync } from "node:fs";

// Keep subtree themes for the playground while taking every value from the handoff.
const source = readFileSync(
  new URL("../../design/tokens/planche-tokens.css", import.meta.url),
  "utf8",
);
const declarations = (block: string) =>
  new Map([...block.matchAll(/(--pl-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const light = declarations(source.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "");
const dark = declarations(source.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)?.[1] ?? "");
const shadows = [...dark.keys()].filter((name) => name.startsWith("--pl-shadow-"));
const lines = [...light].map(([name, value]) => {
  const other = dark.get(name);
  if (!other) {
    return `\t${name}: ${value};`;
  }
  if (shadows.includes(name)) {
    return `\t${name}-light: ${value};\n\t${name}-dark: ${other};`;
  }
  return `\t${name}: light-dark(${value}, ${other});`;
});
const shadowRules = (theme: string) =>
  shadows.map((name) => `\t${name}: var(${name}-${theme});`).join("\n");
const output = `/* Generated from design/tokens/planche-tokens.css. Run bun run sync:design to refresh. */
:root {
\tcolor-scheme: light dark;
${lines.join("\n")}
\t/* App utility aliases; their values come from the design tokens above. */
\t--pl-text-2xs: var(--pl-text-xs);
\t--pl-control: var(--pl-row);
\t--pl-control-lg: var(--pl-row-sub);
\t--pl-radius-window: var(--pl-radius-2xl);
\t--pl-shadow-thumb: var(--pl-shadow-card);
\t--pl-logo-ink: var(--pl-fg);
\t--pl-logo-dot: var(--pl-accent);
}
:root, .light, [data-theme="light"] {
${shadowRules("light")}
}
.light, [data-theme="light"] { color-scheme: light; }
.dark, [data-theme="dark"] {
\tcolor-scheme: dark;
${shadowRules("dark")}
}
@media (prefers-color-scheme: dark) {
\t:root:not(.light):not([data-theme="light"]) {
${shadowRules("dark")}
\t}
}
@media (prefers-reduced-motion: reduce) {
\t:root, .light, .dark, [data-theme] {
\t\t--pl-dur-fast: 0ms;
\t\t--pl-dur-base: 0ms;
\t\t--pl-dur-slow: 0ms;
\t}
}
`;
const target = new URL("../src/styles/tokens.css", import.meta.url);
if (process.argv.includes("--check")) {
  // Formatting is checked separately by Biome.
  const normalize = (css: string) =>
    css
      .replace(/(?<![\w-])\d*\.\d+/g, (value) => String(Number(value)))
      .replace(/\s+/g, "")
      .toLowerCase();
  if (normalize(readFileSync(target, "utf8")) !== normalize(output)) {
    console.error("Design tokens are stale. Run bun run sync:design.");
    process.exit(1);
  }
} else {
  writeFileSync(target, output);
}
