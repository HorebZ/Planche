import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

export async function growWindow() {
  const window = getCurrentWindow();

  await window.setMinSize(new LogicalSize(1100, 700));
  await window.setSize(new LogicalSize(1440, 900));
  await window.center();
}
