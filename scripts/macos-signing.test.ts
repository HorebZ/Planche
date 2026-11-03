import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signingIdentity } from "./macos-signing";

test.skipIf(process.platform !== "darwin")(
  "signing reuses the stored identity and refuses ad hoc or missing identities",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "planche-signing-"));
    const path = join(directory, "identity.txt");
    const fingerprint = "1234567890ABCDEF1234567890ABCDEF12345678";

    try {
      await expect(signingIdentity({}, path)).rejects.toThrow("setup:signing");
      await writeFile(path, `${fingerprint}\n`);

      expect(await signingIdentity({}, path)).toBe(fingerprint);
      expect(
        await signingIdentity(
          { APPLE_SIGNING_IDENTITY: "Developer ID Application: Planche" },
          path,
        ),
      ).toBe("Developer ID Application: Planche");
      await expect(signingIdentity({ APPLE_SIGNING_IDENTITY: "-" }, path)).rejects.toThrow(
        "Ad hoc",
      );

      await writeFile(path, "corrupt identity");
      await expect(signingIdentity({}, path)).rejects.toThrow("setup:signing");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
