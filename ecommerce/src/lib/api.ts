// Thin wrapper around the public storefront API. Used in Server Components
// and route handlers. Defaults to no-store so multi-tenant pages always read
// fresh data per branch (we let the CDN handle edge caching).

import type { BranchSummary, OrderResponse, Product } from "./types";

const BACKEND =
	(process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000/api").replace(/\/$/, "");

interface FetchOpts {
	cache?: RequestCache;
	revalidate?: number | false;
	signal?: AbortSignal;
}

async function getJson<T>(path: string, opts: FetchOpts = {}): Promise<T> {
	const { cache = "no-store", revalidate, signal } = opts;
	const init: RequestInit & { next?: { revalidate?: number | false } } = {
		method: "GET",
		headers: { Accept: "application/json" },
		signal,
	};
	if (revalidate != null) init.next = { revalidate };
	else init.cache = cache;

	const res = await fetch(`${BACKEND}${path}`, init);
	if (!res.ok) {
		const txt = await res.text().catch(() => "");
		throw new Error(`API ${res.status}: ${txt || res.statusText}`);
	}
	return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BACKEND}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(body),
	});
	const json: unknown = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg =
			(json && typeof json === "object" && "error" in json
				? String((json as { error?: unknown }).error || "")
				: "") || res.statusText;
		throw new Error(msg);
	}
	return json as T;
}

export async function fetchBranches() {
	return getJson<BranchSummary[]>("/storefront/branches", { revalidate: 60 });
}

export async function fetchBranch(slug: string) {
	try {
		return await getJson<BranchSummary>(
			`/storefront/branch/${encodeURIComponent(slug)}`,
			{ cache: "no-store" }
		);
	} catch (err) {
		if (err instanceof Error && err.message.includes("404")) return null;
		throw err;
	}
}

export async function fetchProducts(slug: string, query?: { search?: string; category?: string; limit?: number }) {
	const qs = new URLSearchParams();
	if (query?.search) qs.set("search", query.search);
	if (query?.category) qs.set("category", query.category);
	if (query?.limit != null) qs.set("limit", String(query.limit));
	const suffix = qs.toString() ? `?${qs.toString()}` : "";
	return getJson<Product[]>(
		`/storefront/branch/${encodeURIComponent(slug)}/products${suffix}`,
		{ cache: "no-store" }
	);
}

export async function fetchProduct(slug: string, id: number | string) {
	try {
		return await getJson<Product>(
			`/storefront/branch/${encodeURIComponent(slug)}/products/${encodeURIComponent(String(id))}`,
			{ cache: "no-store" }
		);
	} catch (err) {
		if (err instanceof Error && err.message.includes("404")) return null;
		throw err;
	}
}

export async function fetchCategories(slug: string) {
	try {
		return await getJson<string[]>(
			`/storefront/branch/${encodeURIComponent(slug)}/categories`,
			{ cache: "no-store" }
		);
	} catch {
		return [];
	}
}

export interface PaystackInitResponse {
	reference: string;
	accessCode: string;
	authorizationUrl: string;
}

export async function initPaystack(input: {
	amount: number;
	email: string;
	currency: string;
	callbackUrl?: string;
	metadata?: Record<string, unknown>;
}) {
	return postJson<PaystackInitResponse>(
		"/storefront/payments/paystack/initialize",
		input
	);
}

export async function submitOrder(slug: string, payload: {
	items: { productId: number; quantity: number; tagId: number | null }[];
	customer: { name: string; email?: string; phone?: string; address?: string };
	shipping: number;
	paystackReference: string;
	currency: string;
}) {
	return postJson<OrderResponse>(
		`/storefront/branch/${encodeURIComponent(slug)}/orders`,
		payload
	);
}
