import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function normalizeIcns(data: Buffer): Buffer {
  assert(data.length >= 8 && data.toString("ascii", 0, 4) === "icns", "Invalid ICNS header");
  assert(data.readUInt32BE(4) === data.length, "Invalid ICNS length");
  const entries: Buffer[] = [];

  for (let offset = 8; offset < data.length; ) {
    assert(offset + 8 <= data.length, "Truncated ICNS entry");
    const size = data.readUInt32BE(offset + 4);
    assert(size >= 8 && offset + size <= data.length, "Invalid ICNS entry length");
    entries.push(data.subarray(offset, offset + size));
    offset += size;
  }

  // Tauri iterates ICNS representations in an unstable order.
  return Buffer.concat([data.subarray(0, 8), ...entries.sort(Buffer.compare)]);
}

async function generateIcons() {
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
      const generated = await readFile(join(output, name));
      const data = name === "icon.icns" ? normalizeIcns(generated) : generated;
      const destination = join(root, "app/src-tauri/icons", name);

      if ((await Bun.file(destination).exists()) && data.equals(await readFile(destination))) {
        continue;
      }

      await writeFile(destination, data);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await generateIcons();
}
