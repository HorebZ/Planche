import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("website links, SVG symbols and CSS assets resolve locally", async () => {
  const root = new URL("./", import.meta.url);
  const fragments = new Map<string, Set<string>>();
  const references: URL[] = [];

  for await (const path of new Bun.Glob("**/*.{html,css,svg}").scan(fileURLToPath(root))) {
    const url = new URL(path, root);
    const source = await Bun.file(url).text();
    const ids = new Set<string>();
    fragments.set(url.href, ids);

    if (path.endsWith(".css")) {
      for (const match of source.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        references.push(new URL(match[1], url));
      }
    } else {
      await new HTMLRewriter()
        .on("*", {
          element(element) {
            const id = element.getAttribute("id");
            if (id) {
              ids.add(id);
            }

            for (const attribute of ["src", "href"]) {
              const reference = element.getAttribute(attribute);
              if (reference) {
                references.push(new URL(reference, url));
              }
            }
          },
        })
        .transform(new Response(source))
        .text();
    }
  }

  expect(references.length).toBeGreaterThan(0);

  for (const reference of references) {
    if (reference.protocol !== "file:") {
      continue;
    }

    const fragment = reference.hash.slice(1);
    reference.hash = "";

    expect(await Bun.file(reference).exists(), fileURLToPath(reference)).toBe(true);
    const version = reference.searchParams.get("v");
    if (version) {
      const fingerprint = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(reference).arrayBuffer())
        .digest("hex")
        .slice(0, 12);

      expect(version, fileURLToPath(reference)).toBe(fingerprint);
    }
    if (fragment) {
      expect(fragments.get(reference.href)?.has(fragment), `${reference.href}#${fragment}`).toBe(
        true,
      );
    }
  }
});
