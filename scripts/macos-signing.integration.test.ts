import { expect, test } from "bun:test";
import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargoRunnerConfig } from "./macos-signing";

test.skipIf(process.platform !== "darwin" || process.env.PLANCHE_TEST_SIGNING !== "1")(
  "rebuilt executables keep the same designated requirement and launch through the Cargo runner",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "planche signing-"));
    const source = join(directory, "src/main.rs");
    const binary = join(directory, "target/debug/signing-fixture");
    const signatures: string[] = [];
    const hashes: string[] = [];

    try {
      await mkdir(join(directory, "src"));
      await writeFile(
        join(directory, "Cargo.toml"),
        '[package]\nname = "signing-fixture"\nversion = "0.0.0"\nedition = "2021"\n[workspace]\n',
      );

      for (const version of ["first", "second"]) {
        await writeFile(
          source,
          `fn main() { println!("${version}"); println!("{}", std::env::args().nth(1).unwrap()); }\n`,
        );
        const launch = Bun.spawnSync([
          "cargo",
          "run",
          "--quiet",
          "--offline",
          "--manifest-path",
          join(directory, "Cargo.toml"),
          "--config",
          cargoRunnerConfig(),
          "--",
          "argument with spaces",
        ]);
        assert(launch.exitCode === 0, launch.stderr.toString());
        expect(launch.stdout.toString()).toBe(`${version}\nargument with spaces\n`);
        const metadata = Bun.spawnSync(["/usr/bin/codesign", "-d", "-r-", "--verbose=4", binary]);
        assert(metadata.exitCode === 0, metadata.stderr.toString());
        const details = metadata.stdout.toString() + metadata.stderr.toString();
        const requirement = details.match(/^designated => (.+)$/m)?.[1];
        const hash = details.match(/^CDHash=(.+)$/m)?.[1];
        assert(requirement && hash, details);
        expect(requirement).toContain('identifier "dev.planche.app"');
        expect(requirement).not.toContain("cdhash");
        signatures.push(requirement);
        hashes.push(hash);
      }

      expect(signatures[0]).toBe(signatures[1]);
      expect(hashes[0]).not.toBe(hashes[1]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
