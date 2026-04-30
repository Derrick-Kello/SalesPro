// Server-side helper: resolve the active branch (from the middleware-set header)
// and merge it with the local profile. Used by all Server Components.

import { headers } from "next/headers";
import { fetchBranch } from "./api";
import { getBranchProfile, type BranchProfile } from "./branches";
import type { BranchSummary } from "./types";

export interface ResolvedBranch {
	slug: string;
	profile: BranchProfile;
	/** Server-side branch record; null when the backend doesn't know the slug yet. */
	record: BranchSummary | null;
}

export async function getActiveBranch(): Promise<ResolvedBranch> {
	const h = await headers();
	const slug = (h.get("x-branch-slug") || process.env.NEXT_PUBLIC_DEFAULT_BRANCH_SLUG || "odeneho")
		.toLowerCase()
		.trim();

	const profile = getBranchProfile(slug);
	let record: BranchSummary | null = null;
	try {
		record = await fetchBranch(slug);
	} catch (err) {
		console.error("[serverBranch] backend unreachable for", slug, err);
	}
	return { slug, profile, record };
}
