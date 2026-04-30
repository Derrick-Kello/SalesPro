"use client";

import { useBranch } from "./BranchProvider";

export function Footer() {
	const { profile, record } = useBranch();
	return (
		<footer
			className="mt-auto border-t"
			style={{ borderColor: "var(--color-border)" }}
		>
			<div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 grid gap-6 sm:grid-cols-3 text-sm">
				<div>
					<div className="font-display text-lg font-semibold mb-1">
						{profile.displayName}
					</div>
					<p className="text-muted-brand max-w-xs">{profile.tagline}</p>
				</div>
				<div>
					<div className="font-semibold mb-2">Visit</div>
					<p className="text-muted-brand">
						{record?.location || "Accra, Ghana"}
						<br />
						{record?.phone || "+233 000 000 000"}
					</p>
				</div>
				<div>
					<div className="font-semibold mb-2">Marketplace</div>
					<p className="text-muted-brand">
						Powered by SalesPro Marketplace.
						<br />
						© {new Date().getFullYear()}
					</p>
				</div>
			</div>
		</footer>
	);
}
