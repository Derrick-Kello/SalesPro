"use client";

import Link from "next/link";
import { useBranch } from "@/components/BranchProvider";
import { useCart } from "@/components/CartProvider";
import { useAuth } from "@/hooks/useAuth";
import { ProductImage } from "@/components/ProductImage";
import { formatMoney } from "@/lib/money";

export default function CartPage() {
	const { profile } = useBranch();
	const { isAuthenticated } = useAuth();
	const { lines, subtotal, removeLine, updateQuantity, clear, isHydrated } = useCart();

	if (!isAuthenticated) {
		return (
			<section className="mx-auto max-w-2xl px-5 sm:px-8 py-20 text-center flex flex-col gap-4 items-center">
				<h1 className="font-display text-3xl font-semibold">Sign up to view your cart</h1>
				<p className="text-muted-brand">
					We keep your cart tied to your account so you can continue from any session.
				</p>
				<Link href="/signup?next=%2Fcart" className="btn-brand mt-2">
					Sign up
				</Link>
				<Link href="/login?next=%2Fcart" className="btn-brand-soft">
					Log in
				</Link>
			</section>
		);
	}

	if (!isHydrated) {
		return (
			<div className="mx-auto max-w-4xl px-5 sm:px-8 py-12">
				<div className="skeleton h-32" />
			</div>
		);
	}

	if (lines.length === 0) {
		return (
			<section className="mx-auto max-w-2xl px-5 sm:px-8 py-20 text-center flex flex-col gap-4 items-center">
				<div
					aria-hidden
					className="w-20 h-20 rounded-full grid place-items-center"
					style={{ background: "var(--color-secondary)" }}
				>
					🛍
				</div>
				<h1 className="font-display text-3xl font-semibold">Your bag is empty</h1>
				<p className="text-muted-brand">
					Browse {profile.displayName}&apos;s collection and add a few favourites.
				</p>
				<Link href="/products" className="btn-brand mt-2">
					Start shopping
				</Link>
			</section>
		);
	}

	return (
		<section className="mx-auto max-w-5xl px-5 sm:px-8 py-10 grid lg:grid-cols-[2fr_1fr] gap-10">
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h1 className="font-display text-3xl font-semibold">Your bag</h1>
					<button
						type="button"
						onClick={clear}
						className="text-xs underline-offset-2 hover:underline text-muted-brand"
					>
						Clear all
					</button>
				</div>

				<ul className="flex flex-col gap-3">
					{lines.map((line) => (
						<li
							key={`${line.productId}::${line.tagId ?? "_"}`}
							className="card-brand p-3 flex gap-4"
						>
							<ProductImage
								name={line.name}
								category={line.tagLabel || ""}
								className="w-20 h-20 shrink-0"
							/>
							<div className="flex-1 flex flex-col">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="font-semibold">{line.name}</div>
										{line.tagLabel && (
											<div className="text-xs text-muted-brand">
												Variant: {line.tagLabel}
											</div>
										)}
									</div>
									<div className="font-semibold">
										{formatMoney(line.price * line.quantity)}
									</div>
								</div>
								<div className="mt-auto pt-3 flex items-center justify-between">
									<div
										className="flex items-center"
										style={{
											border: "1px solid var(--color-border)",
											borderRadius: "var(--radius)",
										}}
									>
										<button
											type="button"
											className="px-3 py-1.5"
											onClick={() =>
												updateQuantity(line.productId, line.tagId, line.quantity - 1)
											}
											aria-label="Decrease"
										>
											−
										</button>
										<span className="px-3 min-w-7 text-center font-semibold">
											{line.quantity}
										</span>
										<button
											type="button"
											className="px-3 py-1.5"
											onClick={() =>
												updateQuantity(line.productId, line.tagId, line.quantity + 1)
											}
											aria-label="Increase"
										>
											+
										</button>
									</div>
									<button
										type="button"
										onClick={() => removeLine(line.productId, line.tagId)}
										className="text-xs text-muted-brand hover:underline"
									>
										Remove
									</button>
								</div>
							</div>
						</li>
					))}
				</ul>
			</div>

			<aside className="card-brand p-5 h-fit lg:sticky lg:top-24 flex flex-col gap-3">
				<h2 className="font-display text-lg font-semibold">Order summary</h2>
				<dl className="flex flex-col gap-2 text-sm">
					<div className="flex justify-between">
						<dt className="text-muted-brand">Subtotal</dt>
						<dd>{formatMoney(subtotal)}</dd>
					</div>
					<div className="flex justify-between">
						<dt className="text-muted-brand">Shipping</dt>
						<dd className="text-muted-brand">Calculated next</dd>
					</div>
					<div className="flex justify-between text-base font-semibold pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
						<dt>Total</dt>
						<dd>{formatMoney(subtotal)}</dd>
					</div>
				</dl>
				<Link href="/checkout" className="btn-brand w-full justify-center">
					Continue to checkout
				</Link>
				<Link href="/products" className="btn-brand-ghost text-sm justify-center">
					← Keep shopping
				</Link>
			</aside>
		</section>
	);
}
