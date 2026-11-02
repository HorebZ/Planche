import { strict as assert } from "node:assert";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = await mkdtemp(join(tmpdir(), "planche-icons-"));

try {
  const result = Bun.spawnSync(
    [
      join(root, "app/node_modules/.bin/tauri"),
      "icon",
      join(root, "app/src/assets/brand/planche-icon.svg"),
      "--output",
      output,
    ],
    { cwd: root, stdout: "inherit", stderr: "inherit" },
  );
  assert(result.exitCode === 0, "Native icon generation failed");

  for (const name of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.png", "icon.icns"]) {
    await copyFile(join(output, name), join(root, "app/src-tauri/icons", name));
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
