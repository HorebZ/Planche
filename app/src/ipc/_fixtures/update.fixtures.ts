import type { UpdateStatus } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const updateStatus = fixtureFactory<UpdateStatus>({
  current_version: "0.1.0-alpha.1",
  phase: "current",
  release: null,
  received: 0,
  total: null,
  error: null,
});
