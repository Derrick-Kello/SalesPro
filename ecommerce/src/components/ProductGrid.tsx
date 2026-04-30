"use client";

import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import { useBranch } from "./BranchProvider";

interface Props {
	products: Product[];
	emptyText?: string;
}

// `useBranch` reads context, but layout variant is part of the branch profile.
// We turn it into a CSS class on the grid wrapper so each variant feels distinct.
function gridClassFor(layout: string) {
	switch (layout) {
		case "minimal-luxury":
			return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10";
		case "modern-card":
			return "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";
		case "boutique-grid":
		default:
			return "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4";
	}
}

export function ProductGrid({ products, emptyText }: Props) {
	const { profile } = useBranch();
	if (!products.length) {
		return (
			<div className="text-center py-16 text-muted-brand">
				{emptyText || "Nothing here yet — check back soon."}
			</div>
		);
	}
	return (
		<div className={gridClassFor(profile.layout)}>
			{products.map((p) => (
				<ProductCard key={p.id} product={p} />
			))}
		</div>
	);
}
