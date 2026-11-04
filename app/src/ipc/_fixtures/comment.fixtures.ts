import type { CommentSubmission } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const commentSubmission = fixtureFactory<CommentSubmission>({
  request_id: "request-1",
  body: "Ready for **review**.",
  status: "queued",
  error: null,
  entry: null,
});
