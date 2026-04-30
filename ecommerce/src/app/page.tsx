// Storefront home page. Server Component — picks up the active branch from
// middleware-set headers and renders branded hero + featured products.

import Link from "next/link";
import { Hero } from "@/components/Hero";
import { ProductGrid } from "@/components/ProductGrid";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { getActiveBranch } from "@/lib/serverBranch";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const { slug, record } = await getActiveBranch();

	let products: Awaited<ReturnType<typeof fetchProducts>> = [];
	let categories: string[] = [];
	let backendError: string | null = null;

	if (record) {
		try {
			[products, categories] = await Promise.all([
				fetchProducts(slug, { limit: 12 }),
				fetchCategories(slug),
			]);
		} catch (err) {
			backendError =
				err instanceof Error ? err.message : "The store is temporarily unavailable.";
		}
	}

	return (
		<>
			<Hero />

			<section className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
				<div className="flex flex-wrap items-end justify-between gap-3 mb-6">
					<div>
						<h2 className="font-display text-2xl sm:text-3xl font-semibold">
							In store now
						</h2>
						<p className="text-sm text-muted-brand mt-1">
							Live inventory from this branch — what you see is in stock today.
						</p>
					</div>
					<Link href="/products" className="btn-brand-soft text-sm">
						See all →
					</Link>
				</div>

				{backendError && (
					<div
						className="card-brand p-4 mb-6 text-sm"
						style={{ background: "var(--color-secondary)" }}
					>
						<strong>Couldn&apos;t reach the inventory:</strong> {backendError}
					</div>
				)}

				{!record && (
					<div className="card-brand p-6 mb-6 text-sm">
						No matching branch in the inventory for slug{" "}
						<code className="px-1 rounded bg-black/5">{slug}</code>. Add a branch in the
						SalesPro admin (or use <code>?branch=odeneho</code> for development) and the
						storefront will appear here automatically.
					</div>
				)}

				{categories.length > 0 && (
					<div className="flex flex-wrap gap-2 mb-6">
						<Link
							href="/products"
							className="chip-brand"
							style={{ background: "var(--color-primary)", color: "var(--color-primary-foreground)" }}
						>
							All
						</Link>
						{categories.slice(0, 8).map((c) => (
							<Link
								key={c}
								href={`/products?category=${encodeURIComponent(c)}`}
								className="chip-brand"
							>
								{c}
							</Link>
						))}
					</div>
				)}

				<ProductGrid products={products} emptyText="No products in this branch yet." />
			</section>
		</>
	);
}
