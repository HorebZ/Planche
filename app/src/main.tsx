import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/app.css";

const Playground = import.meta.env.DEV ? lazy(() => import("./playground/Playground")) : null;

const page =
	Playground && window.location.pathname === "/playground" ? (
		<Suspense>
			<Playground />
		</Suspense>
	) : (
		<App />
	);

createRoot(document.getElementById("root") as HTMLElement).render(<StrictMode>{page}</StrictMode>);
