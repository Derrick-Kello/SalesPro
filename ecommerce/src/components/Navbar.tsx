"use client";

import Link from "next/link";
import { useBranch } from "./BranchProvider";
import { useCart } from "./CartProvider";
import { useAuth } from "./AuthProvider";

export function Navbar() {
	const { profile, slug, record } = useBranch();
	const { itemCount } = useCart();
	const { user, isAuthenticated, logout } = useAuth();

	return (
		<header
			className="sticky top-0 z-30 backdrop-blur-md border-b"
			style={{
				background: "color-mix(in oklab, var(--color-background) 85%, transparent)",
				borderColor: "var(--color-border)",
			}}
		>
			<div className="mx-auto max-w-6xl px-5 sm:px-8 py-4 flex items-center justify-between">
				<Link href="/" className="flex items-center gap-3 group">
					<span
						aria-hidden
						className="grid place-items-center w-10 h-10 font-display font-semibold tracking-tight"
						style={{
							background: "var(--color-primary)",
							color: "var(--color-primary-foreground)",
							borderRadius: "var(--radius)",
						}}
					>
						{profile.logoMark}
					</span>
					<span className="hidden sm:flex flex-col leading-tight">
						<span className="font-display text-lg font-semibold">
							{profile.displayName}
						</span>
						<span className="text-xs text-muted-brand">{profile.tagline}</span>
					</span>
				</Link>

				<nav className="flex items-center gap-1 sm:gap-2">
					<Link href="/" className="btn-brand-ghost text-sm">
						Home
					</Link>
					<Link href="/products" className="btn-brand-ghost text-sm">
						Shop
					</Link>
					<Link
						href="/cart"
						className="btn-brand-soft text-sm relative"
						aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="9" cy="21" r="1" />
							<circle cx="20" cy="21" r="1" />
							<path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
						</svg>
						<span className="hidden sm:inline">Cart</span>
						{itemCount > 0 && (
							<span
								className="ml-1 rounded-full px-2 text-xs font-semibold"
								style={{
									background: "var(--color-primary)",
									color: "var(--color-primary-foreground)",
								}}
							>
								{itemCount}
							</span>
						)}
					</Link>
					{isAuthenticated ? (
						<>
							<span className="hidden md:inline text-xs text-muted-brand px-2">
								Hi, {user?.name}
							</span>
							<button type="button" onClick={logout} className="btn-brand-ghost text-sm">
								Log out
							</button>
						</>
					) : (
						<>
							<Link href="/login" className="btn-brand-ghost text-sm">
								Log in
							</Link>
							<Link href="/signup" className="btn-brand-soft text-sm">
								Sign up
							</Link>
						</>
					)}
				</nav>
			</div>

			{!record && (
				<div
					className="text-center text-xs py-1.5 px-4"
					style={{ background: "var(--color-secondary)", color: "var(--color-muted)" }}
				>
					Showing fallback storefront for &ldquo;{slug}&rdquo; — no matching branch in
					the inventory yet.
				</div>
			)}
		</header>
	);
}
