"use client";

// Variant picker + quantity stepper + add-to-cart, scoped to one product.
// Renders nothing dynamic on the server so it's safe inside a Server Component
// product page.

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { useAuth } from "@/components/AuthProvider";
import { useNotice } from "@/components/NoticeProvider";
import { formatMoney } from "@/lib/money";
import type { Product, ProductTag } from "@/lib/types";

interface Props {
	product: Product;
}

export function ProductPurchasePanel({ product }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const { addLine } = useCart();
	const { isAuthenticated } = useAuth();
	const { notify } = useNotice();
	const groupNames = useMemo(() => Object.keys(product.variantGroups), [product]);
	const firstAvailableTag = useMemo(() => {
		for (const group of Object.values(product.variantGroups)) {
			const available = group.find((t) => t.quantity == null || t.quantity > 0);
			if (available) return available;
		}
		return null;
	}, [product]);
	const [selectedTagId, setSelectedTagId] = useState<number | null>(() => {
		if (groupNames.length === 0) return null;
		return firstAvailableTag?.id ?? null;
	});
	const [qty, setQty] = useState(1);
	const [justAdded, setJustAdded] = useState(false);

	const selectedTag = useMemo<ProductTag | null>(() => {
		for (const g of Object.values(product.variantGroups)) {
			const hit = g.find((t) => t.id === selectedTagId);
			if (hit) return hit;
		}
		return null;
	}, [product, selectedTagId]);

	// If the product tracks per-tag stock the per-tag quantity wins, otherwise
	// fall back to the branch-level stock from the product summary.
	const tracksPerTagStock = useMemo(
		() => Object.values(product.variantGroups).some((g) => g.some((t) => t.quantity != null)),
		[product]
	);
	// For tracked-tag products, some tags may have `quantity = null` (untracked).
	// In that case we should fall back to branch-level stock, not zero.
	const maxStock = tracksPerTagStock
		? selectedTag
			? selectedTag.quantity ?? product.branchStock
			: 0
		: product.branchStock;
	const requiresTag = tracksPerTagStock;
	const cantBuy = !product.inStock || maxStock <= 0 || (requiresTag && !selectedTag);

	function isAvailable(t: ProductTag) {
		return t.quantity == null || t.quantity > 0;
	}

	function handleAdd() {
		if (cantBuy) return;
		if (!isAuthenticated) {
			notify("Please sign up to add products to cart.", "info");
			router.push(`/signup?next=${encodeURIComponent(pathname || `/products/${product.id}`)}`);
			return;
		}
		addLine({
			productId: product.id,
			name: product.name,
			price: product.price,
			quantity: qty,
			tagId: selectedTag?.id ?? null,
			tagLabel: selectedTag?.name ?? null,
			maxStock: Math.max(qty, maxStock),
		});
		setJustAdded(true);
		setTimeout(() => setJustAdded(false), 1500);
	}

	function handleBuyNow() {
		if (cantBuy) return;
		if (!isAuthenticated) {
			notify("Please sign up to continue.", "info");
			router.push(`/signup?next=${encodeURIComponent(pathname || `/products/${product.id}`)}`);
			return;
		}
		handleAdd();
		router.push("/checkout");
	}

	return (
		<div className="flex flex-col gap-5">
			<div className="text-3xl font-semibold">{formatMoney(product.price)}</div>

			{groupNames.map((g) => (
				<div key={g} className="flex flex-col gap-2">
					<div className="text-sm font-medium">
						{g}
						{requiresTag && <span style={{ color: "var(--color-accent)" }}> *</span>}
					</div>
					<div className="flex flex-wrap gap-2">
						{product.variantGroups[g].map((t) => {
							const out = !isAvailable(t);
							const active = t.id === selectedTagId;
							return (
								<button
									key={t.id}
									type="button"
									disabled={out}
									onClick={() => setSelectedTagId(t.id)}
									className="chip-brand text-sm disabled:opacity-40"
									style={
										active
											? {
													background: "var(--color-primary)",
													color: "var(--color-primary-foreground)",
													borderColor: "var(--color-primary)",
												}
											: undefined
									}
									title={out ? "Sold out" : undefined}
								>
									{t.name}
									{t.quantity != null && (
										<span className="ml-1 opacity-70">· {t.quantity}</span>
									)}
								</button>
							);
						})}
					</div>
				</div>
			))}

			<div className="flex items-center gap-3">
				<div
					className="flex items-center"
					style={{
						border: "1px solid var(--color-border)",
						borderRadius: "var(--radius)",
					}}
				>
					<button
						type="button"
						className="px-3 py-2"
						onClick={() => setQty((q) => Math.max(1, q - 1))}
						disabled={qty <= 1}
						aria-label="Decrease quantity"
					>
						−
					</button>
					<span className="px-3 min-w-8 text-center font-semibold">{qty}</span>
					<button
						type="button"
						className="px-3 py-2"
						onClick={() => setQty((q) => Math.min(maxStock || 99, q + 1))}
						disabled={qty >= (maxStock || 99)}
						aria-label="Increase quantity"
					>
						+
					</button>
				</div>
				<span className="text-xs text-muted-brand">
					{maxStock > 0
						? `${maxStock} available at this branch`
						: "Out of stock"}
				</span>
			</div>

			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					onClick={handleAdd}
					disabled={cantBuy}
					className="btn-brand"
				>
					{justAdded ? "Added ✓" : "Add to cart"}
				</button>
				<button
					type="button"
					onClick={handleBuyNow}
					disabled={cantBuy}
					className="btn-brand-soft"
				>
					Buy now
				</button>
			</div>

			{requiresTag && !selectedTag && (
				<p className="text-xs" style={{ color: "var(--color-accent)" }}>
					Choose a variant to continue.
				</p>
			)}
		</div>
	);
}
