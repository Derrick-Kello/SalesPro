// Products listing — supports ?category=... and ?search=... query params.

import Link from "next/link";
import { ProductGrid } from "@/components/ProductGrid";
import { fetchCategories, fetchProducts } from "@/lib/api";
import { getActiveBranch } from "@/lib/serverBranch";

export const dynamic = "force-dynamic";

interface SearchParams {
	category?: string;
	search?: string;
}

export default async function ProductsPage({
	searchParams,
}: {
	searchParams: Promise<SearchParams>;
}) {
	const { slug, profile, record } = await getActiveBranch();
	const { category, search } = await searchParams;

	let products: Awaited<ReturnType<typeof fetchProducts>> = [];
	let categories: string[] = [];
	let error: string | null = null;

	if (record) {
		try {
			[products, categories] = await Promise.all([
				fetchProducts(slug, { category, search, limit: 200 }),
				fetchCategories(slug),
			]);
		} catch (err) {
			error = err instanceof Error ? err.message : "Could not load products.";
		}
	}

	return (
		<section className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-14">
			<header className="flex flex-wrap items-end justify-between gap-3 mb-6">
				<div>
					<h1 className="font-display text-3xl sm:text-4xl font-semibold">
						{category ? category : "All products"}
					</h1>
					<p className="text-sm text-muted-brand mt-1">
						{products.length} item{products.length === 1 ? "" : "s"} at{" "}
						{profile.displayName}
					</p>
				</div>
				<form className="flex items-center gap-2" action="/products" method="get">
					{category && <input type="hidden" name="category" value={category} />}
					<input
						type="text"
						name="search"
						defaultValue={search || ""}
						placeholder="Search the store"
						className="card-brand px-4 py-2 text-sm w-56 focus:outline-none focus:ring-2"
						style={{ borderRadius: "var(--radius)" }}
					/>
					<button type="submit" className="btn-brand-soft text-sm">
						Search
					</button>
				</form>
			</header>

			<div className="flex flex-wrap gap-2 mb-6">
				<Link
					href="/products"
					className="chip-brand"
					style={
						!category
							? { background: "var(--color-primary)", color: "var(--color-primary-foreground)" }
							: undefined
					}
				>
					All
				</Link>
				{categories.map((c) => (
					<Link
						key={c}
						href={`/products?category=${encodeURIComponent(c)}`}
						className="chip-brand"
						style={
							c.toLowerCase() === (category || "").toLowerCase()
								? { background: "var(--color-primary)", color: "var(--color-primary-foreground)" }
								: undefined
						}
					>
						{c}
					</Link>
				))}
			</div>

			{error && (
				<div
					className="card-brand p-4 mb-6 text-sm"
					style={{ background: "var(--color-secondary)" }}
				>
					{error}
				</div>
			)}

			<ProductGrid
				products={products}
				emptyText={
					search || category
						? "No products match these filters at this branch."
						: "No products available at this branch yet."
				}
			/>
		</section>
	);
}
