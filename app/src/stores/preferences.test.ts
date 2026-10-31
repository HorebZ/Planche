// @vitest-environment happy-dom
import { beforeEach, expect, test } from "vitest";
import { usePreferences } from "./preferences";

beforeEach(() =>
  usePreferences.setState({ theme: "system", hiddenProjects: {}, projectColors: {}, views: {} }),
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
    views: {},
  });
});

test("layouts and collapsed groups persist per account, project and view", async () => {
  const { setLayout, setGroupExpanded, setPropertyVisible } = usePreferences.getState();
  const contexts = [
    ["alice", "project", 1],
    ["bob", "project", 1],
    ["alice", "other", 1],
    ["alice", "project", 2],
    ["alice", "project", null],
  ].map((context) => JSON.stringify(context));

  setPropertyVisible(contexts[0], "labels", false);

  for (const context of contexts) {
    setGroupExpanded(context, "todo", false);
    setGroupExpanded(context, "todo", false);
  }

  setLayout(contexts[0], "list");
  setPropertyVisible(contexts[0], "labels", false);
  setPropertyVisible(contexts[0], "labels", false);
  setPropertyVisible(contexts[0], "repository", false);
  setPropertyVisible(contexts[0], "repository", true);
  setGroupExpanded(contexts[0], "done", false);
  setGroupExpanded(contexts[0], "todo", true);

  const saved = localStorage.getItem("planche-ui-preferences");

  if (!saved) {
    throw new Error("Missing saved preferences");
  }

  usePreferences.setState({ views: {} });
  localStorage.setItem("planche-ui-preferences", saved);
  await usePreferences.persist.rehydrate();

  const { views } = usePreferences.getState();

  expect(views[contexts[0]]).toEqual({
    layout: "list",
    collapsedGroups: ["done"],
    hiddenProperties: ["labels"],
  });

  for (const context of contexts.slice(1)) {
    expect(views[context]).toEqual({ layout: "board", collapsedGroups: ["todo"] });
  }
});
