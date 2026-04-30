"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import type { Product } from "@/lib/types";
import { ProductImage } from "./ProductImage";
import { useAuth } from "./AuthProvider";

export function ProductCard({ product }: { product: Product }) {
	const router = useRouter();
	const { isAuthenticated } = useAuth();
	const target = `/products/${product.id}`;

	function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
		if (isAuthenticated) return;
		e.preventDefault();
		window.alert("Please sign up to view this product.");
		router.push(`/signup?next=${encodeURIComponent(target)}`);
	}

	return (
		<Link
			href={isAuthenticated ? target : `/signup?next=${encodeURIComponent(target)}`}
			onClick={handleClick}
			className="group card-brand p-3 flex flex-col gap-3 transition hover:-translate-y-0.5"
			style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.02)" }}
		>
			<ProductImage
				name={product.name}
				category={product.category}
				className="aspect-[4/5] w-full"
			/>
			<div className="px-1 pt-1 flex flex-col gap-1 grow">
				<div className="flex items-start justify-between gap-3">
					<h3 className="font-display text-base font-semibold leading-tight line-clamp-2">
						{product.name}
					</h3>
					{!product.inStock && (
						<span className="chip-brand text-[10px]" style={{ color: "var(--color-muted)" }}>
							Sold out
						</span>
					)}
				</div>
				<p className="text-xs text-muted-brand line-clamp-2">
					{product.description || product.category}
				</p>
				<div className="mt-auto pt-2 flex items-center justify-between">
					<span className="font-semibold">{formatMoney(product.price)}</span>
					<span
						className="text-xs underline-offset-4 group-hover:underline"
						style={{ color: "var(--color-accent)" }}
					>
						{isAuthenticated ? "View →" : "Sign up to view →"}
					</span>
				</div>
			</div>
		</Link>
	);
}
