import { cargoRunnerConfig, signingIdentity } from "./macos-signing";

await signingIdentity();
const args = process.argv.slice(2);
let separator = args.indexOf("--");

if (separator === -1) {
  args.push("--");
  separator = args.length - 1;
}

args.splice(separator + 1, 0, "--config", cargoRunnerConfig());

process.execve(
  process.execPath,
  [process.execPath, "run", "--cwd", "app", "tauri", "dev", ...args],
  process.env,
);
