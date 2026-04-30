import Link from "next/link";

export default function ProductNotFound() {
	return (
		<section className="mx-auto max-w-xl px-5 py-20 text-center">
			<h1 className="font-display text-3xl font-semibold mb-2">Product not found</h1>
			<p className="text-muted-brand mb-6">
				That product may not be available at this branch right now.
			</p>
			<Link href="/products" className="btn-brand">
				Back to the shop
			</Link>
		</section>
	);
}
