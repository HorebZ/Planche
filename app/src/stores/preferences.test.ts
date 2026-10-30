// @vitest-environment happy-dom
import { beforeEach, expect, test } from "vitest";
import { usePreferences } from "./preferences";

beforeEach(() =>
  usePreferences.setState({ theme: "system", hiddenProjects: {}, projectColors: {} }),
);

test("project colors persist independently for each account and project", async () => {
  const { setProjectColor } = usePreferences.getState();
  setProjectColor("alice", "board", "done");
  setProjectColor("alice", "other", "todo");
  setProjectColor("bob", "board", "pink");
  setProjectColor("alice", "board", "blue");
  const saved = localStorage.getItem("planche-ui-preferences");
  if (!saved) {
    throw new Error("Missing saved preferences");
  }
  usePreferences.setState({ projectColors: {} });
  localStorage.setItem("planche-ui-preferences", saved);
  await usePreferences.persist.rehydrate();
  expect(usePreferences.getState().projectColors).toEqual({
    alice: { board: "blue", other: "todo" },
    bob: { board: "pink" },
  });
});

test("existing preferences load without saved project colors", async () => {
  localStorage.setItem(
    "planche-ui-preferences",
    JSON.stringify({ state: { theme: "dark", hiddenProjects: { alice: ["board"] } }, version: 0 }),
  );
  await usePreferences.persist.rehydrate();
  expect(usePreferences.getState()).toMatchObject({
    theme: "dark",
    hiddenProjects: { alice: ["board"] },
    projectColors: {},
  });
});
