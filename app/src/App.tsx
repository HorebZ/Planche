export default function App() {
	return (
		<main className="grid h-screen place-items-center">
			<div className="flex flex-col items-center gap-2">
				<h1 className="font-bold text-2xl">Planche</h1>
				{import.meta.env.DEV && (
					<a href="/playground" className="text-accent text-sm">
						Open the playground
					</a>
				)}
			</div>
		</main>
	);
}
