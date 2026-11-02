import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { run } from "./release-alpha";

const root = resolve(import.meta.dir, "..");
const config = JSON.parse(await readFile(join(root, "app/src-tauri/tauri.conf.json"), "utf8"));
const version: string = config.version;
assert(/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version), "Expected an alpha version");
const status = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root });
assert(
  status.exitCode === 0 && status.stdout.toString().trim() === "",
  "Commit and push the release code before publishing",
);
run(["bun", "run", "check"]);
const directory = join(root, "target/release/alpha", version);
const manifest = JSON.parse(await readFile(join(directory, "latest.json"), "utf8"));
assert(manifest.version === version, "Build this alpha version before publishing");
const files = (await readdir(directory)).filter(
  (name) =>
    name.endsWith(".dmg") || name.endsWith(".app.tar.gz") || name.endsWith(".app.tar.gz.sig"),
);
assert(files.length >= 3, "Missing DMG or signed updater archive");
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root }).stdout.toString().trim();
const build = JSON.parse(await readFile(join(directory, "build.json"), "utf8"));
assert(
  build.commit === commit && !build.dirty,
  "Rebuild the alpha from this clean commit before publishing",
);

run([
  "gh",
  "release",
  "create",
  `v${version}`,
  ...files.map((name) => join(directory, name)),
  "--repo",
  "HorebZ/Planche",
  "--target",
  commit,
  "--prerelease",
  "--title",
  `Planche ${version}`,
  "--notes",
  manifest.notes,
]);
const feed = Bun.spawnSync(["gh", "release", "view", "alpha", "--repo", "HorebZ/Planche"], {
  stdout: "ignore",
  stderr: "ignore",
});

if (feed.exitCode !== 0) {
  run([
    "gh",
    "release",
    "create",
    "alpha",
    "--repo",
    "HorebZ/Planche",
    "--target",
    commit,
    "--prerelease",
    "--title",
    "Planche alpha update feed",
    "--notes",
    "The app reads latest.json from this release. Download installers from the versioned alpha releases.",
  ]);
}

run([
  "gh",
  "release",
  "upload",
  "alpha",
  join(directory, "latest.json"),
  "--repo",
  "HorebZ/Planche",
  "--clobber",
]);
