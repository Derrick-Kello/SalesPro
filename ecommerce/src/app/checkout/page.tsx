"use client";

// Checkout: collect shipping/contact info, init Paystack on the server, then
// redirect to the Paystack hosted page. The pending order payload is stashed
// in sessionStorage so the success page (which Paystack redirects back to)
// can complete the order against the backend.

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useBranch } from "@/components/BranchProvider";
import { useCart } from "@/components/CartProvider";
import { useAuth } from "@/hooks/useAuth";
import { initPaystack } from "@/lib/api";
import { formatMoney, STORE_CURRENCY } from "@/lib/money";

const SHIPPING_FEE = 25; // GHS — flat rate; replace with calculator later.

interface PendingOrder {
	branchSlug: string;
	currency: string;
	shipping: number;
	customer: {
		name: string;
		email: string;
		phone: string;
		address: string;
	};
	items: { productId: number; quantity: number; tagId: number | null }[];
	expectedTotal: number;
	reference?: string;
}

const PENDING_KEY = "salespro:pendingOrder";

export default function CheckoutPage() {
	const router = useRouter();
	const { slug, profile, record } = useBranch();
	const { isAuthenticated, user } = useAuth();
	const { lines, subtotal, isHydrated } = useCart();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [form, setForm] = useState({
		name: user?.name || "",
		email: user?.email || "",
		phone: "",
		address: "",
		city: "",
		notes: "",
	});

	const total = subtotal + (lines.length ? SHIPPING_FEE : 0);

	function update<K extends keyof typeof form>(k: K, v: string) {
		setForm((prev) => ({ ...prev, [k]: v }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		if (!record) {
			setError("This branch isn't available right now. Try again shortly.");
			return;
		}
		if (!lines.length) return;
		if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) {
			setError("Please fill in your name, email, phone and address.");
			return;
		}

		const payload: PendingOrder = {
			branchSlug: slug,
			currency: STORE_CURRENCY,
			shipping: SHIPPING_FEE,
			customer: {
				name: form.name.trim(),
				email: form.email.trim().toLowerCase(),
				phone: form.phone.trim(),
				address: [form.address.trim(), form.city.trim()].filter(Boolean).join(", "),
			},
			items: lines.map((l) => ({
				productId: l.productId,
				quantity: l.quantity,
				tagId: l.tagId,
			})),
			expectedTotal: Math.round((total + Number.EPSILON) * 100) / 100,
		};

		setSubmitting(true);
		try {
			const callbackUrl = `${window.location.origin}/checkout/success`;
			const init = await initPaystack({
				amount: payload.expectedTotal,
				email: payload.customer.email,
				currency: STORE_CURRENCY,
				callbackUrl,
				metadata: {
					branchSlug: slug,
					branchName: record.name,
					customerName: payload.customer.name,
					itemCount: lines.length,
				},
			});

			payload.reference = init.reference;
			window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));

			window.location.href = init.authorizationUrl;
		} catch (err) {
			setSubmitting(false);
			setError(err instanceof Error ? err.message : "Could not start payment.");
		}
	}

	if (!isHydrated) {
		return <div className="mx-auto max-w-3xl p-12"><div className="skeleton h-32" /></div>;
	}
	if (!isAuthenticated) {
		return (
			<section className="mx-auto max-w-2xl px-5 sm:px-8 py-20 text-center flex flex-col gap-4 items-center">
				<h1 className="font-display text-3xl font-semibold">Sign up to checkout</h1>
				<p className="text-muted-brand">
					Create an account to maintain your cart and complete payment.
				</p>
				<Link href="/signup?next=%2Fcheckout" className="btn-brand mt-2">
					Sign up
				</Link>
				<Link href="/login?next=%2Fcheckout" className="btn-brand-soft">
					Log in
				</Link>
			</section>
		);
	}

	if (!lines.length) {
		return (
			<section className="mx-auto max-w-2xl px-5 sm:px-8 py-20 text-center flex flex-col gap-4 items-center">
				<h1 className="font-display text-3xl font-semibold">Your bag is empty</h1>
				<p className="text-muted-brand">Add a few items to {profile.displayName} before checking out.</p>
				<Link href="/products" className="btn-brand">Shop the collection</Link>
			</section>
		);
	}

	return (
		<section className="mx-auto max-w-5xl px-5 sm:px-8 py-10 grid lg:grid-cols-[1.3fr_1fr] gap-10">
			<form onSubmit={handleSubmit} className="flex flex-col gap-6">
				<header>
					<h1 className="font-display text-3xl font-semibold mb-1">Checkout</h1>
					<p className="text-sm text-muted-brand">
						Shipping from {record?.name || profile.displayName} ·{" "}
						{record?.location || "Accra"}
					</p>
				</header>

				<fieldset className="card-brand p-5 flex flex-col gap-3">
					<legend className="text-sm font-semibold px-1">Contact</legend>
					<Field label="Full name" value={form.name} onChange={(v) => update("name", v)} />
					<div className="grid sm:grid-cols-2 gap-3">
						<Field
							label="Email"
							type="email"
							value={form.email}
							onChange={(v) => update("email", v)}
						/>
						<Field
							label="Phone"
							type="tel"
							value={form.phone}
							onChange={(v) => update("phone", v)}
						/>
					</div>
				</fieldset>

				<fieldset className="card-brand p-5 flex flex-col gap-3">
					<legend className="text-sm font-semibold px-1">Shipping address</legend>
					<Field
						label="Address line"
						value={form.address}
						onChange={(v) => update("address", v)}
					/>
					<Field label="City / Region" value={form.city} onChange={(v) => update("city", v)} />
					<Field
						label="Delivery notes (optional)"
						value={form.notes}
						onChange={(v) => update("notes", v)}
					/>
				</fieldset>

				{error && (
					<div
						className="card-brand p-3 text-sm"
						style={{
							borderColor: "var(--color-accent)",
							background: "color-mix(in oklab, var(--color-accent) 12%, var(--color-background))",
						}}
					>
						{error}
					</div>
				)}

				<button type="submit" disabled={submitting} className="btn-brand w-full justify-center">
					{submitting ? "Redirecting to Paystack…" : `Pay ${formatMoney(total)} with Paystack`}
				</button>
				<p className="text-xs text-muted-brand text-center">
					You&apos;ll be redirected to Paystack&apos;s secure page to finish payment.
					Your order is created and stock is reserved only after a successful payment.
				</p>
			</form>

			<aside className="card-brand p-5 h-fit lg:sticky lg:top-24 flex flex-col gap-3">
				<h2 className="font-display text-lg font-semibold">Order summary</h2>
				<ul className="flex flex-col gap-2 text-sm">
					{lines.map((l) => (
						<li key={`${l.productId}::${l.tagId ?? "_"}`} className="flex justify-between gap-3">
							<span className="flex-1">
								{l.quantity}× {l.name}
								{l.tagLabel && (
									<span className="text-muted-brand"> · {l.tagLabel}</span>
								)}
							</span>
							<span>{formatMoney(l.price * l.quantity)}</span>
						</li>
					))}
				</ul>
				<div
					className="pt-3 border-t flex flex-col gap-1 text-sm"
					style={{ borderColor: "var(--color-border)" }}
				>
					<div className="flex justify-between">
						<span className="text-muted-brand">Subtotal</span>
						<span>{formatMoney(subtotal)}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-brand">Shipping</span>
						<span>{formatMoney(SHIPPING_FEE)}</span>
					</div>
					<div className="flex justify-between font-semibold pt-2">
						<span>Total</span>
						<span>{formatMoney(total)}</span>
					</div>
				</div>
			</aside>
		</section>
	);
}

function Field({
	label,
	value,
	onChange,
	type = "text",
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
}) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-xs font-medium text-muted-brand">{label}</span>
			<input
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="px-3 py-2 text-sm focus:outline-none"
				style={{
					border: "1px solid var(--color-border)",
					borderRadius: "var(--radius)",
					background: "var(--color-background)",
				}}
			/>
		</label>
	);
}
