"use client";

import Link from "next/link";
import { useBranch } from "./BranchProvider";

export function Hero() {
	const { profile } = useBranch();
	const isMinimal = profile.layout === "minimal-luxury";

	return (
		<section
			className="relative overflow-hidden"
			style={{ background: "var(--color-secondary)" }}
		>
			<div
				aria-hidden
				className="absolute inset-0 opacity-40"
				style={{
					background: `radial-gradient(60% 60% at 80% 30%, color-mix(in oklab, var(--color-accent) 25%, transparent), transparent), radial-gradient(50% 50% at 20% 80%, color-mix(in oklab, var(--color-primary) 18%, transparent), transparent)`,
				}}
			/>
			<div className="relative mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
				<div className="flex flex-col gap-5">
					<span className="chip-brand w-fit">{profile.heroEyebrow}</span>
					<h1
						className={`font-display font-semibold whitespace-pre-line leading-[1.05] ${
							isMinimal
								? "text-4xl sm:text-5xl lg:text-6xl"
								: "text-4xl sm:text-5xl lg:text-[3.5rem]"
						}`}
					>
						{profile.heroTitle}
					</h1>
					<p className="text-base sm:text-lg max-w-xl text-muted-brand">
						{profile.heroSubtitle}
					</p>
					<div className="flex flex-wrap gap-3 mt-2">
						<Link href="/products" className="btn-brand">
							Shop the collection
						</Link>
						<Link href="/products" className="btn-brand-soft">
							New arrivals
						</Link>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-md mx-auto w-full">
					{[
						{ tag: "Bestseller", h: 220 },
						{ tag: "Limited", h: 280 },
						{ tag: "Restock", h: 260 },
						{ tag: "Featured", h: 200 },
					].map((b, i) => (
						<div
							key={i}
							className="card-brand overflow-hidden flex flex-col justify-end p-3 text-xs"
							style={{
								height: b.h,
								background: i % 2 === 0
									? `linear-gradient(135deg, var(--color-primary), color-mix(in oklab, var(--color-primary) 60%, var(--color-accent)))`
									: `linear-gradient(135deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 50%, var(--color-primary)))`,
								color: "var(--color-primary-foreground)",
								borderColor: "transparent",
							}}
						>
							<span
								className="chip-brand w-fit"
								style={{
									background: "rgba(255,255,255,0.9)",
									color: "var(--color-foreground)",
								}}
							>
								{b.tag}
							</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
