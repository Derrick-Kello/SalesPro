"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
	return (
		<Suspense fallback={<div className="mx-auto max-w-md p-10 text-center text-muted-brand">Loading…</div>}>
			<LoginInner />
		</Suspense>
	);
}

function LoginInner() {
	const router = useRouter();
	const params = useSearchParams();
	const next = params.get("next") || "/products";
	const { login, isAuthenticated } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isAuthenticated) return;
		router.replace(next);
	}, [isAuthenticated, router, next]);

	if (isAuthenticated) return null;

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		const res = login({ email, password });
		if (!res.ok) {
			setError(res.error || "Could not log in.");
			return;
		}
		router.push(next);
	}

	return (
		<section className="mx-auto max-w-md px-5 py-16">
			<h1 className="font-display text-3xl font-semibold mb-2">Log in</h1>
			<p className="text-sm text-muted-brand mb-6">
				Log in to restore and maintain your cart.
			</p>
			<form onSubmit={onSubmit} className="card-brand p-5 flex flex-col gap-3">
				<Field label="Email" type="email" value={email} onChange={setEmail} />
				<Field label="Password" type="password" value={password} onChange={setPassword} />
				{error && <p className="text-sm" style={{ color: "var(--color-accent)" }}>{error}</p>}
				<button type="submit" className="btn-brand justify-center">Log in</button>
				<p className="text-sm text-muted-brand text-center">
					New here?{" "}
					<Link className="underline" href={`/signup?next=${encodeURIComponent(next)}`}>
						Create account
					</Link>
				</p>
			</form>
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

