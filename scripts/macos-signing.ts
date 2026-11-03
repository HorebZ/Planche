import { strict as assert } from "node:assert";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const directory = resolve(import.meta.dir, "../.local/signing");

export function cargoRunnerConfig() {
  const runner = [process.execPath, resolve(import.meta.dir, "run-signed.ts")];

  return `target.'cfg(target_os = "macos")'.runner = ${JSON.stringify(runner)}`;
}

function command(args: string[]) {
  const result = Bun.spawnSync(args, { stderr: "inherit" });
  assert(result.exitCode === 0, `${args[0]} failed (${result.exitCode})`);

  return result.stdout.toString().trim();
}

export async function signingIdentity(env = process.env, path = join(directory, "identity.txt")) {
  assert(process.platform === "darwin", "macOS signing requires a Mac");
  const configured = env.APPLE_SIGNING_IDENTITY?.trim();
  assert(configured !== "-", "Ad hoc signing cannot preserve Keychain access across builds");

  if (configured) {
    return configured;
  }

  const identity = await readFile(path, "utf8").catch(() => "");
  assert(/^[A-F0-9]{40}$/.test(identity.trim()), "Run bun run setup:signing first");

  return identity.trim();
}

export function signExecutable(path: string, identity: string) {
  command([
    "/usr/bin/codesign",
    "--force",
    "--sign",
    identity,
    "--identifier",
    "dev.planche.app",
    "--timestamp=none",
    path,
  ]);
  command(["/usr/bin/codesign", "--verify", "--strict", path]);
}

async function setup() {
  assert(process.platform === "darwin", "macOS signing requires a Mac");
  process.umask(0o077);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const certificate = join(directory, "certificate.pem");
  const key = join(directory, "private-key.pem");
  const archive = join(directory, "identity.pem");
  const identityFile = join(directory, "identity.txt");

  // Keep the certificate across runs: replacing it would reset Keychain permissions.
  if (!(await Bun.file(certificate).exists())) {
    assert(!(await Bun.file(identityFile).exists()), "Restore the original signing certificate");
    assert(!(await Bun.file(key).exists()), "Restore certificate.pem before retrying setup");
    command([
      "/usr/bin/openssl",
      "req",
      "-new",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-days",
      "3650",
      "-subj",
      "/CN=Planche Local Signing/",
      "-addext",
      "basicConstraints=critical,CA:FALSE",
      "-addext",
      "keyUsage=critical,digitalSignature",
      "-addext",
      "extendedKeyUsage=critical,codeSigning",
      "-keyout",
      key,
      "-out",
      certificate,
    ]);
  }

  const fingerprint = command([
    "/usr/bin/openssl",
    "x509",
    "-in",
    certificate,
    "-noout",
    "-fingerprint",
    "-sha1",
  ])
    .split("=")[1]
    ?.replaceAll(":", "");
  assert(fingerprint && /^[A-F0-9]{40}$/.test(fingerprint), "Invalid signing certificate");

  if (await Bun.file(identityFile).exists()) {
    assert(
      (await readFile(identityFile, "utf8")).trim() === fingerprint,
      "Signing certificate changed",
    );
  }

  if (!command(["/usr/bin/security", "find-identity", "-p", "codesigning"]).includes(fingerprint)) {
    assert(
      await Bun.file(key).exists(),
      "Restore the original identity in Keychain Access; do not regenerate it",
    );
    const keychain = command(["/usr/bin/security", "default-keychain", "-d", "user"]).replace(
      /^"|"$/g,
      "",
    );

    try {
      await writeFile(archive, Buffer.concat([await readFile(certificate), await readFile(key)]), {
        mode: 0o600,
      });
      command([
        "/usr/bin/security",
        "import",
        archive,
        "-k",
        keychain,
        "-f",
        "pemseq",
        "-T",
        "/usr/bin/codesign",
      ]);
    } finally {
      await rm(archive, { force: true });
    }
  }

  assert(
    command(["/usr/bin/security", "find-identity", "-p", "codesigning"]).includes(fingerprint),
    "Signing identity was not imported",
  );
  await writeFile(identityFile, `${fingerprint}\n`, { mode: 0o600 });
  await rm(key, { force: true });
  console.log(`Planche signing identity ready: ${fingerprint}`);
  console.log(
    "Back up this identity with its private key from Keychain Access before distributing builds.",
  );
}

if (import.meta.main) {
  await setup();
}
