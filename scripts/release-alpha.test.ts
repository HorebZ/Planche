import { expect, test } from "bun:test";
import { releaseManifest } from "./release-alpha";

test("alpha manifests use a versioned public asset and embed its signature", () => {
  const result = releaseManifest("0.1.0-alpha.2", "aarch64", " signature\n", "Fixes");

  expect(result.version).toBe("0.1.0-alpha.2");
  expect(result.platforms["darwin-aarch64"]).toEqual({
    url: "https://github.com/HorebZ/Planche/releases/download/v0.1.0-alpha.2/Planche_0.1.0-alpha.2_aarch64.app.tar.gz",
    signature: "signature",
  });
  expect(result.notes).toBe("Fixes");
});

test("an alpha needs an explicit alpha version, supported architecture and signature", () => {
  expect(() => releaseManifest("0.1.0", "aarch64", "signed", "")).toThrow();
  expect(() => releaseManifest("../alpha", "aarch64", "signed", "")).toThrow();
  expect(() => releaseManifest("0.1.0-alpha.1", "unknown", "signed", "")).toThrow();
  expect(() => releaseManifest("0.1.0-alpha.1", "aarch64", "", "")).toThrow();
});
