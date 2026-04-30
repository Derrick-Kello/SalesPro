// Tenant detection proxy (Next 16's renamed middleware).
//
// Determines the active branch slug from the incoming hostname (or `?branch=`
// query override during dev), and forwards it to all downstream handlers as
// `x-branch-slug`. Server Components read this via `headers()` to render the
// correct branded storefront with no client-side flash.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { slugFromHostname, slugFromQuery } from "@/lib/branchSlug";

export default function proxy(req: NextRequest) {
	const url = req.nextUrl;
	const fromQuery = slugFromQuery(url);
	const fromHost = slugFromHostname(req.headers.get("host"));
	const fromCookie = req.cookies.get("branch_slug")?.value || null;
	const fallback = process.env.NEXT_PUBLIC_DEFAULT_BRANCH_SLUG || "odeneho";

	const slug = (fromQuery || fromHost || fromCookie || fallback).toLowerCase().trim();

	const headers = new Headers(req.headers);
	headers.set("x-branch-slug", slug);

	const res = NextResponse.next({ request: { headers } });

	// Persist a query-param override into a cookie so subsequent navigations
	// keep the same branch — useful when developing on a single localhost port.
	if (fromQuery && fromQuery !== fromCookie) {
		res.cookies.set("branch_slug", fromQuery, {
			path: "/",
			maxAge: 60 * 60 * 24 * 7,
			sameSite: "lax",
		});
	}

	res.headers.set("x-branch-slug", slug);
	return res;
}

export const config = {
	matcher: [
		// Run on all paths EXCEPT next-internals, static files, and favicons.
		"/((?!_next/static|_next/image|_next/data|favicon|file\\.svg|globe\\.svg|next\\.svg|window\\.svg|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js|map)).*)",
	],
};
