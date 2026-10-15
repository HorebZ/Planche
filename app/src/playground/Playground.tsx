import { BannerSection } from "./sections/banner";
import { BoardSection } from "./sections/board";
import { ButtonsSection } from "./sections/buttons";
import { ControlsSection } from "./sections/controls";
import { OverlaysSection } from "./sections/overlays";
import { ShellSection } from "./sections/shell";
import { TokensSection } from "./sections/tokens";

const sections = [
	{ id: "tokens", Component: TokensSection },
	{ id: "buttons", Component: ButtonsSection },
	{ id: "controls", Component: ControlsSection },
	{ id: "banner", Component: BannerSection },
	{ id: "overlays", Component: OverlaysSection },
	{ id: "board", Component: BoardSection },
	{ id: "shell", Component: ShellSection },
];

export default function Playground() {
	return (
		<main className="mx-auto flex max-w-[1680px] flex-col gap-10 px-8 py-10">
			<header className="flex items-baseline gap-4">
				<h1 className="font-bold text-2xl">Planche playground</h1>
				<nav className="flex gap-3 font-mono text-fg-3 text-xs">
					{sections.map(({ id }) => (
						<a key={id} href={`#${id}`} className="hover:text-fg">
							{id}
						</a>
					))}
				</nav>
			</header>
			{sections.map(({ id, Component }) => (
				<Component key={id} />
			))}
		</main>
	);
}
