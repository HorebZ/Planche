import type { RepositorySummary, SelectedRepository } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const repository = fixtureFactory<RepositorySummary>({
  id: "R_planche",
  full_name: "HorebZ/Planche",
  url: "https://github.com/HorebZ/Planche",
  owner_is_org: false,
  has_issues: true,
  archived: false,
});
export const selectedRepository = fixtureFactory<SelectedRepository>({
  repository: repository(),
  unavailable: false,
});
