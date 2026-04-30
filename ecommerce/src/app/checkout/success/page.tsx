"use client";

// Paystack returns here after payment with `?reference=...&trxref=...`.
// We reload the pending order from sessionStorage and POST it to the backend,
// which re-verifies payment server-side before creating the Sale + decrementing
// inventory. The user's cart is cleared on success.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useBranch } from "@/components/BranchProvider";
import { useCart } from "@/components/CartProvider";
import { submitOrder } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import type { OrderResponse } from "@/lib/types";

const PENDING_KEY = "salespro:pendingOrder";

interface PendingOrder {
	branchSlug: string;
	currency: string;
	shipping: number;
	customer: { name: string; email: string; phone: string; address: string };
	items: { productId: number; quantity: number; tagId: number | null }[];
	expectedTotal: number;
	reference?: string;
}

type Status = "verifying" | "success" | "error" | "missing";

export default function SuccessPage() {
	return (
		<Suspense fallback={<div className="mx-auto max-w-xl p-12 text-center text-muted-brand">Loading…</div>}>
			<SuccessInner />
		</Suspense>
	);
}

function SuccessInner() {
	const params = useSearchParams();
	const { profile, slug } = useBranch();
	const { clear } = useCart();
	const [status, setStatus] = useState<Status>("verifying");
	const [order, setOrder] = useState<OrderResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const submitted = useRef(false);

	useEffect(() => {
		if (submitted.current) return;
		submitted.current = true;

		const reference = params.get("reference") || params.get("trxref") || "";
		const raw = sessionStorage.getItem(PENDING_KEY);
		if (!raw) {
			setStatus("missing");
			return;
		}
		let pending: PendingOrder;
		try {
			pending = JSON.parse(raw);
		} catch {
			setStatus("missing");
			return;
		}
		const ref = reference || pending.reference;
		if (!ref) {
			setStatus("error");
			setError("Payment reference missing.");
			return;
		}

		(async () => {
			try {
				const result = await submitOrder(pending.branchSlug || slug, {
					items: pending.items,
					customer: pending.customer,
					shipping: pending.shipping,
					paystackReference: ref,
					currency: pending.currency,
				});
				setOrder(result);
				setStatus("success");
				sessionStorage.removeItem(PENDING_KEY);
				clear();
			} catch (err) {
				setStatus("error");
				setError(err instanceof Error ? err.message : "Could not finalise order.");
			}
		})();
		// We deliberately omit `clear` and `slug` from deps — we only want this to
		// run once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<section className="mx-auto max-w-xl px-5 sm:px-8 py-20 text-center flex flex-col items-center gap-4">
			{status === "verifying" && (
				<>
					<div className="skeleton w-16 h-16 rounded-full" />
					<h1 className="font-display text-2xl font-semibold">Confirming your payment…</h1>
					<p className="text-muted-brand text-sm">
						Hold tight while we verify with Paystack and reserve your items at{" "}
						{profile.displayName}.
					</p>
				</>
			)}

			{status === "success" && order && (
				<>
					<div
						aria-hidden
						className="w-16 h-16 rounded-full grid place-items-center text-2xl"
						style={{
							background: "var(--color-primary)",
							color: "var(--color-primary-foreground)",
						}}
					>
						✓
					</div>
					<h1 className="font-display text-3xl font-semibold">Order confirmed</h1>
					<p className="text-muted-brand">
						Thank you! We&apos;ve received your payment of{" "}
						<strong>{formatMoney(order.grandTotal, order.currency)}</strong>.
					</p>
					<dl className="card-brand p-5 text-sm grid grid-cols-2 gap-x-6 gap-y-2 w-full max-w-sm">
						<dt className="text-muted-brand">Order number</dt>
						<dd>#{order.orderId}</dd>
						<dt className="text-muted-brand">Branch</dt>
						<dd>{order.branch.name}</dd>
						<dt className="text-muted-brand">Reference</dt>
						<dd className="break-all">{order.reference}</dd>
					</dl>
					<Link href="/products" className="btn-brand mt-2">
						Continue shopping
					</Link>
				</>
			)}

			{status === "error" && (
				<>
					<div
						aria-hidden
						className="w-16 h-16 rounded-full grid place-items-center text-2xl"
						style={{
							background: "var(--color-accent)",
							color: "var(--color-primary-foreground)",
						}}
					>
						!
					</div>
					<h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
					<p className="text-muted-brand text-sm">
						{error || "We couldn't confirm your order. If you were charged, contact support — we'll sort it out."}
					</p>
					<Link href="/cart" className="btn-brand-soft mt-2">
						Back to cart
					</Link>
				</>
			)}

			{status === "missing" && (
				<>
					<h1 className="font-display text-2xl font-semibold">No pending order</h1>
					<p className="text-muted-brand text-sm">
						We didn&apos;t find a checkout in progress. If you completed payment, your
						order may already be confirmed.
					</p>
					<Link href="/" className="btn-brand-soft mt-2">
						Go home
					</Link>
				</>
			)}
		</section>
	);
}
