import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import { ProductPurchasePanel } from "@/components/ProductPurchasePanel";
import { fetchProduct, fetchProducts } from "@/lib/api";
import { getActiveBranch } from "@/lib/serverBranch";
import { ProductGrid } from "@/components/ProductGrid";

export const dynamic = "force-dynamic";

export default async function ProductPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const { slug, profile, record } = await getActiveBranch();
	if (!record) {
		return (
			<div className="mx-auto max-w-2xl p-10 text-center">
				<h1 className="font-display text-2xl mb-2">Store unavailable</h1>
				<p className="text-muted-brand">
					No matching branch was found in the inventory for this storefront.
				</p>
			</div>
		);
	}

	const product = await fetchProduct(slug, id).catch(() => null);
	if (!product) notFound();

	const related = await fetchProducts(slug, { category: product.category, limit: 8 })
		.then((items) => items.filter((p) => p.id !== product.id).slice(0, 4))
		.catch(() => []);

	return (
		<article className="mx-auto max-w-6xl px-5 sm:px-8 py-10">
			<nav className="text-xs text-muted-brand mb-6 flex gap-2 items-center">
				<Link href="/" className="hover:underline">{profile.displayName}</Link>
				<span>/</span>
				<Link href="/products" className="hover:underline">Shop</Link>
				<span>/</span>
				<Link
					href={`/products?category=${encodeURIComponent(product.category)}`}
					className="hover:underline"
				>
					{product.category}
				</Link>
			</nav>

			<div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
				<div className="flex flex-col gap-3">
					<ProductImage
						name={product.name}
						category={product.category}
						className="aspect-square w-full"
					/>
					<div className="grid grid-cols-3 gap-2">
						{[0, 1, 2].map((i) => (
							<ProductImage
								key={i}
								name={`${product.name} ${i}`}
								category={product.category}
								className="aspect-square w-full opacity-80"
							/>
						))}
					</div>
				</div>
				<div className="flex flex-col gap-6">
					<header>
						<span className="chip-brand mb-2">{product.category}</span>
						<h1 className="font-display text-3xl sm:text-4xl font-semibold">
							{product.name}
						</h1>
					</header>
					<p className="text-sm leading-relaxed">
						{product.description ||
							"A signature piece from our collection. Crafted with care and designed to last."}
					</p>

					<ProductPurchasePanel product={product} />

					<dl className="card-brand p-4 text-sm grid grid-cols-2 gap-y-2">
						<dt className="text-muted-brand">Branch</dt>
						<dd>{record.name}</dd>
						<dt className="text-muted-brand">Stock at branch</dt>
						<dd>{product.branchStock}</dd>
						{product.barcode && (
							<>
								<dt className="text-muted-brand">SKU</dt>
								<dd>{product.barcode}</dd>
							</>
						)}
					</dl>
				</div>
			</div>

			{related.length > 0 && (
				<section className="mt-16">
					<h2 className="font-display text-2xl font-semibold mb-4">
						More from {product.category}
					</h2>
					<ProductGrid products={related} />
				</section>
			)}
		</article>
	);
}
