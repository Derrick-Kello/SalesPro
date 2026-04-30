// Slug detection helpers. The active branch is derived in this priority order:
//   1) `?branch=...` query string (development override)
//   2) `x-branch-slug` request header (set by middleware after parsing host)
//   3) `branch_slug` cookie (set client-side for sticky dev override)
//   4) NEXT_PUBLIC_DEFAULT_BRANCH_SLUG env var
//   5) "odeneho" as final fallback
//
// Subdomain parsing rules:
//   odeneho.marketplace.gh         -> "odeneho"
//   madepa.marketplace.gh          -> "madepa"
//   odeneho.localhost:3000         -> "odeneho"
//   localhost:3000                 -> null  (use fallback)
//   www.marketplace.gh             -> null  (reserved hosts)

const RESERVED_HOSTS = new Set(["www", "api", "admin", "marketplace"]);

export function slugFromHostname(host: string | null | undefined): string | null {
	if (!host) return null;
	const cleanHost = host.split(":")[0].toLowerCase().trim();
	if (!cleanHost) return null;

	const parts = cleanHost.split(".");
	if (parts.length < 2) return null; // bare "localhost"

	const sub = parts[0];
	if (!sub || RESERVED_HOSTS.has(sub)) return null;

	// Don't treat "marketplace.gh" itself (no subdomain) as a slug.
	if (parts.length === 2 && parts[1] === "gh") return null;

	return sub;
}

export function slugFromQuery(url: string | URL | null): string | null {
	if (!url) return null;
	try {
		const u = typeof url === "string" ? new URL(url, "http://x") : url;
		const v = u.searchParams.get("branch");
		return v ? v.toLowerCase().trim() : null;
	} catch {
		return null;
	}
}
