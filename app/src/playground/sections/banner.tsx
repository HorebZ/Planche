import { WifiOff } from "lucide-react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Row, Section, State } from "../kit";

export function BannerSection() {
	return (
		<Section id="banner" title="Banner">
			{() => (
				<Row label="danger" className="flex-col items-stretch">
					<State label="offline, with retry" className="items-stretch">
						<Banner
							icon={<WifiOff />}
							title="Can't reach api.github.com"
							description="Changes are kept locally and will be pushed when you're back online."
							meta="Retrying in 24s"
							action={
								<Button size="sm" className="text-xs">
									Retry now
									<Kbd size="sm">⌘R</Kbd>
								</Button>
							}
						/>
					</State>
					<State label="retry focused" className="items-stretch">
						<Banner
							icon={<WifiOff />}
							title="Can't reach api.github.com"
							meta="Retrying in 3s"
							action={
								<Button size="sm" className="text-xs" data-preview="focus">
									Retry now
									<Kbd size="sm">⌘R</Kbd>
								</Button>
							}
						/>
					</State>
				</Row>
			)}
		</Section>
	);
}
