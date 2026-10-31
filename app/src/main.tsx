import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

const Playground = import.meta.env.DEV ? lazy(() => import("./playground/Playground")) : null;

async function start() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("mock");

  // Playwright renders the app in a browser against a fake backend: on the dev server, or in a
  // production build made with VITE_MOCK=1 for the scroll budget. Other builds drop it.
  if ((import.meta.env.DEV || import.meta.env.VITE_MOCK) && scenario) {
    const { installMockBackend } = await import("./ipc/_fixtures/backend.fixtures");

    installMockBackend(scenario as Parameters<typeof installMockBackend>[0]);
  }

  const page =
    Playground && window.location.pathname === "/playground" ? (
      <Suspense>
        <Playground />
      </Suspense>
    ) : (
      <App />
    );

  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>{page}</StrictMode>,
  );
}

start();
