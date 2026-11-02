import { expect, test } from "bun:test";
import { normalizeIcns } from "./generate-icons";

function container(entries: Buffer[]) {
  const header = Buffer.alloc(8);
  header.write("icns");
  header.writeUInt32BE(8 + entries.reduce((size, entry) => size + entry.length, 0), 4);
  return Buffer.concat([header, ...entries]);
}

test("ICNS normalization preserves representations and ignores their generated order", () => {
  const small = Buffer.from([105, 99, 48, 55, 0, 0, 0, 10, 1, 2]);
  const large = Buffer.from([105, 99, 48, 57, 0, 0, 0, 11, 3, 4, 5]);
  const expected = container([small, large]);

  expect(normalizeIcns(container([large, small]))).toEqual(expected);
  expect(normalizeIcns(expected)).toEqual(expected);
});

test("ICNS normalization rejects malformed headers and truncated entries", () => {
  expect(() => normalizeIcns(Buffer.alloc(8))).toThrow("Invalid ICNS header");
  expect(() => normalizeIcns(Buffer.from("icns0000"))).toThrow("Invalid ICNS length");
  expect(() => normalizeIcns(container([Buffer.alloc(4)]))).toThrow("Truncated ICNS entry");
  expect(() => normalizeIcns(container([Buffer.alloc(8)]))).toThrow("Invalid ICNS entry length");
});
