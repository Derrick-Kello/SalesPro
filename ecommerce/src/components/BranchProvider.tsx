"use client";

// Client-side branch context. Hydrated from data resolved on the server in the
// root layout. Components access branch info via useBranch(); the cart layer
// uses it to scope the cart to one branch at a time.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { BranchProfile } from "@/lib/branches";
import type { BranchSummary } from "@/lib/types";

export interface BranchContextValue {
	slug: string;
	profile: BranchProfile;
	record: BranchSummary | null;
	isResolved: boolean;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({
	value,
	children,
}: {
	value: BranchContextValue;
	children: ReactNode;
}) {
	const memo = useMemo(() => value, [value]);
	return <BranchContext.Provider value={memo}>{children}</BranchContext.Provider>;
}

export function useBranch(): BranchContextValue {
	const ctx = useContext(BranchContext);
	if (!ctx) {
		throw new Error("useBranch() must be used inside <BranchProvider>");
	}
	return ctx;
}
