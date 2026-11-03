import { strict as assert } from "node:assert";
import { signExecutable, signingIdentity } from "./macos-signing";

const [executable, ...args] = process.argv.slice(2);
assert(executable, "Cargo must supply the executable to sign");
signExecutable(executable, await signingIdentity());
process.execve(executable, [executable, ...args], process.env);
