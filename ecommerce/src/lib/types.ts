// Shared TypeScript types mirroring the public storefront API on the backend.
// Keep this file in sync with backend/src/routes/storefront.js -> mapPublicProduct().

export type BranchSlug = string;

export interface BranchSummary {
	id: number;
	slug: BranchSlug;
	name: string;
	location: string | null;
	phone: string | null;
}

export interface ProductTag {
	id: number;
	name: string;
	group: string | null;
	quantity: number | null;
}

export interface ProductVariantGroups {
	[group: string]: ProductTag[];
}

export interface Product {
	id: number;
	name: string;
	category: string;
	price: number;
	description: string;
	barcode: string | null;
	inStock: boolean;
	branchStock: number;
	tags: ProductTag[];
	variantGroups: ProductVariantGroups;
}

export interface CartLine {
	productId: number;
	name: string;
	price: number;
	quantity: number;
	tagId: number | null;
	tagLabel: string | null;
	maxStock: number;
	branchSlug: BranchSlug;
}

export interface OrderRequestItem {
	productId: number;
	quantity: number;
	tagId: number | null;
}

export interface OrderResponse {
	orderId: number;
	branch: { id: number; name: string; slug: string };
	grandTotal: number;
	currency: string;
	reference: string;
}

export interface ShopperUser {
	id: string;
	name: string;
	email: string;
	createdAt: string;
}
