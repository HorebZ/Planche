import { strict as assert } from "node:assert";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export function releaseManifest(version: string, arch: string, signature: string, notes: string) {
  assert(/^\d+\.\d+\.\d+-alpha\.\d+$/.test(version), "Use a version such as 0.1.0-alpha.1");
  assert(arch === "aarch64" || arch === "x86_64", "Unsupported release architecture");
  assert(signature.trim(), "The updater archive must be signed");

  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      [`darwin-${arch}`]: {
        url: `https://github.com/HorebZ/Planche/releases/download/v${version}/Planche_${version}_${arch}.app.tar.gz`,
        signature: signature.trim(),
      },
    },
  };
}

export function run(command: string[], env: Record<string, string | undefined> = process.env) {
  const result = Bun.spawnSync(command, {
    cwd: resolve(import.meta.dir, ".."),
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  assert(result.exitCode === 0, `${command[0]} failed (${result.exitCode})`);
}

async function build() {
  assert(process.platform === "darwin", "Build the macOS alpha on a Mac");
  assert(
    process.env.PLANCHE_GITHUB_CLIENT_ID?.trim(),
    "Set the public PLANCHE_GITHUB_CLIENT_ID before building",
  );
  const root = resolve(import.meta.dir, "..");
  const dmgPython = join(root, ".local/dmg-tools/bin/python");
  assert(
    await Bun.file(dmgPython).exists(),
    "Set up the DMG builder: python3 -m venv .local/dmg-tools && .local/dmg-tools/bin/python -m pip install -r scripts/dmg-requirements.txt",
  );
  const config = JSON.parse(await readFile(join(root, "app/src-tauri/tauri.conf.json"), "utf8"));
  const version: string = config.version;
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  releaseManifest(version, arch, "validation", "");

  for (const path of ["Cargo.toml", "app/src-tauri/Cargo.toml"]) {
    const cargo = await readFile(join(root, path), "utf8");
    assert(
      cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1] === version,
      `Version mismatch in ${path}`,
    );
  }

  const pkg = JSON.parse(await readFile(join(root, "app/package.json"), "utf8"));
  assert(pkg.version === version, "Version mismatch in app/package.json");
  const env = {
    ...process.env,
    PLANCHE_TOKEN: undefined,
    VITE_MOCK: undefined,
    APPLE_SIGNING_IDENTITY: process.env.APPLE_SIGNING_IDENTITY || "-",
  };
  const buildEnv = {
    ...env,
    TAURI_SIGNING_PRIVATE_KEY: undefined,
    TAURI_SIGNING_PRIVATE_KEY_PATH: undefined,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: undefined,
  };
  const key = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || join(root, ".local/release/alpha.key");

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    assert(
      await Bun.file(key).exists(),
      "Missing updater key. Restore the original alpha key before building a release.",
    );
  }

  run(["bun", "run", "check"]);
  run(["bun", "run", "--cwd", "app", "tauri", "build", "--bundles", "app"], buildEnv);

  const output = join(root, "target/release/alpha", version);
  const app = join(root, "target/release/bundle/macos/Planche.app");
  const name = `Planche_${version}_${arch}`;
  const archive = join(output, `${name}.app.tar.gz`);
  await mkdir(output, { recursive: true });

  const executable = await readFile(join(app, "Contents/MacOS/planche-app"));

  for (const secret of [process.env.PLANCHE_TOKEN, process.env.PLANCHE_GITHUB_CLIENT_SECRET]) {
    assert(
      !secret || secret.length < 20 || !executable.includes(Buffer.from(secret)),
      "A development credential was found in the release binary",
    );
  }

  run(["/usr/bin/codesign", "--verify", "--deep", "--strict", app]);
  run(["/usr/bin/tar", "-czf", archive, "-C", dirname(app), "Planche.app"], {
    ...buildEnv,
    COPYFILE_DISABLE: "1",
  });
  const signer = [
    join(root, "app/node_modules/.bin/tauri"),
    "signer",
    "sign",
    "--app-version",
    version,
  ];

  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    signer.push("--private-key-path", key);
  }

  run([...signer, archive], {
    ...env,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
  });
  run(
    [
      "cargo",
      "test",
      "-p",
      "planche-core",
      "update::tests::built_release_has_a_valid_signature_and_expected_bundle",
      "--",
      "--ignored",
    ],
    { ...buildEnv, PLANCHE_RELEASE_ARCHIVE: archive, PLANCHE_RELEASE_VERSION: version },
  );
  const signature = await readFile(`${archive}.sig`, "utf8");
  const manifest = releaseManifest(
    version,
    arch,
    signature,
    "Distinct project colors in light and dark themes, with a wider default color cycle and preserved custom choices.",
  );
  await writeFile(join(output, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root })
    .stdout.toString()
    .trim();
  const dirty =
    Bun.spawnSync(["git", "status", "--porcelain"], { cwd: root }).stdout.toString().trim() !== "";
  await writeFile(
    join(output, "build.json"),
    `${JSON.stringify({ version, commit, dirty, arch }, null, 2)}\n`,
  );
  run([dmgPython, join(root, "scripts/build-dmg.py"), app, join(output, `${name}.dmg`)], buildEnv);

  console.log(`Alpha ready: ${output}`);
  console.log(
    env.APPLE_SIGNING_IDENTITY === "-"
      ? "Ad hoc signature: testers may need Open Anyway in macOS Privacy & Security."
      : "Developer ID signature: verify the notarization result before publishing.",
  );
}

if (import.meta.main) {
  await build();
}
