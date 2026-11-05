// @vitest-environment happy-dom
import { expect, test } from "vitest";
import { render } from "@/test-support";
import { AvatarStack } from "./avatar";

test("empty assignee stacks show a circle instead of an avatar", () => {
  const { container } = render(<AvatarStack users={[]} />);

  expect(container.querySelector('[role="img"][aria-label="Unassigned"]')).not.toBeNull();
  expect(container.querySelector('[data-slot="avatar"]')).toBeNull();
});

test("assigned users replace the empty circle with their avatars", () => {
  const { container } = render(<AvatarStack users={[{ login: "camille" }]} />);

  expect(container.querySelector('[aria-label="Unassigned"]')).toBeNull();
  expect(container.querySelector('[data-slot="avatar"]')?.textContent).toBe("CA");
});
