import type { Board, BoardField, BoardProject, Column } from "../bindings.types";
import { fixtureFactory } from "./factory";

export const boardProject = fixtureFactory<BoardProject>({
  id: "PVT_1",
  number: 2,
  title: "Planche",
  url: "https://github.com/users/HorebZ/projects/2",
});

export const boardField = fixtureFactory<BoardField>({ id: "F_status", name: "Status" });

export const column = fixtureFactory<Column>({
  option_id: "todo",
  name: "Todo",
  color: null,
  cards: [],
});

export const board = fixtureFactory<Board>({
  project: boardProject(),
  view: null,
  field: boardField(),
  columns: [column()],
  pending_count: 0,
  synced_at: null,
});
