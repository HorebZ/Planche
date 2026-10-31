import type { AuthStatus, User } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const user = fixtureFactory<User>({ id: "U", login: "u", avatar_url: "" });

export const authStatus = fixtureFactory<AuthStatus>({
  id: "U",
  login: "u",
  avatar_url: null,
  missing_scopes: [],
});
