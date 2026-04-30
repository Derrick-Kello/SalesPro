"use client";

// LocalStorage-backed cart, scoped per branch (we cannot mix items from
// different boutiques in one checkout). Switching branches in the same browser
// shows an empty cart for the new branch — items from the previous one are
// preserved separately.

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import type { CartLine } from "@/lib/types";
import { useBranch } from "./BranchProvider";
import { useAuth } from "./AuthProvider";

interface CartState {
	lines: CartLine[];
}

interface CartContextValue {
	lines: CartLine[];
	itemCount: number;
	subtotal: number;
	addLine: (line: Omit<CartLine, "branchSlug">) => void;
	updateQuantity: (productId: number, tagId: number | null, quantity: number) => void;
	removeLine: (productId: number, tagId: number | null) => void;
	clear: () => void;
	isHydrated: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const storageKey = (slug: string, userId: string) => `salespro:cart:${slug}:${userId}`;

function lineKey(productId: number, tagId: number | null) {
	return `${productId}::${tagId ?? "_"}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
	const { slug } = useBranch();
	const { user, isHydrated: authHydrated } = useAuth();
	const [state, setState] = useState<CartState>({ lines: [] });
	const [isHydrated, setHydrated] = useState(false);
	const principal = user?.id || "guest";

	// Load cart from localStorage when branch changes.
	useEffect(() => {
		if (typeof window === "undefined" || !authHydrated) return;
		try {
			const raw = window.localStorage.getItem(storageKey(slug, principal));
			if (raw) {
				const parsed = JSON.parse(raw) as CartState;
				if (parsed && Array.isArray(parsed.lines)) {
					setState({ lines: parsed.lines.filter((l) => l.branchSlug === slug) });
				} else {
					setState({ lines: [] });
				}
			} else {
				setState({ lines: [] });
			}
		} catch {
			setState({ lines: [] });
		}
		setHydrated(true);
	}, [slug, principal, authHydrated]);

	// Persist on change.
	useEffect(() => {
		if (typeof window === "undefined" || !isHydrated) return;
		try {
			window.localStorage.setItem(storageKey(slug, principal), JSON.stringify(state));
		} catch {
			/* quota exceeded — silently ignore */
		}
	}, [slug, principal, state, isHydrated]);

	const addLine = useCallback<CartContextValue["addLine"]>(
		(line) => {
			const fullLine: CartLine = { ...line, branchSlug: slug };
			setState((prev) => {
				const idx = prev.lines.findIndex(
					(l) => lineKey(l.productId, l.tagId) === lineKey(fullLine.productId, fullLine.tagId)
				);
				if (idx === -1) return { lines: [...prev.lines, fullLine] };
				const next = [...prev.lines];
				const merged = Math.min(
					fullLine.maxStock || Number.POSITIVE_INFINITY,
					next[idx].quantity + fullLine.quantity
				);
				next[idx] = { ...next[idx], quantity: merged };
				return { lines: next };
			});
		},
		[slug]
	);

	const updateQuantity = useCallback<CartContextValue["updateQuantity"]>(
		(productId, tagId, quantity) => {
			setState((prev) => ({
				lines: prev.lines
					.map((l) => {
						if (lineKey(l.productId, l.tagId) !== lineKey(productId, tagId)) return l;
						const capped = Math.max(0, Math.min(l.maxStock || Number.POSITIVE_INFINITY, quantity));
						return { ...l, quantity: capped };
					})
					.filter((l) => l.quantity > 0),
			}));
		},
		[]
	);

	const removeLine = useCallback<CartContextValue["removeLine"]>((productId, tagId) => {
		setState((prev) => ({
			lines: prev.lines.filter(
				(l) => lineKey(l.productId, l.tagId) !== lineKey(productId, tagId)
			),
		}));
	}, []);

	const clear = useCallback(() => setState({ lines: [] }), []);

	const value = useMemo<CartContextValue>(() => {
		const itemCount = state.lines.reduce((sum, l) => sum + l.quantity, 0);
		const subtotal = state.lines.reduce((sum, l) => sum + l.quantity * l.price, 0);
		return {
			lines: state.lines,
			itemCount,
			subtotal,
			addLine,
			updateQuantity,
			removeLine,
			clear,
			isHydrated,
		};
	}, [state.lines, addLine, updateQuantity, removeLine, clear, isHydrated]);

	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
	const ctx = useContext(CartContext);
	if (!ctx) throw new Error("useCart() must be used inside <CartProvider>");
	return ctx;
}
